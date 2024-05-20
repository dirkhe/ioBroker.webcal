/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";

import fs from "fs";
import { DavCalCalendar, initLib as calDavInit } from "./lib/calDav";
import { CalendarEvent, CalendarManager, localTimeZone } from "./lib/calendarManager";
import { EventManager } from "./lib/eventManager";
import { GoogleCalendar, initLib as googleInit } from "./lib/google";
import { ICalReadOnlyClient, initLib as icalROInit } from "./lib/iCalReadOnly";

let adapter: Webcal;

const i18n: Record<string, string> = {
	allDay: "all day",
	from: "from",
	until: "until",
	now: "now",
	today: "today",
	day: "day",
	days: "days",
	starttime: "starttime",
	addEvent: "add Event",
	createNewEvent: "create new Event in calendar, see Readme",
	couldNotFoundCalendar: "could not found calendar for",
	invalidDate: "invalid date",
	invalidId: "invalid id",
	undefinedError: "undefined error",
	successfullyAdded: "successfully added",
	successfullyDeleted: "successfully deleted",
	Tomorrow: "Tomorrow",
	Yesterday: "Yesterday",
	xDaysAgo: "%d days ago",
	inXDays: "in %d days",
	dateOrPeriod: "date or time period",
	nextEvent: "next Event",
	weekDaysFull0: "Sunday",
	weekDaysFull1: "Monday",
	weekDaysFull2: "Tuesday",
	weekDaysFull3: "Wednesday",
	weekDaysFull4: "Thursday",
	weekDaysFull5: "Friday",
	weekDaysFull6: "Saturday",
};
class Webcal extends utils.Adapter {
	eventManager: EventManager;
	calendarManager: CalendarManager;
	private updateCalenderIntervall: ioBroker.Interval | undefined = undefined;
	private actionEvents: Array<ioBroker.Timeout> = []; // we save this for internal housekeeping to fullfill PR addintg to iobroker repository

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "webcal",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

		this.eventManager = new EventManager(this, i18n);
		this.calendarManager = new CalendarManager(this, i18n);
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		await this.initLocales();
		this.eventManager.init(this.config);
		this.calendarManager.init(this.config);
		calDavInit(this);
		googleInit(this, localTimeZone);
		icalROInit(this);
		if (this.config.calendars) {
			for (let c = 0; c < this.config.calendars.length; c++) {
				this.calendarManager.addCalendar(
					this.createCalendarFromConfig(this.config.calendars[c]),
					this.config.calendars[c].name,
				);
			}
			this.fetchCalendars();
			if (this.config.intervall > 0) {
				if (this.config.intervall < 10) {
					this.config.intervall = 10;
					adapter.log.info("minimum fetching time of calendar ar 10 minutes");
				}
				adapter.log.info("fetch calendar data all " + this.config.intervall + " minutes");
				this.updateCalenderIntervall = this.setInterval(
					this.fetchCalendars.bind(this),
					this.config.intervall * 60000,
				);
			}
		}
		this.subscribeStates("fetchCal");
		this.subscribeStates("events.*.addEvent");
	}

	/**
	 * get data from all calendars and update Eventstates
	 */
	fetchCalendars(): void {
		this.eventManager.resetAll();
		this.calendarManager.fetchCalendars().then((calEvents: CalendarEvent[]) => {
			for (let i = 0; i < calEvents.length; i++) {
				calEvents[i].searchForEvents(this.eventManager.events);
			}
			this.eventManager.syncFlags();
		});
	}

	createCalendarFromConfig(calConfig: webcal.IConfigCalendar): webcal.ICalendarBase | null {
		if (!calConfig.inactive) {
			if (calConfig.password) {
				if (calConfig.authMethod == "google") {
					this.log.info("create google calendar: " + calConfig.name);
					return new GoogleCalendar(calConfig);
				} else if (calConfig.authMethod == "Download") {
					this.log.info("create Download calendar: " + calConfig.name);
					return new ICalReadOnlyClient(calConfig);
				} else {
					this.log.info("create DAV calendar: " + calConfig.name);
					return new DavCalCalendar(calConfig);
				}
			} else {
				this.log.warn("calendar " + calConfig.name + " has no password set");
			}
		} else {
			this.log.info("calendar " + calConfig.name + " is inactive");
		}

		return null;
	}
	/**
	 * create new Event in calendar
	 * @param expression Syntax relDays[@calendar] | date|datetime[ - date|datetime][@calendar]
	 * relDays - number of days after today
	 * date/datetime must be parsable date
	 * \@calendar is the name of the calendar, if not use default (first defined calendar)
	 * @returns {msg:string, errNo:number}
	 */
	async addEvent(expression: string, summary: string): Promise<{ statusText: string; errNo: number }> {
		adapter.log.debug("add event to calender: " + expression);
		let terms = expression.split("@", 2);
		expression = " " + expression; // for formatting in msg
		const calendarName =
			terms.length > 1 ? terms[1] : this.eventManager.events[summary]?.defaultCalendar || undefined;
		const eventData: webcal.ICalendarEventData = {
			summary: summary,
			startDate: "",
		};

		if (terms[0].length < 4) {
			const days = parseInt(terms[0], 10);
			if (!isNaN(days)) {
				eventData.startDate = new Date(new Date().setDate(new Date().getDate() + days))
					.toISOString()
					.substring(0, 10);
			} else {
				return { statusText: i18n.invalidDate + expression, errNo: 4 };
			}
		} else {
			terms = terms[0].split(" - ");
			let date = CalendarEvent.parseDateTime(terms[0]);
			if (!date.year) {
				return { statusText: i18n.invalidDate + expression, errNo: 2 };
			}
			eventData.startDate = date;
			if (terms[1]) {
				date = CalendarEvent.parseDateTime(terms[1]);
				if (!date.year) {
					return { statusText: i18n.invalidDate + expression, errNo: 3 };
				}
				eventData.endDate = date;
			}
		}
		const result = await this.calendarManager.addEvent(eventData, calendarName);
		if (result.ok) {
			return { statusText: i18n.successfullyAdded + expression, errNo: 0 };
		} else {
			return { statusText: result.message + " " + expression, errNo: 5 };
		}
	}

	/**
	 * try to locale all internal used text
	 */
	async initLocales(): Promise<void> {
		// try to locale i18n
		//this.log.debug("load locales");
		const systemConfig = await this.getForeignObjectAsync("system.config");
		if (systemConfig) {
			const language = systemConfig.common.language;
			if (language) {
				const data = fs.readFileSync("./admin/i18n/" + language + "/translations.json");
				if (data) {
					try {
						const trans = JSON.parse(data.toString());
						for (const key in i18n) {
							if (trans[i18n[key]]) {
								// eslint-disable-next-line @typescript-eslint/ban-ts-comment
								// @ts-ignore
								i18n[key] = trans[i18n[key]];
							}
						}
					} catch (error) {
						this.log.warn("error on loading translation, use english\n" + error);
					}
				} else {
					this.log.warn("could not load translation, use english");
				}
			}
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			this.updateCalenderIntervall && this.clearInterval(this.updateCalenderIntervall);
			this.eventManager.resetAll();
			this.eventManager.iQontrolTimerID && this.clearTimeout(this.eventManager.iQontrolTimerID);
			for (let i = 0; i < this.actionEvents.length; i++) {
				this.clearTimeout(this.actionEvents[i]);
			}
			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  */
	// private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (!state || state.ack) {
			return;
		}

		// The state was changed
		this.log.info(`state ${id} changed: ${state.val}`);

		const stateId = id.split(".").pop();
		switch (stateId) {
			case "fetchCal":
				if (state.val) {
					this.fetchCalendars();
					this.setStateAsync(id, false, true);
				}
				break;

			case "addEvent":
				if (state.val) {
					this.getObjectAsync(id.substring(0, id.lastIndexOf("."))).then((obj) => {
						this.addEvent(state.val as string, obj?.common.name as string).then((result) => {
							this.setStateAsync(id, result.statusText, true);
							this.fetchCalendars();
							const timerID: ioBroker.Timeout | undefined = this.addTimer(
								adapter.setTimeout(() => {
									this.setStateAsync(id, "", true);
									timerID && this.clearTimer(timerID);
								}, 60000),
							);
						});
					});
				}

				break;
		}
	}

	addTimer(timerID: ioBroker.Timeout | undefined): ioBroker.Timeout | undefined {
		if (timerID) {
			this.actionEvents.push(timerID);
		}
		return timerID;
	}

	clearTimer(timerID: ioBroker.Timeout): void {
		for (let i = 0; i < this.actionEvents.length; i++) {
			if (this.actionEvents[i] == timerID) {
				delete this.actionEvents[i];
			}
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  */
	private async onMessage(obj: ioBroker.Message): Promise<void> {
		this.log.debug(JSON.stringify(obj));
		if (typeof obj === "object") {
			if (obj.command === "testCalendar") {
				// Send response in callback if required
				if (obj.callback && obj.message) {
					const calObj = this.createCalendarFromConfig((obj.message as any).calData);
					if (calObj) {
						const error = calObj.loadEvents(
							[],
							new Date(),
							new Date(new Date().setDate(new Date().getDate() + 15)),
						);
						if (error) {
							this.sendTo(obj.from, obj.command, { result: error }, obj.callback);
						} else {
							this.sendTo(obj.from, obj.command, { result: "success" }, obj.callback);
						}
					}
				} else {
					this.sendTo(obj.from, obj.command, { result: "could not create Calendar" }, obj.callback);
				}
			} else if (obj.command === "getCalendars") {
				// Send response in callback if required
				if (obj.callback) {
					const calendars = [];
					for (let c = 0; c < this.config.calendars.length; c++) {
						calendars.push({ label: this.config.calendars[c].name, value: this.config.calendars[c].name });
					}
					this.sendTo(obj.from, obj.command, calendars, obj.callback);
				} else {
					this.sendTo(obj.from, obj.command, [{ label: "No calendar found", value: "" }], obj.callback);
				}
			} else if (obj.command === "addEvents") {
				/** obj.message
 {
    calendar?: "test",
    events: [
      {
        summary: string;
		start: string;
		end?: string;
      }
    ]
  }	 */

				if (typeof obj.message == "object" && obj.message.events) {
					const calendar = obj.message.calendar
						? this.calendarManager.calendars[obj.message.calendar]
						: this.calendarManager.defaultCalendar;
					if (!calendar) {
						return this.sendTo(
							obj.from,
							obj.command,
							{ error: i18n.couldNotFoundCalendar + " name: " + obj.message.calendar },
							obj.callback,
						);
					}
					adapter.log.debug("add Events to " + calendar.name);
					for (const i in obj.message.events) {
						const event = obj.message.events[i];
						event.startDate = CalendarEvent.parseDateTime(event.start);
						if (!event.startDate.year) {
							event.error = "start: " + i18n.invalidDate;
						} else {
							if (event.end) {
								event.endDate = CalendarEvent.parseDateTime(event.end);
								if (!event.endDate.year) {
									event.error = "end: " + i18n.invalidDate;
								}
							}
						}
						if (!event.error) {
							const result = await calendar.addEvent(event);
							if (result.ok) {
								event.status = i18n.successfullyAdded;
							} else {
								event.error = result.message || result.statusText || i18n.undefinedError;
							}
						}
					}
					this.fetchCalendars();
					this.sendTo(obj.from, obj.command, obj.message.events, obj.callback);
				} else {
					return this.sendTo(obj.from, obj.command, { error: "found no events" }, obj.callback);
				}
			} else if (obj.command === "deleteEvents") {
				/** obj.message
 {
    calendar: "test",
    events: [{
		id: string
	}]
  }	 */

				if (typeof obj.message == "object" && obj.message.events) {
					const calendar = obj.message.calendar ? this.calendarManager.calendars[obj.message.calendar] : null;
					if (!calendar) {
						return this.sendTo(
							obj.from,
							obj.command,
							{ error: i18n.couldNotFoundCalendar + " name: " + obj.message.calendar },
							obj.callback,
						);
					}
					adapter.log.debug("delete Events from " + calendar.name);
					for (const i in obj.message.events) {
						const event = obj.message.events[i];
						if (!event.id) {
							event.error = i18n.invalidId;
						}
						if (!event.error) {
							const result = await calendar.deleteEvent(event.id);
							if (result.ok) {
								event.status = i18n.successfullyDeleted;
							} else {
								event.error = result.message || result.statusText || i18n.undefinedError;
							}
						}
					}
					this.fetchCalendars();
					this.sendTo(obj.from, obj.command, obj.message.events, obj.callback);
				} else {
					return this.sendTo(obj.from, obj.command, { error: "found no events" }, obj.callback);
				}
			}
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => (adapter = new Webcal(options));
}
// otherwise start the instance directly
else {
	(() => (adapter = new Webcal()))();
}

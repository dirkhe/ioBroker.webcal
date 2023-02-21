// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { AdapterInstance } from "@iobroker/adapter-core";
import { DAVAccount, DAVCalendar, DAVCalendarObject, DAVClient, DAVCredentials } from "tsdav";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ICAL from "ical.js";
import { CalendarEvent, ICalendarTimeRangObj } from "./calendarManager";

let adapter: AdapterInstance;

export function initLib(adapterInstance: AdapterInstance, localTimeZone: string): void {
	adapter = adapterInstance;
	ICAL.Timezone.localTimezone = new ICAL.Timezone({ tzID: localTimeZone });
}
export class IcalCalendarEvent extends CalendarEvent {
	icalEvent?: ICAL.Event;
	timezone?: ICAL.Timezone;
	recurIterator?: ICAL.RecurExpansion;

	constructor(calendarEventData: string, calendarName: string, startDate: Date, endDate: Date) {
		super(endDate, calendarName);
		try {
			adapter.log.debug("parse calendar data:\n" + calendarEventData.replace(/\s*([:;=])\s*/gm, "$1"));
			const jcalData = ICAL.parse(calendarEventData);
			const comp = new ICAL.Component(jcalData);
			const calTimezone = comp.getFirstSubcomponent("vtimezone");
			if (calTimezone) {
				this.timezone = new ICAL.Timezone(calTimezone);
			}

			this.icalEvent = new ICAL.Event(comp.getFirstSubcomponent("vevent"));
			this.summary = this.icalEvent.summary || "";
			this.description = this.icalEvent.description || "";

			if (this.icalEvent.isRecurring()) {
				if (!["HOURLY", "SECONDLY", "MINUTELY"].includes(this.icalEvent.getRecurrenceTypes())) {
					const timeObj = this.getNextTimeObj(true);
					if (timeObj) {
						const startTime = ICAL.Time.fromData({
							year: startDate.getFullYear(),
							month: startDate.getMonth() + 1,
							day: startDate.getDate(),
							hour: timeObj.startDate.getHours(),
							minute: timeObj.startDate.getMinutes(),
							timezone: calTimezone,
						});
						this.recurIterator = this.icalEvent.iterator(startTime);
					}
				}
			}
		} catch (error) {
			adapter.log.error("could not read calendar Event: " + error);
			adapter.log.debug(calendarEventData);
			this.icalEvent = null;
		}
	}

	getNextTimeObj(isFirstCall: boolean): ICalendarTimeRangObj | null {
		let start: ICAL.Time;
		let end: ICAL.Time;
		if (this.recurIterator) {
			start = this.recurIterator.next();
			if (start) {
				if (this.timezone) {
					start = start.convertToZone(this.timezone);
				}
				if (start.toUnixTime() > this.maxUnixTime) {
					return null;
				}
				try {
					end = this.icalEvent.getOccurrenceDetails(start).endDate;
				} catch (error) {
					return null;
				}
			} else {
				return null;
			}
		} else if (isFirstCall) {
			start = this.icalEvent.startDate;
			if (this.timezone) {
				start = start.convertToZone(this.timezone);
			}
			end = this.icalEvent.endDate;
		} else {
			return null;
		}
		if (this.timezone) {
			end = end.convertToZone(this.timezone);
		}
		return {
			startDate: start.toJSDate(), //.local();
			endDate: end.toJSDate(), //.local();
		};
	}

	static createIcalEventString(data: webcal.ICalendarEventData): string {
		const cal = new ICAL.Component(["vcalendar", [], []]);
		cal.updatePropertyWithValue("prodid", "-//ioBroker.webCal");
		const vevent = new ICAL.Component("vevent");
		const event = new ICAL.Event(vevent);

		event.summary = data.summary;
		event.description = "ioBroker webCal";
		event.uid = new Date().getTime().toString();
		event.startDate =
			typeof data.startDate == "string"
				? ICAL.Time.fromString(data.startDate)
				: ICAL.Time.fromData(data.startDate);
		if (data.endDate) {
			event.endDate =
				typeof data.endDate == "string" ? ICAL.Time.fromString(data.endDate) : ICAL.Time.fromData(data.endDate);
		}
		cal.addSubcomponent(vevent);
		return cal.toString();
	}
}

export class DavCalCalendar implements webcal.ICalendarBase {
	name: string;
	client: DAVClient;
	ignoreSSL = false;
	calendar: DAVCalendar | undefined;

	constructor(calConfig: webcal.IConfigCalendar) {
		this.name = calConfig.name;
		const params: {
			serverUrl: string;
			credentials: DAVCredentials;
			authMethod?: "Basic" | "Oauth";
			defaultAccountType?: DAVAccount["accountType"] | undefined;
		} =
			calConfig.authMethod == "Oauth"
				? {
						serverUrl: calConfig.serverUrl,
						credentials: {
							tokenUrl: calConfig.tokenUrl,
							username: calConfig.username,
							refreshToken: calConfig.refreshToken,
							clientId: calConfig.clientId,
							clientSecret: calConfig.password,
						},
						authMethod: calConfig.authMethod,
						defaultAccountType: "caldav",
				  }
				: {
						serverUrl: calConfig.serverUrl,
						credentials: {
							username: calConfig.username,
							password: calConfig.password,
						},
						authMethod: "Basic",
						defaultAccountType: "caldav",
				  };
		this.client = new DAVClient(params);
		this.ignoreSSL = !!calConfig.ignoreSSL;
	}

	/**
	 * load Calendars from Server
	 * @param displayName if set, try to return Calendar with this name
	 * @returns Calender by displaName or last part of initial ServerUrl or first found Calendar
	 */
	private async getCalendar(displayName?: string): Promise<DAVCalendar> {
		if (!this.calendar) {
			if (!this.client.account) {
				await this.client.login();
			}
			const calendars = await this.client.fetchCalendars();
			//console.log(calendars)
			if (displayName) {
				const displayNameLowerCase = displayName.toLocaleLowerCase();
				for (let i = 0; i < calendars.length; i++) {
					if (calendars[i].displayName?.toLowerCase() == displayNameLowerCase) {
						this.calendar = calendars[i];
						break;
					}
				}
			} else {
				for (let i = 0; i < calendars.length; i++) {
					if (calendars[i].url == this.client.serverUrl) {
						this.calendar = calendars[i];
						break;
					}
				}
			}
			if (!this.calendar) {
				this.calendar = calendars[0];
			}
		}
		return this.calendar;
	}

	/**
	 * fetch Events form Calendar
	 * @param startDate as date object
	 * @param endDate as date object
	 * @returns Array of Calenderobjects
	 */
	private async getCalendarObjects(
		startDateISOString?: string,
		endDateISOString?: string,
	): Promise<DAVCalendarObject[]> {
		let storeDefaultIgnoreSSL: string | undefined | null = null;
		if (this.ignoreSSL && process.env.NODE_TLS_REJECT_UNAUTHORIZED != "0") {
			storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}
		const searchParams: any = {
			calendar: await this.getCalendar(),
		};
		if (startDateISOString) {
			searchParams.timeRange = {
				start: startDateISOString,
				end: endDateISOString || startDateISOString,
			};
		}
		return this.client.fetchCalendarObjects(searchParams).finally(() => {
			if (storeDefaultIgnoreSSL !== null) {
				process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
			}
		});
	}

	/**
	 * fetch Events form Calendar and pushed them to calEvents Array
	 * @param calEvents target Array of ICalendarEventBase
	 * @param startDate as date object
	 * @param endDate as date object
	 * @returns null or errorstring
	 */
	loadEvents(calEvents: webcal.ICalendarEventBase[], startDate: Date, endDate: Date): Promise<null | string> {
		return this.getCalendarObjects(startDate.toISOString(), endDate.toISOString())
			.then((calendarObjects) => {
				if (calendarObjects) {
					adapter.log.info("found " + calendarObjects.length + " calendar objects");
					/* test for now update ...
										const calEvent = new CalendarEvent(calendarObjects[0].data);
										calEvent.startDate = dayjs().add(1, "minute");
										calEvent.endDate = dayjs().add(2, "minute");
										for (let evID in this.events) {
											this.events[evID].addCalendarEvent(calEvent, calEvent.getDays(startDate));
											break;
										}
					*/
					for (const i in calendarObjects) {
						calEvents.push(new IcalCalendarEvent(calendarObjects[i].data, this.name, startDate, endDate));
					}
				}
				return null;
			})
			.catch((reason) => {
				return reason.message;
			});
	}

	/**
	 * add Event to Calendar
	 * @param data event data
	 * @returns Server response, like {ok:boolen}
	 */
	async addEvent(data: webcal.ICalendarEventData): Promise<any> {
		let storeDefaultIgnoreSSL: string | undefined | null = null;
		if (this.ignoreSSL && process.env.NODE_TLS_REJECT_UNAUTHORIZED != "0") {
			storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}
		let result;
		try {
			const calendarEventData = IcalCalendarEvent.createIcalEventString(data);
			result = await this.client.createCalendarObject({
				calendar: await this.getCalendar(),
				filename: new Date().getTime() + ".ics",
				iCalString: calendarEventData,
			});
		} catch (error) {
			result = {
				ok: false,
				message: error,
			};
		}
		if (storeDefaultIgnoreSSL !== null) {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
		}
		//console.log(result);
		//console.log(result.ok);
		return result;
	}
}

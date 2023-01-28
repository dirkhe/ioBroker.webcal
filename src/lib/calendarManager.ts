import { AdapterInstance } from "@iobroker/adapter-core";
import dayjs, { Dayjs } from "dayjs";
import dayjs_timezone from "dayjs/plugin/timezone";
import dayjs_utc from "dayjs/plugin/utc";
import { Event } from "./eventManager";
import { DavCal } from "./tsdav";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ICAL from "ical.js";

dayjs.extend(dayjs_timezone);
dayjs.extend(dayjs_utc);
const localTimeZone = dayjs.tz.guess();
dayjs.tz.setDefault(localTimeZone);
ICAL.Timezone.localTimezone = new ICAL.Timezone({ tzID: localTimeZone });

let adapter: AdapterInstance;
let i18n: Record<string, string> = {};

export class CalendarEvent {
	static daysFuture = 3;
	static daysPast = 0;
	static todayMidnight: Dayjs = dayjs().startOf("d");
	icalEvent?: ICAL.Event;
	timezone?: ICAL.Timezone;
	recurIterator?: ICAL.RecurExpansion;
	maxUnixTime: number;

	constructor(calendarEventData: string, startDate: Dayjs, endDate: Dayjs) {
		this.maxUnixTime = endDate.unix();
		try {
			adapter.log.debug("parse calendar data:\n" + calendarEventData.replace(/\s*([:;=])\s*/gm, "$1"));
			const jcalData = ICAL.parse(calendarEventData);
			const comp = new ICAL.Component(jcalData);
			const calTimezone = comp.getFirstSubcomponent("vtimezone");
			if (calTimezone) {
				this.timezone = new ICAL.Timezone(calTimezone);
			}

			this.icalEvent = new ICAL.Event(comp.getFirstSubcomponent("vevent"));

			if (this.icalEvent.isRecurring()) {
				if (!["HOURLY", "SECONDLY", "MINUTELY"].includes(this.icalEvent.getRecurrenceTypes())) {
					const timeObj = this.getNextTimeObj(true);
					if (timeObj) {
						const startTime = ICAL.Time.fromData({
							year: startDate.year(),
							month: startDate.month() + 1,
							day: startDate.date(),
							hour: timeObj.start.hour(),
							minute: timeObj.start.minute(),
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

	getNextTimeObj(isFirstCall: boolean): webcal.IEventTimeRangObj | null {
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
			start: dayjs(start.toJSDate()), //.local();
			end: dayjs(end.toJSDate()), //.local();
		};
	}

	searchForEvents(events: Record<string, Event>): void {
		if (!this.icalEvent) {
			return;
		}
		const content = (this.icalEvent.summary || "") + (this.icalEvent.description || "");
		if (content.length) {
			adapter.log.debug(
				"check calendar event " + (this.icalEvent.summary || "") + " " + (this.icalEvent.description || ""),
			);
			const eventHits = [];
			for (const evID in events) {
				const event = events[evID];
				if (event.checkCalendarContent(content)) {
					adapter.log.debug("  found event '" + event.name + "' in calendar event ");
					eventHits.push(event);
				}
			}
			if (eventHits.length > 0) {
				let timeObj = this.getNextTimeObj(true);
				while (timeObj) {
					const days: Record<number, string> = this.calcDays(timeObj);
					for (let e = 0; e < eventHits.length; e++) {
						eventHits[e].addCalendarEvent(timeObj, days);
					}
					timeObj = this.getNextTimeObj(false);
				}
			}
		}
	}

	calcDays(timeObj: webcal.IEventTimeRangObj): Record<number, string> {
		const days: Record<number, string> = {};
		if (timeObj) {
			const firstDay = Math.max(
				timeObj.start.startOf("D").diff(CalendarEvent.todayMidnight, "d"),
				-CalendarEvent.daysPast,
			);
			const lastDay = Math.min(
				timeObj.end.startOf("D").diff(CalendarEvent.todayMidnight, "d"),
				CalendarEvent.daysFuture,
			);
			if (lastDay > firstDay) {
				// event is at least next day
				let d: number = firstDay;
				let time = timeObj.start.format(" HH:mm");
				if (time != " 00:00") {
					days[d++] = i18n["from"] + time;
				}
				for (; d < lastDay; d++) {
					days[d] = i18n["all day"];
				}
				time = timeObj.end.format(" HH:mm");
				if (time == " 23:59") {
					days[lastDay] = i18n["all day"];
				} else if (time != " 00:00") {
					days[lastDay] = i18n["until"] + " -" + time;
				}
			} else {
				days[firstDay] = timeObj.start.format("HH:mm");
			}
			adapter.log.debug("days for calendar event(" + JSON.stringify(timeObj) + "): " + JSON.stringify(days));
		}
		return days;
	}

	static parseDateTime(dateString: string): ICAL.Time {
		const dateTimeObj = {
			// first we use year, minute and day numbers as index
			year: 0,
			month: 1,
			day: 2,
			hour: 0,
			minute: 0,
			second: 0,
			isDate: false,
		};

		const terms = dateString.split(/[.\/T :-]/);
		if (terms.length > 2) {
			if (terms[0].length != 4) {
				dateTimeObj.year = 2;
				if (dateString[2] == ".") {
					dateTimeObj.day = 0;
					dateTimeObj.month = 1;
				} else {
					if (parseInt(terms[0], 10) > 12) {
						dateTimeObj.day = 0;
						dateTimeObj.month = 1;
					} else {
						dateTimeObj.month = 0;
						dateTimeObj.day = 1;
					}
				}
			} // else terms[0].length == 4 -> use default index
			dateTimeObj.year = parseInt(terms[dateTimeObj.year], 10);
			dateTimeObj.month = parseInt(terms[dateTimeObj.month], 10);
			dateTimeObj.day = parseInt(terms[dateTimeObj.day], 10);
			if (terms.length > 4) {
				dateTimeObj.hour = parseInt(terms[3], 10);
				dateTimeObj.minute = parseInt(terms[4], 10);
				if (dateTimeObj.hour < 12 && terms.length > 5) {
					const hour12 = terms[5] + (terms.length > 6 ? terms[6] : "");
					if (hour12.toLocaleLowerCase() == "pm") {
						dateTimeObj.hour += 12;
					}
				}
			} else {
				dateTimeObj.isDate = true;
			}
			if (dateTimeObj.year < 100) {
				dateTimeObj.year += 2000;
			}
		}
		return ICAL.Time.fromData(dateTimeObj);
	}

	static createIcalEventString(data: webcal.ICalEventData): string {
		const cal = new ICAL.Component(["vcalendar", [], []]);
		cal.updatePropertyWithValue("prodid", "-//ioBroker.webCal");
		const vevent = new ICAL.Component("vevent");
		const event = new ICAL.Event(vevent);

		event.summary = data.summary;
		event.description = "ioBroker webCal";
		event.uid = new Date().getTime().toString();
		event.startDate = typeof data.startDate == "string" ? ICAL.Time.fromString(data.startDate) : data.startDate;
		if (data.endDate) {
			event.endDate = typeof data.endDate == "string" ? ICAL.Time.fromString(data.endDate) : data.endDate;
		}
		cal.addSubcomponent(vevent);
		return cal.toString();
	}
}

export class CalendarManager {
	calendars: Record<string, DavCal>;
	defaultCalendar: DavCal | null = null;

	constructor(adapterInstance: AdapterInstance, i18nInstance: any) {
		adapter = adapterInstance;
		i18n = i18nInstance;
		this.calendars = {};
	}

	init(config: ioBroker.AdapterConfig): boolean {
		CalendarEvent.daysFuture = Math.max(config.daysEventFuture || 0, config.daysJSONFuture || 0);
		CalendarEvent.daysPast = Math.max(config.daysEventPast || 0, config.daysJSONPast || 0);
		// init all calendars
		if (config.calendars) {
			for (let c = 0; c < config.calendars.length; c++) {
				const davCal = CalendarManager.createDavCalFromConfig(config.calendars[c]);
				if (davCal) {
					this.calendars[config.calendars[c].name] = davCal;
					if (!this.defaultCalendar) {
						this.defaultCalendar = davCal;
					}
				}
			}
		}
		return this.defaultCalendar != null;
	}

	static createDavCalFromConfig(calConfig: webcal.IConfigCalendar): DavCal | null {
		if (calConfig.serverUrl) {
			const credentials =
				calConfig.authMethod == "Oauth"
					? {
							tokenUrl: calConfig.tokenUrl,
							username: calConfig.username,
							refreshToken: calConfig.refreshToken,
							clientId: calConfig.clientId,
							clientSecret: calConfig.password,
					  }
					: {
							username: calConfig.username,
							password: calConfig.password,
					  };

			return new DavCal(
				{
					serverUrl: calConfig.serverUrl,
					credentials: credentials,
					authMethod: calConfig.authMethod,
					defaultAccountType: "caldav",
				},
				calConfig.ignoreSSL,
			);
		}
		return null;
	}

	/**
	 * get data from all calendars
	 * @returns Array of CalendarEvents
	 */
	async fetchCalendars(): Promise<CalendarEvent[]> {
		CalendarEvent.todayMidnight = dayjs().startOf("D");
		const calEvents: CalendarEvent[] = [];
		const startDate: Dayjs = CalendarEvent.todayMidnight.add(-CalendarEvent.daysPast, "d");
		const endDate: Dayjs = CalendarEvent.todayMidnight.add(CalendarEvent.daysFuture, "d").endOf("D");
		for (const c in this.calendars) {
			try {
				const calendarObjects = await this.calendars[c].getEvents(
					startDate.toISOString(),
					endDate.toISOString(),
				);
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
						calEvents.push(new CalendarEvent(calendarObjects[i].data, startDate, endDate));
					}
				}
			} catch (error) {
				adapter.log.error("could not fetch Calendar " + c + ": " + error);
			}
		}
		return calEvents;
	}

	/**
	 * create new Event in calendar
	 * @param data
	 * @param calendarName optional name of calendar, otherwise default calender is used
	 * @returns Response Object
	 */
	async addEvent(
		data: webcal.ICalEventData,
		calendarName?: string,
	): Promise<{ ok: boolean; statusText: string; errNo: number }> {
		const calendar = calendarName ? this.calendars[calendarName] : this.defaultCalendar;
		if (!calendar) {
			return { statusText: i18n["could not found calendar for"] + calendarName, errNo: 1, ok: false };
		}
		adapter.log.debug("add Event " + JSON.stringify(data));
		const calendarEventData = CalendarEvent.createIcalEventString(data);
		return calendar.addEvent(calendarEventData);
	}
}

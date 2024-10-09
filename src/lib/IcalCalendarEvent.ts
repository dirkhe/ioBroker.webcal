// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ICAL from "ical.js";
import { CalendarEvent, ICalendarTimeRangObj } from "./calendarManager";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { AdapterInstance } from "@iobroker/adapter-core";
let adapter: AdapterInstance;

export function initLib(adapterInstance: AdapterInstance): void {
	adapter = adapterInstance;
	//ICAL.Timezone.localTimezone = new ICAL.Timezone({ tzID: localTimeZone });
}

export function getAllIcalCalendarEvents(
	calendarEventData: string,
	calendarName: string,
	startDate: Date,
	endDate: Date,
	checkDateRange?: boolean,
): webcal.ICalendarEventBase[] {
	const result: webcal.ICalendarEventBase[] = [];
	try {
		adapter.log.silly("parse calendar data:\n" + calendarEventData.replace(/\s*([:;=])\s*/gm, "$1"));
		const jcalData = ICAL.parse(calendarEventData);
		const comp = new ICAL.Component(jcalData);
		const calTimezoneComp = comp.getFirstSubcomponent("vtimezone");
		const calTimezone = calTimezoneComp ? new ICAL.Timezone(calTimezoneComp) : null;
		const allEvents = comp.getAllSubcomponents("vevent");

		for (const i in allEvents) {
			const ev: IcalCalendarEvent = new IcalCalendarEvent(
				allEvents[i],
				calTimezone,
				calendarName,
				startDate,
				endDate,
			);
			if (ev) {
				if (checkDateRange) {
					const timeObj = ev.getNextTimeObj(true);
					if (!timeObj || timeObj.startDate < startDate || timeObj.endDate > endDate) {
						continue;
					}
				}
				result.push(ev);
			}
		}
	} catch (error) {
		adapter.log.error("could not read calendar Event: " + error);
	}
	return result;
}

export class IcalCalendarEvent extends CalendarEvent {
	icalEvent?: ICAL.Event;
	timezone?: ICAL.Timezone | null;
	recurIterator?: ICAL.RecurExpansion;

	static fromData(
		calendarEventData: string,
		calendarName: string,
		startDate: Date,
		endDate: Date,
	): IcalCalendarEvent | null {
		try {
			adapter.log.debug("parse calendar data:\n" + calendarEventData.replace(/\s*([:;=])\s*/gm, "$1"));
			const jcalData = ICAL.parse(calendarEventData);
			const comp = new ICAL.Component(jcalData);
			const calTimezone = comp.getFirstSubcomponent("vtimezone");

			return new IcalCalendarEvent(
				comp.getFirstSubcomponent("vevent") || undefined,
				calTimezone ? new ICAL.Timezone(calTimezone) : null,
				calendarName,
				startDate,
				endDate,
			);
		} catch (error) {
			adapter.log.error("could not read calendar Event: " + error);
			adapter.log.debug(calendarEventData);
			return null;
		}
	}

	constructor(
		eventComp: ICAL.Component | undefined,
		calTimezone: ICAL.Timezone | null,
		calendarName: string,
		startDate: Date,
		endDate: Date,
	) {
		super(endDate, calendarName, null);
		this.timezone = calTimezone;
		try {
			this.icalEvent = new ICAL.Event(eventComp);
			this.summary = this.icalEvent.summary || "";
			this.description = this.icalEvent.description || "";
			this.id = this.icalEvent.uid;

			if (this.icalEvent.isRecurring()) {
				this.recurIterator = this.icalEvent.iterator();
				/*
				if (!["HOURLY", "SECONDLY", "MINUTELY"].includes(this.icalEvent.getRecurrenceTypes())) {
					const timeObj = this.getNextTimeObj(true);
					if (timeObj) {
						const startTime = ICAL.Time.fromData(
							{
								year: startDate.getFullYear(),
								month: startDate.getMonth() + 1,
								day: startDate.getDate() - 1,
								hour: timeObj.startDate.getHours(),
								minute: timeObj.startDate.getMinutes(),
							},
							this.timezone,
						);
						this.recurIterator = this.icalEvent.iterator();
						this.recurIterator.next(startTime);
					}
				}
				*/
			}
		} catch (error) {
			adapter.log.error("could not read calendar Event: " + error);
			this.icalEvent = undefined;
		}
	}

	getNextTimeObj(isFirstCall: boolean): ICalendarTimeRangObj | null {
		let start: ICAL.Time;
		let end: ICAL.Time;
		if (!this.icalEvent) {
			return null;
		}
		if (this.recurIterator) {
			if (isFirstCall) {
				this.recurIterator = this.icalEvent.iterator();
			}
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
					adapter.log.error("could not get next Time Object: " + error);
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
		event.description = data.description || "ioBroker webCal";
		event.uid = new Date().getTime().toString();
		event.startDate =
			typeof data.startDate == "string"
				? ICAL.Time.fromString(data.startDate, null)
				: ICAL.Time.fromData(data.startDate);
		if (data.endDate) {
			event.endDate =
				typeof data.endDate == "string"
					? ICAL.Time.fromString(data.endDate, null)
					: ICAL.Time.fromData(data.endDate);
		}
		cal.addSubcomponent(vevent);
		return cal.toString();
	}
}

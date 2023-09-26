"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var IcalCalendarEvent_exports = {};
__export(IcalCalendarEvent_exports, {
  IcalCalendarEvent: () => IcalCalendarEvent,
  getAllIcalCalendarEvents: () => getAllIcalCalendarEvents,
  initLib: () => initLib
});
module.exports = __toCommonJS(IcalCalendarEvent_exports);
var import_ical = __toESM(require("ical.js"));
var import_calendarManager = require("./calendarManager");
let adapter;
function initLib(adapterInstance, localTimeZone) {
  adapter = adapterInstance;
  import_ical.default.Timezone.localTimezone = new import_ical.default.Timezone({ tzID: localTimeZone });
}
function getAllIcalCalendarEvents(calendarEventData, calendarName, startDate, endDate, checkDateRange) {
  const result = [];
  try {
    adapter.log.silly("parse calendar data:\n" + calendarEventData.replace(/\s*([:;=])\s*/gm, "$1"));
    const jcalData = import_ical.default.parse(calendarEventData);
    const comp = new import_ical.default.Component(jcalData);
    const calTimezoneComp = comp.getFirstSubcomponent("vtimezone");
    const calTimezone = calTimezoneComp ? new import_ical.default.Timezone(calTimezoneComp) : null;
    const allEvents = comp.getAllSubcomponents("vevent");
    for (const i in allEvents) {
      const ev = new IcalCalendarEvent(
        allEvents[i],
        calTimezone,
        calendarName,
        startDate,
        endDate
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
class IcalCalendarEvent extends import_calendarManager.CalendarEvent {
  constructor(eventComp, calTimezone, calendarName, startDate, endDate) {
    super(endDate, calendarName);
    this.timezone = calTimezone;
    try {
      this.icalEvent = new import_ical.default.Event(eventComp);
      this.summary = this.icalEvent.summary || "";
      this.description = this.icalEvent.description || "";
      if (this.icalEvent.isRecurring()) {
        if (!["HOURLY", "SECONDLY", "MINUTELY"].includes(this.icalEvent.getRecurrenceTypes())) {
          const timeObj = this.getNextTimeObj(true);
          if (timeObj) {
            const startTime = import_ical.default.Time.fromData(
              {
                year: startDate.getFullYear(),
                month: startDate.getMonth() + 1,
                day: startDate.getDate(),
                hour: timeObj.startDate.getHours(),
                minute: timeObj.startDate.getMinutes()
              },
              this.timezone
            );
            this.recurIterator = this.icalEvent.iterator(startTime);
          }
        }
      }
    } catch (error) {
      adapter.log.error("could not read calendar Event: " + error);
      this.icalEvent = null;
    }
  }
  static fromData(calendarEventData, calendarName, startDate, endDate) {
    try {
      adapter.log.debug("parse calendar data:\n" + calendarEventData.replace(/\s*([:;=])\s*/gm, "$1"));
      const jcalData = import_ical.default.parse(calendarEventData);
      const comp = new import_ical.default.Component(jcalData);
      const calTimezone = comp.getFirstSubcomponent("vtimezone");
      return new IcalCalendarEvent(
        comp.getFirstSubcomponent("vevent"),
        calTimezone ? new import_ical.default.Timezone(calTimezone) : null,
        calendarName,
        startDate,
        endDate
      );
    } catch (error) {
      adapter.log.error("could not read calendar Event: " + error);
      adapter.log.debug(calendarEventData);
      return null;
    }
  }
  getNextTimeObj(isFirstCall) {
    let start;
    let end;
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
      startDate: start.toJSDate(),
      endDate: end.toJSDate()
    };
  }
  static createIcalEventString(data) {
    const cal = new import_ical.default.Component(["vcalendar", [], []]);
    cal.updatePropertyWithValue("prodid", "-//ioBroker.webCal");
    const vevent = new import_ical.default.Component("vevent");
    const event = new import_ical.default.Event(vevent);
    event.summary = data.summary;
    event.description = data.description || "ioBroker webCal";
    event.uid = new Date().getTime().toString();
    event.startDate = typeof data.startDate == "string" ? import_ical.default.Time.fromString(data.startDate) : import_ical.default.Time.fromData(data.startDate);
    if (data.endDate) {
      event.endDate = typeof data.endDate == "string" ? import_ical.default.Time.fromString(data.endDate) : import_ical.default.Time.fromData(data.endDate);
    }
    cal.addSubcomponent(vevent);
    return cal.toString();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IcalCalendarEvent,
  getAllIcalCalendarEvents,
  initLib
});
//# sourceMappingURL=IcalCalendarEvent.js.map

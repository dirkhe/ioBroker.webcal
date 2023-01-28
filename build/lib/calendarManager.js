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
var calendarManager_exports = {};
__export(calendarManager_exports, {
  CalendarEvent: () => CalendarEvent,
  CalendarManager: () => CalendarManager
});
module.exports = __toCommonJS(calendarManager_exports);
var import_dayjs = __toESM(require("dayjs"));
var import_timezone = __toESM(require("dayjs/plugin/timezone"));
var import_utc = __toESM(require("dayjs/plugin/utc"));
var import_tsdav = require("./tsdav");
var import_ical = __toESM(require("ical.js"));
import_dayjs.default.extend(import_timezone.default);
import_dayjs.default.extend(import_utc.default);
const localTimeZone = import_dayjs.default.tz.guess();
import_dayjs.default.tz.setDefault(localTimeZone);
import_ical.default.Timezone.localTimezone = new import_ical.default.Timezone({ tzID: localTimeZone });
let adapter;
let i18n = {};
const _CalendarEvent = class {
  constructor(calendarEventData, startDate, endDate) {
    this.maxUnixTime = endDate.unix();
    try {
      adapter.log.debug("parse calendar data:\n" + calendarEventData.replace(/\s*([:;=])\s*/gm, "$1"));
      const jcalData = import_ical.default.parse(calendarEventData);
      const comp = new import_ical.default.Component(jcalData);
      const calTimezone = comp.getFirstSubcomponent("vtimezone");
      if (calTimezone) {
        this.timezone = new import_ical.default.Timezone(calTimezone);
      }
      this.icalEvent = new import_ical.default.Event(comp.getFirstSubcomponent("vevent"));
      if (this.icalEvent.isRecurring()) {
        if (!["HOURLY", "SECONDLY", "MINUTELY"].includes(this.icalEvent.getRecurrenceTypes())) {
          const timeObj = this.getNextTimeObj(true);
          if (timeObj) {
            const startTime = import_ical.default.Time.fromData({
              year: startDate.year(),
              month: startDate.month() + 1,
              day: startDate.date(),
              hour: timeObj.start.hour(),
              minute: timeObj.start.minute(),
              timezone: calTimezone
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
      start: (0, import_dayjs.default)(start.toJSDate()),
      end: (0, import_dayjs.default)(end.toJSDate())
    };
  }
  searchForEvents(events) {
    if (!this.icalEvent) {
      return;
    }
    const content = (this.icalEvent.summary || "") + (this.icalEvent.description || "");
    if (content.length) {
      adapter.log.debug(
        "check calendar event " + (this.icalEvent.summary || "") + " " + (this.icalEvent.description || "")
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
          const days = this.calcDays(timeObj);
          for (let e = 0; e < eventHits.length; e++) {
            eventHits[e].addCalendarEvent(timeObj, days);
          }
          timeObj = this.getNextTimeObj(false);
        }
      }
    }
  }
  calcDays(timeObj) {
    const days = {};
    if (timeObj) {
      const firstDay = Math.max(
        timeObj.start.startOf("D").diff(_CalendarEvent.todayMidnight, "d"),
        -_CalendarEvent.daysPast
      );
      const lastDay = Math.min(
        timeObj.end.startOf("D").diff(_CalendarEvent.todayMidnight, "d"),
        _CalendarEvent.daysFuture
      );
      if (lastDay > firstDay) {
        let d = firstDay;
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
  static parseDateTime(dateString) {
    const dateTimeObj = {
      year: 0,
      month: 1,
      day: 2,
      hour: 0,
      minute: 0,
      second: 0,
      isDate: false
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
      }
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
        dateTimeObj.year += 2e3;
      }
    }
    return import_ical.default.Time.fromData(dateTimeObj);
  }
  static createIcalEventString(data) {
    const cal = new import_ical.default.Component(["vcalendar", [], []]);
    cal.updatePropertyWithValue("prodid", "-//ioBroker.webCal");
    const vevent = new import_ical.default.Component("vevent");
    const event = new import_ical.default.Event(vevent);
    event.summary = data.summary;
    event.description = "ioBroker webCal";
    event.uid = new Date().getTime().toString();
    event.startDate = typeof data.startDate == "string" ? import_ical.default.Time.fromString(data.startDate) : data.startDate;
    if (data.endDate) {
      event.endDate = typeof data.endDate == "string" ? import_ical.default.Time.fromString(data.endDate) : data.endDate;
    }
    cal.addSubcomponent(vevent);
    return cal.toString();
  }
};
let CalendarEvent = _CalendarEvent;
CalendarEvent.daysFuture = 3;
CalendarEvent.daysPast = 0;
CalendarEvent.todayMidnight = (0, import_dayjs.default)().startOf("d");
class CalendarManager {
  constructor(adapterInstance, i18nInstance) {
    this.defaultCalendar = null;
    adapter = adapterInstance;
    i18n = i18nInstance;
    this.calendars = {};
  }
  init(config) {
    CalendarEvent.daysFuture = Math.max(config.daysEventFuture || 0, config.daysJSONFuture || 0);
    CalendarEvent.daysPast = Math.max(config.daysEventPast || 0, config.daysJSONPast || 0);
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
  static createDavCalFromConfig(calConfig) {
    if (calConfig.serverUrl) {
      const credentials = calConfig.authMethod == "Oauth" ? {
        tokenUrl: calConfig.tokenUrl,
        username: calConfig.username,
        refreshToken: calConfig.refreshToken,
        clientId: calConfig.clientId,
        clientSecret: calConfig.password
      } : {
        username: calConfig.username,
        password: calConfig.password
      };
      return new import_tsdav.DavCal(
        {
          serverUrl: calConfig.serverUrl,
          credentials,
          authMethod: calConfig.authMethod,
          defaultAccountType: "caldav"
        },
        calConfig.ignoreSSL
      );
    }
    return null;
  }
  async fetchCalendars() {
    CalendarEvent.todayMidnight = (0, import_dayjs.default)().startOf("D");
    const calEvents = [];
    const startDate = CalendarEvent.todayMidnight.add(-CalendarEvent.daysPast, "d");
    const endDate = CalendarEvent.todayMidnight.add(CalendarEvent.daysFuture, "d").endOf("D");
    for (const c in this.calendars) {
      try {
        const calendarObjects = await this.calendars[c].getEvents(
          startDate.toISOString(),
          endDate.toISOString()
        );
        if (calendarObjects) {
          adapter.log.info("found " + calendarObjects.length + " calendar objects");
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
  async addEvent(data, calendarName) {
    const calendar = calendarName ? this.calendars[calendarName] : this.defaultCalendar;
    if (!calendar) {
      return { statusText: i18n["could not found calendar for"] + calendarName, errNo: 1, ok: false };
    }
    adapter.log.debug("add Event " + JSON.stringify(data));
    const calendarEventData = CalendarEvent.createIcalEventString(data);
    return calendar.addEvent(calendarEventData);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CalendarEvent,
  CalendarManager
});
//# sourceMappingURL=calendarManager.js.map

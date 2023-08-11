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
  CalendarManager: () => CalendarManager,
  jsonEvent: () => jsonEvent,
  localTimeZone: () => localTimeZone
});
module.exports = __toCommonJS(calendarManager_exports);
var import_dayjs = __toESM(require("dayjs"));
var import_timezone = __toESM(require("dayjs/plugin/timezone"));
var import_utc = __toESM(require("dayjs/plugin/utc"));
import_dayjs.default.extend(import_timezone.default);
import_dayjs.default.extend(import_utc.default);
const localTimeZone = import_dayjs.default.tz.guess();
import_dayjs.default.tz.setDefault(localTimeZone);
let adapter;
let i18n = {};
class jsonEvent {
  constructor(calendarName, date, summary, startTime, endTime) {
    this.calendarName = calendarName;
    this.summary = summary;
    this.date = date;
    this.startTime = startTime;
    this.endTime = endTime;
  }
  toString() {
    return this.isAllday() ? i18n.allDay : (this.startTime ? i18n["from"] + " " + this.startTime : "") + (this.endTime ? (this.startTime ? " " : "") + i18n["until"] + " " + this.endTime : "");
  }
  isAllday() {
    return !this.startTime && !this.endTime;
  }
}
const _CalendarEvent = class {
  constructor(endDate, calendarName) {
    this.calendarName = calendarName;
    this.maxUnixTime = (0, import_dayjs.default)(endDate).unix();
  }
  searchForEvents(events) {
    const content = (this.summary || "") + (this.description || "");
    if (content.length) {
      adapter.log.debug("check calendar event " + (this.summary || "") + " " + (this.description || ""));
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
          const evTimeObj = {
            start: (0, import_dayjs.default)(timeObj.startDate),
            end: (0, import_dayjs.default)(timeObj.endDate)
          };
          const days = this.calcDays(evTimeObj);
          for (let e = 0; e < eventHits.length; e++) {
            eventHits[e].addCalendarEvent(days);
          }
          timeObj = this.getNextTimeObj(false);
        }
      }
    }
  }
  calcDays(timeObj) {
    const days = {};
    if (timeObj) {
      const firstDay = timeObj.start.startOf("D").diff(_CalendarEvent.todayMidnight, "d");
      if (!timeObj.start.isSame(timeObj.end)) {
        const lastDay = Math.min(
          timeObj.end.startOf("D").diff(_CalendarEvent.todayMidnight, "d"),
          _CalendarEvent.daysFuture
        );
        let d = firstDay;
        let time = timeObj.start.format("HH:mm");
        if (firstDay < -_CalendarEvent.daysPast) {
          d = -_CalendarEvent.daysPast;
        } else if (time != "00:00") {
          days[firstDay] = new jsonEvent(this.calendarName, timeObj.start.toDate(), this.summary, time);
          d++;
        }
        for (; d <= lastDay; d++) {
          days[d] = new jsonEvent(
            this.calendarName,
            timeObj.start.add(d - firstDay, "d").toDate(),
            this.summary
          );
        }
        time = timeObj.end.format("HH:mm");
        if (time != "23:59") {
          if (days[lastDay]) {
            days[lastDay].endTime = time;
          }
        }
      } else if (firstDay >= -_CalendarEvent.daysPast) {
        days[firstDay] = new jsonEvent(
          this.calendarName,
          timeObj.start.toDate(),
          this.summary,
          timeObj.start.format("HH:mm")
        );
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
        if (dateString[2] == "." || dateString[1] == ".") {
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
    return dateTimeObj;
  }
  static getDateTimeISOStringFromEventDateTime(date) {
    if (!date.isDate) {
      return new Date(date.year, date.month - 1, date.day, date.hour, date.minute, date.second).toISOString();
    }
    return new String("20" + date.year).slice(-4).concat("-", new String("0" + date.month).slice(-2), "-", new String("0" + date.day).slice(-2));
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
  }
  addCalendar(cal, name) {
    if (cal) {
      this.calendars[name] = cal;
      if (!this.defaultCalendar) {
        this.defaultCalendar = cal;
      }
    }
  }
  async fetchCalendars() {
    CalendarEvent.todayMidnight = (0, import_dayjs.default)().startOf("D");
    const calEvents = [];
    const startDate = CalendarEvent.todayMidnight.add(-CalendarEvent.daysPast, "d").toDate();
    const endDate = CalendarEvent.todayMidnight.add(CalendarEvent.daysFuture, "d").endOf("D").toDate();
    for (const c in this.calendars) {
      const error = await this.calendars[c].loadEvents(calEvents, startDate, endDate);
      if (error) {
        adapter.log.error("could not fetch Calendar " + c + ": " + error);
      }
    }
    return calEvents;
  }
  async addEvent(data, calendarName) {
    const calendar = calendarName ? this.calendars[calendarName] : this.defaultCalendar;
    if (!calendar) {
      return { message: i18n.couldNotFoundCalendar + calendarName, errNo: 1, ok: false };
    }
    adapter.log.debug("add Event to " + calendar.name + ": " + JSON.stringify(data));
    return calendar.addEvent(data);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CalendarEvent,
  CalendarManager,
  jsonEvent,
  localTimeZone
});
//# sourceMappingURL=calendarManager.js.map

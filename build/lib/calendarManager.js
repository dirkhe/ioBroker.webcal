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
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
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
  constructor(event, date, startTime, endTime) {
    this.id = event.id;
    this.calendarName = event.calendarName;
    this.summary = event.summary;
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
const _CalendarEvent = class _CalendarEvent {
  constructor(endDate, calendarName, id) {
    this.id = id;
    this.calendarName = calendarName;
    this.maxUnixTime = (0, import_dayjs.default)(endDate).unix();
  }
  searchForEvents(events) {
    const content = (this.summary || "") + (this.description || "");
    if (content.length) {
      adapter.log.debug(
        "check calendar(" + this.calendarName + ") event '" + (this.summary || "") + "' " + (this.description || "")
      );
      const eventHits = [];
      for (const evID in events) {
        const event = events[evID];
        if (event.checkCalendarContent(content, this.calendarName)) {
          adapter.log.debug("  found event '" + event.name + "' in calendar-event ");
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
      let time = timeObj.start.format("HH:mm");
      if (!timeObj.start.isSame(timeObj.end)) {
        let lastDay = Math.min(
          timeObj.end.startOf("D").diff(_CalendarEvent.todayMidnight, "d"),
          _CalendarEvent.daysFuture
        );
        let d = firstDay;
        if (firstDay < -_CalendarEvent.daysPast) {
          d = -_CalendarEvent.daysPast;
        } else if (time != "00:00") {
          days[firstDay] = new jsonEvent(this, timeObj.start.toDate(), time);
          d++;
        }
        time = timeObj.end.format("HH:mm");
        if (time == "00:00") {
          lastDay--;
          time = "23:59";
        }
        for (; d <= lastDay; d++) {
          days[d] = new jsonEvent(this, timeObj.start.add(d - firstDay, "d").toDate());
        }
        if (time != "23:59") {
          if (days[lastDay]) {
            days[lastDay].endTime = time;
          }
        }
      } else if (firstDay >= -_CalendarEvent.daysPast) {
        days[firstDay] = new jsonEvent(this, timeObj.start.toDate(), time != "00:00" ? time : void 0);
        time = timeObj.end.format("HH:mm");
        if (time != "23:59") {
          days[firstDay].endTime = time;
        }
      }
      const days_string = JSON.stringify(days);
      if (days_string.length > 2) {
        adapter.log.debug("days for calendar-event(" + JSON.stringify(timeObj) + "): " + days_string);
      } else {
        adapter.log.silly("no days for calendar-event(" + JSON.stringify(timeObj) + ") found ");
      }
    }
    return days;
  }
  static parseDateTime(dateString) {
    const dateTimeObj = {
      // first we use year, minute and day numbers as index
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
_CalendarEvent.daysFuture = 3;
_CalendarEvent.daysPast = 0;
_CalendarEvent.todayMidnight = (0, import_dayjs.default)().startOf("d");
let CalendarEvent = _CalendarEvent;
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
  /**
   * get data from all calendars
   * @returns Array of CalendarEvents
   */
  async fetchCalendars() {
    CalendarEvent.todayMidnight = (0, import_dayjs.default)().startOf("D");
    const calEvents = [];
    const startDate = CalendarEvent.todayMidnight.add(-CalendarEvent.daysPast, "d").toDate();
    const endDate = CalendarEvent.todayMidnight.add(CalendarEvent.daysFuture, "d").endOf("D").toDate();
    for (const c in this.calendars) {
      adapter.log.debug("fetching Calendar " + c);
      const error = await this.calendars[c].loadEvents(calEvents, startDate, endDate);
      if (error) {
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

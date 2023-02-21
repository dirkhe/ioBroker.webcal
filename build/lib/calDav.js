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
var calDav_exports = {};
__export(calDav_exports, {
  DavCalCalendar: () => DavCalCalendar,
  IcalCalendarEvent: () => IcalCalendarEvent,
  initLib: () => initLib
});
module.exports = __toCommonJS(calDav_exports);
var import_tsdav = require("tsdav");
var import_ical = __toESM(require("ical.js"));
var import_calendarManager = require("./calendarManager");
let adapter;
function initLib(adapterInstance, localTimeZone) {
  adapter = adapterInstance;
  import_ical.default.Timezone.localTimezone = new import_ical.default.Timezone({ tzID: localTimeZone });
}
class IcalCalendarEvent extends import_calendarManager.CalendarEvent {
  constructor(calendarEventData, calendarName, startDate, endDate) {
    super(endDate, calendarName);
    try {
      adapter.log.debug("parse calendar data:\n" + calendarEventData.replace(/\s*([:;=])\s*/gm, "$1"));
      const jcalData = import_ical.default.parse(calendarEventData);
      const comp = new import_ical.default.Component(jcalData);
      const calTimezone = comp.getFirstSubcomponent("vtimezone");
      if (calTimezone) {
        this.timezone = new import_ical.default.Timezone(calTimezone);
      }
      this.icalEvent = new import_ical.default.Event(comp.getFirstSubcomponent("vevent"));
      this.summary = this.icalEvent.summary || "";
      this.description = this.icalEvent.description || "";
      if (this.icalEvent.isRecurring()) {
        if (!["HOURLY", "SECONDLY", "MINUTELY"].includes(this.icalEvent.getRecurrenceTypes())) {
          const timeObj = this.getNextTimeObj(true);
          if (timeObj) {
            const startTime = import_ical.default.Time.fromData({
              year: startDate.getFullYear(),
              month: startDate.getMonth() + 1,
              day: startDate.getDate(),
              hour: timeObj.startDate.getHours(),
              minute: timeObj.startDate.getMinutes(),
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
    event.description = "ioBroker webCal";
    event.uid = new Date().getTime().toString();
    event.startDate = typeof data.startDate == "string" ? import_ical.default.Time.fromString(data.startDate) : import_ical.default.Time.fromData(data.startDate);
    if (data.endDate) {
      event.endDate = typeof data.endDate == "string" ? import_ical.default.Time.fromString(data.endDate) : import_ical.default.Time.fromData(data.endDate);
    }
    cal.addSubcomponent(vevent);
    return cal.toString();
  }
}
class DavCalCalendar {
  constructor(calConfig) {
    this.ignoreSSL = false;
    this.name = calConfig.name;
    const params = calConfig.authMethod == "Oauth" ? {
      serverUrl: calConfig.serverUrl,
      credentials: {
        tokenUrl: calConfig.tokenUrl,
        username: calConfig.username,
        refreshToken: calConfig.refreshToken,
        clientId: calConfig.clientId,
        clientSecret: calConfig.password
      },
      authMethod: calConfig.authMethod,
      defaultAccountType: "caldav"
    } : {
      serverUrl: calConfig.serverUrl,
      credentials: {
        username: calConfig.username,
        password: calConfig.password
      },
      authMethod: "Basic",
      defaultAccountType: "caldav"
    };
    this.client = new import_tsdav.DAVClient(params);
    this.ignoreSSL = !!calConfig.ignoreSSL;
  }
  async getCalendar(displayName) {
    var _a;
    if (!this.calendar) {
      if (!this.client.account) {
        await this.client.login();
      }
      const calendars = await this.client.fetchCalendars();
      if (displayName) {
        const displayNameLowerCase = displayName.toLocaleLowerCase();
        for (let i = 0; i < calendars.length; i++) {
          if (((_a = calendars[i].displayName) == null ? void 0 : _a.toLowerCase()) == displayNameLowerCase) {
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
  async getCalendarObjects(startDateISOString, endDateISOString) {
    let storeDefaultIgnoreSSL = null;
    if (this.ignoreSSL && process.env.NODE_TLS_REJECT_UNAUTHORIZED != "0") {
      storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    const searchParams = {
      calendar: await this.getCalendar()
    };
    if (startDateISOString) {
      searchParams.timeRange = {
        start: startDateISOString,
        end: endDateISOString || startDateISOString
      };
    }
    return this.client.fetchCalendarObjects(searchParams).finally(() => {
      if (storeDefaultIgnoreSSL !== null) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
      }
    });
  }
  loadEvents(calEvents, startDate, endDate) {
    return this.getCalendarObjects(startDate.toISOString(), endDate.toISOString()).then((calendarObjects) => {
      if (calendarObjects) {
        adapter.log.info("found " + calendarObjects.length + " calendar objects");
        for (const i in calendarObjects) {
          calEvents.push(new IcalCalendarEvent(calendarObjects[i].data, this.name, startDate, endDate));
        }
      }
      return null;
    }).catch((reason) => {
      return reason.message;
    });
  }
  async addEvent(data) {
    let storeDefaultIgnoreSSL = null;
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
        iCalString: calendarEventData
      });
    } catch (error) {
      result = {
        ok: false,
        message: error
      };
    }
    if (storeDefaultIgnoreSSL !== null) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
    }
    return result;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DavCalCalendar,
  IcalCalendarEvent,
  initLib
});
//# sourceMappingURL=calDav.js.map

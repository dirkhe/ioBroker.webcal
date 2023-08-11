"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var google_exports = {};
__export(google_exports, {
  GoogleCalendar: () => GoogleCalendar,
  GoogleCalendarEvent: () => GoogleCalendarEvent,
  initLib: () => initLib
});
module.exports = __toCommonJS(google_exports);
var import_calendar = require("@googleapis/calendar");
var import_oauth2 = require("@googleapis/oauth2");
var import_calendarManager = require("./calendarManager");
let adapter;
let localTimeZone;
function initLib(adapterInstance, adapterLocalTimeZone) {
  adapter = adapterInstance;
  localTimeZone = adapterLocalTimeZone;
}
class GoogleCalendarEvent extends import_calendarManager.CalendarEvent {
  constructor(googleEvent, calendarName, endDate) {
    super(endDate, calendarName);
    this.googleEvent = googleEvent;
    try {
      this.summary = googleEvent.summary || "";
      this.description = googleEvent.description || "";
    } catch (error) {
      adapter.log.error("could not read calendar Event: " + error);
      adapter.log.debug(JSON.stringify(googleEvent));
      this.googleEvent = null;
    }
  }
  getNextTimeObj(isFirstCall) {
    if (!this.googleEvent || !isFirstCall) {
      return null;
    }
    let start;
    let end;
    if (this.googleEvent.start) {
      if (this.googleEvent.start.date) {
        start = new Date(this.googleEvent.start.date + "T00:00");
      } else {
        start = new Date(this.googleEvent.start.dateTime || "");
      }
    } else {
      start = new Date();
    }
    if (this.googleEvent.end) {
      if (this.googleEvent.end.date) {
        end = new Date(this.googleEvent.end.date + "T23:59");
      } else {
        end = new Date(this.googleEvent.end.dateTime || "");
      }
    } else {
      end = new Date();
    }
    return {
      startDate: start,
      endDate: end
    };
  }
}
class GoogleCalendar {
  constructor(calConfig) {
    this.name = calConfig.name;
    this.auth = new import_oauth2.auth.OAuth2(calConfig.clientId, calConfig.password);
    this.auth.setCredentials({
      refresh_token: calConfig.refreshToken
    });
    this.client = (0, import_calendar.calendar)({
      version: "v3",
      auth: this.auth
    });
  }
  async getCalendar(displayName) {
    var _a, _b;
    if (!this.calendarId) {
      const res = await this.client.calendarList.list();
      if (res && res.data && res.data.items) {
        const calendars = res.data.items;
        if (!displayName) {
          displayName = this.name;
        }
        if (displayName) {
          const displayNameLowerCase = displayName.toLocaleLowerCase();
          for (let i = 0; i < calendars.length; i++) {
            if (((_a = calendars[i].summary) == null ? void 0 : _a.toLowerCase()) == displayNameLowerCase || ((_b = calendars[i].summaryOverride) == null ? void 0 : _b.toLowerCase()) == displayNameLowerCase) {
              this.calendarId = calendars[i].id || "";
              return this.calendarId;
            }
          }
        }
        for (let i = 0; i < calendars.length; i++) {
          if (calendars[i].primary) {
            this.calendarId = calendars[i].id || "";
            break;
          }
        }
      }
    }
    return this.calendarId || "";
  }
  async getCalendarObjects(startDateISOString, endDateISOString) {
    const searchParams = {
      calendarId: await this.getCalendar(),
      singleEvents: true,
      orderBy: "startTime",
      timeZone: localTimeZone
    };
    if (startDateISOString) {
      searchParams.timeMin = startDateISOString;
      searchParams.timeMax = endDateISOString;
    }
    return this.client.events.list(searchParams);
  }
  loadEvents(calEvents, startDate, endDate) {
    return this.getCalendarObjects(startDate.toISOString(), endDate.toISOString()).then((res) => {
      var _a;
      const calendarObjects = (_a = res == null ? void 0 : res.data) == null ? void 0 : _a.items;
      if (calendarObjects) {
        adapter.log.info("found " + calendarObjects.length + " calendar objects");
        for (const i in calendarObjects) {
          calEvents.push(new GoogleCalendarEvent(calendarObjects[i], this.name, endDate));
        }
      }
      return null;
    }).catch((reason) => {
      return reason.message;
    });
  }
  async addEvent(calEvent) {
    let result;
    try {
      const start = typeof calEvent.startDate == "string" ? calEvent.startDate : import_calendarManager.CalendarEvent.getDateTimeISOStringFromEventDateTime(calEvent.startDate);
      const data = {
        summary: calEvent.summary,
        description: calEvent.description || "ioBroker webCal"
      };
      if (start.length > 10) {
        data.start = { dateTime: start, timeZone: localTimeZone };
      } else {
        data.start = { date: start };
      }
      if (calEvent.endDate) {
        const end = typeof calEvent.endDate == "string" ? calEvent.endDate : import_calendarManager.CalendarEvent.getDateTimeISOStringFromEventDateTime(calEvent.endDate);
        if (end.length > 10) {
          data.end = { dateTime: end, timeZone: localTimeZone };
        } else {
          data.end = { date: end };
        }
      } else {
        data.end = data.start;
      }
      const res = await this.client.events.insert({
        calendarId: await this.getCalendar(),
        requestBody: data
      });
      result = {
        ok: !!res.data,
        message: res.statusText
      };
    } catch (error) {
      result = {
        ok: false,
        message: error.message
      };
    }
    return result;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GoogleCalendar,
  GoogleCalendarEvent,
  initLib
});
//# sourceMappingURL=google.js.map

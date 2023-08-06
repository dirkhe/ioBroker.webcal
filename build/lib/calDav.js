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
var calDav_exports = {};
__export(calDav_exports, {
  DavCalCalendar: () => DavCalCalendar,
  initLib: () => initLib
});
module.exports = __toCommonJS(calDav_exports);
var import_tsdav = require("tsdav");
var import_IcalCalendarEvent = require("./IcalCalendarEvent");
let adapter;
function initLib(adapterInstance, localTimeZone) {
  adapter = adapterInstance;
  (0, import_IcalCalendarEvent.initLib)(adapterInstance, localTimeZone);
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
    if (!this.calendar) {
      if (!this.client.account) {
        await this.client.login();
      }
      const calendars = await this.client.fetchCalendars();
      if (displayName) {
        const displayNameLowerCase = displayName.toLocaleLowerCase();
        for (let i = 0; i < calendars.length; i++) {
          if (calendars[i].displayName && typeof calendars[i].displayName === "string" && calendars[i].displayName.toLowerCase() == displayNameLowerCase) {
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
          const ev = import_IcalCalendarEvent.IcalCalendarEvent.fromData(
            calendarObjects[i].data,
            this.name,
            startDate,
            endDate
          );
          ev && calEvents.push(ev);
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
      const calendarEventData = import_IcalCalendarEvent.IcalCalendarEvent.createIcalEventString(data);
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
  initLib
});
//# sourceMappingURL=calDav.js.map

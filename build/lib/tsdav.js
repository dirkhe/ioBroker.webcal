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
var tsdav_exports = {};
__export(tsdav_exports, {
  DavCal: () => DavCal
});
module.exports = __toCommonJS(tsdav_exports);
var import_tsdav = require("tsdav");
class DavCal {
  constructor(params, ignoreSSL) {
    this.ignoreSSL = false;
    this.isLoggedIn = false;
    this.client = new import_tsdav.DAVClient(params);
    this.ignoreSSL = !!ignoreSSL;
  }
  async login() {
    let storeDefaultIgnoreSSL = null;
    if (this.ignoreSSL) {
      storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    await this.client.login().then(() => {
      this.isLoggedIn = true;
    }).finally(() => {
      if (storeDefaultIgnoreSSL !== null) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
      }
    });
    return this.isLoggedIn;
  }
  async getCalendar(displayName) {
    var _a;
    if (!this.calendar) {
      if (!this.isLoggedIn) {
        await this.login();
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
  async getEvents(startDateISOString, endDateISOString) {
    const searchParams = {
      calendar: await this.getCalendar()
    };
    if (startDateISOString) {
      searchParams.timeRange = {
        start: startDateISOString,
        end: endDateISOString || startDateISOString
      };
    }
    return this.client.fetchCalendarObjects(searchParams);
  }
  async addEvent(iCalString) {
    const result = await this.client.createCalendarObject({
      calendar: await this.getCalendar(),
      filename: new Date().getTime() + ".ics",
      iCalString
    });
    return result;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DavCal
});
//# sourceMappingURL=tsdav.js.map

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
var iCalReadOnly_exports = {};
__export(iCalReadOnly_exports, {
  ICalReadOnlyClient: () => ICalReadOnlyClient,
  initLib: () => initLib
});
module.exports = __toCommonJS(iCalReadOnly_exports);
var import_axios = __toESM(require("axios"));
var import_IcalCalendarEvent = require("./IcalCalendarEvent");
function initLib(adapterInstance) {
  (0, import_IcalCalendarEvent.initLib)(adapterInstance);
}
class ICalReadOnlyClient {
  constructor(calConfig) {
    this.ignoreSSL = false;
    this.name = calConfig.name;
    this.ignoreSSL = !!calConfig.ignoreSSL;
    this.axiosOptions = {
      method: "get",
      responseType: "text",
      url: calConfig.serverUrl
    };
    if (calConfig.username) {
      this.axiosOptions.auth = {
        username: calConfig.username,
        password: calConfig.password
      };
    }
  }
  /**
   * fetch Events form Calendar and pushed them to calEvents Array
   * @param calEvents target Array of ICalendarEventBase
   * @param startDate as date object
   * @param endDate as date object
   * @returns null or errorstring
   */
  loadEvents(calEvents, startDate, endDate) {
    let storeDefaultIgnoreSSL = null;
    if (this.ignoreSSL && process.env.NODE_TLS_REJECT_UNAUTHORIZED != "0") {
      storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    return (0, import_axios.default)(this.axiosOptions).then((response) => {
      if (response.data) {
        const allEvents = (0, import_IcalCalendarEvent.getAllIcalCalendarEvents)(response.data, this.name, startDate, endDate, true);
        for (const i in allEvents) {
          calEvents.push(allEvents[i]);
        }
        return null;
      } else {
        throw "Error while reading from URL " + this.axiosOptions.url + ": Received no data";
      }
    }).catch((error) => {
      if (error.response) {
        return `Error reading from URL "${this.axiosOptions.url}": ${error.response.status}`;
      } else if (error.request) {
        return `Error reading from URL "${this.axiosOptions.url}"`;
      } else {
        return `Error reading from URL "${this.axiosOptions.url}": ${error.message}`;
      }
    }).catch((reason) => {
      return reason.message;
    }).finally(() => {
      if (storeDefaultIgnoreSSL !== null) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
      }
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async addEvent(calEvent) {
    return {
      ok: false,
      message: "calender is readonly (" + this.name + ")"
    };
  }
  /**
   * delte Event from Calendar
   * @param id event id
   * @returns Server response, like {ok:boolen}
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteEvent(id) {
    return {
      ok: false,
      message: "calender is readonly (" + this.name + ")"
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ICalReadOnlyClient,
  initLib
});
//# sourceMappingURL=iCalReadOnly.js.map

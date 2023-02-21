"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var utils = __toESM(require("@iobroker/adapter-core"));
var import_fs = __toESM(require("fs"));
var import_calDav = require("./lib/calDav");
var import_calendarManager = require("./lib/calendarManager");
var import_eventManager = require("./lib/eventManager");
var import_google = require("./lib/google");
let adapter;
const i18n = {
  "all day": "all day",
  from: "from",
  until: "until",
  now: "now",
  today: "today",
  day: "day",
  days: "days",
  starttime: "starttime",
  "add Event": "add Event",
  "create new Event in calendar, see Readme": "create new Event in calendar, see Readme",
  "could not found calendar for": "could not found calendar for",
  "invalid date": "invalid date",
  "successfully added": "successfully added",
  Tomorrow: "Tomorrow",
  inXDays: "in %d days",
  dateOrPeriod: "date or time period",
  "next Event": "next Event"
};
class Webcal extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "webcal"
    });
    this.fetchCalendarIntervallTimerID = null;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.eventManager = new import_eventManager.EventManager(this, i18n);
    this.calendarManager = new import_calendarManager.CalendarManager(this, i18n);
  }
  async onReady() {
    await this.initLocales();
    this.eventManager.init(this.config);
    this.calendarManager.init(this.config);
    (0, import_calDav.initLib)(this, import_calendarManager.localTimeZone);
    (0, import_google.initLib)(this, import_calendarManager.localTimeZone);
    if (this.config.calendars) {
      for (let c = 0; c < this.config.calendars.length; c++) {
        this.calendarManager.addCalendar(
          this.createCalendarFromConfig(this.config.calendars[c]),
          this.config.calendars[c].name
        );
      }
      this.fetchCalendars();
      if (this.config.intervall > 0) {
        adapter.log.info("fetch calendar data all " + this.config.intervall + " minutes");
        this.fetchCalendarIntervallTimerID = setInterval(
          this.fetchCalendars.bind(this),
          this.config.intervall * 6e4
        );
      }
    }
    this.subscribeStates("fetchCal");
    this.subscribeStates("events.*.addEvent");
  }
  fetchCalendars() {
    this.eventManager.resetAll();
    this.calendarManager.fetchCalendars().then((calEvents) => {
      for (let i = 0; i < calEvents.length; i++) {
        calEvents[i].searchForEvents(this.eventManager.events);
      }
      this.eventManager.syncFlags();
    });
  }
  createCalendarFromConfig(calConfig) {
    if (calConfig.password) {
      if (calConfig.authMethod == "google") {
        return new import_google.GoogleCalendar(calConfig);
      } else {
        return new import_calDav.DavCalCalendar(calConfig);
      }
    }
    return null;
  }
  async addEvent(expression, summary) {
    adapter.log.debug("add event to calender: " + expression);
    let terms = expression.split("@", 2);
    expression = " " + expression;
    const calendarName = terms.length > 1 ? terms[1] : void 0;
    const eventData = {
      summary,
      startDate: ""
    };
    if (terms[0].length < 4) {
      const days = parseInt(terms[0], 10);
      if (!isNaN(days)) {
        eventData.startDate = new Date(new Date().setDate(new Date().getDate() + days)).toISOString().substring(0, 10);
      } else {
        return { statusText: i18n["invalid date"] + expression, errNo: 4 };
      }
    } else {
      terms = terms[0].split(" - ");
      let date = import_calendarManager.CalendarEvent.parseDateTime(terms[0]);
      if (!date.year) {
        return { statusText: i18n["invalid date"] + expression, errNo: 2 };
      }
      eventData.startDate = date;
      if (terms[1]) {
        date = import_calendarManager.CalendarEvent.parseDateTime(terms[1]);
        if (!date.year) {
          return { statusText: i18n["invalid date"] + expression, errNo: 3 };
        }
        eventData.endDate = date;
      }
    }
    const result = await this.calendarManager.addEvent(eventData, calendarName);
    if (result.ok) {
      return { statusText: i18n["successfully added"] + expression, errNo: 0 };
    } else {
      return { statusText: result.message + " " + expression, errNo: 5 };
    }
  }
  async initLocales() {
    const systemConfig = await this.getForeignObjectAsync("system.config");
    if (systemConfig) {
      const language = systemConfig.common.language;
      if (language) {
        const data = import_fs.default.readFileSync("./admin/i18n/" + language + "/translations.json");
        if (data) {
          try {
            const trans = JSON.parse(data.toString());
            for (const key in i18n) {
              if (trans[key]) {
                i18n[key] = trans[key];
              }
            }
          } catch (error) {
            this.log.warn("error on loading translation, use english\n" + error);
          }
        } else {
          this.log.warn("could not load translation, use english");
        }
      }
    }
  }
  onUnload(callback) {
    try {
      if (this.fetchCalendarIntervallTimerID) {
        clearInterval(this.fetchCalendarIntervallTimerID);
      }
      this.eventManager.resetAll();
      callback();
    } catch (e) {
      callback();
    }
  }
  onStateChange(id, state) {
    if (!state || state.ack) {
      return;
    }
    this.log.info(`state ${id} changed: ${state.val}`);
    const stateId = id.split(".").pop();
    switch (stateId) {
      case "fetchCal":
        if (state.val) {
          this.fetchCalendars();
          this.setStateAsync(id, false, true);
        }
        break;
      case "addEvent":
        if (state.val) {
          this.getObjectAsync(id.substring(0, id.lastIndexOf("."))).then((obj) => {
            this.addEvent(state.val, obj == null ? void 0 : obj.common.name).then((result) => {
              this.setStateAsync(id, result.statusText, true);
              this.fetchCalendars();
              this.setTimeout(() => {
                this.setStateAsync(id, "", true);
              }, 6e4);
            });
          });
        }
        break;
    }
  }
  onMessage(obj) {
    this.log.info(JSON.stringify(obj));
    if (typeof obj === "object" && obj.message) {
      if (obj.command === "testCalendar") {
        if (obj.callback) {
          const calObj = this.createCalendarFromConfig(obj.message.calData);
          if (calObj) {
            const error = calObj.loadEvents(
              [],
              new Date(),
              new Date(new Date().setDate(new Date().getDate() + 15))
            );
            if (error) {
              this.sendTo(obj.from, obj.command, { result: error }, obj.callback);
            } else {
              this.sendTo(obj.from, obj.command, { result: "success" }, obj.callback);
            }
          }
        } else {
          this.sendTo(obj.from, obj.command, { result: "could not create Calendar" }, obj.callback);
        }
      }
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => adapter = new Webcal(options);
} else {
  (() => adapter = new Webcal())();
}
//# sourceMappingURL=main.js.map

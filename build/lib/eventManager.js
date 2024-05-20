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
var eventManager_exports = {};
__export(eventManager_exports, {
  Event: () => Event,
  EventManager: () => EventManager
});
module.exports = __toCommonJS(eventManager_exports);
var import_dayjs = __toESM(require("dayjs"));
var import_regex_escape = __toESM(require("regex-escape"));
let adapter;
let i18n = {};
const _Event = class _Event {
  constructor(config) {
    this.stateValues = {};
    this.nowFlag = null;
    var _a;
    this.name = config.name;
    this.id = this.name.replace(/[^a-z0-9_-]/gi, "");
    this.regEx = new RegExp(config.regEx || (0, import_regex_escape.default)(config.name), "i");
    if (config.calendars) {
      this.calendars = [];
      for (const i in config.calendars) {
        if (config.calendars[i]) {
          this.calendars.push(config.calendars[i]);
        }
      }
      if (!((_a = this.calendars) == null ? void 0 : _a.length)) {
        this.calendars = void 0;
      }
    }
    this.defaultCalendar = config.defaultCalendar;
    this.useIQontrol = !!config.useIQontrol;
  }
  checkCalendarContent(content, calendarName) {
    if (calendarName && this.calendars && this.calendars.indexOf(calendarName) == -1) {
      return false;
    }
    return this.regEx.test(content) || content.indexOf(this.name) >= 0;
  }
  addCalendarEvent(days) {
    let values;
    for (const d in days) {
      const day = d;
      values = this.stateValues[day];
      if (!values) {
        values = this.stateValues[day] = [];
      }
      values.push(days[day]);
    }
    adapter.log.silly("days for event '" + this.name + "': " + JSON.stringify(this.stateValues));
    const today = days[0];
    if (today) {
      const startTime = today.startTime || "00:00";
      const endTime = today.endTime || "23:59";
      if (this.nowFlag) {
        if (!this.nowFlag.allDay) {
          let curTime = null;
          for (let i = 0; curTime == null && i < this.nowFlag.times.length; i++) {
            curTime = this.nowFlag.times[i];
            if (startTime < curTime.start) {
              if (curTime.start > endTime) {
                this.nowFlag.times.splice(i, 0, {
                  start: startTime,
                  end: endTime
                });
              } else {
                curTime.start = startTime;
                if (endTime > curTime.end) {
                  curTime.end = endTime;
                }
              }
            } else if (startTime == curTime.start || startTime < curTime.end) {
              if (endTime > curTime.end) {
                curTime.end = endTime;
              }
            } else {
              curTime = null;
            }
          }
          if (curTime == null) {
            this.nowFlag.times.push({
              start: startTime,
              end: endTime
            });
          } else if (curTime.start == "00:00" && curTime.end == "23:59") {
            this.nowFlag.allDay = true;
          }
        }
      } else {
        this.nowFlag = {
          times: [],
          timerID: null,
          allDay: today.isAllday()
        };
        if (!this.nowFlag.allDay) {
          this.nowFlag.times.push({ start: startTime, end: endTime });
        }
      }
    }
  }
  reset() {
    this.stateValues = {};
    if (this.nowFlag && this.nowFlag.timerID) {
      clearTimeout(this.nowFlag.timerID);
    }
    this.nowFlag = null;
  }
  syncFlags() {
    adapter.getStatesAsync(_Event.namespace + this.id + ".*").then((states) => {
      if (states) {
        for (const stateId in states) {
          const evID = parseInt(stateId.split(".").pop() || "0", 10);
          if (!isNaN(evID)) {
            adapter.setStateChangedAsync(stateId, (this.stateValues[evID] || []).join(", "), true);
          }
        }
      }
    });
    const jsonData = [];
    let next = /* @__PURE__ */ new Date("9999-12-31");
    const now = /* @__PURE__ */ new Date();
    for (const d in this.stateValues) {
      const dInt = parseInt(d, 10);
      const dateText = dInt < -1 ? i18n.xDaysAgo.replace("%d", Math.abs(dInt).toString()) : dInt == -1 ? i18n.yesterday : dInt == 0 ? i18n.today : dInt == 1 ? i18n.Tomorrow : dInt > 1 ? i18n.inXDays.replace("%d", d) : "";
      const times = this.stateValues[d];
      for (const i in times) {
        const time = {
          ...times[i],
          timeText: times[i].toString(),
          dateText
        };
        jsonData.push(time);
        if (time.date > now && time.date < next) {
          next = time.date;
        }
      }
    }
    adapter.setStateChangedAsync(_Event.namespace + this.id + ".data", JSON.stringify(jsonData), true);
    adapter.setStateChangedAsync(
      _Event.namespace + this.id + ".next",
      next.getFullYear() < 9999 ? next.toISOString() : "",
      true
    );
    this.updateNowFlag();
  }
  updateNowFlag() {
    let stateText = "";
    if (this.nowFlag) {
      if (this.nowFlag.timerID != null) {
        clearTimeout(this.nowFlag.timerID);
        this.nowFlag.timerID = null;
      }
      if (this.nowFlag.allDay) {
        stateText = i18n.allDay;
      } else {
        for (let i = 0; i < this.nowFlag.times.length; i++) {
          const todayStr = (0, import_dayjs.default)().format("YYYY-MM-DDT");
          const timeUntilStart = (0, import_dayjs.default)(todayStr + this.nowFlag.times[i].start).diff();
          const timerUntilStop = (0, import_dayjs.default)(todayStr + this.nowFlag.times[i].end).diff();
          if (timeUntilStart <= 0 && timerUntilStop > 0) {
            stateText = this.nowFlag.times[i].start != "00:00" ? i18n["from"] + " " + this.nowFlag.times[i].start : "";
            stateText += this.nowFlag.times[i].end != "23:59" ? (stateText ? " " : "") + i18n["until"] + " " + this.nowFlag.times[i].end : "";
            this.nowFlag.timerID = setTimeout(
              function(event) {
                event.updateNowFlag();
              },
              timerUntilStop,
              this
            );
            break;
          } else {
            if (timeUntilStart > 0) {
              this.nowFlag.timerID = setTimeout(
                function(event) {
                  event.updateNowFlag();
                },
                timeUntilStart,
                this
              );
              break;
            }
          }
        }
      }
    }
    adapter.setStateChangedAsync(_Event.namespace + this.id + ".now", stateText, true);
  }
};
_Event.namespace = "events.";
_Event.daysFuture = 3;
_Event.daysPast = 0;
let Event = _Event;
class EventManager {
  constructor(adapterInstance, i18nInstance) {
    adapter = adapterInstance;
    i18n = i18nInstance;
    this.events = {};
    Event.namespace = adapter.namespace + "." + Event.namespace;
  }
  init(config) {
    adapter.log.info("init events");
    Event.daysFuture = config.daysEventFuture;
    Event.daysPast = config.daysEventPast;
    for (let i = 0; i < config.events.length; i++) {
      const event = new Event(config.events[i]);
      this.events[event.id] = event;
    }
    this.syncEventStateObjects();
  }
  /**
   * create/update/delete all Event State objects based on config
   */
  syncEventStateObjects() {
    const allEventIDs = {};
    for (const evID in this.events) {
      allEventIDs[evID] = true;
    }
    const eventFlags = {
      now: i18n["now"],
      addEvent: i18n.addEvent,
      next: i18n.nextEvent,
      data: "data",
      "0": i18n["today"]
    };
    for (let d = 1; d <= Event.daysPast; d++) {
      eventFlags[-d] = i18n["today"] + " - " + d + " " + (d == 1 ? i18n["day"] : i18n["days"]);
    }
    for (let d = 1; d <= Event.daysFuture; d++) {
      eventFlags[d] = i18n["today"] + " + " + d + " " + (d == 1 ? i18n["day"] : i18n["days"]);
    }
    adapter.getChannelsOf("events", (_err, eventObjs) => {
      if (eventObjs) {
        for (let e = 0; e < (eventObjs == null ? void 0 : eventObjs.length); e++) {
          const eventObj = eventObjs[e];
          const evID = eventObj._id.split(".").pop() || "";
          if (this.events[evID]) {
            delete allEventIDs[evID];
            adapter.getStatesAsync(eventObj._id + ".*").then((states) => {
              if (states) {
                for (const stateId in states) {
                  if (!eventFlags[stateId.split(".").pop() || ""]) {
                    adapter.log.info("delete flag " + stateId);
                    adapter.delObjectAsync(stateId);
                  }
                }
              }
            });
            for (const id in eventFlags) {
              this.addEventFlagObject(eventObj._id + "." + id, eventFlags[id]);
            }
          } else {
            adapter.log.info("delete event state " + eventObj._id);
            adapter.delObjectAsync(eventObj._id, { recursive: true });
          }
        }
      }
      for (const evID in allEventIDs) {
        adapter.log.info("create event " + this.events[evID].name);
        adapter.createChannel("events", evID, (_err2, eventObj) => {
          if (eventObj) {
            adapter.extendObjectAsync(eventObj.id, {
              common: {
                name: this.events[evID].name
              }
            });
            for (const id in eventFlags) {
              this.addEventFlagObject(eventObj.id + "." + id, eventFlags[id]);
            }
          }
        });
      }
    });
    adapter.setTimeout(this.syncIQontrolStates.bind(this), 2e3);
  }
  addEventFlagObject(id, name) {
    const obj = {
      type: "state",
      common: {
        name,
        type: "string",
        role: "text",
        read: true,
        write: false,
        def: "",
        desc: i18n["starttime"]
      },
      native: {},
      _id: id
    };
    if (id.endsWith("addEvent")) {
      obj.common.write = true;
      obj.common.desc = i18n.createNewEvent;
      const idTerms = id.split(".");
      if (this.events[idTerms[idTerms.length - 2]].useIQontrol) {
        obj.common.custom = {
          "iqontrol.0": {
            enabled: true,
            statesAddInput: true,
            statesAddInputCaption: i18n.dateOrPeriod,
            showOnlyTargetValues: false,
            type: "string",
            role: "text"
          }
        };
      }
    } else if (id.endsWith("data")) {
      obj.common.desc = "data as JSON";
      obj.common.role = "json";
    }
    adapter.setObjectAsync(id, obj);
  }
  syncIQontrolStates() {
    if (this.iQontrolTimerID) {
      adapter.clearTimeout(this.iQontrolTimerID);
    }
    adapter.log.info("update addEvent-states");
    const iqontrolStates = {
      "0": i18n.today,
      "1": i18n.Tomorrow
    };
    const d = (/* @__PURE__ */ new Date()).getDay();
    for (let i = 2; i < 7; i++) {
      iqontrolStates[i.toString()] = i18n["weekDaysFull" + new String((d + i) % 7)] + " " + i18n.inXDays.replace("%d", i.toString());
    }
    for (const id in this.events) {
      if (this.events[id].useIQontrol) {
        adapter.getObjectAsync(Event.namespace + id + ".addEvent").then((eventObj) => {
          if (eventObj && eventObj.common.custom && eventObj.common.custom["iqontrol.0"]) {
            eventObj.common.custom["iqontrol.0"]["states"] = iqontrolStates;
            adapter.setObject(eventObj._id, eventObj);
          }
        });
      }
    }
    const midNight = /* @__PURE__ */ new Date();
    midNight.setDate(midNight.getDate() + 1);
    midNight.setHours(0, 10, 0);
    this.iQontrolTimerID = adapter.setTimeout(
      this.syncIQontrolStates.bind(this),
      midNight.getTime() - (/* @__PURE__ */ new Date()).getTime()
    );
  }
  syncFlags() {
    for (const evID in this.events) {
      this.events[evID].syncFlags();
    }
  }
  resetAll() {
    for (const evID in this.events) {
      this.events[evID].reset();
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Event,
  EventManager
});
//# sourceMappingURL=eventManager.js.map

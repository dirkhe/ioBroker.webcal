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
var eventManager_exports = {};
__export(eventManager_exports, {
  Event: () => Event,
  EventManager: () => EventManager
});
module.exports = __toCommonJS(eventManager_exports);
var import_regex_escape = __toESM(require("regex-escape"));
let adapter;
let i18n = {};
const _Event = class {
  constructor(config) {
    this.stateValues = {};
    this.nowFlag = null;
    this.name = config.name;
    this.id = this.name.replace(/[^a-z0-9_-]/gi, "");
    this.regEx = new RegExp(config.regEx || (0, import_regex_escape.default)(config.name), "i");
    _Event.namespace = adapter.namespace + "." + _Event.namespace;
  }
  checkCalendarContent(content) {
    return this.regEx.test(content);
  }
  addCalendarEvent(timeObj, days) {
    if (!timeObj.start) {
      return;
    }
    let values;
    for (const d in days) {
      const day = d;
      if (day >= _Event.daysPast && day <= _Event.daysFuture) {
        values = this.stateValues[day];
        if (!values) {
          values = this.stateValues[day] = [];
        }
        values.push(days[day]);
      }
    }
    adapter.log.debug("days for event: " + JSON.stringify(this.stateValues));
    if (days[0]) {
      if (this.nowFlag && days[0] != i18n["all day"]) {
        if (!this.nowFlag.allDay) {
          let curTime = null;
          for (let i = 0; curTime == null && i < this.nowFlag.times.length; i++) {
            curTime = this.nowFlag.times[i];
            if (timeObj.start.isBefore(curTime.start)) {
              if (timeObj.end.isBefore(curTime.start)) {
                this.nowFlag.times.splice(i, 0, {
                  start: timeObj.start,
                  end: timeObj.end
                });
              } else {
                curTime.start = timeObj.start;
                if (timeObj.end.isAfter(curTime.end)) {
                  curTime.end = timeObj.end;
                }
              }
            } else if (timeObj.start.isSame(curTime.start) || timeObj.start.isBefore(curTime.end)) {
              if (timeObj.end.isAfter(curTime.end)) {
                curTime.end = timeObj.end;
              }
            } else {
              curTime = null;
            }
          }
          if (curTime == null) {
            this.nowFlag.times.push({
              start: timeObj.start,
              end: timeObj.end
            });
          }
        }
      } else {
        this.nowFlag = {
          times: [],
          timerID: null,
          allDay: days[0] == i18n["all day"]
        };
        if (!this.nowFlag.allDay) {
          this.nowFlag.times.push({ start: timeObj.start, end: timeObj.end });
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
        stateText = i18n["all day"];
      } else {
        for (let i = 0; i < this.nowFlag.times.length; i++) {
          const timeUntilStart = this.nowFlag.times[i].start.diff();
          const timerUntilStop = this.nowFlag.times[i].end.diff();
          if (timeUntilStart <= 0 && timerUntilStop > 0) {
            stateText = this.nowFlag.times[i].start.format("HH:mm");
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
let Event = _Event;
Event.namespace = "events.";
Event.daysFuture = 3;
Event.daysPast = 0;
class EventManager {
  constructor(adapterInstance, i18nInstance) {
    adapter = adapterInstance;
    i18n = i18nInstance;
    this.events = {};
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
  syncEventStateObjects() {
    const allEventIDs = {};
    for (const evID in this.events) {
      allEventIDs[evID] = true;
    }
    const eventFlags = {
      now: i18n["now"],
      addEvent: i18n["add Event"],
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
  }
  addEventFlagObject(id, name) {
    adapter.setObjectNotExistsAsync(id, {
      type: "state",
      common: {
        name,
        type: "string",
        role: "text",
        read: true,
        write: false,
        def: "",
        desc: id.endsWith("addEvent") ? i18n["create new Event in calendar, see Readme"] : i18n["starttime"]
      },
      native: {}
    });
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

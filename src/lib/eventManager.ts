import { AdapterInstance } from "@iobroker/adapter-core";
import dayjs from "dayjs";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import RegExpEscape from "regex-escape";
import { jsonEvent } from "./calendarManager";

let adapter: AdapterInstance;
let i18n: Record<string, string> = {};

export class Event {
	static namespace = "events.";
	static daysFuture = 3;
	static daysPast = 0;
	id: string;
	name: string;
	regEx: RegExp;
	calendars?: Array<string>;
	defaultCalendar?: string;
	useIQontrol: boolean;
	stateValues: Record<number, Array<jsonEvent>> = {};
	nowFlag: {
		times: Array<webcal.IEventTimeRangObj>;
		timerID: NodeJS.Timeout | null;
		allDay: boolean;
	} | null = null;

	constructor(config: webcal.IConfigEvent) {
		this.name = config.name;
		this.id = this.name.replace(/[^a-z0-9_-]/gi, "");
		this.regEx = new RegExp(config.regEx || RegExpEscape(config.name), "i");
		if (config.calendars) {
			this.calendars = [];
			for (const i in config.calendars) {
				if (config.calendars[i]) {
					this.calendars.push(config.calendars[i]);
				}
			}
			if (!this.calendars?.length) {
				this.calendars = undefined;
			}
		}
		this.defaultCalendar = config.defaultCalendar;
		this.useIQontrol = !!config.useIQontrol;
	}

	checkCalendarContent(content: string, calendarName: string): boolean {
		if (calendarName && this.calendars && this.calendars.indexOf(calendarName) == -1) {
			return false;
		}
		return this.regEx.test(content) || content.indexOf(this.name) >= 0;
	}

	addCalendarEvent(days: Record<number, jsonEvent>): void {
		let values;
		for (const d in days) {
			const day: number = d as unknown as number;
			//if (day >= -Event.daysPast && day <= Event.daysFuture) {
			values = this.stateValues[day];
			if (!values) {
				values = this.stateValues[day] = [];
			}
			values.push(days[day]);
			//}
		}
		adapter.log.silly("days for event '" + this.name + "': " + JSON.stringify(this.stateValues));
		const today = days[0];
		if (today) {
			// we have a hit today
			const startTime = today.startTime || "00:00";
			const endTime = today.endTime || "23:59";
			if (this.nowFlag) {
				if (!this.nowFlag.allDay) {
					let curTime = null;
					for (let i = 0; curTime == null && i < this.nowFlag.times.length; i++) {
						curTime = this.nowFlag.times[i];
						if (startTime < curTime.start) {
							if (curTime.start > endTime) {
								// hole timeframe is befor cur timeframe, so we insert it as new item
								this.nowFlag.times.splice(i, 0, {
									start: startTime,
									end: endTime,
								});
							} else {
								// we will start earlier
								curTime.start = startTime;
								if (endTime > curTime.end) {
									// the endtime is later then cur timeframe, so we stopps later
									curTime.end = endTime;
								}
							}
						} else if (startTime == curTime.start || startTime < curTime.end) {
							if (endTime > curTime.end) {
								// the endtime is later then cur timeframe, so we stopps later
								curTime.end = endTime;
							}
						} else {
							curTime = null;
						}
					}

					if (curTime == null) {
						this.nowFlag.times.push({
							start: startTime,
							end: endTime,
						});
					} else if (curTime.start == "00:00" && curTime.end == "23:59") {
						this.nowFlag.allDay = true;
					}
				}
			} else {
				// first entry
				this.nowFlag = {
					times: [],
					timerID: null,
					allDay: today.isAllday(),
				};
				if (!this.nowFlag.allDay) {
					this.nowFlag.times.push({ start: startTime, end: endTime });
				}
			}
		}
	}

	reset(): void {
		this.stateValues = {};
		if (this.nowFlag && this.nowFlag.timerID) {
			clearTimeout(this.nowFlag.timerID);
		}
		this.nowFlag = null;
	}

	syncFlags(): void {
		adapter.getStatesAsync(Event.namespace + this.id + ".*").then((states) => {
			if (states) {
				for (const stateId in states) {
					const evID = parseInt(stateId.split(".").pop() || "0", 10);
					if (!isNaN(evID)) {
						// its a number, so it will be a day state
						adapter.setStateChangedAsync(stateId, (this.stateValues[evID] || []).join(", "), true);
					}
				}
			}
		});
		const jsonData = [];
		let next = new Date("9999-12-31");
		const now = new Date();
		for (const d in this.stateValues) {
			const dInt = parseInt(d, 10);
			const dateText =
				dInt < -1
					? i18n.xDaysAgo.replace("%d", Math.abs(dInt).toString())
					: dInt == -1
						? i18n.yesterday
						: dInt == 0
							? i18n.today
							: dInt == 1
								? i18n.Tomorrow
								: dInt > 1
									? i18n.inXDays.replace("%d", d)
									: "";
			const times = this.stateValues[d];
			for (const i in times) {
				const time = {
					...times[i],
					timeText: times[i].toString(),
					dateText,
				};
				jsonData.push(time);
				if (time.date > now && time.date < next) {
					next = time.date;
				}
			}
		}
		adapter.setStateChangedAsync(Event.namespace + this.id + ".data", JSON.stringify(jsonData), true);
		adapter.setStateChangedAsync(
			Event.namespace + this.id + ".next",
			next.getFullYear() < 9999 ? next.toISOString() : "",
			true,
		);
		this.updateNowFlag();
	}

	updateNowFlag(): void {
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
					const todayStr = dayjs().format("YYYY-MM-DDT");
					const timeUntilStart = dayjs(todayStr + this.nowFlag.times[i].start).diff();
					const timerUntilStop = dayjs(todayStr + this.nowFlag.times[i].end).diff();
					if (timeUntilStart <= 0 && timerUntilStop > 0) {
						// starttime is in the past and endTime is in the future
						stateText =
							this.nowFlag.times[i].start != "00:00"
								? i18n["from"] + " " + this.nowFlag.times[i].start
								: "";
						stateText +=
							this.nowFlag.times[i].end != "23:59"
								? (stateText ? " " : "") + i18n["until"] + " " + this.nowFlag.times[i].end
								: "";
						this.nowFlag.timerID = setTimeout(
							function (event) {
								event.updateNowFlag();
							},
							timerUntilStop,
							this,
						);
						break;
					} else {
						if (timeUntilStart > 0) {
							// starttime is in the future
							this.nowFlag.timerID = setTimeout(
								function (event) {
									event.updateNowFlag();
								},
								timeUntilStart,
								this,
							);
							break;
						}
					}
				}
			}
		}
		adapter.setStateChangedAsync(Event.namespace + this.id + ".now", stateText, true);
	}
}

export class EventManager {
	events: Record<string, Event>;
	iQontrolTimerID?: ioBroker.Timeout;

	constructor(adapterInstance: AdapterInstance, i18nInstance: any) {
		adapter = adapterInstance;
		i18n = i18nInstance;
		this.events = {};
		Event.namespace = adapter.namespace + "." + Event.namespace;
	}

	init(config: ioBroker.AdapterConfig): void {
		adapter.log.info("init events");
		Event.daysFuture = config.daysEventFuture;
		Event.daysPast = config.daysEventPast;
		// init all Events
		for (let i = 0; i < config.events.length; i++) {
			const event = new Event(config.events[i]);
			this.events[event.id] = event;
		}
		this.syncEventStateObjects();
	}

	/**
	 * create/update/delete all Event State objects based on config
	 */
	syncEventStateObjects(): void {
		const allEventIDs: Record<string, boolean> = {};
		for (const evID in this.events) {
			allEventIDs[evID] = true;
		}

		const eventFlags: Record<string, string> = {
			now: i18n["now"],
			addEvent: i18n.addEvent,
			next: i18n.nextEvent,
			data: "data",
			"0": i18n["today"],
		};
		for (let d = 1; d <= Event.daysPast; d++) {
			eventFlags[-d] = i18n["today"] + " - " + d + " " + (d == 1 ? i18n["day"] : i18n["days"]);
		}
		for (let d = 1; d <= Event.daysFuture; d++) {
			eventFlags[d] = i18n["today"] + " + " + d + " " + (d == 1 ? i18n["day"] : i18n["days"]);
		}

		adapter.getChannelsOf("events", (_err, eventObjs) => {
			if (eventObjs) {
				for (let e = 0; e < eventObjs?.length; e++) {
					const eventObj = eventObjs[e];
					const evID: string = eventObj._id.split(".").pop() || "";
					if (this.events[evID]) {
						delete allEventIDs[evID];
						adapter.getStatesAsync(eventObj._id + ".*").then((states) => {
							if (states) {
								for (const stateId in states) {
									if (!eventFlags[stateId.split(".").pop() || ""]) {
										adapter.log.info("delete flag " + stateId);
										//this.delForeignObjectAsync(stateId);
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
						//this.delForeignObjectAsync(eventObj._id, { recursive: true });
						adapter.delObjectAsync(eventObj._id, { recursive: true });
					}
				}
			}

			for (const evID in allEventIDs) {
				adapter.log.info("create event " + this.events[evID].name);
				adapter.createChannel("events", evID, (_err, eventObj) => {
					if (eventObj) {
						adapter.extendObjectAsync(eventObj.id, {
							common: {
								name: this.events[evID].name,
							},
						});
						for (const id in eventFlags) {
							this.addEventFlagObject(eventObj.id + "." + id, eventFlags[id]);
						}
					}
				});
			}
		});
		adapter.setTimeout(this.syncIQontrolStates.bind(this), 2000);
	}
	addEventFlagObject(id: string, name: string): void {
		const obj: ioBroker.StateObject = {
			type: "state",
			common: {
				name: name,
				type: "string",
				role: "text",
				read: true,
				write: false,
				def: "",
				desc: i18n["starttime"],
			},
			native: {},
			_id: id,
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
						role: "text",
					},
				};
			}
		} else if (id.endsWith("data")) {
			obj.common.desc = "data as JSON";
			obj.common.role = "json";
		}
		adapter.setObjectAsync(id, obj);
	}

	syncIQontrolStates(): void {
		if (this.iQontrolTimerID) {
			adapter.clearTimeout(this.iQontrolTimerID);
		}
		adapter.log.info("update addEvent-states");
		const iqontrolStates: Record<string, string> = {
			"0": i18n.today,
			"1": i18n.Tomorrow,
		};
		const d = new Date().getDay();
		for (let i = 2; i < 7; i++) {
			iqontrolStates[i.toString()] =
				i18n["weekDaysFull" + new String((d + i) % 7)] + " " + i18n.inXDays.replace("%d", i.toString());
		}
		for (const id in this.events) {
			if (this.events[id].useIQontrol) {
				adapter.getObjectAsync(Event.namespace + id + ".addEvent").then((eventObj) => {
					if (eventObj && eventObj.common.custom && eventObj.common.custom["iqontrol.0"]) {
						// eslint-disable-next-line @typescript-eslint/ban-ts-comment
						// @ts-ignore
						eventObj.common.custom["iqontrol.0"]["states"] = iqontrolStates;
						adapter.setObject(eventObj._id, eventObj);
					}
				});
			}
		}

		const midNight = new Date();
		midNight.setDate(midNight.getDate() + 1);
		midNight.setHours(0, 10, 0);
		this.iQontrolTimerID = adapter.setTimeout(
			this.syncIQontrolStates.bind(this),
			midNight.getTime() - new Date().getTime(),
		);
	}

	syncFlags(): void {
		for (const evID in this.events) {
			this.events[evID].syncFlags();
		}
	}

	resetAll(): void {
		/*
		if (this.iQontrolTimerID) {
			clearTimeout(this.iQontrolTimerID);
		} */
		for (const evID in this.events) {
			this.events[evID].reset();
		}
	}
}

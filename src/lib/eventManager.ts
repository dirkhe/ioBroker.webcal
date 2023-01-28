import { AdapterInstance } from "@iobroker/adapter-core";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import RegExpEscape from "regex-escape";

let adapter: AdapterInstance;
let i18n: Record<string, string> = {};

export class Event {
	static namespace = "events.";
	static daysFuture = 3;
	static daysPast = 0;
	id: string;
	name: string;
	regEx: RegExp;
	stateValues: Record<number, Array<string>> = {};
	nowFlag: {
		times: Array<webcal.IEventTimeRangObj>;
		timerID: NodeJS.Timeout | null;
		allDay: boolean;
	} | null = null;

	constructor(config: webcal.IConfigEvent) {
		this.name = config.name;
		this.id = this.name.replace(/[^a-z0-9_-]/gi, "");
		this.regEx = new RegExp(config.regEx || RegExpEscape(config.name), "i");
		Event.namespace = adapter.namespace + "." + Event.namespace;
	}

	checkCalendarContent(content: string): boolean {
		return this.regEx.test(content);
	}

	addCalendarEvent(timeObj: webcal.IEventTimeRangObj, days: Record<number, string>): void {
		if (!timeObj.start) {
			return;
		}
		let values;
		for (const d in days) {
			const day: number = d as unknown as number;
			if (day >= Event.daysPast && day <= Event.daysFuture) {
				values = this.stateValues[day];
				if (!values) {
					values = this.stateValues[day] = [];
				}
				values.push(days[day]);
			}
		}
		adapter.log.debug("days for event: " + JSON.stringify(this.stateValues));
		if (days[0]) {
			// we have a hit today
			if (this.nowFlag && days[0] != i18n["all day"]) {
				if (!this.nowFlag.allDay) {
					let curTime = null;
					for (let i = 0; curTime == null && i < this.nowFlag.times.length; i++) {
						curTime = this.nowFlag.times[i];
						if (timeObj.start.isBefore(curTime.start)) {
							if (timeObj.end.isBefore(curTime.start)) {
								// hole timeframe is befor cur timeframe, so we insert it as new item
								this.nowFlag.times.splice(i, 0, {
									start: timeObj.start,
									end: timeObj.end,
								});
							} else {
								// we will start earlier
								curTime.start = timeObj.start;
								if (timeObj.end.isAfter(curTime.end)) {
									// the endtime is later then cur timeframe, so we stopps later
									curTime.end = timeObj.end;
								}
							}
						} else if (timeObj.start.isSame(curTime.start) || timeObj.start.isBefore(curTime.end)) {
							if (timeObj.end.isAfter(curTime.end)) {
								// the endtime is later then cur timeframe, so we stopps later
								curTime.end = timeObj.end;
							}
						} else {
							curTime = null;
						}
					}

					if (curTime == null) {
						this.nowFlag.times.push({
							start: timeObj.start,
							end: timeObj.end,
						});
					}
				}
			} else {
				// first entry
				this.nowFlag = {
					times: [],
					timerID: null,
					allDay: days[0] == i18n["all day"],
				};
				if (!this.nowFlag.allDay) {
					this.nowFlag.times.push({ start: timeObj.start, end: timeObj.end });
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
				stateText = i18n["all day"];
			} else {
				for (let i = 0; i < this.nowFlag.times.length; i++) {
					const timeUntilStart = this.nowFlag.times[i].start.diff();
					const timerUntilStop = this.nowFlag.times[i].end.diff();
					if (timeUntilStart <= 0 && timerUntilStop > 0) {
						// starttime is in the past and endTime is in the future
						stateText = this.nowFlag.times[i].start.format("HH:mm");
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

	constructor(adapterInstance: AdapterInstance, i18nInstance: any) {
		adapter = adapterInstance;
		i18n = i18nInstance;
		this.events = {};
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
			addEvent: i18n["add Event"],
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
	}
	addEventFlagObject(id: string, name: string): void {
		adapter.setObjectNotExistsAsync(id, {
			type: "state",
			common: {
				name: name,
				type: "string",
				role: "text",
				read: true,
				write: false,
				def: "",
				desc: id.endsWith("addEvent") ? i18n["create new Event in calendar, see Readme"] : i18n["starttime"],
			},
			native: {},
		});
	}

	syncFlags(): void {
		for (const evID in this.events) {
			this.events[evID].syncFlags();
		}
	}

	resetAll(): void {
		for (const evID in this.events) {
			this.events[evID].reset();
		}
	}
}

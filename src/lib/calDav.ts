// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { AdapterInstance } from "@iobroker/adapter-core";
import { DAVAccount, DAVCalendar, DAVCalendarObject, DAVClient, DAVCredentials } from "tsdav";
import { IcalCalendarEvent, initLib as IcalInit } from "./IcalCalendarEvent";

let adapter: AdapterInstance;

export function initLib(adapterInstance: AdapterInstance): void {
	adapter = adapterInstance;
	IcalInit(adapterInstance);
}
export class DavCalCalendar implements webcal.ICalendarBase {
	name: string;
	client: DAVClient;
	ignoreSSL = false;
	calendar: DAVCalendar | undefined;

	constructor(calConfig: webcal.IConfigCalendar) {
		this.name = calConfig.name;
		const params: {
			serverUrl: string;
			credentials: DAVCredentials;
			authMethod?: "Basic" | "Oauth";
			defaultAccountType?: DAVAccount["accountType"] | undefined;
		} =
			calConfig.authMethod == "Oauth"
				? {
						serverUrl: calConfig.serverUrl,
						credentials: {
							tokenUrl: calConfig.tokenUrl,
							username: calConfig.username,
							refreshToken: calConfig.refreshToken,
							clientId: calConfig.clientId,
							clientSecret: calConfig.password,
						},
						authMethod: calConfig.authMethod,
						defaultAccountType: "caldav",
					}
				: {
						serverUrl: calConfig.serverUrl,
						credentials: {
							username: calConfig.username,
							password: calConfig.password,
						},
						authMethod: "Basic",
						defaultAccountType: "caldav",
					};
		if (!params.serverUrl.endsWith("/")) {
			params.serverUrl += "/";
		}
		this.client = new DAVClient(params);
		this.ignoreSSL = !!calConfig.ignoreSSL;
	}

	/**
	 * load Calendars from Server
	 * @param displayName if set, try to return Calendar with this name
	 * @returns Calender by displaName or last part of initial ServerUrl or first found Calendar
	 */
	private async getCalendar(displayName?: string): Promise<DAVCalendar> {
		if (!this.calendar) {
			if (!this.client.account) {
				await this.client.login();
			}
			const calendars: Array<DAVCalendar> = await this.client.fetchCalendars();
			//console.log(calendars)
			if (displayName) {
				const displayNameLowerCase = displayName.toLocaleLowerCase();
				for (let i = 0; i < calendars.length; i++) {
					if (
						calendars[i].displayName &&
						typeof calendars[i].displayName === "string" &&
						(calendars[i].displayName as string).toLowerCase() == displayNameLowerCase
					) {
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

	/**
	 * fetch Events form Calendar
	 * @param startDate as date object
	 * @param endDate as date object
	 * @returns Array of Calenderobjects
	 */
	private async getCalendarObjects(
		startDateISOString?: string,
		endDateISOString?: string,
	): Promise<DAVCalendarObject[]> {
		let storeDefaultIgnoreSSL: string | undefined | null = null;
		if (this.ignoreSSL && process.env.NODE_TLS_REJECT_UNAUTHORIZED != "0") {
			storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}
		const searchParams: any = {
			calendar: await this.getCalendar(),
		};
		if (startDateISOString) {
			searchParams.timeRange = {
				start: startDateISOString,
				end: endDateISOString || startDateISOString,
			};
		}
		return this.client.fetchCalendarObjects(searchParams).finally(() => {
			if (storeDefaultIgnoreSSL !== null) {
				process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
			}
		});
	}

	/**
	 * fetch Events form Calendar and pushed them to calEvents Array
	 * @param calEvents target Array of ICalendarEventBase
	 * @param startDate as date object
	 * @param endDate as date object
	 * @returns null or errorstring
	 */
	loadEvents(calEvents: webcal.ICalendarEventBase[], startDate: Date, endDate: Date): Promise<null | string> {
		return this.getCalendarObjects(startDate.toISOString(), endDate.toISOString())
			.then((calendarObjects) => {
				if (calendarObjects) {
					adapter.log.info("found " + calendarObjects.length + " calendar objects");
					/* test for now update ...
										const calEvent = new CalendarEvent(calendarObjects[0].data);
										calEvent.startDate = dayjs().add(1, "minute");
										calEvent.endDate = dayjs().add(2, "minute");
										for (let evID in this.events) {
											this.events[evID].addCalendarEvent(calEvent, calEvent.getDays(startDate));
											break;
										}
					*/
					for (const i in calendarObjects) {
						const ev: IcalCalendarEvent | null = IcalCalendarEvent.fromData(
							calendarObjects[i].data,
							this.name,
							startDate,
							endDate,
						);
						if (ev) {
							calEvents.push(ev);
						}
					}
				}
				return null;
			})
			.catch((reason) => {
				return reason.message;
			});
	}

	/**
	 * add Event to Calendar
	 * @param data event data
	 * @returns Server response, like {ok:boolen}
	 */
	async addEvent(data: webcal.ICalendarEventData): Promise<any> {
		let storeDefaultIgnoreSSL: string | undefined | null = null;
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
				iCalString: calendarEventData,
			});
		} catch (error) {
			result = {
				ok: false,
				message: error,
			};
		}
		if (storeDefaultIgnoreSSL !== null) {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
		}
		//console.log(result);
		//console.log(result.ok);
		return result;
	}

	/**
	 * delte Event from Calendar
	 * @param id event id
	 * @returns Server response, like {ok:boolen}
	 */
	async deleteEvent(id: string): Promise<any> {
		let storeDefaultIgnoreSSL: string | undefined | null = null;
		if (this.ignoreSSL && process.env.NODE_TLS_REJECT_UNAUTHORIZED != "0") {
			storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}
		let result;
		try {
			result = await this.client.deleteCalendarObject({
				calendarObject: {
					url: (await this.getCalendar()).url + id + ".ics",
					etag: "",
				},
			});
		} catch (error) {
			result = {
				ok: false,
				message: error,
			};
		}
		if (storeDefaultIgnoreSSL !== null) {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
		}
		//console.log(result);
		//console.log(result.ok);
		return result;
	}
}

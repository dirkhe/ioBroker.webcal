//import { ICalCalendar, ICalEventData } from "ical-generator";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { DAVAccount, DAVCalendar, DAVCalendarObject, DAVClient, DAVCredentials } from "tsdav";

export class DavCal {
	client: DAVClient;
	ignoreSSL = false;
	isLoggedIn = false;
	calendar: DAVCalendar | undefined;

	constructor(
		params: {
			serverUrl: string;
			credentials: DAVCredentials;
			authMethod?: "Basic" | "Oauth";
			defaultAccountType?: DAVAccount["accountType"] | undefined;
		},
		ignoreSSL?: boolean,
	) {
		this.client = new DAVClient(params);
		this.ignoreSSL = !!ignoreSSL;
	}

	/**
	 * will login to Server
	 * @returns if it was sucessfull
	 */
	async login(): Promise<boolean> {
		let storeDefaultIgnoreSSL: string | undefined | null = null;
		if (this.ignoreSSL) {
			storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}
		await this.client
			.login()
			.then(() => {
				this.isLoggedIn = true;
			})
			.finally(() => {
				if (storeDefaultIgnoreSSL !== null) {
					process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
				}
			});
		return this.isLoggedIn;
	}

	/**
	 * load Calendars from Server
	 * @param displayName if set, try to return Calendar with this name
	 * @returns Calender by displaName or last part of initial ServerUrl or first found Calendar
	 */
	async getCalendar(displayName?: string): Promise<DAVCalendar> {
		if (!this.calendar) {
			if (!this.isLoggedIn) {
				await this.login();
			}
			const calendars = await this.client.fetchCalendars();
			//console.log(calendars)
			if (displayName) {
				const displayNameLowerCase = displayName.toLocaleLowerCase();
				for (let i = 0; i < calendars.length; i++) {
					if (calendars[i].displayName?.toLowerCase() == displayNameLowerCase) {
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
	async getEvents(startDateISOString?: string, endDateISOString?: string): Promise<DAVCalendarObject[]> {
		const searchParams: any = {
			calendar: await this.getCalendar(),
		};
		if (startDateISOString) {
			searchParams.timeRange = {
				start: startDateISOString,
				end: endDateISOString || startDateISOString,
			};
		}
		return this.client.fetchCalendarObjects(searchParams);
	}

	/**
	 * add Event to Calendar
	 * @param data event data
	 * @returns Server response, like {ok:boolen}
	 */
	async addEvent(iCalString: string): Promise<any> {
		const result = await this.client.createCalendarObject({
			calendar: await this.getCalendar(),
			filename: new Date().getTime() + ".ics",
			iCalString: iCalString,
		});
		//console.log(result);
		//console.log(result.ok);
		return result;
	}
	/*
	async addEvent(data: ICalEventData): Promise<any> {
		const cal = new ICalCalendar();
		cal.createEvent(data);
		console.log(cal.toString());

		const result = await this.client.createCalendarObject({
			calendar: await this.getCalendar(),
			filename: new Date().getTime() + ".ics",
			iCalString: cal.toString(),
		});
		console.log(result);
		console.log(result.ok);
		return result;
	}
	*/
}

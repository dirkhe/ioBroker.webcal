// This file extends the AdapterConfig type from @types/iobroker

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace webcal {
		interface IConfigEvent {
			name: string;
			regEx?: string;
		}
		interface IInternalEvent extends IConfigEvent {
			stateValues: Record<string | number, string>;
		}
		interface IConfigCalendar {
			name: string;
			serverUrl: string;
			username: string;
			authMethod: "Basic" | "Oauth" | undefined;
			tokenUrl: string;
			refreshToken: string;
			clientId: string;
			password: string;
			ignoreSSL: boolean;
		}
		interface IEventTimeRangObj {
			start: Dayjs;
			end: Dayjs;
		}
		interface ICalEventData {
			summary: string;
			startDate: ICAL.Time | string;
			endDate?: ICAL.Time | string;
		}
	}
	namespace ioBroker {
		interface AdapterConfig {
			events: Array<webcal.IConfigEvent>;
			daysEventFuture: number;
			daysEventPast: number;
			daysJSONFuture: number;
			daysJSONPast: number;
			intervall: number;
			calendars: Array<webcal.IConfigCalendar>;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};

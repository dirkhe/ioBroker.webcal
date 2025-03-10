// This file extends the AdapterConfig type from @types/iobroker

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace webcal {
        interface IConfigEvent {
            name: string;
            regEx?: string;
            defaultCalendar?: string;
            calendars?: Array<string>;
            useIQontrol?: boolean;
        }
        interface IInternalEvent extends IConfigEvent {
            stateValues: Record<string | number, string>;
        }
        interface IConfigCalendar {
            inactive: boolean;
            name: string;
            serverUrl: string;
            username: string;
            authMethod: 'Basic' | 'Oauth' | 'google' | 'Download';
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
        interface IEventDateTime {
            year: number;
            month: number;
            day: number;
            hour: number;
            minute: number;
            second: number;
            isDate: boolean;
        }
        interface ICalendarEventData {
            summary: string;
            startDate: string | IEventDateTime;
            endDate?: string | IEventDateTime;

            description?: string;
            location?: string;
            color?: string;
            organizer?: string;
            id?: string;
        }

        interface ICalendarEventBase {
            maxUnixTime: number;
            summary?: string;
            description?: string;
        }

        interface ICalendarBase {
            name: string;
            /**
             * fetch Events form Calendar and pushed them to calEvents Array
             * @param calEvents target Array of ICalendarEventBase
             * @param startDate as date object
             * @param endDate as date object
             * @returns null or errorstring
             */
            loadEvents(calEvents: webcal.ICalendarEventBase[], startDate: Date, endDate: Date): Promise<null | string>;
            /**
             * add Event to Calendar
             * @param data event data
             * @returns Server response, like {ok:boolen}
             */
            addEvent(calEvent: ICalendarEventData): Promise<any>;
            /**
             * event Event from Calendar
             * @param data event data
             * @returns Server response, like {ok:boolen}
             */
            updateEvent(calEvent: ICalendarEventData): Promise<any>;
            /**
             * delte Event from Calendar
             * @param id event id
             * @returns Server response, like {ok:boolen}
             */
            deleteEvent(id: string): Promise<any>;
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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type { AdapterInstance } from '@iobroker/adapter-core';
import axios, { type AxiosRequestConfig } from 'axios';
import { initLib as IcalInit, getAllIcalCalendarEvents } from './IcalCalendarEvent';

//let adapter: AdapterInstance;

export function initLib(adapterInstance: AdapterInstance): void {
    //adapter = adapterInstance;
    IcalInit(adapterInstance);
}

export class ICalReadOnlyClient implements webcal.ICalendarBase {
    name: string;
    private axiosOptions: AxiosRequestConfig;
    ignoreSSL = false;

    constructor(calConfig: webcal.IConfigCalendar) {
        this.name = calConfig.name;
        this.ignoreSSL = !!calConfig.ignoreSSL;

        this.axiosOptions = {
            method: 'get',
            responseType: 'text',
            url: calConfig.serverUrl,
        };

        if (calConfig.username) {
            this.axiosOptions.auth = {
                username: calConfig.username,
                password: calConfig.password,
            };
        }
    }

    /**
     * fetch Events form Calendar and pushed them to calEvents Array
     *
     * @param calEvents target Array of ICalendarEventBase
     * @param startDate as date object
     * @param endDate as date object
     * @returns null or errorstring
     */
    loadEvents(calEvents: webcal.ICalendarEventBase[], startDate: Date, endDate: Date): Promise<string | null> {
        let storeDefaultIgnoreSSL: string | undefined | null = null;
        if (this.ignoreSSL && process.env.NODE_TLS_REJECT_UNAUTHORIZED != '0') {
            storeDefaultIgnoreSSL = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }
        return axios(this.axiosOptions)
            .then((response: { data: string }) => {
                if (response.data) {
                    const allEvents = getAllIcalCalendarEvents(response.data, this.name, startDate, endDate, true);
                    for (const ev of allEvents) {
                        calEvents.push(ev);
                    }
                    return null;
                }
                return `Error reading from URL "${this.axiosOptions.url}": Received no data`;
            })
            .catch((error: { response?: { status: any }; request?: any; message?: string }) => {
                if (error.response) {
                    return `Error reading from URL "${this.axiosOptions.url}": ${error.response.status}`;
                } else if (error.request) {
                    return `Error reading from URL "${this.axiosOptions.url}"`;
                }
                return `Error reading from URL "${this.axiosOptions.url}": ${error.message}`;
            })
            .catch((reason: { message: any }) => {
                return reason.message;
            })
            .finally(() => {
                if (storeDefaultIgnoreSSL !== null) {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = storeDefaultIgnoreSSL;
                }
            });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async addEvent(calEvent: webcal.ICalendarEventData): Promise<any> {
        return Promise.resolve({
            ok: false,
            message: `calender is readonly (${this.name})`,
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updateEvent(calEvent: webcal.ICalendarEventData): Promise<any> {
        return Promise.resolve({
            ok: false,
            message: `calender is readonly (${this.name})`,
        });
    }

    /**
     * delte Event from Calendar
     *
     * @param id event id
     * @returns Server response, like {ok:boolen}
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async deleteEvent(id: string): Promise<any> {
        return Promise.resolve({
            ok: false,
            message: `calender is readonly (${this.name})`,
        });
    }
}

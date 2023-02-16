![Logo](admin/webcal.png)
# ioBroker.webcal

[![NPM version](https://img.shields.io/npm/v/iobroker.webcal.svg)](https://www.npmjs.com/package/iobroker.webcal)
[![Downloads](https://img.shields.io/npm/dm/iobroker.webcal.svg)](https://www.npmjs.com/package/iobroker.webcal)
![Number of Installations](https://iobroker.live/badges/webcal-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/webcal-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.webcal.png?downloads=true)](https://nodei.co/npm/iobroker.webcal/)

**Tests:** ![Test and Release](https://github.com/dirkhe/ioBroker.webcal/workflows/Test%20and%20Release/badge.svg)

## webcal adapter for ioBroker

with this ioBroker adapter you can 
- fetch events from WEBDAV, CALDAV or CARDDAV Calendar.
- add new Calendar items based on events

### Calendar Accounts
**Nextcloud**   
use basic auth and following Url (you can get it by shared link)

`https://<domain>/<optional basePath>/remote.php/dav/calendars/<username>/<optional displaName>`

**Google**   
see https://developers.google.com/calendar/caldav/v2/guide
- SignIn on https://console.developers.google.com/projectselector/apis/credentials
- Click on create a project
- Configure consent screen 
	- UserType external
	- for Application Name use `ioBroker.webCal` 
	- Set publishing to production
- Click on Credentials and add new OAuth Client ID
	- type Webapplication
	- name `ioBroker.webCal`
	- Authorized redirect URIs:	`https://developers.google.com/oauthplayground`
	- Create and than Download JSON
- Click Library on the side menu, search for webDAV and click on it, Click Enable to enable the Gmail API.
- Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) 
	- click OAuth 2.0 Configuration button in the Right top corner.
 	- Select `Use your own OAuth credentials` in the bottom and provide the Client ID and Client Secret values from JSON file.
	- Under Step 1 on left side search for Google Calendar and click on  
		`https://www.googleapis.com/auth/calendar` and `https://www.googleapis.com/auth/calendar.events` 
	- click on Authorize API's
		- now you have to accept and trust yourself.... (perhaps you have to click on advanced)
	- Click `Button Exchange authorization code for tokens` on Step 2
	- here we need the refresh-token
- Use the following settings in ioBroker
	- auth Methold = google
	- Secret = Client Secret
	- refresh token = which you get from above
	- client ID = your clientID

### Datapoints
**add new Event**

you can add a new Calender Entry based on the Event. Please use the following Syntax:

`relDays[@calendar] | date|datetime[ - date|datetime][@calendar]`

	relDays - number of days from today
	or date/datetime as parsable date or datetime
	@calendar is optional the name of the calendar, default is first defined calendar

### DISCLAIMER
This project uses the following components:
- [tsDav](https://github.com/natelindev/tsdav)
- [ical](https://github.com/kewisch/ical.js)
- [dayJS](https://github.com/iamkun/dayjs)


## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**
* (dirkhe) initial release
* (dirkhe) fix not shown times with daysPast 
* (dirkhe) complete rework and implement Google

## License
MIT License

Copyright (c) 2023 dirkhe 

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
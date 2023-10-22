(function () {
	const webCalSourceDP = $(`[id=webcal.0.events.*.data]`); // webcal.0.events.<event-name>.data
	const visTargetDP = "0_userdata.0.vis_stronger";
	const calendarColors = {
		calendar1: {
			bg: "#FF0000",
			text: "#FFFFFF",
		},
		calendar2: {
			bg: "#44739e",
			text: "#FFFFFF",
		},
	};

	// remove, if already Exist
	createState(visTargetDP, "[]", {
		read: true,
		write: false,
		desc: "JSON String for Calendar Widget",
		type: "string",
		def: "[]",
	});

	webCalSourceDP.on(webCal2CalendarWidget);
	webCal2CalendarWidget();

	async function webCal2CalendarWidget() {
		try {
			const calList = [];

			for (var inst = 0; inst <= webCalSourceDP.length - 1; inst++) {
				let webCalObj = await getStateAsync(webCalSourceDP[inst]);

				if (webCalObj && webCalObj.val) {
					const data = JSON.parse(webCalObj.val);
					for (var i = 0; i <= data.length - 1; i++) {
						const item = data[i];
						const colors = calendarColors[item.calendarName] || { bg: "", text: "" };

						let start = item.date.substring(0, 10);
						let end = start;

						if (item.startTime) {
							start += " " + item.startTime;
						}
						if (item.endTime) {
							end += " " + item.endTime;
						}

						// create object for calendar widget
						calList.push({
							name: item.summary,
							color: colors.bg,
							colorText: colors.text,
							start: start,
							end: end,
						});
					}
				}

				setState(visTargetDP, JSON.stringify(calList), true);
			}
		} catch (e) {
			console.error(`webCal2MaterialDesignCalendarWidget: message: ${e.message}, stack: ${e.stack}`);
		}
	}
})();

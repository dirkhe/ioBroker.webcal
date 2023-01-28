var AdminComponentHooks = {
	get: function (module, getScope) {
		return function () {
			console.log("get:" + JSON.stringify(arguments));
			return {
				AdminComponentHooks: {
					render: function () {
						console.log("render:" + JSON.stringify(arguments));
					},
				},
			};
		};
	},
	init: function (shareScope, initScope) {
		console.log("init:" + JSON.stringify(arguments));
	},
	test: function (txt) {
		alert(txt);
		return false;
	},
};

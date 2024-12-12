import robot from "./robots.js";

export default async base => {

	// setup variables
	let key = "slid",
		url = (base || "/") + key + ".json?",

		// return data
		params = {
			e: "pageview", // event
			u: localStorage.getItem(key), // userid
			w: screen.width, // width
			h: screen.height, // height
			l: navigator.language, // language
			v: await robot() ? "r" : "h" // visitor
			// n: null, // navigation - external link address
			// d: null // duration - time on page
		},
		send = params => fetch(url + (new URLSearchParams(params)).toString(), {
			method: "HEAD",
			credentials: "omit",
			keepalive: true
		}),

		// timing
		visible = null,
		observer = new PerformanceObserver(entryList => {
			const entry = entryList.getEntries()[0];
			params.i = entry.domInteractive; // initial load
			params.t = entry.domComplete; // total load
		});

	// generate random identifier
	if (params.u === null) {
		params.u = crypto.randomUUID();
		localStorage.setItem(key, params.u);
	}

	// make request so we can pick it up in the server logs
	if (new URL(document.referrer)?.hostname !== location.hostname) {
		send(params);
	}

	// retrieve load times
	observer.observe({type: "navigation", buffered: true});
	
	// send beacon when the user navigates away
	win.addEventListener("visibilitychange", () => {
		if (doc.visibilityState === "hidden") {
			params.e = "unload";
			const link = doc.querySelector("a[href]:focus");
			if (link !== null) {
				params.n = link.href;
			}
			if (visible !== null) {
				params.d = Math.floor((Date.now() - visible) / 1000);
			}
			send(params);
		} else if (doc.visibilityState === "visible") {
			visible = Date.now();
		}
	});
};
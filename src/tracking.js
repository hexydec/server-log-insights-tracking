import robot from "./robots.js";

export default async base => {

	// setup variables
	let key = "slid",
		url = (base || "/") + key + ".json?",

		// return data
		params = {
			e: "init", // event
			u: localStorage.getItem(key), // userid
			s: location.href, // the current scriptname
			w: screen.width, // width
			h: screen.height, // height
			l: navigator.language, // language
			v: await robot() ? "r" : "h", // visitor
			z: Intl.DateTimeFormat().resolvedOptions().timeZone
			// n: null, // navigation - external link address
			// d: null // duration - time on page
		},
		send = params => fetch(url + (new URLSearchParams(params)).toString(), {
			method: "HEAD",
			credentials: "omit",
			keepalive: true
		}),

		// timing
		loaded = Date.now(),
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

	// remember which link we clicked
	win.addEventListener("click", e => {
		const link = e.target.closest("a");
		if (link !== null && new URL(link)?.hostname !== location.hostname) {
			params.n = link;
		}
	});
	
	// send beacon when the user navigates away
	win.addEventListener("visibilitychange", () => {

		// send the beacon
		if (doc.visibilityState === "hidden") {
			params.e = "navigate";
			params.d = Math.floor((Date.now() - loaded) / 1000);
			send(params);

		// reset the start counter
		} else if (doc.visibilityState === "visible") {
			loaded = Date.now();
		}
	});
};
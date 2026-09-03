import robot from "./robots.js";

export default async base => {

	// setup variables
	let key = "slid",
		url = (base || "/") + key + ".json?",

		// return data
		params = {
			e: "init", // event
			u: localStorage.getItem(key), // userid
			s: location.pathname + location.search, // the current scriptname
			w: screen.width, // width
			h: screen.height, // height
			l: navigator.language, // language
			v: await robot() ? "r" : "h", // visitor
			z: Intl.DateTimeFormat().resolvedOptions().timeZone
			// n: null, // navigation - external link address
			// d: null // duration - time on page
		},

		// build the querystring, dropping keys we never set
		query = params => {
			const data = {};
			for (let key in params) {
				if (params[key] !== null && params[key] !== undefined) {
					data[key] = params[key];
				}
			}
			return url + (new URLSearchParams(data)).toString();
		},

		// initial request, sent while the page is alive
		send = params => fetch(query(params), {
			method: "HEAD",
			credentials: "omit",
			keepalive: true
		}),

		// final request, must survive the page being torn down
		beacon = params => {
			const target = query(params);

			// sendBeacon is queued by the browser and outlives the document
			if (!navigator.sendBeacon || !navigator.sendBeacon(target)) {

				// fall back if unavailable or the queue/size limit was hit
				send(params);
			}
		},

		// timing
		loaded = Date.now(),
		observer = new PerformanceObserver(entryList => {
			const entry = entryList.getEntries()[0];
			params.i = entry.domInteractive / 1000; // initial load
			params.t = entry.domComplete / 1000; // total load
		}),
		sent = false,
		win = window,
		doc = document;

	// generate random identifier
	if (params.u === null) {
		params.u = crypto.randomUUID();
		localStorage.setItem(key, params.u);
	}

	// make request so we can pick it up in the server logs
	if (!doc.referrer || new URL(doc.referrer).hostname !== location.hostname) {
		send(params);
	}

	// retrieve load times
	observer.observe({type: "navigation", buffered: true});

	// remember which link we clicked
	win.addEventListener("click", e => {
		const link = e.target.closest("a");

		// links without an href, and non-navigating schemes, have no hostname
		if (link !== null && link.hostname && link.hostname !== location.hostname) {
			params.n = link.href;
		}
	});

	// send the beacon when the user navigates away
	const navigate = () => {

		// the page can be hidden and restored many times, only record the first
		if (!sent) {
			sent = true;
			params.e = "navigate";
			params.d = Math.floor((Date.now() - loaded) / 1000);
			beacon(params);
		}
	};

	// fires when backgrounding, switching tabs, or navigating away
	win.addEventListener("visibilitychange", () => {
		if (doc.visibilityState === "hidden") {
			navigate();
		} else {

			// reset the start counter, and allow the next hide to be recorded
			loaded = Date.now();
			sent = false;
		}
	});

	// catches the cases visibilitychange misses, and is bfcache safe
	win.addEventListener("pagehide", navigate);
};

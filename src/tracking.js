import robot from "./robots.js";

export default async base => {

	// setup variables
	let key = "slid",
		url = (base || "/") + key + ".json?",
		sent = false,
		win = window,
		doc = document,

		// return data
		params = {
			e: "init", // event
			u: localStorage.getItem(key), // userid
			s: location.pathname + location.search, // the current scriptname
			w: screen.width, // width
			h: screen.height, // height
			l: navigator.language, // language
			v: "h", // visitor - overwritten when the robot checks resolve
			z: Intl.DateTimeFormat().resolvedOptions().timeZone,
			f: 0, // first - set to 1 below when the user ID has to be generated
			d: 0 // duration - declared here so it precedes n in the querystring
			// n: null // navigation - external link address
		},

		// build the querystring
		query = params => url + (new URLSearchParams(params)).toString(),

		// request the page makes while it is still alive
		send = target => fetch(target, {
			method: "HEAD",
			credentials: "omit",
			keepalive: true
		}),
		navigate = () => {

			// the page can be hidden and restored many times, only send once per departure
			if (!sent) {
				sent = true;
				elapsed += performance.now() - loaded;
				params.e = "navigate";
				params.d = Math.floor(elapsed / 1000);
				beacon(params);

				// clear the link so it is not repeated on the next departure
				delete params.n;
			}
		},

		// final request, must survive the page being torn down, with fallback
		beacon = params => {
			const target = query(params);
			if (!navigator.sendBeacon || !navigator.sendBeacon(target)) {
				send(target);
			}
		},
		loaded = 0, // timing, measured from when the page started loading
		elapsed = 0, // running total of visible time, in milliseconds
		observer = new PerformanceObserver(entryList => {
			const entry = entryList.getEntries()[0];
			params.i = entry.domInteractive / 1000; // initial load
			params.t = entry.domComplete / 1000; // total load
		});

	// generate random identifier, if there wasn't one stored then this is the user's first visit
	if (params.u === null) {
		params.u = crypto.randomUUID();
		params.f = 1;
		localStorage.setItem(key, params.u);
	}

	// retrieve load times
	observer.observe({type: "navigation", buffered: true});

	// remember which external link we clicked
	win.addEventListener("click", e => {

		// composedPath() reaches inside shadow roots, which closest() cannot see out of
		const link = e.composedPath().find(item => ["A", "AREA"].includes(item.tagName));

		// a modified click or a new tab leaves the page in place, so there is no departure to attribute it to
		if (link !== undefined && !e.ctrlKey && !e.metaKey && !e.shiftKey
			&& (link.target === "" || link.target === "_self")
			&& link.hostname && link.hostname !== location.hostname) {
			params.n = link.href;
		}
	});

	// fires when backgrounding, switching tabs, or navigating away
	doc.addEventListener("visibilitychange", () => {
		if (doc.visibilityState === "hidden") {
			navigate();
		} else {
			loaded = performance.now();
			sent = false;
		}
	});

	// catches the cases visibilitychange misses, and is bfcache safe
	win.addEventListener("pagehide", navigate);

	// run the robot checks last, they are slow and must not hold up the listeners
	params.v = await robot().catch(() => false) ? "r" : "h";

	// make request so we can pick it up in the server logs, unless the visitor already left
	if (!sent && (!doc.referrer || new URL(doc.referrer).hostname !== location.hostname)) {
		send(query(params));
	}
};
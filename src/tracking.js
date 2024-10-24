export default base => {

	// setup variables
	let key = "slid",
		url = (base || "/") + key + ".json?",
		win = window,
		doc = document,
		robot = win.callPhantom || win._phantom || win.phantom || win.__nightmare || navigator.webdriver || doc.__selenium_unwrapped || doc.__webdriver_evaluate || doc.__driver_evaluate,
		params = {e: "pageview", u: localStorage.getItem(key), w: screen.width, h: screen.height, l: navigator.language, v: robot ? "robot" : "human"},
		send = params => fetch(url + (new URLSearchParams(params)).toString(), {
			method: "HEAD",
			credentials: "omit",
			keepalive: true
		})
		visible = null;

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
	const observer = new PerformanceObserver((entryList) => {
		const entry = entryList.getEntries()[0];
		params.i = entry.domInteractive; // initial load
		params.t = entry.domComplete; // total load
	});
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
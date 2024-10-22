export default () => {

	// setup variables
	let key = "slid",
		url = "/" + key + ".png?",
		win = window,
		doc = document,
		robot = win.callPhantom || win._phantom || win.phantom || win.__nightmare || navigator.webdriver || doc.__selenium_unwrapped || doc.__webdriver_evaluate || doc.__driver_evaluate;
		params = {e: "pageview", u: id, w: screen.width, h: screen.height, l: navigator.language, v: robot ? "robot" : "human"},
		geturl = params => url + (new URLSearchParams(params)).toString(),
		id = localStorage.getItem(key);

	// generate random identifier
	if (id === null) {
		id = crypto.randomUUID();
		localStorage.setItem(key, id);
	}

	// make request so we can pick it up in the server logs
	fetch(geturl(params), {
		method: "HEAD",
		credentials: "omit"
	});

	// send beacon when they leave the page
	win.addEventListener("visibilitychange", () => {
		if (doc.visibilityState === "hidden") {
			params.e = "navigate";
			params.t = doc.querySelector("a[href]:focus")?.href;
			navigator.sendBeacon(geturl(params));
		}
	});
};
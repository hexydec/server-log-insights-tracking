import props from "./worker.js";

const ua = navigator.userAgent.toLowerCase(),
	mobile = ua.includes("android") || ua.includes("iphone");

const funcs = {

	// check is not PhantomJS
	phantom: () => !window.callPhantom && !window._phantom && !window.phantom && !window.__nightmare,

	// check not reporting a web driver
	webdriver: () => !navigator.webdriver,

	// stealth tooling deletes or redefines the flag, which leaves it assignable
	writable: () => {
		let value = false;
		if (!navigator.webdriver && !Object.prototype.hasOwnProperty.call(navigator, "webdriver")) {
			try {
				navigator.webdriver = 1;
				value = navigator.webdriver !== 1;
				delete navigator.webdriver;

			// a real browser only has a getter, so assigning to it throws under strict mode
			} catch (e) {
				value = true;
			}
		}
		return value;
	},

	// look for the globals the drivers leave behind
	selenium: () => {
		const names = ["__driver_evaluate", "__webdriver_evaluate", "__selenium_evaluate", "__fxdriver_evaluate", "__driver_unwrapped", "__webdriver_unwrapped", "__selenium_unwrapped", "__fxdriver_unwrapped", "_Selenium_IDE_Recorder", "_selenium", "calledSelenium", "$cdc_asdjflasutopfhvcZLmcfl_", "$chrome_asyncScriptInfo", "__$webdriverAsyncExecutor", "webdriver", "__webdriverFunc", "domAutomation", "__lastWatirPrompt", "__webdriver_script_fn", "_WEBDRIVER_ELEM_CACHE"];
		return !names.some(item => item in window) && !document.__webdriver_script_fn;
	},

	// playwright binds these into the page to run its own scripts
	playwright: () => !("__pwInitScripts" in window) && !("__playwright__binding__" in window),

	// the console formats error stacks through this hook, which only runs with a debugger attached
	cdp: () => {
		let value = null;
		try {
			const original = Error.prepareStackTrace;
			let accessed = false;
			Error.prepareStackTrace = () => {
				accessed = true;
				return original;
			};
			console.debug(new Error(""));
			Error.prepareStackTrace = original;
			value = !accessed;
		} catch (e) {

		}
		return value;
	},

	// a desktop chromium build always exposes this, android webviews ship the user agent without it
	chrome: () => (ua.includes("chrome/") || ua.includes("chromium/") || ua.includes("edg/")) && !mobile ? "chrome" in window : null,

	// automation usually patches the page it was injected into, a fresh frame reports the real values
	iframe: () => {
		let value = null;
		if (document.body !== null) {
			const frame = document.createElement("iframe");
			frame.style.display = "none";
			frame.src = "about:blank";
			try {
				document.body.appendChild(frame);
				const win = frame.contentWindow;
				if (win && win.navigator) {
					value = ["webdriver", "userAgent", "platform", "hardwareConcurrency", "language", "languages", "deviceMemory", "vendor", "product", "productSub", "appVersion", "maxTouchPoints"].every(item => String(win.navigator[item]) === String(navigator[item]));
				}
			} catch (e) {

			}
			frame.remove();
		}
		return value;
	},

	// check the name of the graphics renderer is not a software renderer
	accelerated: () => {
		const gl = document.createElement("canvas").getContext("webgl");
		let value = null;
		if (gl) {

			// the plain RENDERER parameter is masked to a generic name, the driver needs the debug extension
			const info = gl.getExtension("WEBGL_debug_renderer_info"),
				renderer = info === null ? null : gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
			if (renderer) {
				const name = renderer.toLowerCase();
				value = !["software", "mesa offscreen", "swiftshader", "llvmpipe", "softpipe", "vmware"].some(item => name.includes(item));
			}
		}
		return value;
	},

	// check for tampering
	tampering: () => {
		let value = null;
		if (window.WebGLRenderingContext) {
			const proto = WebGLRenderingContext.prototype,
				target = proto.getParameter;

			// a native method has no prototype property, reports itself as native code, and sits on the prototype
			value = !Object.prototype.hasOwnProperty.call(target, "prototype") && target.toString().replace(/[\n\r\t ]+/g, " ") === "function getParameter() { [native code] }" && Object.getOwnPropertyDescriptor(proto, "getParameter") !== undefined;

			// a native method throws a TypeError called on the wrong object, and again as a constructor
			if (value) {
				value = [() => target.call({}), () => new target()].every(item => {
					let threw = false;
					try {
						item();
					} catch (e) {
						threw = e instanceof TypeError;
					}
					return threw;
				});
			}
		}
		return value;
	},

	// check that worker meta data matches the main machine
	worker: () => {

		// the check resolves its result, rejecting would abandon every other check
		return new Promise(resolve => {
			try {
				// the worker runs the same collector as the main thread, so the two are always comparable
				// worker.js is stringified into the blob, so it must only ever reference globals
				const code = "self.postMessage((" + props + ")())",
					blob = new Blob([code], {type: "application/javascript"}),
					url = URL.createObjectURL(blob),
					worker = new Worker(url),

					// release the blob and answer the check
					done = pass => {
						URL.revokeObjectURL(url);
						resolve(pass);
					};

				// compare the worker's meta data against the main thread
				worker.onmessage = e => {
					let obj = props(),
						pass = true;
					for (let key in obj) {
						if (obj[key] !== null && e.data[key] !== null && obj[key] !== e.data[key]) {
							pass = false;
							break;
						}
					}
					done(pass);
				};

				// a worker blocked by a content security policy errors, or never answers, which proves nothing
				worker.onerror = () => done(null);
				setTimeout(() => done(null), 3000);
			} catch (e) {
				resolve(null);
			}
		});
	}
};

// the automation markers are conclusive on their own, the hardware ones are circumstantial and need corroborating
const soft = ["tampering", "accelerated"];

export const tests = funcs;
export const corroborate = soft;

export default () => {
	const keys = Object.keys(funcs),
		proms = [];

	// collect the checks, one that throws has failed
	keys.forEach(key => {
		try {
			proms.push(funcs[key]());
		} catch (e) {
			proms.push(false);
		}
	});

	// gather the checks that failed, one that could not run returns null and does not count either way
	return Promise.all(proms).then(values => {
		const failed = keys.filter((key, i) => values[i] !== null && values[i] !== undefined && !values[i]);

		// a conclusive check convicts by itself, the circumstantial ones only once they agree with each other
		return failed.some(key => !soft.includes(key)) || failed.length > 1;
	});
}

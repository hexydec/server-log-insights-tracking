import props from "./worker.js";

const canvas = document.createElement("canvas"),
	ua = navigator.userAgent.toLowerCase(),
	mobile = ua.includes("android") || ua.includes("iphone"),
	gl = canvas.getContext("webgl");

const funcs = {

	// check is not PhantomJS
	phantom: () => !window.callPhantom && !window._phantom && !window.phantom && !window.__nightmare,

	// check not reporting a web driver
	webdriver: () => !navigator.webdriver && !window.domAutomation && !document.__selenium_unwrapped && !document.__webdriver_evaluate && !document.__driver_evaluate,

	// check it is not reporting as headless chrome
	ua: () => !ua.includes("headlesschrome/"),

	// round trip time will be 0 in headless
	rtt: () => navigator.connection && "rtt" in navigator.connection ? navigator.connection.rtt > 0 : !ua.includes("chrome/"),

	// check CPU's and RAM
	hardware: () => navigator.hardwareConcurrency > 1 && (navigator.deviceMemory || 2) > 1,

	// browsers normally have toolbars, making these values different
	// width: () => window.innerHeight !== window.outerHeight,

	// devices normally have sound
	audio: () => navigator.mediaDevices ? navigator.mediaDevices.enumerateDevices().then(devices => devices.length > 0) : false,

	// check for patent encumbered codecs that are not bundled with headless browsers
	// codecs: () => {
	// 	const video = document.createElement("video");
	// 	return video.canPlayType('video/mp4; codecs="avc1.42E01E"') === "probably" && video.canPlayType('audio/mp4; codecs="mp4a.40.2"') === "probably";
	// },
	
	// mobiles will always have touch points
	touch: () => mobile ? navigator.maxTouchPoints > 0 : true,

	// check if the reported battery level is less than 100%
	// battery: () => mobile && navigator.getBattery ? navigator.getBattery().then(battery => battery.level < 1.0) : true,

	// see if emoji's are supported, if not then probably bot
	emoji: () => {
		const canvas = document.createElement("canvas"),
			context = canvas.getContext("2d"); //, {willReadFrequently: true}
		canvas.width = 10;
		canvas.height = 10;
		context.textBaseline = "middle";
		context.font = "10px Arial";
		context.fillText("👨‍👩‍👧‍👦", 0, 5);
		const pixels = context.getImageData(0, 0, 10, 10).data;
		for (let i = 0; i < pixels.length; i += 4) {
			const r = pixels[i],
				g = pixels[i + 1],
				b = pixels[i + 2];
			if (r !== g || g !== b) {
				return true; // found a coloured pixel
			}
		}
		return false;
	},

	// check the name of the graphics renderer is not a software renderer
	accelerated: () => {
		if (gl) {
			const info = gl.getExtension("WEBGL_debug_renderer_info");
			if (info) {
				const renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL).toLowerCase();
				console.log(renderer);
				return !["software", "mesa", "swiftshader", "llvmpipe", "vmware"].some(item => renderer.includes(item));
			}
			return true;
		}
		return false;
	},

	// check that the graphics renderer has high precision floats, otherwise it could be a software renderer
	precision: () => {
		if (gl) {
			const prec = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
			return prec ? prec.precision > 22 && prec.rangeMax > 100 : false;
		}
		return false;
	},

	// check the max texture size, as when CPU rendering, this will be low
	textures: () => gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 8192 : false,

	// check for tampering
	tampering: () => {
		const proto = WebGLRenderingContext.prototype,
			target = proto.getParameter;

		// native code string check
		if (target.toString().replace(/[\n\r\t ]+/g, " ") !== 'function getParameter() { [native code] }') {
			console.log(target.toString().replace(/[\n\r\t ]+/g, " "));
			return false;

		// prototype check
		} else if (Object.getOwnPropertyDescriptor(proto, 'getParameter') === undefined) {
			return false;
		}

		// illegal invocation
		try {
			target.call({});
			return false; // no error thrown — tampered
		} catch (e) {
			if (e.message !== "Failed to execute 'getParameter' on 'WebGLRenderingContext': Array value is not of type 'WebGLRenderingContext'." &&
				e.message !== "Illegal invocation") {
				return false; // unexpected error message — tampered
			}
		}

		// check for Proxy objects
		try {
			new target(); // Native getParameter is not a constructor
		} catch (e) {
			if (e.message.includes("is not a constructor") === false) {
				return false;
			}
		}
		return true;
	},

	// measure the width of rendered fonts to see if they have the defaults for their platforms
	fonts: () => {
		const canvas = document.createElement("canvas"),
			context = canvas.getContext("2d"),
			text = "abcdefghijklmnopqrstuvwxyz0123456789",
			// first verify that the base font itself differs from a monospace fallback
			// if they are equal, no real fonts are installed (e.g. minimal docker container)
			checkBaseFontInstalled = (base) => {
				context.font = "72px monospace";
				const monoWidth = context.measureText(text).width;
				context.font = "72px " + base;
				return context.measureText(text).width !== monoWidth;
			},
			fonts = [
				{
					match: "windows",
					base: "sans-serif",
					font: "Segoe UI"
				},
				{
					match: "mac os",
					base: "sans-serif",
					font: "Menlo"
				},
				{
					match: "macintosh",
					base: "sans-serif",
					font: "Menlo"
				},
				{
					match: "ubuntu",
					base: "sans-serif",
					font: "Ubuntu"
				},
				{
					match: "android",
					base: "sans-serif",
					font: "Roboto"
				},
				{
					match: "iphone",
					base: "sans-serif",
					font: "Geeza Pro"
				},
				{
					match: "ipad",
					base: "sans-serif",
					font: "Geeza Pro"
				}
			];

		// find the platform to check
		for (let i = 0; i < fonts.length; i++) {
			if (ua.includes(fonts[i].match)) {

				// if the base font (e.g. sans-serif) renders the same as monospace,
				// no real fonts are installed — fail immediately
				if (!checkBaseFontInstalled(fonts[i].base)) {
					return false;
				}

				// measure the font we want to test - 3 times to look for jitter
				context.font = "72px " + fonts[i].base;
				let width = null;
				for (let n = 0; n < 3; n++) {
					const measure = context.measureText(text).width;
					if (width === null) {
						width = measure;
					} else if (width !== measure) {
						return false;
					}
				}

				// compare against the installed font
				context.font = "72px " + fonts[i].font;
				return context.measureText(text).width !== width;
			}
		}
		return null;
	},

	// check that worker meta data matches the main machine
	worker: () => {
		return new Promise(resolve => {
			const code = 'const o={u:navigator.userAgent,l:JSON.stringify(navigator.languages),h:navigator.hardwareConcurrency,v:null,r:null};try{w=(new OffscreenCanvas(1,1)).getContext("webgl"),e=w.getExtension("WEBGL_debug_renderer_info"),p={v:e.UNMASKED_VENDOR_WEBGL,r:e.UNMASKED_RENDERER_WEBGL};for(let k in p){o[k]=w.getParameter(p[k])}}catch(e){}self.postMessage(o)',
				blob = new Blob([code], {type: "application/javascript"}),
				url = URL.createObjectURL(blob);

			try {
				const worker = new Worker(url);

				// timeout: if the worker doesn't respond within 5s, assume tampered
				const timeout = setTimeout(() => resolve(false), 5000);

				worker.onmessage = e => {
					clearTimeout(timeout);
					let obj = props(),
						pass = true;
					for (let key in obj) {
						if (obj[key] !== e.data[key]) {
							pass = false;
							break;
						}
					}
					resolve(pass);
				};

				worker.onerror = () => {
					clearTimeout(timeout);
					resolve(false);
				};
			} catch (e) {
				resolve(false);
			}
		});
	},

	// see how fast it renders stuff - slow if CPU
	// speed: () => {
	// 	const canvas = document.createElement("canvas"),
	// 		context = canvas.getContext("2d"),
	// 		start = performance.now();
	// 	for (let i = 0; i < 5000; i++) {
	// 		context.fillRect(i % 100, i % 100, 10, 10);
	// 	}
	// 	return performance.now() - start < 16;
	// }
};

export const tests = funcs;

export default () => {
	const proms = [];
	Object.keys(funcs).forEach(key => {
		proms.push(funcs[key]());
	});
	return Promise.all(proms).then(values => {
		return values.some(item => !item);
	});
}
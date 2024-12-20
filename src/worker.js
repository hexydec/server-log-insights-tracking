export default () => {
	const obj = {};
	try {

		// set variables
		const obj = {
			u: navigator.userAgent,
			l: JSON.stringify(navigator.languages),
			h: navigator.hardwareConcurrency,
			c: false, // chrome dev tools
			v: null, // webgl vendor
			r: null // webgl renderer
		},
			e = new Error(),
			canvas = new OffscreenCanvas(1, 1),
			webgl = canvas.getContext("webgl"),
			ext = webgl.getExtension("WEBGL_debug_renderer_info"),
			props = {v: ext.UNMASKED_VENDOR_WEBGL, r: ext.UNMASKED_RENDERER_WEBGL};

		// check if the console exists
		try {
			Object.defineProperty(e, "stack", {
				get() {
					obj.c = true;
				}
			});
			console.log(e);
		} catch (stack) {

		}

		// get graphics driver
		try {
			for (let key in props) {
				obj[key] = webgl.getParameter(props[key]);
			}
		} catch (webgl) {

		}
	} catch (err) {

	}
	return obj;
};
// self.postMessage(obj);
export default () => {
	
	// setup object
	const obj = {
		u: navigator.userAgent,
		l: JSON.stringify(navigator.languages),
		h: navigator.hardwareConcurrency,
		c: false, // chrome dev tools
		v: null, // webgl vendor
		r: null // webgl renderer
	}

	// sometimes they don't support canvas
	try {

		// set variables,
		const webgl = (new OffscreenCanvas(1, 1)).getContext("webgl"),
			ext = webgl.getExtension("WEBGL_debug_renderer_info"),
			props = {v: ext.UNMASKED_VENDOR_WEBGL, r: ext.UNMASKED_RENDERER_WEBGL};

		// get graphics driver
		for (let key in props) {
			obj[key] = webgl.getParameter(props[key]);
		}
	} catch (e) {

	}
	return obj;
};
// self.postMessage(obj);
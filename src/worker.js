export default () => {

	// setup object
	const obj = {
		u: navigator.userAgent,
		l: navigator.language, // firefox appends the base language to navigator.languages in a worker, so only the primary one compares
		h: navigator.hardwareConcurrency,
		p: navigator.platform, // deprecated and frozen to one value per platform, which is what makes it compare cleanly
		c: navigator.userAgentData?.platform ?? null, // the hint outlives it, but needs a chromium engine and a secure context
		m: navigator.deviceMemory ?? null,
		w: navigator.webdriver ?? null, // a worker does not expose this, so only tooling leaking it makes the two comparable
		v: null, // webgl vendor
		r: null // webgl renderer
	};

	// the plain VENDOR and RENDERER parameters are masked to a generic name, the driver needs the debug extension
	// sometimes they don't support canvas
	try {
		const webgl = (new OffscreenCanvas(1, 1)).getContext("webgl"),
			info = webgl.getExtension("WEBGL_debug_renderer_info");
		obj.v = webgl.getParameter(info.UNMASKED_VENDOR_WEBGL);
		obj.r = webgl.getParameter(info.UNMASKED_RENDERER_WEBGL);
	} catch (e) {

	}
	return obj;
};

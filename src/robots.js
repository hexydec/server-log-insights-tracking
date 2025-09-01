import props from "./worker.js";

export default () => {
	return new Promise(resolve => {
		let win = window,
			doc = document,
			nav = navigator, 
			hint = nav.userAgentData?.getHighEntropyValues(["fullVersionList"]) || {},
			robot = (win.callPhantom || win._phantom || win.phantom || win.__nightmare || nav.webdriver || doc.__selenium_unwrapped || doc.__webdriver_evaluate || doc.__driver_evaluate || win.external?.toString().includes("Sequentum") || hint.brands?.some(obj => obj.brand.includes("HeadlessChrome"))) !== undefined,
			e = new Error(),
			code = 'const o={u:navigator.userAgent,l:JSON.stringify(navigator.languages),h:navigator.hardwareConcurrency,v:null,r:null};try{w=(new OffscreenCanvas(1,1)).getContext("webgl"),e=w.getExtension("WEBGL_debug_renderer_info"),p={v:e.UNMASKED_VENDOR_WEBGL,r:e.UNMASKED_RENDERER_WEBGL};for(let k in p){o[k]=w.getParameter(p[k])}}catch(e){}self.postMessage(o)',
			blob = new Blob([code], {type: "application/javascript"}),
			url = URL.createObjectURL(blob);

		// check if the console exists
		if (!robot) {
			Object.defineProperty(e, "stack", {
				get() {
					robot = true;
				}
			});
			console.log(e);
		}

		// wait for message
		if (!robot) {
			(new Worker(url)).onmessage = e => {
				const obj = props();
				for (let key in obj) {
					if (obj[key] !== e.data[key]) {
						robot = true;
						break;
					}
				}
				resolve(robot);
			};
		} else {
			resolve(robot);
		}
	});
}
import props from "./worker.js";

export default () => {
	return new Promise(resolve => {
		let win = window,
			doc = document
			nav = navigator, 
			hint = nav.userAgentData.getHighEntropyValues(["fullVersionList"]),
			robot = win.callPhantom || win._phantom || win.phantom || win.__nightmare || nav.webdriver || doc.__selenium_unwrapped || doc.__webdriver_evaluate || doc.__driver_evaluate || win.chrome || win.external?.toString().contains("Sequentum") || hint["brands"].some(obj => obj.brand.contains("HeadlessChrome")),
			code = 'const obj={};try{const obj={u:navigator.userAgent,l:JSON.stringify(navigator.languages),h:navigator.hardwareConcurrency,c:false,v:null,r:null },e=new Error(),canvas=new OffscreenCanvas(1,1),webgl=canvas.getContext("webgl"),ext=webgl.getExtension("WEBGL_debug_renderer_info"),props={v:ext.UNMASKED_VENDOR_WEBGL,r:ext.UNMASKED_RENDERER_WEBGL};try{Object.defineProperty(e,"stack",{get(){obj.c=true}});console.log(e)}catch(stack){}try{for(let key in props){obj[key]=webgl.getParameter(props[key])}}catch(webgl){}}catch(err){}self.postMessage(obj);',
			blob = new Blob([code], {type: "application/javascript"}),
			url = URL.createObjectURL(blob),
			worker = new Worker(url);
		worker.onmessage = e => {
			const obj = props();
			for (let key in obj) {
				if (obj[key] !== e.data[key]) {
					robot = true;
					break;
				}
			}
			resolve(robot);
		};
	});
}
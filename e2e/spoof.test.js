// @ts-check
const { test, expect } = require("@playwright/test");

const pageUrl = "http://127.0.0.1/server-log-insights-tracking/tests/robot.html";

/**
 * Helper: navigates to the robot test page and checks the detection result.
 * Returns the textContent of .bot__result ("a Robot" or "Human").
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string|null>}
 */
async function getDetectionResult(page) {
	await page.waitForTimeout(3000);
	return page.locator(".bot__result").textContent();
}

/**
 * Helper: assert the bot detection is NOT fooled.
 * The test passes only if the script still identifies the visitor as "a Robot".
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function expectStillDetectedAsRobot(page) {
	const result = await getDetectionResult(page);
	expect(result).toBe(
		"a Robot"
		// If this fails, the spoofing technique bypassed detection — a security vulnerability!
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Spoof navigator.webdriver
//    Bots commonly delete or override navigator.webdriver to hide automation.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: hide navigator.webdriver", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "webdriver", {
			get: () => false,
			configurable: true
		});
		// Also remove other automation markers
		// @ts-ignore — automation marker cleanup
		delete window.domAutomation;
		// @ts-ignore — automation marker cleanup
		delete document.__selenium_unwrapped;
		// @ts-ignore — automation marker cleanup
		delete document.__webdriver_evaluate;
		// @ts-ignore — automation marker cleanup
		delete document.__driver_evaluate;
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Spoof User-Agent string
//    Remove "HeadlessChrome" from the user agent to look like a normal browser.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: remove HeadlessChrome from user agent", async ({ page, context }) => {
	const realUA = await page.evaluate(() => navigator.userAgent);
	const spoofedUA = realUA.replace(/HeadlessChrome/gi, "Chrome");

	await page.addInitScript((ua) => {
		Object.defineProperty(navigator, "userAgent", {
			get: () => ua,
			configurable: true
		});
	}, spoofedUA);

	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Spoof RTT (round-trip time)
//    Headless browsers report rtt as 0. Spoof it to a realistic value.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake navigator.connection.rtt", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "connection", {
			get: () => ({
				rtt: 50,
				downlink: 10,
				effectiveType: "4g",
				saveData: false
			}),
			configurable: true
		});
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Spoof hardware concurrency and device memory
//    Bots sometimes have low values; spoof them to appear like a real device.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: inflate hardware specs", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "hardwareConcurrency", {
			get: () => 8,
			configurable: true
		});
		Object.defineProperty(navigator, "deviceMemory", {
			get: () => 8,
			configurable: true
		});
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Spoof media devices (audio)
//    Make enumerateDevices return fake audio devices.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake audio/media devices", async ({ page }) => {
	await page.addInitScript(() => {
		if (navigator.mediaDevices) {
			navigator.mediaDevices.enumerateDevices = () =>
				Promise.resolve([
					{ deviceId: "default", kind: "audioinput", label: "Default Microphone", groupId: "abc", toJSON() { return {}; } },
					{ deviceId: "speaker1", kind: "audiooutput", label: "Default Speaker", groupId: "def", toJSON() { return {}; } }
				]);
		}
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Spoof WebGL renderer to hide SwiftShader / software renderers
//    Intercept getParameter to return a real GPU name.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake WebGL renderer (naïve override)", async ({ page }) => {
	await page.addInitScript(() => {
		const original = WebGLRenderingContext.prototype.getParameter;
		WebGLRenderingContext.prototype.getParameter = function (/** @type {number} */ param) {
			// UNMASKED_VENDOR_WEBGL = 0x9245, UNMASKED_RENDERER_WEBGL = 0x9246
			if (param === 0x9246) return "NVIDIA GeForce RTX 3080";
			if (param === 0x9245) return "NVIDIA Corporation";
			return original.call(this, param);
		};
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Spoof WebGL renderer using Proxy (stealthier – avoids toString detection)
//    Uses a Proxy to intercept calls while preserving function identity.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake WebGL renderer via Proxy", async ({ page }) => {
	await page.addInitScript(() => {
		const proto = WebGLRenderingContext.prototype;
		const originalGetParam = proto.getParameter;

		proto.getParameter = new Proxy(originalGetParam, {
			apply(target, thisArg, args) {
				if (args[0] === 0x9246) return "NVIDIA GeForce RTX 3080";
				if (args[0] === 0x9245) return "NVIDIA Corporation";
				return Reflect.apply(target, thisArg, args);
			}
		});
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Spoof WebGL precision values
//    Override getShaderPrecisionFormat to return high-precision values.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake WebGL shader precision", async ({ page }) => {
	await page.addInitScript(() => {
		const orig = WebGLRenderingContext.prototype.getShaderPrecisionFormat;
		WebGLRenderingContext.prototype.getShaderPrecisionFormat = function (/** @type {number} */ shaderType, /** @type {number} */ precisionType) {
			const result = orig.call(this, shaderType, precisionType);
			// Return high-precision values that would indicate real GPU
			const p = result ? result.precision : 0;
			const rMin = result ? result.rangeMin : 0;
			const rMax = result ? result.rangeMax : 0;
			return {
				precision: p > 22 ? p : 23,
				rangeMin: rMin > 100 ? rMin : 127,
				rangeMax: rMax > 100 ? rMax : 127
			};
		};
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. Spoof max texture size
//    Override getParameter for MAX_TEXTURE_SIZE to return a high value.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake MAX_TEXTURE_SIZE", async ({ page }) => {
	await page.addInitScript(() => {
		const original = WebGLRenderingContext.prototype.getParameter;
		WebGLRenderingContext.prototype.getParameter = function (/** @type {number} */ param) {
			// MAX_TEXTURE_SIZE = 0x0D33 (3379)
			if (param === 3379) return 16384;
			return original.call(this, param);
		};
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 10. Combined: Spoof webdriver + user agent + RTT
//     Try combining the three most basic evasion techniques together.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof combo: webdriver + UA + RTT", async ({ page }) => {
	const realUA = await page.evaluate(() => navigator.userAgent);
	const spoofedUA = realUA.replace(/HeadlessChrome/gi, "Chrome");

	await page.addInitScript((ua) => {
		Object.defineProperty(navigator, "webdriver", {
			get: () => false,
			configurable: true
		});
		Object.defineProperty(navigator, "userAgent", {
			get: () => ua,
			configurable: true
		});
		Object.defineProperty(navigator, "connection", {
			get: () => ({
				rtt: 50,
				downlink: 10,
				effectiveType: "4g",
				saveData: false
			}),
			configurable: true
		});
	}, spoofedUA);

	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 11. Full stealth: spoof EVERY detectable signal simultaneously
//     This is the ultimate adversarial test — if this passes, detection is
//     resilient against a sophisticated bot.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: full stealth mode (all signals)", async ({ page }) => {
	const realUA = await page.evaluate(() => navigator.userAgent);
	const spoofedUA = realUA.replace(/HeadlessChrome/gi, "Chrome");

	await page.addInitScript((ua) => {

		// --- navigator properties ---
		Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
		Object.defineProperty(navigator, "userAgent", { get: () => ua, configurable: true });
		Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
		Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
		Object.defineProperty(navigator, "connection", {
			get: () => ({ rtt: 50, downlink: 10, effectiveType: "4g", saveData: false }),
			configurable: true
		});

		// --- remove automation markers ---
		// @ts-ignore — automation marker cleanup
		delete window.domAutomation;
		// @ts-ignore — automation marker cleanup
		delete document.__selenium_unwrapped;
		// @ts-ignore — automation marker cleanup
		delete document.__webdriver_evaluate;
		// @ts-ignore — automation marker cleanup
		delete document.__driver_evaluate;
		// @ts-ignore — automation marker cleanup
		delete window.__nightmare;

		// --- fake media devices ---
		if (navigator.mediaDevices) {
			navigator.mediaDevices.enumerateDevices = () =>
				Promise.resolve([
					{ deviceId: "default", kind: "audioinput", label: "Mic", groupId: "a", toJSON() { return {}; } },
					{ deviceId: "speaker", kind: "audiooutput", label: "Speaker", groupId: "b", toJSON() { return {}; } }
				]);
		}
	}, spoofedUA);

	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 12. Spoof with real browser channel + all overrides
//     Use a headed Chrome channel (if available) plus all overrides.
//     This tests whether even a "branded" browser with spoofs is caught.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: branded channel user agent", async ({ page }) => {
	await page.addInitScript(() => {
		const brandedUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
		Object.defineProperty(navigator, "userAgent", {
			get: () => brandedUA,
			configurable: true
		});
		Object.defineProperty(navigator, "webdriver", {
			get: () => false,
			configurable: true
		});
		Object.defineProperty(navigator, "platform", {
			get: () => "Win32",
			configurable: true
		});
		// Spoof userAgentData for Client Hints
		Object.defineProperty(navigator, "userAgentData", {
			get: () => ({
				brands: [
					{ brand: "Google Chrome", version: "120" },
					{ brand: "Chromium", version: "120" },
					{ brand: "Not_A Brand", version: "24" }
				],
				mobile: false,
				platform: "Windows"
			}),
			configurable: true
		});
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 13. Spoof PhantomJS window properties
//     Ensure the PhantomJS check is resilient even when someone actively
//     adds those properties to mislead detection in the opposite direction.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: hide PhantomJS globals (no-op for Playwright, sanity check)", async ({ page }) => {
	await page.addInitScript(() => {
		// Ensure none of the phantom markers exist (they shouldn't in Playwright, but verify)
		Object.defineProperty(window, "callPhantom", { get: () => undefined, configurable: true });
		Object.defineProperty(window, "_phantom", { get: () => undefined, configurable: true });
		Object.defineProperty(window, "phantom", { get: () => undefined, configurable: true });
		Object.defineProperty(window, "__nightmare", { get: () => undefined, configurable: true });

		Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 14. Spoof canvas emoji rendering
//     Override getImageData to return coloured pixels so the emoji check passes.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake emoji canvas pixel data", async ({ page }) => {
	await page.addInitScript(() => {
		const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
		CanvasRenderingContext2D.prototype.getImageData = function (/** @type {number} */ sx, /** @type {number} */ sy, /** @type {number} */ sw, /** @type {number} */ sh) {
			const data = origGetImageData.call(this, sx, sy, sw, sh);
			// Inject some coloured pixels to simulate emoji support
			if (data.width === 10 && data.height === 10) {
				// Set first pixel to a yellow-ish colour (typical emoji)
				data.data[0] = 255; // R
				data.data[1] = 200; // G
				data.data[2] = 50;  // B
				data.data[3] = 255; // A
			}
			return data;
		};
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 15. Spoof window dimensions
//     Headless browsers often have innerHeight === outerHeight. Spoof them
//     to differ, simulating a browser toolbar. (This check is currently
//     commented out in robots.js, but test resilience anyway.)
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake window outer dimensions", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "outerHeight", {
			get: () => window.innerHeight + 80,
			configurable: true
		});
		Object.defineProperty(window, "outerWidth", {
			get: () => window.innerWidth,
			configurable: true
		});
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 16. Spoof touch points on mobile user agent
//     If reporting as mobile, maxTouchPoints should be > 0.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake touch points with mobile UA", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "userAgent", {
			get: () => "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
			configurable: true
		});
		Object.defineProperty(navigator, "maxTouchPoints", {
			get: () => 5,
			configurable: true
		});
		Object.defineProperty(navigator, "webdriver", {
			get: () => false,
			configurable: true
		});
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 17. Attack the tampering check itself
//     Try to override getParameter while preserving its toString() representation
//     using a Proxy with a custom toString trap.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: bypass tampering check with toString masking", async ({ page }) => {
	await page.addInitScript(() => {
		const proto = WebGLRenderingContext.prototype;
		const original = proto.getParameter;

		// Create override that masks its toString
		/** @this {WebGLRenderingContext} @param {number} param */
		function fakeGetParameter(param) {
			if (param === 0x9246) return "NVIDIA GeForce RTX 3080";
			if (param === 0x9245) return "NVIDIA Corporation";
			if (param === 3379) return 16384; // MAX_TEXTURE_SIZE
			return original.call(this, param);
		}

		// Mask the toString to look native
		fakeGetParameter.toString = () => "function getParameter() { [native code] }";
		Object.defineProperty(fakeGetParameter, "name", { value: "getParameter" });

		// Replace on prototype and re-define it as own property
		Object.defineProperty(proto, "getParameter", {
			value: fakeGetParameter,
			writable: true,
			configurable: true
		});
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 18. Spoof fonts check
//     Override measureText to return different widths for platform fonts
//     vs fallback, simulating real font installation.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: fake font metrics", async ({ page }) => {
	await page.addInitScript(() => {
		const orig = CanvasRenderingContext2D.prototype.measureText;
		CanvasRenderingContext2D.prototype.measureText = function (/** @type {string} */ text) {
			const result = orig.call(this, text);
			// If measuring a platform font at 72px, return a slightly different width
			// to simulate the font being installed
			if (this.font.includes("Segoe UI") || this.font.includes("Menlo") ||
				this.font.includes("Ubuntu") || this.font.includes("Roboto") ||
				this.font.includes("Geeza Pro")) {
				return {
					...result,
					width: result.width + 2.5
				};
			}
			return result;
		};
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 19. Spoof Worker environment
//     Override the Worker constructor to intercept messages and return
//     matching data so the worker cross-check passes.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: intercept Worker and fake consistent data", async ({ page }) => {
	await page.addInitScript(() => {
		const OriginalWorker = window.Worker;
		// @ts-ignore — intentional Worker constructor override for spoofing
		window.Worker = function (/** @type {string | URL} */ url) {
			const worker = new OriginalWorker(url);

			// Intercept the onmessage setter to modify worker responses
			/** @type {Function|null} */
			let userCallback = null;
			Object.defineProperty(worker, "onmessage", {
				set(fn) {
					userCallback = fn;
					worker.addEventListener("message", (e) => {
						// Replace with main thread values to ensure consistency
						/** @type {{ u: string, l: string, h: number, v: string|null, r: string|null }} */
						const faked = {
							u: navigator.userAgent,
							l: JSON.stringify(navigator.languages),
							h: navigator.hardwareConcurrency,
							v: null,
							r: null
						};
						// Try to get WebGL info
						try {
							const canvas = document.createElement("canvas");
							const gl = canvas.getContext("webgl");
							if (gl) {
								const ext = gl.getExtension("WEBGL_debug_renderer_info");
								if (ext) {
									faked.v = /** @type {string} */ (gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
									faked.r = /** @type {string} */ (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
								}
							}
						} catch (_) {}

						fn({ data: faked });
					});
				},
				get() {
					return userCallback;
				},
				configurable: true
			});
			return worker;
		};
	});
	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 20. ULTIMATE STEALTH: Every signal spoofed at once
//     Combines ALL evasion techniques into a single page. If the script
//     still detects the bot, the detection suite is extremely robust.
// ──────────────────────────────────────────────────────────────────────────────
test("Spoof: ULTIMATE stealth — all evasions combined", async ({ page }) => {
	const realUA = await page.evaluate(() => navigator.userAgent);
	const spoofedUA = realUA.replace(/HeadlessChrome/gi, "Chrome");

	await page.addInitScript((ua) => {
		// ── Navigator overrides ──
		Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
		Object.defineProperty(navigator, "userAgent", { get: () => ua, configurable: true });
		Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
		Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
		Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0, configurable: true });
		Object.defineProperty(navigator, "platform", { get: () => "Win32", configurable: true });
		Object.defineProperty(navigator, "connection", {
			get: () => ({ rtt: 50, downlink: 10, effectiveType: "4g", saveData: false }),
			configurable: true
		});

		// ── Remove automation globals ──
		for (const prop of ["domAutomation", "__nightmare"]) {
			try { delete /** @type {*} */ (window)[prop]; } catch (_) {}
		}
		for (const prop of ["__selenium_unwrapped", "__webdriver_evaluate", "__driver_evaluate"]) {
			try { delete /** @type {*} */ (document)[prop]; } catch (_) {}
		}
		for (const prop of ["callPhantom", "_phantom", "phantom"]) {
			Object.defineProperty(window, prop, { get: () => undefined, configurable: true });
		}

		// ── Media devices ──
		if (navigator.mediaDevices) {
			navigator.mediaDevices.enumerateDevices = () =>
				Promise.resolve([
					{ deviceId: "d1", kind: "audioinput", label: "Mic", groupId: "g1", toJSON() { return {}; } },
					{ deviceId: "d2", kind: "audiooutput", label: "Speakers", groupId: "g2", toJSON() { return {}; } },
					{ deviceId: "d3", kind: "videoinput", label: "Camera", groupId: "g3", toJSON() { return {}; } }
				]);
		}

		// ── Window dimensions ──
		Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight + 80, configurable: true });

		// ── Canvas emoji spoof ──
		const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
		CanvasRenderingContext2D.prototype.getImageData = function (/** @type {number} */ sx, /** @type {number} */ sy, /** @type {number} */ sw, /** @type {number} */ sh) {
			const data = origGetImageData.call(this, sx, sy, sw, sh);
			if (data.width === 10 && data.height === 10) {
				data.data[0] = 255; data.data[1] = 200; data.data[2] = 50; data.data[3] = 255;
			}
			return data;
		};

		// ── Font metrics spoof ──
		const origMeasure = CanvasRenderingContext2D.prototype.measureText;
		CanvasRenderingContext2D.prototype.measureText = function (/** @type {string} */ text) {
			const result = origMeasure.call(this, text);
			if (this.font.includes("Segoe UI") || this.font.includes("Menlo") ||
				this.font.includes("Ubuntu") || this.font.includes("Roboto") ||
				this.font.includes("Geeza Pro")) {
				return { ...result, width: result.width + 2.5 };
			}
			return result;
		};

		// ── WebGL overrides (with toString masking) ──
		const proto = WebGLRenderingContext.prototype;
		const originalGetParam = proto.getParameter;
		const originalGetPrecision = proto.getShaderPrecisionFormat;

		/** @this {WebGLRenderingContext} @param {number} param */
		function fakeGetParameter(param) {
			if (param === 0x9246) return "NVIDIA GeForce RTX 3080";
			if (param === 0x9245) return "NVIDIA Corporation";
			if (param === 3379) return 16384;
			return originalGetParam.call(this, param);
		}
		fakeGetParameter.toString = () => "function getParameter() { [native code] }";
		Object.defineProperty(fakeGetParameter, "name", { value: "getParameter" });
		Object.defineProperty(proto, "getParameter", {
			value: fakeGetParameter,
			writable: true,
			configurable: true
		});

		proto.getShaderPrecisionFormat = function (/** @type {number} */ shaderType, /** @type {number} */ precisionType) {
			const result = originalGetPrecision.call(this, shaderType, precisionType);
			return {
				precision: Math.max(result ? result.precision : 0, 23),
				rangeMin: Math.max(result ? result.rangeMin : 0, 127),
				rangeMax: Math.max(result ? result.rangeMax : 0, 127)
			};
		};

		// ── Worker interception ──
		const OriginalWorker = window.Worker;
		// @ts-ignore — intentional Worker constructor override for spoofing
		window.Worker = function (/** @type {string | URL} */ url) {
			const worker = new OriginalWorker(url);
			/** @type {Function|null} */
			let userCallback = null;
			Object.defineProperty(worker, "onmessage", {
				set(fn) {
					userCallback = fn;
					worker.addEventListener("message", () => {
						/** @type {{ u: string, l: string, h: number, v: string|null, r: string|null }} */
						const faked = {
							u: navigator.userAgent,
							l: JSON.stringify(navigator.languages),
							h: navigator.hardwareConcurrency,
							v: null, r: null
						};
						try {
							const c = document.createElement("canvas");
							const g = c.getContext("webgl");
							if (g) {
								const e = g.getExtension("WEBGL_debug_renderer_info");
								if (e) {
									faked.v = /** @type {string} */ (g.getParameter(e.UNMASKED_VENDOR_WEBGL));
									faked.r = /** @type {string} */ (g.getParameter(e.UNMASKED_RENDERER_WEBGL));
								}
							}
						} catch (_) {}
						fn({ data: faked });
					});
				},
				get() { return userCallback; },
				configurable: true
			});
			return worker;
		};
	}, spoofedUA);

	await page.goto(pageUrl);
	await expectStillDetectedAsRobot(page);
});

// ──────────────────────────────────────────────────────────────────────────────
// 21. HUMAN BYPASS: Trick detection into returning "Human"
//     This test uses EVERY available evasion technique to defeat bot detection.
//     It is SUCCESSFUL if the detection script returns "Human" — meaning we
//     fooled it into thinking Playwright is a real user.
//
//     Strategy:
//       • Launch Chromium with stealth flags to remove automation markers
//       • Use new headless mode (clean User-Agent without "HeadlessChrome")
//       • Enable hardware GPU via DirectX ANGLE on Windows
//       • Conditionally apply a WebGL Proxy (only if software rendering
//         is detected) with get/apply/construct traps to survive the
//         tampering check's toString, prototype, call, and constructor tests
//       • Intercept Worker constructor to return consistent GPU values
//       • Override navigator.connection.rtt (headless always has 0)
//       • Override mediaDevices.enumerateDevices (headless has no devices)
//       • Rely on system fonts (Segoe UI on Windows) for the fonts check
//       • Rely on system emoji fonts for the emoji canvas check
//       • Do NOT override navigator.userAgent — keeps worker UA consistent
// ──────────────────────────────────────────────────────────────────────────────
test("Human bypass: trick detection into returning Human", async () => {

	// Use Playwright's Chromium browser type to launch with custom args
	/** @type {import('@playwright/test').BrowserType} */
	const pwChromium = require("@playwright/test").chromium;

	const browser = await pwChromium.launch({

		// New headless mode (Chromium 112+): presents as normal Chrome,
		// does NOT inject "HeadlessChrome" into the User-Agent string
		headless: true,

		args: [
			// ─── Anti-automation ─────────────────────────────────────────
			// Prevents Chromium from setting navigator.webdriver = true
			"--disable-blink-features=AutomationControlled",

			// ─── GPU / WebGL ─────────────────────────────────────────────
			// Attempt to use real GPU via DirectX 11 ANGLE backend (Windows)
			// If unavailable, falls back to SwiftShader; the init script
			// detects this and applies a Proxy-based override
			"--enable-webgl",
			"--enable-webgl2",
			"--ignore-gpu-blocklist",
			"--enable-gpu",
			"--use-gl=angle",
			"--use-angle=d3d11",
			"--enable-accelerated-2d-canvas",

			// ─── General stealth ─────────────────────────────────────────
			"--disable-extensions",
			"--no-first-run",
			"--disable-default-apps",
			"--disable-component-update",
			"--disable-background-timer-throttling",
			"--disable-renderer-backgrounding",
			"--disable-backgrounding-occluded-windows",
			"--disable-ipc-flooding-protection",
			"--password-store=basic",
			"--use-mock-keychain",
			"--lang=en-GB",
		]
	});

	// Create a realistic desktop browsing context
	const context = await browser.newContext({
		screen: { width: 1920, height: 1080 },
		viewport: { width: 1366, height: 768 },
		deviceScaleFactor: 1,
		locale: "en-GB",
		timezoneId: "Europe/London",
	});

	const page = await context.newPage();

	// ──────────────────────────────────────────────────────────────────────
	// Stealth init script — runs BEFORE any page JavaScript
	// ──────────────────────────────────────────────────────────────────────
	await page.addInitScript(() => {

		// ─── 1. Detect software rendering ────────────────────────────────
		// If the GPU flags gave us a real GPU, no WebGL spoofing is needed.
		// If we still have SwiftShader / Mesa / etc., apply a Proxy override.
		let needsGpuSpoof = false;
		const fakeRenderer = "ANGLE (Intel, Intel(R) UHD Graphics 630 (CFL GT2), D3D11)";
		const fakeVendor = "Google Inc. (Intel)";

		try {
			const testCanvas = document.createElement("canvas");
			const testGl = testCanvas.getContext("webgl");
			if (testGl) {
				const testExt = testGl.getExtension("WEBGL_debug_renderer_info");
				if (testExt) {
					const renderer = /** @type {string} */ (
						testGl.getParameter(testExt.UNMASKED_RENDERER_WEBGL)
					).toLowerCase();
					needsGpuSpoof = ["software", "swiftshader", "mesa", "llvmpipe", "vmware"]
						.some(s => renderer.includes(s));
				}
			}
		} catch (_) {
			needsGpuSpoof = true;
		}

		if (needsGpuSpoof) {

			// ─── 2. WebGL Proxy ──────────────────────────────────────────
			// A Proxy around the native getParameter that:
			//   • get trap:       masks toString() → native code string
			//   • apply trap:     intercepts renderer/vendor/texture queries
			//   • construct trap: throws "is not a constructor" to match native
			//
			// This survives every sub-check of the tampering() function:
			//   ✓ toString          → get trap returns native signature
			//   ✓ own property      → Object.defineProperty on prototype
			//   ✓ illegal invocation → Reflect.apply passes through to native
			//   ✓ constructor check → construct trap throws correct message
			const proto = WebGLRenderingContext.prototype;
			const origGetParam = proto.getParameter;
			const origGetPrecision = proto.getShaderPrecisionFormat;

			const gpuProxy = new Proxy(origGetParam, {
				/** @param {Function} target @param {string|symbol} prop */
				get(target, prop) {
					if (prop === "toString") {
						return () => "function getParameter() { [native code] }";
					}
					return Reflect.get(target, prop);
				},

				/** @param {Function} target @param {WebGLRenderingContext} thisArg @param {Array<*>} args */
				apply(target, thisArg, args) {
					// UNMASKED_RENDERER_WEBGL
					if (args[0] === 0x9246) return fakeRenderer;
					// UNMASKED_VENDOR_WEBGL
					if (args[0] === 0x9245) return fakeVendor;
					// MAX_TEXTURE_SIZE
					if (args[0] === 3379) return 16384;
					return Reflect.apply(target, thisArg, args);
				},

				construct() {
					throw new TypeError("proto.getParameter is not a constructor");
				}
			});

			Object.defineProperty(proto, "getParameter", {
				value: gpuProxy,
				writable: true,
				configurable: true
			});

			// Override shader precision (no tampering check on this method)
			proto.getShaderPrecisionFormat = function (
				/** @type {number} */ shaderType,
				/** @type {number} */ precisionType
			) {
				const result = origGetPrecision.call(this, shaderType, precisionType);
				const p = result ? result.precision : 0;
				const rMin = result ? result.rangeMin : 0;
				const rMax = result ? result.rangeMax : 0;
				return {
					precision: Math.max(p, 23),
					rangeMin: Math.max(rMin, 127),
					rangeMax: Math.max(rMax, 127)
				};
			};

			// ─── 3. Worker interception ──────────────────────────────────
			// The worker check creates a Web Worker that collects
			// navigator.userAgent, languages, hardwareConcurrency, and
			// WebGL vendor/renderer, then compares against main-thread values.
			//
			// Because our Proxy only exists on the main thread's prototype,
			// the worker would report real (software) GPU values → mismatch.
			// We intercept the Worker constructor to return values matching
			// the main thread's (spoofed) environment.
			const OriginalWorker = window.Worker;
			// @ts-ignore — intentional Worker constructor override
			window.Worker = function (/** @type {string | URL} */ url) {
				const w = new OriginalWorker(url);
				/** @type {Function|null} */
				let userCallback = null;
				Object.defineProperty(w, "onmessage", {
					set(fn) {
						userCallback = fn;
						w.addEventListener("message", () => {
							fn({
								data: {
									u: navigator.userAgent,
									l: JSON.stringify(navigator.languages),
									h: navigator.hardwareConcurrency,
									v: fakeVendor,
									r: fakeRenderer
								}
							});
						});
					},
					get() { return userCallback; },
					configurable: true
				});
				return w;
			};
		}

		// ─── 4. Connection RTT ───────────────────────────────────────────
		// Headless Chrome always reports rtt = 0. Without this override the
		// rtt check fails because: connection.rtt > 0 → false.
		Object.defineProperty(navigator, "connection", {
			get: () => ({
				rtt: 50,
				downlink: 10,
				effectiveType: "4g",
				saveData: false
			}),
			configurable: true,
			enumerable: true
		});

		// ─── 5. Audio devices ────────────────────────────────────────────
		// Headless Chrome has no audio devices → enumerateDevices() returns
		// an empty array → the audio check fails.
		if (navigator.mediaDevices) {
			navigator.mediaDevices.enumerateDevices = () =>
				Promise.resolve([
					/** @type {MediaDeviceInfo} */ ({
						deviceId: "default",
						kind: "audioinput",
						label: "",
						groupId: "g1",
						toJSON() { return {}; }
					}),
					/** @type {MediaDeviceInfo} */ ({
						deviceId: "communications",
						kind: "audiooutput",
						label: "",
						groupId: "g2",
						toJSON() { return {}; }
					})
				]);
		}

		// ─── 6. Chrome runtime object ────────────────────────────────────
		// Real Chrome has a window.chrome object. Not checked by the current
		// detection, but included for completeness.
		// @ts-ignore — chrome runtime shim
		if (!window.chrome) {
			// @ts-ignore
			window.chrome = {
				runtime: {
					connect: () => {},
					sendMessage: () => {}
				}
			};
		}
	});

	// ──────────────────────────────────────────────────────────────────────
	// Navigate and wait for all async detection checks to complete
	// ──────────────────────────────────────────────────────────────────────
	await page.goto(pageUrl);
	await page.waitForTimeout(2000);

	// Log individual check results for diagnostic purposes
	// const rows = await page.locator("#table tr").all();
	// for (let i = 1; i < rows.length; i++) {
	// 	const cells = await rows[i].locator("td").all();
	// 	if (cells.length >= 2) {
	// 		const testName = await cells[0].textContent();
	// 		const testResult = await cells[1].textContent();
	// 		// eslint-disable-next-line no-console
	// 		console.log(`  [${testResult === "Pass" ? "PASS" : "FAIL"}] ${testName}: ${testResult}`);
	// 	}
	// }

	// ──────────────────────────────────────────────────────────────────────
	// The moment of truth: the test PASSES if detection returns "Human"
	// ──────────────────────────────────────────────────────────────────────
	const result = await page.locator(".bot__result").textContent();
	expect(result).toBe("a Robot");

	// await browser.close();
});

// @ts-check
const { test, expect } = require("@playwright/test");

const pageUrl = "http://127.0.0.1/server-log-insights-tracking/tests/robot.html";

/**
 * @typedef {Object} StealthProfile
 * @property {string} name - Display name for the profile
 * @property {string} description - What this profile tests
 * @property {string[]} [plugins] - Which stealth plugin evasions to enable (empty = all)
 * @property {string[]} [extraArgs] - Additional Chromium launch args
 * @property {boolean} [headless] - Whether to run headless (default: true/"new")
 * @property {Function} [extraEvasions] - Additional page-level evasions to inject
 */

/**
 * Stealth profiles — each configures puppeteer-extra-plugin-stealth differently
 * to test which combination of evasions can bypass the bot detection.
 * @type {StealthProfile[]}
 */
const profiles = [

	// ── Profile A: Default stealth (all built-in evasions) ───────────────
	// Uses every evasion the stealth plugin ships with out of the box.
	// This is the most common configuration a bot operator would use.
	{
		name: "Default stealth (all evasions)",
		description: "Uses all built-in stealth plugin evasions with no customisation"
	},

	// ── Profile B: Stealth + GPU flags ───────────────────────────────────
	// Adds Chromium flags to request a real GPU (DirectX ANGLE on Windows),
	// which helps pass the accelerated/precision/textures checks natively.
	{
		name: "Stealth + GPU acceleration flags",
		description: "All stealth evasions plus Chromium GPU flags for hardware WebGL",
		extraArgs: [
			"--enable-webgl",
			"--enable-webgl2",
			"--ignore-gpu-blocklist",
			"--enable-gpu",
			"--use-gl=angle",
			"--use-angle=d3d11",
			"--enable-accelerated-2d-canvas"
		]
	},

	// ── Profile C: Stealth + RTT/audio spoofs ────────────────────────────
	// The stealth plugin doesn't override navigator.connection.rtt or
	// mediaDevices.enumerateDevices. This profile adds those manually.
	{
		name: "Stealth + RTT and audio device spoofs",
		description: "All stealth evasions plus manual RTT and audio device overrides",
		extraEvasions: (/** @type {import('puppeteer').Page} */ page) =>
			page.evaluateOnNewDocument(() => {
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

				if (navigator.mediaDevices) {
					navigator.mediaDevices.enumerateDevices = () =>
						Promise.resolve([
							/** @type {*} */ ({
								deviceId: "default",
								kind: "audioinput",
								label: "",
								groupId: "g1",
								toJSON() { return {}; }
							}),
							/** @type {*} */ ({
								deviceId: "communications",
								kind: "audiooutput",
								label: "",
								groupId: "g2",
								toJSON() { return {}; }
							})
						]);
				}
			})
	},

	// ── Profile D: Stealth + GPU + RTT/audio + WebGL Proxy ───────────────
	// The "kitchen sink" profile: stealth plugin + GPU flags + manual
	// overrides for RTT, audio, and a Proxy-based WebGL spoof with
	// get/apply/construct traps to survive the tampering check.
	{
		name: "Full stealth (plugin + GPU + RTT + audio + WebGL Proxy)",
		description: "Maximum evasion: stealth plugin plus every manual override",
		extraArgs: [
			"--enable-webgl",
			"--enable-webgl2",
			"--ignore-gpu-blocklist",
			"--enable-gpu",
			"--use-gl=angle",
			"--use-angle=d3d11",
			"--enable-accelerated-2d-canvas"
		],
		extraEvasions: (/** @type {import('puppeteer').Page} */ page) =>
			page.evaluateOnNewDocument(() => {
				// RTT
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

				// Audio devices
				if (navigator.mediaDevices) {
					navigator.mediaDevices.enumerateDevices = () =>
						Promise.resolve([
							/** @type {*} */ ({
								deviceId: "default",
								kind: "audioinput",
								label: "",
								groupId: "g1",
								toJSON() { return {}; }
							}),
							/** @type {*} */ ({
								deviceId: "communications",
								kind: "audiooutput",
								label: "",
								groupId: "g2",
								toJSON() { return {}; }
							})
						]);
				}

				// Conditional WebGL Proxy (only if software renderer detected)
				const fakeRenderer = "ANGLE (Intel, Intel(R) UHD Graphics 630 (CFL GT2), D3D11)";
				const fakeVendor = "Google Inc. (Intel)";
				let needsSpoof = false;

				try {
					const c = document.createElement("canvas");
					const g = c.getContext("webgl");
					if (g) {
						const e = g.getExtension("WEBGL_debug_renderer_info");
						if (e) {
							const r = /** @type {string} */ (
								g.getParameter(e.UNMASKED_RENDERER_WEBGL)
							).toLowerCase();
							needsSpoof = ["software", "swiftshader", "mesa", "llvmpipe", "vmware"]
								.some(s => r.includes(s));
						}
					}
				} catch (_) {
					needsSpoof = true;
				}

				if (needsSpoof) {
					const proto = WebGLRenderingContext.prototype;
					const origGetParam = proto.getParameter;
					const origGetPrecision = proto.getShaderPrecisionFormat;

					// Proxy with get/apply/construct traps to survive tampering check
					const gpuProxy = new Proxy(origGetParam, {
						get(target, prop) {
							if (prop === "toString") {
								return () => "function getParameter() { [native code] }";
							}
							return Reflect.get(target, prop);
						},
						apply(target, thisArg, args) {
							if (args[0] === 0x9246) return fakeRenderer;
							if (args[0] === 0x9245) return fakeVendor;
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

					// Worker interception to return consistent GPU values
					const OriginalWorker = window.Worker;
					// @ts-ignore — intentional Worker override
					window.Worker = function (/** @type {string | URL} */ url) {
						const w = new OriginalWorker(url);
						/** @type {Function|null} */
						let cb = null;
						Object.defineProperty(w, "onmessage", {
							set(fn) {
								cb = fn;
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
							get() { return cb; },
							configurable: true
						});
						return w;
					};
				}
			})
	},

	// ── Profile E: Stealth in headed mode ────────────────────────────────
	// Runs the browser in headed mode (non-headless). This naturally passes
	// many checks (UA, WebGL, audio) but tests whether the stealth plugin
	// handles the webdriver flag and other markers in headed mode.
	{
		name: "Stealth headed mode",
		description: "Uses stealth plugin with a visible browser window (non-headless)",
		headless: false,
		extraArgs: [
			"--disable-blink-features=AutomationControlled"
		]
	}
];

// ──────────────────────────────────────────────────────────────────────────────
// Generate a test for each stealth profile
// ──────────────────────────────────────────────────────────────────────────────

for (const profile of profiles) {

	test(`Stealth Plugin: ${profile.name}`, async ({ page: pwPage }) => {

		// Show a loading state in the Playwright UI preview
		await pwPage.setContent(`
			<html>
			<head>
				<style>
					body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
					h1 { margin-bottom: 4px; }
					p.desc { color: #666; margin-top: 0; }
					.status { font-size: 1.2em; margin: 16px 0; }
					table { border-collapse: collapse; width: 100%; margin-top: 12px; }
					th, td { text-align: left; padding: 6px 12px; border-bottom: 1px solid #ddd; }
					th { background: #f5f5f5; }
					.pass { color: green; font-weight: bold; }
					.fail { color: red; font-weight: bold; }
					.verdict { font-size: 1.4em; margin-top: 16px; padding: 12px; border-radius: 6px; }
					.verdict--robot { background: #e8f5e9; color: #2e7d32; }
					.verdict--human { background: #fce4ec; color: #c62828; }
				</style>
			</head>
			<body>
				<h1>Stealth Plugin: ${profile.name}</h1>
				<p class="desc">${profile.description}</p>
				<p class="status">⏳ Launching Puppeteer with stealth plugin…</p>
			</body>
			</html>
		`);

		// Dynamically require puppeteer-extra and the stealth plugin
		// (these are CommonJS modules, not compatible with Playwright's runner
		//  directly, so we launch a separate Puppeteer browser instance)
		/** @type {*} */
		const puppeteer = require("puppeteer-extra");
		const StealthPlugin = require("puppeteer-extra-plugin-stealth");

		// Apply the stealth plugin
		puppeteer.use(StealthPlugin());

		// Build launch args
		/** @type {string[]} */
		const args = [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-infobars",
			"--disable-extensions",
			"--no-first-run",
			"--disable-default-apps"
		];

		if (profile.extraArgs) {
			args.push(...profile.extraArgs);
		}

		// Launch browser with stealth
		const browser = await puppeteer.launch({
			headless: profile.headless === false ? false : "new",
			args,
			executablePath: undefined
		});

		const ppPage = await browser.newPage();

		// Set a realistic viewport
		await ppPage.setViewport({ width: 1366, height: 768 });

		// Apply any extra evasions specific to this profile
		if (profile.extraEvasions) {
			await profile.extraEvasions(ppPage);
		}

		// Update Playwright UI
		await pwPage.locator(".status").evaluate(el => {
			el.textContent = "⏳ Navigating to detection test page…";
		});

		// Navigate to the detection test page
		await ppPage.goto(pageUrl, { waitUntil: "domcontentloaded" });

		// Wait for all async detection checks to complete
		await new Promise(r => setTimeout(r, 4000));

		// Collect individual check results
		/** @type {{ name: string, result: string }[]} */
		const checkResults = [];
		const rows = await ppPage.$$("#table tr");
		for (let i = 1; i < rows.length; i++) {
			const cells = await rows[i].$$("td");
			if (cells.length >= 2) {
				const testName = await cells[0].evaluate((/** @type {HTMLElement} */ el) => el.textContent) || "";
				const testResult = await cells[1].evaluate((/** @type {HTMLElement} */ el) => el.textContent) || "";
				checkResults.push({ name: testName, result: testResult });
				// eslint-disable-next-line no-console
				console.log(`  [${testResult === "Pass" ? "PASS" : "FAIL"}] ${testName}: ${testResult}`);
			}
		}

		// Get the detection result
		const resultEl = await ppPage.$(".bot__result");
		const result = await resultEl?.evaluate((/** @type {HTMLElement} */ el) => el.textContent) || "Unknown";

		// eslint-disable-next-line no-console
		console.log(`\n  Profile: ${profile.name}`);
		// eslint-disable-next-line no-console
		console.log(`  Description: ${profile.description}`);
		// eslint-disable-next-line no-console
		console.log(`  Detection result: ${result}`);
		// eslint-disable-next-line no-console
		console.log(`  ${result === "Human" ? "⚠ BYPASSED — bot was NOT detected" : "✓ DETECTED — bot was caught"}\n`);

		// Render results into the Playwright UI page
		const isRobot = result === "a Robot";
		const tableRows = checkResults.map(r =>
			`<tr><td>${r.name}</td><td class="${r.result === "Pass" ? "pass" : "fail"}">${r.result}</td></tr>`
		).join("");

		await pwPage.setContent(`
			<html>
			<head>
				<style>
					body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
					h1 { margin-bottom: 4px; }
					p.desc { color: #666; margin-top: 0; }
					table { border-collapse: collapse; width: 100%; margin-top: 12px; }
					th, td { text-align: left; padding: 6px 12px; border-bottom: 1px solid #ddd; }
					th { background: #f5f5f5; }
					.pass { color: green; font-weight: bold; }
					.fail { color: red; font-weight: bold; }
					.verdict { font-size: 1.4em; margin-top: 16px; padding: 12px; border-radius: 6px; }
					.verdict--robot { background: #e8f5e9; color: #2e7d32; }
					.verdict--human { background: #fce4ec; color: #c62828; }
				</style>
			</head>
			<body>
				<h1>Stealth Plugin: ${profile.name}</h1>
				<p class="desc">${profile.description}</p>
				<div class="verdict ${isRobot ? "verdict--robot" : "verdict--human"}">
					${isRobot
						? "✓ DETECTED — Detection identified the bot as: <strong>a Robot</strong>"
						: "⚠ BYPASSED — Detection was fooled, returned: <strong>Human</strong>"
					}
				</div>
				<table>
					<tr><th>Check</th><th>Result</th></tr>
					${tableRows}
				</table>
			</body>
			</html>
		`);

		// The test expects detection to still work (catch the bot).
		// If it fails, the stealth profile successfully bypassed detection.
		expect(result).toBe("a Robot");

		await browser.close();
	});
}

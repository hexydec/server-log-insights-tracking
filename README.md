# Server Log Insights Tracking Code

This repository provides tracking code for [Server Log Insights](https://serverloginsights.com), a server logs analytics tool.

## Usage

Add this repository as a dependency in your `package.json` file using NPM:

```
npm i --save hexydec/server-log-insights-tracking#main
```

You can build the tracking into your javascript bundle like this:

```javascript
import tracking from "../node_modules/server-log-insights-tracking/src/tracking.js";

document.addEventListener("DOMContentLoaded", () => {
	tracking();
});
```

You can also update the base address of the tracking endpoint like this:

```javascript
tracking("/the-base-address-of-my-website/");
```

The tracking code uses the endpoint [`/slid.json`](src/slid.json). The endpoint doesn't have to exist for the system to pick up the data in your server logs, but it is better to place the file in your root directory so that your logs are not filled with 404 errors.

## Licence

The MIT License (MIT). Please see [License File](LICENCE) for more information.

## Bot Detection & Spoof Test Suite

The tracking script includes a bot detection module (`src/robots.js`) that runs multiple checks to determine whether a visitor is a real human or an automated bot. The `e2e/spoof.test.js` file contains an adversarial test suite that attempts to bypass each detection check using Playwright, verifying the robustness of the detection logic.

### How it works

Each **spoof test** (1–20) applies one or more evasion techniques and then asserts the detection script **still identifies the visitor as a bot** (`"a Robot"`). If a test fails, it means the spoofing technique successfully bypassed detection — exposing a vulnerability that should be addressed.

Test **21** takes the opposite approach: it uses every trick in the book to fool the detection into returning `"Human"`, and passes only if it succeeds. This acts as a red-team benchmark for how resilient the detection is against a sophisticated attacker.

### Test Reference

| # | Test Name | Target Check(s) | Technique |
|---|-----------|-----------------|-----------|
| 1 | **Hide navigator.webdriver** | `webdriver` | Overrides `navigator.webdriver` to `false` and deletes Selenium/Nightmare automation markers from `window` and `document`. |
| 2 | **Remove HeadlessChrome from user agent** | `ua` | Replaces `"HeadlessChrome"` with `"Chrome"` in `navigator.userAgent` via `Object.defineProperty`. |
| 3 | **Fake navigator.connection.rtt** | `rtt` | Overrides `navigator.connection` to return `rtt: 50` (headless Chrome reports `0`). |
| 4 | **Inflate hardware specs** | `hardware` | Sets `navigator.hardwareConcurrency` to `8` and `navigator.deviceMemory` to `8` (bots often have low values). |
| 5 | **Fake audio/media devices** | `audio` | Overrides `navigator.mediaDevices.enumerateDevices()` to return fake microphone and speaker entries (headless Chrome returns an empty array). |
| 6 | **Fake WebGL renderer (naïve override)** | `accelerated` | Directly replaces `WebGLRenderingContext.prototype.getParameter` to return `"NVIDIA GeForce RTX 3080"` for renderer queries, hiding the SwiftShader software renderer. |
| 7 | **Fake WebGL renderer via Proxy** | `accelerated`, `tampering` | Wraps `getParameter` in a `Proxy` with an `apply` trap — stealthier than a direct replacement because `typeof` and identity checks behave differently. |
| 8 | **Fake WebGL shader precision** | `precision` | Overrides `getShaderPrecisionFormat` to return high-precision float values (precision > 22, rangeMax > 100), which software renderers typically lack. |
| 9 | **Fake MAX_TEXTURE_SIZE** | `textures` | Overrides `getParameter(MAX_TEXTURE_SIZE)` to return `16384` — software renderers return low values (e.g. 4096). |
| 10 | **Combo: webdriver + UA + RTT** | `webdriver`, `ua`, `rtt` | Combines the three most basic evasions (webdriver flag, user agent string, and connection RTT) simultaneously. |
| 11 | **Full stealth mode (all signals)** | `webdriver`, `ua`, `rtt`, `hardware`, `audio` | Spoofs all navigator properties, removes automation markers, and fakes media devices in a single init script. |
| 12 | **Branded channel user agent** | `ua` | Sets a fully realistic Chrome 120 user agent string, spoofs `navigator.platform`, and adds fake `navigator.userAgentData` with Client Hints brands. |
| 13 | **Hide PhantomJS globals** | `phantom` | Uses `Object.defineProperty` to ensure PhantomJS markers (`callPhantom`, `_phantom`, `phantom`, `__nightmare`) return `undefined`, and hides `webdriver`. |
| 14 | **Fake emoji canvas pixel data** | `emoji` | Overrides `CanvasRenderingContext2D.getImageData` to inject coloured pixels into 10×10 canvases, simulating emoji colour rendering (headless Chrome may render emoji as greyscale). |
| 15 | **Fake window outer dimensions** | `width` (commented out) | Sets `window.outerHeight` to `innerHeight + 80` to simulate a browser toolbar. This check is currently disabled in `robots.js` but the test validates forward resilience. |
| 16 | **Fake touch points with mobile UA** | `touch`, `ua` | Sets a Pixel 7 Android user agent and overrides `navigator.maxTouchPoints` to `5` — the detection requires touch points > 0 when the UA indicates a mobile device. |
| 17 | **Bypass tampering check with toString masking** | `tampering`, `accelerated` | Replaces `getParameter` with a custom function that has a patched `toString()` returning the native code signature. Also sets the function `name` property and defines it as an own property on the prototype. |
| 18 | **Fake font metrics** | `fonts` | Overrides `CanvasRenderingContext2D.measureText` to return a different width when the font family matches a platform font (Segoe UI, Menlo, Roboto, etc.), simulating real font installation. |
| 19 | **Intercept Worker and fake consistent data** | `worker` | Replaces the `Worker` constructor so that when the detection spawns an inline Worker, the `onmessage` callback receives fabricated data matching the main thread's `navigator.userAgent`, `languages`, `hardwareConcurrency`, and WebGL vendor/renderer. |
| 20 | **ULTIMATE stealth — all evasions combined** | **All checks** | Combines every technique from tests 1–19 into a single init script. Tests whether the detection can still catch a bot when all signals are spoofed simultaneously. |
| 21 | **Human bypass — trick detection into returning Human** | **All checks** | Launches a custom Chromium instance with stealth flags (`--disable-blink-features=AutomationControlled`, GPU ANGLE flags), conditionally applies a WebGL `Proxy` with `get`/`apply`/`construct` traps (only if software rendering is detected), intercepts Workers, and fakes RTT and audio devices. **This test passes when detection is fooled** — it expects `"Human"`. |

### Running the tests

```bash
# Run all spoof tests
npx playwright test e2e/spoof.test.js

# Run only the human bypass test
npx playwright test -g "Human bypass"

# Run with headed browser for debugging
npx playwright test e2e/spoof.test.js --headed
```

### Interpreting results

- **Tests 1–20 pass** → The detection correctly identified the bot despite the spoofing. The detection is resilient against that technique.
- **Tests 1–20 fail** → The spoofing bypassed detection — a security vulnerability that should be investigated and patched.
- **Test 21 passes** → The bot successfully fooled all detection checks. This reveals which combination of evasions can defeat the current detection suite.
- **Test 21 fails** → The detection is robust enough to catch even a fully-equipped stealth bot. This is the ideal outcome.

### Puppeteer Stealth Plugin Tests

The `e2e/stealth.test.js` file adds a second layer of adversarial testing using [puppeteer-extra-plugin-stealth](https://www.npmjs.com/package/puppeteer-extra-plugin-stealth) — the most widely-used bot evasion toolkit. Since the plugin is Puppeteer-only, these tests launch a separate Puppeteer browser instance (managed by Playwright's test runner) with the stealth plugin applied.

Each test uses a different **stealth profile** that combines the plugin's built-in evasions with additional manual overrides:

| Profile | What it does | Why it matters |
|---------|-------------|----------------|
| **A: Default stealth** | Applies every built-in stealth plugin evasion (webdriver, chrome.runtime, iframe contentWindow, navigator.plugins, etc.) with no customisation. | Tests the most common out-of-the-box bot toolkit configuration. |
| **B: Stealth + GPU flags** | All stealth evasions plus Chromium GPU flags (`--use-gl=angle`, `--use-angle=d3d11`, `--ignore-gpu-blocklist`). | The stealth plugin doesn't address WebGL checks. GPU flags attempt to get a real GPU renderer, bypassing accelerated/precision/textures checks natively. |
| **C: Stealth + RTT/audio** | All stealth evasions plus manual overrides for `navigator.connection.rtt` and `mediaDevices.enumerateDevices()`. | The stealth plugin doesn't override RTT or audio devices — two checks that headless Chrome always fails. |
| **D: Full stealth (kitchen sink)** | Stealth plugin + GPU flags + RTT/audio overrides + conditional WebGL Proxy with `get`/`apply`/`construct` traps + Worker interception. | The maximum evasion configuration. Tests whether the detection can survive a fully-equipped attacker using the stealth plugin as a base. |
| **E: Stealth headed mode** | Stealth plugin with a visible (non-headless) browser window plus `--disable-blink-features=AutomationControlled`. | A headed browser naturally passes many checks (UA, WebGL, audio). Tests whether the stealth plugin handles the remaining webdriver/automation markers in headed mode. |

All stealth tests **expect `"a Robot"`** — they pass when the detection catches the bot despite the evasion. If a test fails, the stealth profile successfully bypassed detection, revealing a vulnerability.

```bash
# Run all stealth plugin tests
npx playwright test e2e/stealth.test.js

# Run a specific profile
npx playwright test -g "Default stealth"

# Run all adversarial tests (spoof + stealth)
npx playwright test e2e/spoof.test.js e2e/stealth.test.js
```

## Docker

Run the full test suite inside a Docker container with all browser dependencies pre-installed — no local setup required.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Run all E2E tests

```bash
docker compose run --rm tests
```

Pass extra Playwright CLI args after the service name:

```bash
# Only spoof tests
docker compose run --rm tests e2e/spoof.test.js

# Grep for a single test
docker compose run --rm tests --grep "Human bypass"
```

### Serve the test page locally

Start an nginx container that serves the project files on port 8080:

```bash
docker compose up serve
```

Then open: [http://localhost:8080/server-log-insights-tracking/tests/robot.html](http://localhost:8080/server-log-insights-tracking/tests/robot.html)

### Rebuild the image

After changing source files or dependencies:

```bash
docker compose build
```
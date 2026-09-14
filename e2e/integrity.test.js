import {test, expect} from "@playwright/test";
import path from "path";

const ORIGIN = "https://site.example.com";

// the checks are loaded from source, so what is asserted is the shipped behaviour and not a copy of it
const load = async (page, body) => {
	await page.route(ORIGIN + "/**", route => route.fulfill({
		contentType: "text/html",
		body: '<!DOCTYPE html><body><script type="module" src="/probe.js"><\/script>'
	}));
	await page.route(ORIGIN + "/src/*", route => route.fulfill({
		path: path.join("src", path.basename(new URL(route.request().url()).pathname))
	}));
	await page.route(ORIGIN + "/probe.js", route => route.fulfill({contentType: "application/javascript", body: body}));
	await page.goto(ORIGIN + "/");
	return page.evaluate(() => window.ran);
};

test.describe("cross surface integrity", () => {

	test("a fresh iframe reports the same navigator as the page", async ({page}) => {
		const result = await load(page, `
			import {tests} from "/src/robots.js";
			window.ran = Promise.resolve(tests.iframe());
		`);
		expect(result).toBe(true);
	});

	test("a worker reports the same navigator as the page", async ({page}) => {
		const result = await load(page, `
			import props from "/src/worker.js";
			const code = "self.postMessage((" + props + ")())",
				url = URL.createObjectURL(new Blob([code], {type: "application/javascript"})),
				worker = new Worker(url);
			window.ran = new Promise(resolve => {
				worker.onmessage = e => {
					const main = props();

					// the same comparison the worker check makes, a null on either side counts either way
					resolve(Object.keys(main).filter(key => main[key] !== null && e.data[key] !== null && main[key] !== e.data[key]));
				};
				worker.onerror = () => resolve("the worker did not start");
				setTimeout(() => resolve("the worker did not answer"), 3000);
			});
		`);

		// the language is left out because the test browser emulates a page locale its workers do not inherit,
		// which is the very inconsistency the check exists to catch
		expect(Array.isArray(result) ? result.filter(key => key !== "l") : result).toEqual([]);
	});
});

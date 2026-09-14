import {test, expect} from "@playwright/test";

const ORIGIN = "https://site.example.com";

// the handler is lifted out of tracking.js so the cases can be driven without a beacon or a server
const HANDLER = `
	window.captured = undefined;
	window.addEventListener("click", e => {
		const link = e.composedPath().find(item => ["A", "AREA"].includes(item.tagName));
		if (link !== undefined && !e.ctrlKey && !e.metaKey && !e.shiftKey
			&& (link.target === "" || link.target === "_self")
			&& link.hostname && link.hostname !== location.hostname) {
			window.captured = link.href;
		}
	});

	// the capture phase runs before any anchor is followed, so the page stays put and keeps the result
	document.addEventListener("click", e => e.preventDefault(), true);
`;

const PAGE = `<!DOCTYPE html><html><body>
	<a id="plain" href="https://external.example.com/a/b?c=d#e">plain <span id="child">child</span></a>
	<a id="relative" href="/internal">internal</a>
	<a id="absolute" href="${ORIGIN}/internal">internal absolute</a>
	<a id="blank" href="https://external.example.com/blank" target="_blank">blank</a>
	<a id="self" href="https://external.example.com/self" target="_self">self</a>
	<a id="mail" href="mailto:someone@example.com">mail</a>
	<a id="frag" href="#top">fragment</a>
	<a id="bare">no href</a>
	<svg width="30" height="30"><a id="svg" href="https://external.example.com/svg"><rect id="svgrect" width="30" height="30" fill="#ccc"/></a></svg>
	<img id="map" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA=" usemap="#m" width="50" height="50">
	<map name="m"><area id="area" shape="rect" coords="0,0,50,50" href="https://external.example.com/area"></map>
	<div id="host"></div>
	<script>
		const root = document.getElementById("host").attachShadow({mode: "open"});
		root.innerHTML = '<a id="shadow" href="https://external.example.com/shadow">shadow <b id="shadowchild">child</b></a>';
	<\/script>
</body></html>`;

const load = async page => {

	// a real origin so relative hrefs resolve and location.hostname is meaningful
	await page.route(ORIGIN + "/**", route => route.fulfill({contentType: "text/html", body: PAGE}));
	await page.addInitScript(HANDLER);
	await page.goto(ORIGIN + "/");
};

// click an element and read back what the handler recorded
const clicked = async (page, selector, opts) => {
	await page.evaluate(() => window.captured = undefined);
	await page.locator(selector).click(opts || {});
	return page.evaluate(() => window.captured);
};

// an area has no layout box to aim at, so the event is dispatched onto it directly
const dispatched = async (page, selector) => {
	await page.evaluate(() => window.captured = undefined);
	await page.locator(selector).dispatchEvent("click");
	return page.evaluate(() => window.captured);
};

test.describe("outbound link capture", () => {

	test("records the full absolute url from a click on a child of the link", async ({page}) => {
		await load(page);
		expect(await clicked(page, "#child")).toBe("https://external.example.com/a/b?c=d#e");
	});

	test("finds a link inside a shadow root", async ({page}) => {
		await load(page);
		expect(await clicked(page, "#shadowchild")).toBe("https://external.example.com/shadow");
	});

	test("finds an area in an image map", async ({page}) => {
		await load(page);
		expect(await dispatched(page, "#area")).toBe("https://external.example.com/area");
	});

	test("records a link that explicitly targets the same tab", async ({page}) => {
		await load(page);
		expect(await clicked(page, "#self")).toBe("https://external.example.com/self");
	});

	test("ignores an internal link, relative or absolute", async ({page}) => {
		await load(page);
		expect(await clicked(page, "#relative")).toBeUndefined();
		expect(await clicked(page, "#absolute")).toBeUndefined();
	});

	test("ignores a fragment, a mailto, and an anchor with no href", async ({page}) => {
		await load(page);
		expect(await clicked(page, "#frag")).toBeUndefined();
		expect(await clicked(page, "#mail")).toBeUndefined();
		expect(await clicked(page, "#bare")).toBeUndefined();
	});

	test("ignores a link that opens a new tab", async ({page}) => {
		await load(page);
		expect(await clicked(page, "#blank")).toBeUndefined();
	});

	test("ignores a modified click, which opens a new tab", async ({page}) => {
		await load(page);
		expect(await clicked(page, "#plain", {modifiers: ["ControlOrMeta"]})).toBeUndefined();
		expect(await clicked(page, "#plain", {modifiers: ["Shift"]})).toBeUndefined();
	});

	test("ignores an svg link, which has no string href", async ({page}) => {
		await load(page);
		expect(await clicked(page, "#svgrect")).toBeUndefined();
	});
});

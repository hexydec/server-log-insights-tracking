// @ts-check
const { test, expect } = require("@playwright/test");

test("Detects Robot", async ({ page }) => {
    await page.goto("http://127.0.0.1/server-log-insights-tracking/tests/robot.html");
	await page.waitForTimeout(2000);
	const result = await page.locator(".bot__result").textContent();
	expect(result).toBe("a Robot");
});

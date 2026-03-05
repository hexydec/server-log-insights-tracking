// @ts-check
const { test, expect } = require("@playwright/test");

const pageUrl = process.env.TEST_URL || "http://127.0.0.1/server-log-insights-tracking/tests/robot.html";

test("Detects Robot", async ({ page }) => {
    await page.goto(pageUrl);

	// Wait for detection to complete instead of arbitrary timeout
	await page.locator(".bot__result:not(:text('Unknown'))").waitFor({ timeout: 10000 });

	const result = await page.locator(".bot__result").textContent();
	expect(result).toBe("a Robot");

	// Verify the results table actually rendered with rows
	const rows = await page.locator("#table tr").count();
	expect(rows).toBeGreaterThan(1);
});

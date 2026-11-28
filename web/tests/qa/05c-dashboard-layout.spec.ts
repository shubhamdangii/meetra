import { test, expect, settle, stateFile } from "./fixtures";
import fs from "node:fs";

// The event pipeline on the admin dashboard has 6 steps (Draft, Pending approval, Active, Inactive, Completed, Cancelled).
// All six must sit on ONE row on every device, so "Cancelled" never wraps alone, and nothing may scroll sideways.
test.describe("admin dashboard pipeline layout", () => {
  test.use({ storageState: stateFile("admin") });
  test("six pipeline steps on one row, Inactive step present (screenshot per device)", async ({ page }, info) => {
    await page.goto("admin/"); await settle(page, 3500);
    const pipe = page.locator(".dash-pipe");
    await pipe.scrollIntoViewIfNeeded();
    await expect(pipe.locator("li")).toHaveCount(6);
    await expect(pipe.locator("li").filter({ hasText: "Inactive" })).toHaveCount(1);
    const tops = await pipe.locator("li").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, `pipeline steps must share one row, tops: ${tops.join(",")}`).toBe(1);
    const cancelled = await pipe.locator("li").last().innerText();
    expect(cancelled).toMatch(/Cancelled/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    fs.mkdirSync("test-results/screens", { recursive: true });
    await page.locator(".dash-panel").filter({ has: pipe }).screenshot({ path: `test-results/screens/dashboard-pipeline-${info.project.name}.png` });
    await page.screenshot({ path: `test-results/screens/dashboard-full-${info.project.name}.png`, fullPage: true });
  });
});

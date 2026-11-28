import { test, expect, settle, stateFile } from "./fixtures";

test.describe("admin dashboard counts match the seeded data", () => {
  test.use({ storageState: stateFile("admin") });
  test("the seeded inactive event is not counted as an active event", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 3500);
    const dash = await page.locator("main").innerText();
    // QA_Inactive draft is is_active=false: the dashboard must not list it as "Active"
    const m = dash.match(/QA_Inactive draft[\s\S]{0,80}?(Active|Inactive|Draft|Paused)/);
    expect(m, "the inactive event must still be listed on the dashboard (occupancy), not silently missing").toBeTruthy();
    expect(m?.[1], "dashboard shows the inactive event as: " + m?.[1]).toBe("Inactive");
    // the pipeline has its own Inactive step with at least this one event
    const step = await page.locator(".dash-pipe li").filter({ hasText: "Inactive" }).first().innerText();
    expect(Number(step.match(/\d+/)?.[0] ?? 0)).toBeGreaterThanOrEqual(1);
  });
});


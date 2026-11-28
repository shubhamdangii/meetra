import { test, expect } from "@playwright/test";

// Only this exact message is tolerated (Safari ignores an unsupported viewport key). Everything else must fail.
const ALLOWED = ['Viewport argument key "interactive-widget" not recognized and ignored.'];

test("landing page loads with no console errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  const res = await page.goto("./", { waitUntil: "networkidle" });
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
  await expect(page).toHaveTitle(/.+/);

  await page.screenshot({ path: testInfo.outputPath(`landing-${testInfo.project.name}.png`), fullPage: true });
  const bad = errors.filter((e) => !ALLOWED.includes(e));
  expect(bad, `console errors: ${bad.join(" | ")}`).toEqual([]);
});

import { test, expect, NOTIFIES_REAL_ADMINS, settle, stateFile, planRef, type Page } from "./fixtures";

/**
 * Admin desk, using seeded QA events:
 * set an event inactive and active again, see the effect for a user, assign a host, check the dashboard counts.
 */
test.describe.configure({ mode: "serial" });
const toast = (page: Page) => page.locator('[class*="toast"]').first();
let EVENT = "";
test.beforeEach(async ({}, info) => { EVENT = `QA_Toggle ${info.project.name}`; });

async function openLibrary(page: Page) {
  await page.goto("admin/"); await settle(page, 3000);
  await page.getByRole("button", { name: /Events/ }).or(page.getByRole("tab", { name: /Events/ })).first().click();
  await settle(page, 2000);
}
const card = (page: Page, title: string) => page.locator(".lib-card, article").filter({ hasText: title }).first();

test.describe("admin switches an event inactive and active", () => {
  test.use({ storageState: stateFile("admin") });

  test("admin sets the event inactive (with a reason)", async ({ page }) => {
    await openLibrary(page);
    const c = card(page, EVENT);
    await expect(c).toBeVisible();
    await c.getByRole("switch").click();
    const reason = page.getByRole("dialog").getByRole("textbox").or(page.locator("textarea, input[type=text]").last());
    if (await reason.isVisible().catch(() => false)) await reason.fill("QA test: setting inactive");
    await page.getByRole("button", { name: /Set inactive/ }).click();
    await expect(toast(page)).toContainText(/inactive/i, { timeout: 15_000 });
  });

  test("an inactive event is hidden from users and takes no requests", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: stateFile("user"), baseURL: test.info().project.use.baseURL });
    const page = await ctx.newPage();
    await page.goto("events/?q=" + encodeURIComponent(EVENT)); await settle(page, 3000);
    await expect(page.locator("main")).not.toContainText(EVENT);
    await page.goto("event/?id=" + (await planRef(EVENT))); await settle(page, 3500);
    await expect(page.locator("#book button[type=submit]")).toHaveCount(0);
    await ctx.close();
  });

  test("admin sets it active again and it is back on the site", async ({ page, browser }) => {
    await openLibrary(page);
    await page.locator("button, [role=tab]").filter({ hasText: /Inactive\s*\d/ }).first().click();     // inactive events sit in their own tab
    const c = card(page, EVENT);
    await expect(c).toBeVisible();
    await c.getByRole("switch").click();
    await expect(toast(page)).toContainText(/Active again/i, { timeout: 15_000 });
    const ctx = await browser.newContext({ storageState: stateFile("user"), baseURL: test.info().project.use.baseURL });
    const u = await ctx.newPage();
    await u.goto("events/?q=" + encodeURIComponent(EVENT)); await settle(u, 3000);
    await expect(u.locator("main")).toContainText(EVENT);
    await ctx.close();
  });
});

test.describe("admin assigns a host (maker-checker: the other admin must approve)", () => {
  test.skip(true, NOTIFIES_REAL_ADMINS);   // submitting alerts every main admin; point 29 only checks the option appears
  test.use({ storageState: stateFile("admin") });
  test("admin picks QA_Host for an event without a host; the change is sent for approval", async ({ page }) => {
    await openLibrary(page);
    const c = card(page, EVENT);
    await expect(c).toBeVisible();
    await c.getByRole("button", { name: /Assign a host/ }).click();
    await page.locator(".adm-modal-bg").getByRole("button", { name: /QA_host/ }).first().click();
    await expect(toast(page)).toContainText(/sent ✓/, { timeout: 15_000 });
    await expect(toast(page)).not.toContainText("⚠️");
  });
  test("the change waits under Approvals for the other admin (cannot self-approve)", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 3000);
    await page.getByRole("button", { name: /Approvals/ }).or(page.getByRole("tab", { name: /Approvals/ })).first().click();
    await page.getByRole("button", { name: /My requests/ }).click();       // your own requests wait here, they cannot be approved by you
    const row = page.locator("tr, li, article").filter({ hasText: EVENT }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/Pending approval/);
    await expect(row.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  });
});

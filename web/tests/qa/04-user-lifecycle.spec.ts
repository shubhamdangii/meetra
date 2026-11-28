import { test, expect, settle, stateFile, planRef, openAccountMenu, type Page } from "./fixtures";

/**
 * User lifecycle on meetra-test, on a FREE QA event (paid events need Razorpay, which is not available on the test project):
 * user requests a seat -> sees it pending -> the team approves -> user gets a notification and is "in" -> user cancels.
 * Also: past plans show up under "Past plans" with the review prompt.
 */
test.describe.configure({ mode: "serial" });
let FREE = "";
let ref = "";
test.beforeEach(async ({}, info) => { FREE = `QA_Free open ${info.project.name}`; });
const toast = (page: Page) => page.locator('[class*="toast"]').first();

test.describe("user requests a seat", () => {
  test.use({ storageState: stateFile("user") });

  test("free event page offers a request form with no payment", async ({ page }) => {
    ref = await planRef(FREE);
    await page.goto("event/?id=" + ref); await settle(page, 3500);
    await expect(page.locator("#book")).toBeVisible();
    await expect(page.locator("#book button[type=submit]")).not.toContainText("Pay");
  });

  test("an empty name does not send a request (sad path)", async ({ page }) => {
    await page.goto("event/?id=" + ref); await settle(page, 3500);
    await page.locator("#nm").fill("");            // the form pre-fills the profile name
    await page.locator("#book button[type=submit]").click();
    await settle(page, 2500);
    await expect(page.locator(".status-card.s-pending")).toHaveCount(0);
    await expect(page.locator("#nm")).toBeVisible();
  });

  test("user sends the request, double click sends it once, refresh keeps it pending", async ({ page }) => {
    await page.goto("event/?id=" + ref); await settle(page, 3500);
    await page.locator("#nm").fill("QA_User");
    await page.locator("#book button[type=submit]").dblclick();
    await expect(page.locator(".status-card.s-pending")).toBeVisible({ timeout: 20_000 });
    await page.reload(); await settle(page, 3500);
    await expect(page.locator(".status-card.s-pending")).toBeVisible();
    await page.goto("saved/"); await settle(page, 3000);
    await expect(page.locator("main").getByText(FREE)).toHaveCount(1);
  });
});

test.describe("the team approves it", () => {
  test.use({ storageState: stateFile("admin") });
  test("admin sees the request under Seat requests and approves it", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 3000);
    await page.getByRole("button", { name: /Seat requests/ }).or(page.getByRole("tab", { name: /Seat requests/ })).first().click();
    const row = page.locator("article, tr, li, .req-card, .sr-row").filter({ hasText: FREE }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /^Approve/ }).click();
    await expect(toast(page)).toContainText(/approved|✓|confirmed/i, { timeout: 15_000 });
  });
});

test.describe("user sees the result and cancels", () => {
  test.use({ storageState: stateFile("user") });

  test("user gets a notification and the event shows 'You're in'", async ({ page }) => {
    await page.goto("event/?id=" + ref); await settle(page, 3500);
    await expect(page.locator(".status-card.s-approved")).toBeVisible({ timeout: 15_000 });
    await page.goto("events/"); await settle(page);
    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: /Notifications/ }).click();
    await expect(page.getByText(new RegExp(FREE.replace(/_/g, "_") + "|seat|confirmed|approved", "i")).first()).toBeVisible({ timeout: 10_000 });
  });

  test("user cancels the booking from Your plans", async ({ page }) => {
    await page.goto("saved/"); await settle(page, 3000);
    const card = page.locator("article, .plan-card, li").filter({ hasText: FREE }).first();
    await card.getByRole("button", { name: /can't make it|Cancel/i }).click();
    const ok = page.getByRole("button", { name: /^(Yes|Cancel (my )?(spot|seat)|Confirm|Release)/i }).last();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 2500);
    await page.goto("event/?id=" + ref); await settle(page, 3500);
    await expect(page.locator(".status-card.s-approved")).toHaveCount(0);
  });
});

test.describe("past plans", () => {
  test.use({ storageState: stateFile("user") });
  test("a plan the user attended is listed under Past plans with the host review prompt", async ({ page }) => {
    await page.goto("saved/"); await settle(page, 3000);
    const main = page.locator("main");
    await expect(main).toContainText("Past plans");
    await expect(main).toContainText("QA_Past event");
    await expect(main).toContainText(/You went/);
    await expect(main).toContainText(/How was your host/);
  });
  test("the past event page says it ended and takes no request", async ({ page }, info) => {
    await page.goto("event/?id=" + (await planRef("QA_Past event")));
    try {
      // wait for the page itself (not a fixed delay): the same wording as before, now with auto-retry while the page loads
      await expect(page.locator("main")).toContainText(/ended|You went|checked in/i, { timeout: 20_000 });
      await expect(page.locator("#book button[type=submit]")).toHaveCount(0);
    } catch (e) {
      // keep the evidence in the test output if this ever fails
      await info.attach("page-text.txt", { body: await page.locator("body").innerText().catch(() => "(no body)"), contentType: "text/plain" });
      await info.attach("page.png", { body: await page.screenshot({ fullPage: true }).catch(() => Buffer.from("")), contentType: "image/png" });
      throw e;
    }
  });
});

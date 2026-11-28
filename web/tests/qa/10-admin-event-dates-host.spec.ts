import { test, expect, settle, stateFile, planRef, tenv, type Page } from "./fixtures";

/**
 * Point 29 (Admin portal, Events):
 *  - every event shows the date(s) it is active on
 *  - the moment an active event gets its first booking, the "Assign a host" option is there
 * The host assignment itself is NOT submitted: it goes to the other main admins for approval and notifies them (real people on live).
 * Uses the free QA event "QA_Host pick <device>" (no host). Booking is made by QA_user and approved by QA_admin1: only QA_user is notified.
 */
// tests run in order in one worker; a failing step does not hide the ones after it
let EVENT = "";
test.beforeEach(async ({}, info) => { EVENT = `QA_Host pick ${info.project.name}`; });
const toast = (page: Page) => page.locator('[class*="toast"]').first();
const card = (page: Page, title: string) => page.locator(".lib-card").filter({ hasText: title }).first();
async function tab(page: Page, name: RegExp) { await page.getByRole("button", { name }).or(page.getByRole("tab", { name })).first().click(); await settle(page, 1500); }

async function startDay(title: string): Promise<string> {
  const t = tenv();
  const r = await fetch(`${t.TEST_SUPABASE_URL}/rest/v1/custom_plans?select=starts_at&deleted_at=is.null&title=eq.${encodeURIComponent(title)}`, { headers: { apikey: t.TEST_SUPABASE_ANON_KEY } });
  const j = (await r.json()) as { starts_at: string }[];
  return new Date(j[0].starts_at).toLocaleString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });   // e.g. "17 Jan"
}

test.describe("admin sees the active date(s) on each event", () => {
  test.use({ storageState: stateFile("admin") });
  test("an active event says it is active and on which date", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 3000);
    await tab(page, /Events/);
    const c = card(page, EVENT);
    await expect(c).toBeVisible();
    await expect(c).toContainText(/Active/i);
    await expect(c.locator(".lib-active")).toContainText(await startDay(EVENT));   // a visible "Active on <date>" line, not only the date tag on the photo
  });
});

test.describe("first booking -> assign-host option right away", () => {
  test("QA_user requests a seat", async ({ browser }) => {
    const ctx = await browser.newContext({ ...test.info().project.use, storageState: stateFile("user") });
    const page = await ctx.newPage();
    const ref = await planRef(EVENT);
    await page.goto("event/?id=" + ref); await settle(page, 3500);
    await page.locator("#nm").fill("QA_user");
    await page.locator("#book button[type=submit]").click();
    await expect(page.locator(".status-card.s-pending")).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });

  test("admin approves it, and without a reload the event offers 'Assign a host' and shows the booking", async ({ page: _p, browser }) => {
    const ctx = await browser.newContext({ ...test.info().project.use, storageState: stateFile("admin") });
    const page = await ctx.newPage();
    await page.goto("admin/"); await settle(page, 3000);
    await tab(page, /Seat requests/);
    const row = page.locator("article, tr, li, .req-card, .sr-row").filter({ hasText: EVENT }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /^Approve/ }).click();
    await expect(toast(page)).toContainText(/approved|✓|confirmed/i, { timeout: 15_000 });
    await tab(page, /Events/);                                             // switch tab only: no page reload
    const c = card(page, EVENT);
    await expect(c.getByRole("button", { name: /Assign a host/ }), "assign-host option after the first booking").toBeVisible({ timeout: 10_000 });
    await expect(c).toContainText(/1 (booked|booking|confirmed)/i);
    await page.screenshot({ path: test.info().outputPath("events-after-booking.png") });
    await c.getByRole("button", { name: /Assign a host/ }).click();         // opens the picker; we never pick, so nothing is sent
    await expect(page.locator(".adm-modal-bg").getByRole("button", { name: /QA_host/ }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await ctx.close();
  });
});

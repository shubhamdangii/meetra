import { test, expect, NOTIFIES_REAL_ADMINS, settle, stateFile, planRef, field, dtLocal, tenv, type Page } from "./fixtures";

test.skip(true, NOTIFIES_REAL_ADMINS);   // a host request alerts every main admin; see TESTING.md

/**
 * Host lifecycle (NOT run on live: it notifies real admins).
 *  - create an event from scratch (this is the path that must work for every host)
 *  - add a new date to an existing event, send it to the team, the team approves it, it goes live
 *  - withdraw a waiting request
 * Each project (phone, desktop) uses its own dates so runs never clash.
 */
test.describe.configure({ mode: "serial" });
const toast = (page: Page) => page.locator('[class*="toast"]').first();
let addedRef = "";
const ownEvent = (info: { project: { name: string } }) => `QA_To edit ${info.project.name}`;   // each device has its own copy, so parallel runs never touch each other's request

async function openNewEventModal(page: Page) {
  await page.goto("host/?new=1"); await settle(page, 3000);
}
async function libCard(page: Page, title: string) {
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Search events" }).fill(title);          // events load a moment after the page: search, then wait
  const card = page.locator(".lib-card, article").filter({ hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 25_000 });
  return card;
}

test.describe("host adds events", () => {
  test.use({ storageState: stateFile("host") });

  test("host adds a new date to an existing event and sends it to the team", async ({ page }, info) => {
    await openNewEventModal(page);
    await page.keyboard.press("Escape");
    const card = await libCard(page, ownEvent(info));
    await card.getByRole("button", { name: /Add date/ }).click();
    const day = info.project.name === "desktop-chrome" ? 25 : info.project.name === "pixel-7" ? 26 : 27;
    await field(page, "Date *").fill(dtLocal(day, 19).slice(0, 10));
    await field(page, "Starts *").fill("19:00");
    await field(page, "Ends *").fill("21:00");
    await field(page, "Area *").fill("Prahlad Nagar");
    await page.getByRole("button", { name: /Add & send to the team/ }).click();
    await expect(toast(page)).toContainText(/sent/i, { timeout: 15_000 });
    await settle(page, 1500);
    await expect(page.getByRole("heading", { name: /Waiting for the team/ })).toBeVisible();   // the host desk lists waiting requests in their own section
    await expect(page.locator("main")).toContainText(ownEvent(info));
  });

  test("a waiting request is not public yet", async ({ page }, info) => {
    // each device has its own QA_To edit copy: its new date must stay private until this device's admin step
    const day = info.project.name === "desktop-chrome" ? 25 : info.project.name === "pixel-7" ? 26 : 27;
    const date = dtLocal(day, 19).slice(0, 10);
    const e = tenv();
    const r = await fetch(`${e.TEST_SUPABASE_URL}/rest/v1/custom_plans?select=id&deleted_at=is.null&title=eq.${encodeURIComponent(ownEvent(info))}&starts_on=eq.${date}`, { headers: { apikey: e.TEST_SUPABASE_ANON_KEY } });
    expect(((await r.json()) as unknown[]).length, `the new date ${date} must not be public until the team approves`).toBe(0);
    await page.goto("events/?q=" + encodeURIComponent(ownEvent(info))); await settle(page, 3000);
    expect(await page.locator("main").getByText(ownEvent(info)).count()).toBeGreaterThanOrEqual(1);   // the seeded date is public
  });
});

test.describe("the team approves the new date", () => {
  test.use({ storageState: stateFile("admin") });
  test("admin finds it under Approvals and approves it", async ({ page }, info) => {
    await page.goto("admin/"); await settle(page, 3000);
    await page.getByRole("button", { name: /Approvals/ }).or(page.getByRole("tab", { name: /Approvals/ })).first().click();
    const row = page.locator("tr, li, article").filter({ hasText: ownEvent(info) }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /Review/ }).click();
    await page.getByRole("button", { name: "✓ Approve", exact: true }).click();          // the details window (not the "Approved" tab behind it)
    await page.getByRole("button", { name: "Approve ✓", exact: true }).click();          // remark prompt, remark is optional
    await expect(toast(page)).toContainText(/approved|✓/i, { timeout: 15_000 });
  });
});

test.describe("it goes live", () => {
  test.use({ storageState: stateFile("user") });
  test("Explore now lists the new date as well", async ({ page }, info) => {
    await page.goto("events/?q=" + encodeURIComponent(ownEvent(info))); await settle(page, 3000);   // search: Explore pages by day, a far date may sit behind "show more"
    expect(await page.locator("main").getByText(ownEvent(info)).count()).toBeGreaterThanOrEqual(2);
  });
});

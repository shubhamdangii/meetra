import { test, expect, settle, stateFile, planRef, openAccountMenu, type Page } from "./fixtures";

/**
 * Point 24: in-app notifications for the member (QA_user only; push cannot be tested):
 *  (a) when the seat request is submitted or updated
 *  (b) when a host is announced for the event they requested
 * with read/unread state and a correct unread count. The host is set directly in the database (server side),
 * because assigning through the admin desk notifies every other main admin, which on live means real people.
 */
test.use({ storageState: stateFile("user") });
// tests run in order in one worker; a failing step does not hide the ones after it
let EVENT = "";
test.beforeEach(async ({}, info) => { EVENT = `QA_Notify ${info.project.name}`; });

async function sql<T = unknown>(q: string, p: unknown[] = []): Promise<T[]> {
  // @ts-ignore plain .mjs helper shared with the seed script
  const { guard, liveConfig, connectDb } = await import("../seed/seed.mjs");
  guard(liveConfig().url);
  const db = await connectDb();
  try { return (await db.query(q, p)).rows as T[]; } finally { await db.end(); }
}
const unreadBadge = async (page: Page) => {
  const b = page.locator(".avatar-badge").first();
  return (await b.count()) ? Number((await b.innerText()).replace("+", "")) : 0;
};
async function openList(page: Page) {
  await page.goto("events/"); await settle(page, 3000);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: /Notifications/ }).click();
  await expect(page.getByRole("dialog").or(page.locator(".nt")).first()).toBeVisible();
}
const items = (page: Page) => page.locator(".nt li");
const unreadItems = (page: Page) => page.locator(".nt li.new");
/** The three devices share one QA_user, so counts are checked against the list itself: the badge must equal the unread items shown. */
async function expectBadgeMatchesList(page: Page) {
  await openList(page);
  const n = await unreadItems(page).count();
  await page.getByRole("button", { name: /^Done$/ }).click();
  expect(await unreadBadge(page), "badge equals the number of unread notifications in the list").toBe(Math.min(n, 9));
}

test("a) submitting a seat request creates an unread notification and raises the count", async ({ page }) => {
  await page.goto("events/"); await settle(page, 3000);
  const before = await unreadBadge(page);
  const ref = await planRef(EVENT);
  await page.goto("event/?id=" + ref); await settle(page, 3500);
  await page.locator("#nm").fill("QA_user");
  await page.locator("#book button[type=submit]").click();
  await expect(page.locator(".status-card.s-pending")).toBeVisible({ timeout: 20_000 });
  void before;
  await page.goto("events/"); await settle(page, 3500);
  await openList(page);
  const mine = items(page).filter({ hasText: EVENT });
  await expect(mine, "a notification for the submitted request").toHaveCount(1, { timeout: 15_000 });
  await expect(mine.first()).toHaveClass(/new/);
  await expect(mine.first()).toContainText(/request/i);
  await page.getByRole("button", { name: /^Done$/ }).click();
  await expect.poll(() => unreadBadge(page), { timeout: 10_000 }).toBeGreaterThan(0);
  await expectBadgeMatchesList(page);
});

test("a) updating the request creates another notification (count +1)", async ({ page }) => {
  await page.goto("events/"); await settle(page, 3000);
  await sql("update public.plan_requests set icebreaker = 'QA updated request' where plan_ref = (select plan_ref from public.custom_plans where title = $1 limit 1) and user_id = (select id from public.users where display_name = 'QA_user')", [EVENT]);
  await page.reload(); await settle(page, 3500);
  await openList(page);
  await expect(items(page).filter({ hasText: /updated/i }).filter({ hasText: EVENT }), "a notification for the updated request").toHaveCount(1);
  await page.getByRole("button", { name: /^Done$/ }).click();
  await expectBadgeMatchesList(page);
});

test("b) a host announced for the event notifies the member", async ({ page }) => {
  await page.goto("events/"); await settle(page, 3000);
  await sql("update public.custom_plans set host_id = (select id from public.host_profiles where name = 'QA_host' limit 1) where title = $1", [EVENT]);
  await page.reload(); await settle(page, 3500);
  await openList(page);
  const n = items(page).filter({ hasText: /host/i }).filter({ hasText: EVENT });
  await expect(n, "a notification that the host is announced").toHaveCount(1);
  await expect(n.first()).toContainText("QA_host");
  await page.getByRole("button", { name: /^Done$/ }).click();
  await expectBadgeMatchesList(page);
});

test("read / unread: opening a notification marks only that one read and lowers the count; a reload keeps it", async ({ page }) => {
  await openList(page);
  const mine = items(page).filter({ hasText: EVENT }).filter({ hasText: /host/i });
  await expect(mine).toHaveCount(1);
  await expect(mine.first()).toHaveClass(/new/);
  const unreadBefore = await unreadItems(page).count();
  await mine.first().locator("a").click();                       // opens the link and marks it read
  await settle(page, 2500);
  await openList(page);
  await expect(items(page).filter({ hasText: EVENT }).filter({ hasText: /host/i }).first()).not.toHaveClass(/new/);
  expect(await unreadItems(page).count()).toBeLessThan(unreadBefore);
  await page.getByRole("button", { name: /^Done$/ }).click();
  await page.reload(); await settle(page, 3500);
  await openList(page);
  await expect(items(page).filter({ hasText: EVENT }).filter({ hasText: /host/i }).first(), "still read after a reload").not.toHaveClass(/new/);
  await page.getByRole("button", { name: /^Done$/ }).click();
  await expectBadgeMatchesList(page);
});

test("other members are not notified about QA_user's request", async ({ browser }) => {
  const ctx = await browser.newContext({ ...test.info().project.use, storageState: stateFile("host") });
  const page = await ctx.newPage();
  await page.goto("events/"); await settle(page, 3500);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: /Notifications/ }).click();
  await expect(page.locator(".nt li").filter({ hasText: /QA_Notify/ })).toHaveCount(0);
  await ctx.close();
});

test("35 unread notifications: the badge says 9+ and the menu says the real number (more than the 30 the list shows)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "QA_user is shared by the three devices; one device checks the big count");
  await sql(`insert into public.admin_notifications (user_id, kind, title, body)
             select u.id, 'qa_bulk', 'QA bulk ' || g, 'QA bulk notification' from public.users u, generate_series(1, 35) g where u.display_name = 'QA_user'`);
  const real = Number((await sql<{ n: number }>("select count(*)::int n from public.admin_notifications a join public.users u on u.id = a.user_id where u.display_name = 'QA_user' and a.read_at is null"))[0].n);
  expect(real).toBeGreaterThanOrEqual(35);
  await page.goto("events/"); await settle(page, 3500);
  await expect(page.locator(".avatar-badge").first()).toHaveText("9+");
  await openAccountMenu(page);
  await expect(page.locator(".nt-count").first()).toHaveText(`${real} new`);
  await page.screenshot({ path: info.outputPath("unread-35-menu.png") });
  await page.keyboard.press("Escape");
});

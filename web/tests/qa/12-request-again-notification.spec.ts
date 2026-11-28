import { test, expect, settle, stateFile, planRef, openAccountMenu } from "./fixtures";

/**
 * Point 24, reviewer's gap: asking for a seat again after cancelling changes the old row from cancelled to pending
 * (it is not a new row). That must also create a "Seat request received" notification for QA_user (and nobody else).
 * Uses the QA event "QA_Again <device>". Only in-app notifications are checked.
 */
test.use({ storageState: stateFile("user") });
let EVENT = "";
test.beforeEach(async ({}, info) => { EVENT = `QA_Again ${info.project.name}`; });

async function sql<T = unknown>(q: string, p: unknown[] = []): Promise<T[]> {
  // @ts-ignore plain .mjs helper shared with the seed script
  const { guard, liveConfig, connectDb } = await import("../seed/seed.mjs");
  guard(liveConfig().url);
  const db = await connectDb();
  try { return (await db.query(q, p)).rows as T[]; } finally { await db.end(); }
}
const received = (title: string) => sql<{ n: number }>(
  `select count(*)::int n from public.admin_notifications a join public.users u on u.id = a.user_id
   where u.display_name = 'QA_user' and a.kind = 'seat_requested' and a.body like $1`, [`%${title}%`]).then((r) => r[0].n);

test("request, cancel, request again: a second 'Seat request received' arrives", async ({ page }) => {
  const ref = await planRef(EVENT);
  await page.goto("event/?id=" + ref); await settle(page, 3500);
  await page.locator("#nm").fill("QA_user");
  await page.locator("#book button[type=submit]").click();
  await expect(page.locator(".status-card.s-pending")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => received(EVENT), { timeout: 10_000 }).toBe(1);

  // cancel (same change the Cancel button makes: the row becomes 'cancelled')
  await sql("update public.plan_requests set status = 'cancelled' where plan_ref = $1 and user_id = (select id from public.users where display_name = 'QA_user')", [ref]);
  await page.reload(); await settle(page, 3500);
  await expect(page.locator("#nm")).toBeVisible();                       // the form is back after a cancel
  await page.locator("#nm").fill("QA_user");
  await page.locator("#book button[type=submit]").click();
  await expect(page.locator(".status-card.s-pending")).toBeVisible({ timeout: 20_000 });

  await expect.poll(() => received(EVENT), { timeout: 10_000, message: "second 'received' notification after asking again" }).toBe(2);
  // visible to the member in the bell list, unread
  await page.goto("events/"); await settle(page, 3000);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: /Notifications/ }).click();
  await expect(page.locator(".nt li").filter({ hasText: EVENT }).filter({ hasText: /request/i })).toHaveCount(2);
});

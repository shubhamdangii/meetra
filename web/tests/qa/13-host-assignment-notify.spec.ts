import { test, expect, settle, stateFile, openAccountMenu } from "./fixtures";

/** Point 30: the host is told when assigned, changed away or removed (in-app). Host changes are made server side on a QA event. */
test.use({ storageState: stateFile("host") });
let EVENT = "";
test.beforeEach(async ({}, info) => { EVENT = `QA_Host pick ${info.project.name}`; });
async function sql<T = unknown>(q: string, p: unknown[] = []): Promise<T[]> {
  // @ts-ignore plain .mjs helper shared with the seed script
  const { guard, liveConfig, connectDb } = await import("../seed/seed.mjs");
  guard(liveConfig().url); const db = await connectDb();
  try { return (await db.query(q, p)).rows as T[]; } finally { await db.end(); }
}
const setHost = (name: string | null) => sql(`update public.custom_plans set host_id = ${name ? "(select id from public.host_profiles where name = $2 limit 1)" : "null"} where title = $1`, name ? [EVENT, name] : [EVENT]);

test("assign -> host told and sees it; change away -> told; removed -> told", async ({ page }) => {
  await setHost("QA_host");
  await page.goto("host/"); await settle(page, 4000);
  await expect(page.locator("main")).toContainText(EVENT);                       // in the host desk
  await openAccountMenu(page); await page.getByRole("menuitem", { name: /Notifications/ }).click();
  await expect(page.locator(".nt li").filter({ hasText: `You are hosting ${EVENT}` })).toHaveCount(1);
  await page.getByRole("button", { name: /^Done$/ }).click();
  await setHost("QA_Other Host");                                                 // changed to another host
  await page.reload(); await settle(page, 4000);
  await expect(page.locator("main")).not.toContainText(EVENT);
  await openAccountMenu(page); await page.getByRole("menuitem", { name: /Notifications/ }).click();
  await expect(page.locator(".nt li").filter({ hasText: `no longer hosting ${EVENT}` })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("host-notes.png") });
  await page.getByRole("button", { name: /^Done$/ }).click();
  await setHost("QA_host"); await setHost(null);                                  // assigned again, then removed
  const n = await sql<{ n: number }>(`select count(*)::int n from public.admin_notifications a join public.users u on u.id = a.user_id
     where u.display_name = 'QA_host' and a.kind = 'host_removed' and a.title like $1`, [`%${EVENT}%`]);
  expect(n[0].n, "told twice that they no longer host it").toBe(2);
});

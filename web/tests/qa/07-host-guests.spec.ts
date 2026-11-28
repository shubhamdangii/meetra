import { test, expect, settle, stateFile, tenv, type Page } from "./fixtures";

/**
 * A host sees the guests of THEIR OWN events (confirmed count and profile photos, never names) and nothing about another host's events.
 * QA_host hosts: QA_Open with location, QA_Full event, QA_Future event, QA_Past event, QA_To edit (one per device), QA_To cancel.
 * QA_Other Host (no login) hosts: QA_Other host event, which has a seat request from QA_user.
 */
const env = (k: "TEST_SUPABASE_URL" | "TEST_SUPABASE_ANON_KEY") => tenv()[k];
async function token(page: Page) {
  return page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /^sb-.*auth-token$/.test(x))!; return JSON.parse(localStorage.getItem(k)!).access_token as string; });
}
const api = async (tok: string, p: string, init: RequestInit = {}) =>
  fetch(`${env("TEST_SUPABASE_URL")}/rest/v1/${p}`, { ...init, headers: { apikey: env("TEST_SUPABASE_ANON_KEY"), Authorization: "Bearer " + tok, "content-type": "application/json", ...(init.headers as object) } });

test.describe("host desk shows own events and their guests", () => {
  test.use({ storageState: stateFile("host") });

  test("lists the host's own events and not another host's", async ({ page }) => {
    await page.goto("host/"); await settle(page, 4000);
    const main = page.locator("main");
    for (const t of ["QA_Open with location", "QA_Full event", "QA_Future event"]) await expect(main).toContainText(t);
    await expect(main).not.toContainText("QA_Other host event");
    await expect(main).not.toContainText("QA_Jaipur event");
  });

  test("shows who is coming for an event with confirmed guests (count and photos, no names)", async ({ page }) => {
    await page.goto("host/"); await settle(page, 4000);
    const card = page.locator("article, li, div").filter({ hasText: "QA_Full event" }).filter({ hasText: /WHO'?S COMING/i }).last();
    await expect(card).toContainText(/2\/2 confirmed|2 people are going/);
    await expect(card).not.toContainText("QA User");          // names are never shown to the host here
    await expect(card).not.toContainText("QA_user");
  });
});

test.describe("host cannot read another host's guests or private data", () => {
  test.use({ storageState: stateFile("host") });

  test("the other host's event is not in the host's own event list", async ({ page }) => {
    await page.goto("host/"); await settle(page, 3000);
    const tok = await token(page);
    const r = await api(tok, "rpc/host_my_events", { method: "POST", body: "{}" });
    const rows = (await r.json()) as { title: string }[];
    const titles = rows.map((x) => x.title).filter((t) => t.startsWith("QA_"));
    expect(titles).toContain("QA_Full event");
    expect(titles).not.toContain("QA_Other host event");
  });

  test("direct reads of seat requests and private profiles return nothing from other people", async ({ page }) => {
    await page.goto("host/"); await settle(page, 3000);
    const tok = await token(page);
    const reqs = (await (await api(tok, "plan_requests?select=id,plan_ref")).json()) as unknown[];
    expect(reqs, "host can read seat requests directly").toEqual([]);
    const priv = (await (await api(tok, "user_private?select=user_id,full_name,phone")).json()) as unknown[];
    expect(priv.length, "host can read other people's private profiles").toBe(1);   // only their own
  });

  test("the other host's event page does not expose its guest list to this host", async ({ page }) => {
    await page.goto("host/"); await settle(page, 3000);
    const tok = await token(page);
    const r = await api(tok, "custom_plans?select=plan_ref&title=eq.QA_Other%20host%20event");
    const [{ plan_ref }] = (await r.json()) as { plan_ref: string }[];
    const att = await api(tok, "plan_requests?select=*&plan_ref=eq." + plan_ref);
    expect(await att.json()).toEqual([]);
  });
});

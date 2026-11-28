import { test, expect, settle, stateFile, planRef, tenv, type Page } from "./fixtures";

/** A sub-admin runs ONE city (Ahmedabad). They must not see or change another city's events, and have a smaller desk than the main admin. */
async function accessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*auth-token$/.test(x))!;
    return JSON.parse(localStorage.getItem(k)!).access_token as string;
  });
}

test.describe("sub-admin: city desk", () => {
  test.use({ storageState: stateFile("subadmin") });

  test("the desk is called City desk and shows only the city tools", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 3500);
    const main = page.locator("main");
    await expect(main).toContainText(/City desk/);
    await expect(main).toContainText(/Ahmedabad/);
    for (const tab of [/Seat requests/, /Door/, /Interest/]) await expect(page.getByRole("button", { name: tab }).or(page.getByRole("tab", { name: tab })).first()).toBeVisible();
    for (const tab of [/Dashboard/, /Approvals/, /Team/, /Brands/, /Activity/]) await expect(page.getByRole("button", { name: tab })).toHaveCount(0);
  });

  test("seat requests list only Ahmedabad events, never the Jaipur one", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 3500);
    const text = await page.locator("main").innerText();
    expect(text).toContain("QA_Open with location");
    expect(text).not.toContain("QA_Jaipur event");
  });

  test("sub-admin cannot change a Jaipur event through the API either", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 2500);
    const tok = await accessToken(page);
    const { TEST_SUPABASE_URL: base, TEST_SUPABASE_ANON_KEY: anon } = tenv();
    const r = await fetch(`${base}/rest/v1/custom_plans?title=eq.QA_Jaipur%20event`, {
      method: "PATCH", headers: { apikey: anon, Authorization: "Bearer " + tok, "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ blurb: "changed by a sub-admin" }),
    });
    const body = r.ok ? await r.json() : [];
    expect(Array.isArray(body) ? body.length : 0, "a Jaipur event was changed by an Ahmedabad sub-admin").toBe(0);
  });
});

test.describe("main admin can see the other city", () => {
  test.use({ storageState: stateFile("admin") });
  test("admin sees the Jaipur event in the event library", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 3000);
    await page.getByRole("button", { name: /Events/ }).or(page.getByRole("tab", { name: /Events/ })).first().click();
    await settle(page, 2000);
    await page.locator("select").filter({ has: page.locator("option", { hasText: "Jaipur" }) }).first().selectOption({ label: "Jaipur" });
    await expect(page.locator("main")).toContainText("QA_Jaipur event");
    expect(await planRef("QA_Jaipur event")).toContain("jaipur");
  });
});

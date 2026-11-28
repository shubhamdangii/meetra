import { test, expect, settle, stateFile, tenv, type Page } from "./fixtures";

/**
 * Point 26: no mobile / WhatsApp verification anywhere on the profile (kept behind one flag in config.ts).
 * Point 27: one simple priority score, 7 parts, always out of 100, recalculated the moment the profile is saved:
 *   photo 20 · bio 20+ chars 15 · longer bio 80+ chars 10 · house rules 15 · email verified 15 · three words 10 · prompt answer 15
 */
test.use({ storageState: stateFile("user") });
// tests run in order in one worker; a failing step does not hide the ones after it

const PARTS: [RegExp, number][] = [
  [/^Photo$/i, 20], [/^Bio \(20\+ characters\)$/i, 15], [/^Longer bio \(80\+ characters\)$/i, 10],
  [/^House rules$/i, 15], [/^Email verified$/i, 15], [/^Three words$/i, 10], [/^Prompt answer$/i, 15],
];

async function token(page: Page) {
  return page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /^sb-.*auth-token$/.test(x))!; return JSON.parse(localStorage.getItem(k)!).access_token as string; });
}
async function dbScore(page: Page): Promise<number> {
  const t = tenv();
  const r = await fetch(`${t.TEST_SUPABASE_URL}/rest/v1/rpc/me`, { method: "POST", headers: { apikey: t.TEST_SUPABASE_ANON_KEY, Authorization: "Bearer " + (await token(page)), "content-type": "application/json" }, body: "{}" });
  const j = await r.json(); return (Array.isArray(j) ? j[0] : j).profile_score as number;
}
const shownScore = async (page: Page) => Number(await page.locator(".ps-num b").first().innerText());
async function openProfile(page: Page) { await page.goto("profile/"); await settle(page, 3500); }

test.describe("point 26: no mobile number or WhatsApp verification", () => {
  test("no verify button, no verification badge, no WhatsApp item in the score or the quests", async ({ page }) => {
    await openProfile(page);
    await expect(page.getByRole("button", { name: /^Verify$/ })).toHaveCount(0);
    await expect(page.locator(".ps-verify")).not.toContainText(/WhatsApp/i);
    await expect(page.locator("main")).not.toContainText(/verified WhatsApp|Verify your WhatsApp|WhatsApp number/i);
    await expect(page.locator(".vtag").filter({ hasText: /not verified/ })).toHaveCount(0);   // the email tag may say "verified", but no "not verified" for the phone
    await expect(page.locator("#phone")).toHaveCount(0);
  });
});

test.describe("point 27: simple, correct priority score", () => {
  test("the breakdown has exactly the 7 agreed parts and they add up to 100", async ({ page }) => {
    await openProfile(page);
    const rows = page.locator(".ps-checks li");
    await expect(rows).toHaveCount(PARTS.length);
    let total = 0;
    for (const [label, pts] of PARTS) {
      const row = rows.filter({ has: page.locator("span", { hasText: label }) });
      await expect(row, `part ${label}`).toHaveCount(1);
      await expect(row).toContainText(`+${pts}`);
      total += pts;
    }
    expect(total).toBe(100);
    await expect(page.locator(".ps-checks")).not.toContainText(/first name|city|what you do|full name|date of birth|gender|WhatsApp/i);
  });

  test("the breakdown shows what is done and what is left, and the number matches it", async ({ page }) => {
    await openProfile(page);
    const done = page.locator(".ps-checks li.ok"), left = page.locator(".ps-checks li:not(.ok)");
    expect((await done.count()) + (await left.count())).toBe(PARTS.length);
    let sum = 0;
    for (const li of await done.all()) sum += Number((await li.locator("b").innerText()).replace("+", ""));
    expect(await shownScore(page), "the big number equals the ticked parts").toBe(sum);
    expect(await shownScore(page), "the big number equals what the database stores").toBe(await dbScore(page));
  });

  test("saving the profile recalculates immediately: shown, stored and equal to the ticked parts (bio of 80+ characters)", async ({ page }, info) => {
    await openProfile(page);
    const before = await shownScore(page);
    expect(await dbScore(page)).toBe(before);
    // the three devices share one QA_user: work out what the bio parts add right now instead of assuming an empty bio
    const bioRow = (n: RegExp) => page.locator(".ps-checks li").filter({ has: page.locator("span", { hasText: n }) });
    const had20 = await bioRow(/^Bio \(20\+ characters\)$/i).evaluate((el) => el.classList.contains("ok"));
    const had80 = await bioRow(/^Longer bio \(80\+ characters\)$/i).evaluate((el) => el.classList.contains("ok"));
    const expected = before + (had20 ? 0 : 15) + (had80 ? 0 : 10);
    await page.locator("#bio").fill(`QA bio ${info.project.name} ${Date.now()}: I love board games, long walks and chai, and I am joining Meetra to meet new people in my city.`);
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.locator(".form-msg").filter({ hasText: /Saved ✓/ })).toBeVisible({ timeout: 15_000 });
    // no reload: the page itself must already show the new score
    await expect.poll(() => shownScore(page), { timeout: 8000 }).toBe(expected);
    await expect(page.locator(".form-msg").filter({ hasText: /Saved ✓/ })).toContainText(`${expected}/100`);
    expect(await dbScore(page), "stored score").toBe(expected);
    await page.reload(); await settle(page, 3000);
    expect(await shownScore(page), "after a reload").toBe(expected);
  });

  test("answering the quests recalculates at once: three words +10, prompt answer +15 (stored and shown, no reload)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-chrome", "QA_user is shared by the three devices; one device changes the quests");
    await openProfile(page);
    const row = (n: RegExp) => page.locator(".ps-checks li").filter({ has: page.locator("span", { hasText: n }) });
    const hadWords = await row(/^Three words$/i).evaluate((el) => el.classList.contains("ok"));
    const hadPrompt = await row(/^Prompt answer$/i).evaluate((el) => el.classList.contains("ok"));
    let want = await shownScore(page);
    if (!hadWords) {
      for (const w of ["Curious", "Warm", "Witty"]) await page.locator(".q-chips button", { hasText: new RegExp(`^${w}$`) }).click();
      await page.getByRole("button", { name: /Lock them in/ }).click();
      want += 10;
      await expect.poll(() => shownScore(page), { timeout: 10_000 }).toBe(want);
    }
    if (!hadPrompt) {
      await page.getByLabel("Your answer").fill("QA: chai and board games");
      await page.getByRole("button", { name: /Save answer/ }).click();
      want += 15;
      await expect.poll(() => shownScore(page), { timeout: 10_000 }).toBe(want);
    }
    await expect(row(/^Three words$/i)).toHaveClass(/ok/);
    await expect(row(/^Prompt answer$/i)).toHaveClass(/ok/);
    expect(await dbScore(page), "stored score equals the shown score").toBe(await shownScore(page));
    await page.screenshot({ path: info.outputPath("score-breakdown.png"), fullPage: false });
  });

  test("the score can never go above 100", async ({ page }) => {
    await openProfile(page);
    const n = await shownScore(page);
    expect(n).toBeLessThanOrEqual(100); expect(n).toBeGreaterThanOrEqual(0);
    expect(await dbScore(page)).toBeLessThanOrEqual(100);
  });
});

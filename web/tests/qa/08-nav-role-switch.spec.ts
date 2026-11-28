import { test, expect, settle, creds, openAccountMenu, isMobile, ROLES, type Page, type Role } from "./fixtures";

/**
 * Point 28: the bottom navigation bar must stay visible when someone logs out and logs in as another role.
 * The old check (toBeVisible) did not catch a bar that was slid off-screen and made transparent, so this test looks at where the bar really is.
 * The login is done the way a person does it on a phone: type the password and press Enter / Go, with no page reload in between.
 */
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

const bar = (page: Page) => page.getByRole("navigation", { name: "Main (mobile)" });

/** The bar is really usable: on screen, opaque, and not marked as hidden by the keyboard logic. */
async function expectBarUsable(page: Page, label: string) {
  await expect(bar(page), `${label}: bar exists`).toBeVisible();
  await expect(bar(page), `${label}: bar is not hidden for the keyboard`).not.toHaveClass(/typing/);
  // on screen = its top edge is well above the bottom of the window (a hidden bar is slid 110% down, so its top is at or below the window bottom)
  await expect.poll(() => bar(page).evaluate((el) => { const r = el.getBoundingClientRect(); return { fromBottom: Math.round(window.innerHeight - r.top), h: Math.round(r.height) }; }), { message: `${label}: bar is inside the screen` })
    .toMatchObject({ fromBottom: expect.any(Number) });
  const g = await bar(page).evaluate((el) => { const r = el.getBoundingClientRect(); return window.innerHeight - r.top - r.height * 0.9; });
  expect(g, `${label}: at least 90% of the bar is above the window bottom (value ${g})`).toBeGreaterThan(0);
  const opacity = await bar(page).evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity), `${label}: bar is opaque`).toBe(1);
  const pe = await bar(page).evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pe, `${label}: bar takes taps`).not.toBe("none");
}

/** Log in without a page reload after the form: fill, then press Enter in the password field (focus stays inside the form). */
async function typeLogin(page: Page, role: Role) {
  const c = creds(role);
  await page.locator("#em").fill(c.email);
  await page.locator("#pw").fill(c.password);
  await page.locator("#pw").press("Enter");
  await expect(page).not.toHaveURL(/\/login\/?(\?|$)/, { timeout: 20_000 });
}

async function logoutNoReload(page: Page) {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page.getByText(/Logged out/).first()).toBeVisible();
}

test("logout then login as each role: the bottom bar is there and right every time", async ({ page }, info) => {
  test.skip(!isMobile(info), "the bottom bar exists on phones only");
  test.setTimeout(240_000);   // four full logins, logouts and page changes over the network
  await page.goto("login/"); await settle(page);
  const seen: string[] = [];
  for (const role of ROLES) {
    await typeLogin(page, role); await settle(page, 1500);
    await expectBarUsable(page, `after logging in as ${role}`);
    await expect(bar(page).getByRole("link", { name: "Account" }), `${role}: Account tab`).toBeVisible();
    await expect(bar(page).getByRole("link", { name: "My plans" })).toBeVisible();
    // navigate inside the app (no reload) and check again
    await page.getByRole("navigation", { name: "Main (mobile)" }).getByRole("link", { name: "Explore" }).click(); await settle(page, 800);
    await expectBarUsable(page, `${role} after opening Explore`);
    await logoutNoReload(page); await settle(page, 800);
    await expectBarUsable(page, `after logging out of ${role}`);
    await expect(bar(page).getByRole("link", { name: "Log in" })).toBeVisible();
    seen.push(role);
    await bar(page).getByRole("link", { name: "Log in" }).click();    // client-side to the login page again
    await expect(page.locator("#em")).toBeVisible();
  }
  expect(seen).toEqual([...ROLES]);
});

test("the menu items follow the role after each switch (all devices)", async ({ page }) => {
  await page.goto("login/"); await settle(page);
  const want: Record<Role, RegExp> = { admin: /Admin desk/, subadmin: /City desk/, host: /Add a plan/, user: /My profile/ };
  for (const role of ROLES) {
    await typeLogin(page, role); await settle(page, 1500);
    await openAccountMenu(page);
    await expect(page.getByRole("menuitem", { name: want[role] }).first(), `${role} menu`).toBeVisible();
    if (role === "user") await expect(page.getByRole("menuitem", { name: /Admin desk|City desk|Add a plan/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await logoutNoReload(page); await settle(page, 600);
    await page.goto("login/"); await settle(page, 600);
  }
});

import { test, expect, settle, stateFile, openAccountMenu, logout, loginAs, isMobile, type Role } from "./fixtures";

const expectMenu: Record<Role, { has: RegExp[]; not: RegExp[] }> = {
  admin: { has: [/Admin desk/, /Notifications/, /Log out/], not: [/City desk/, /Add a plan/] },
  subadmin: { has: [/City desk/, /Notifications/, /Log out/], not: [/Admin desk/, /Add a plan/] },
  host: { has: [/Add a plan/, /Notifications/, /Log out/], not: [/Admin desk/, /City desk/] },
  user: { has: [/Notifications/, /Log out/, /Your plans/], not: [/Admin desk/, /City desk/, /Add a plan/] },
};

for (const role of Object.keys(expectMenu) as Role[]) {
  test.describe(`${role}: menu and bottom bar`, () => {
    test.use({ storageState: stateFile(role) });
    test(`${role} account menu shows the right items`, async ({ page }) => {
      await page.goto("events/"); await settle(page);
      await openAccountMenu(page);
      const menu = page.getByRole("menu").last();
      for (const re of expectMenu[role].has) await expect(menu.getByRole("menuitem", { name: re }).first()).toBeVisible();
      for (const re of expectMenu[role].not) await expect(menu.getByRole("menuitem", { name: re })).toHaveCount(0);
    });
    test(`${role} sees the mobile bottom bar with Home, Explore, My plans, Account`, async ({ page }, info) => {
      test.skip(!isMobile(info), "the bottom bar is phone only");
      await page.goto("events/"); await settle(page);
      const bar = page.getByRole("navigation", { name: "Main (mobile)" });
      await expect(bar).toBeVisible();
      for (const l of ["Home", "Explore", "My plans", "Account"]) await expect(bar.getByRole("link", { name: l })).toBeVisible();
      await expect(bar.getByRole("link", { name: "Log in" })).toHaveCount(0);
    });
  });
}

test.describe("logout, then log in as a different role", () => {
  // fresh browser: logging out revokes that user's sessions, so these tests must not use the shared saved sessions
  test.use({ storageState: { cookies: [], origins: [] } });
  test("admin logs out, user logs in: no admin items, bottom bar and data follow the new role", async ({ page }, info) => {
    await loginAs(page, "admin");
    await page.goto("events/"); await settle(page);
    await openAccountMenu(page);
    await expect(page.getByRole("menuitem", { name: /Admin desk/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await logout(page);
    if (isMobile(info)) await expect(page.getByRole("navigation", { name: "Main (mobile)" }).getByRole("link", { name: "Log in" })).toBeVisible();
    await page.goto("admin/"); await settle(page);
    expect(await page.locator("main").innerText()).not.toMatch(/Seat requests|Dashboard/);

    await loginAs(page, "user"); await settle(page);
    await openAccountMenu(page);
    await expect(page.getByRole("menuitem", { name: /Admin desk|City desk|Add a plan/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    if (isMobile(info)) await expect(page.getByRole("navigation", { name: "Main (mobile)" }).getByRole("link", { name: "Account" })).toBeVisible();
    await page.goto("saved/"); await settle(page);
    await expect(page.locator("main")).toContainText("QA_");
    await page.goto("admin/"); await settle(page);
    await expect(page.locator("main")).toContainText("This page is for the meetra team only");
  });

  test("then a host logs in on the same browser and gets the host menu", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("events/"); await settle(page);
    await logout(page);
    await loginAs(page, "host"); await settle(page);
    await openAccountMenu(page);
    await expect(page.getByRole("menuitem", { name: /Add a plan/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Admin desk|City desk/ })).toHaveCount(0);
  });
});

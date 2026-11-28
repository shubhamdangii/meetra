import { test, expect, settle, stateFile } from "./fixtures";

test.describe("logged out: typing private URLs shows no private data", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const url of ["admin/", "saved/", "profile/", "ticket/", "host/?new=1"]) {
    test(`/${url} shows no private data`, async ({ page }) => {
      await page.goto(url); await settle(page);
      const text = await page.locator("main").innerText();
      expect(text).not.toMatch(/QA_|Seat requests|Approvals|YOUR HOST DESK|Open door pass/i);
    });
  }
  test("admin page says it is for the team only or asks to log in", async ({ page }) => {
    await page.goto("admin/"); await settle(page);
    await expect(page.locator("main")).toContainText(/team only|log in/i);
  });
});

test.describe("a normal member typing private URLs is turned away", () => {
  test.use({ storageState: stateFile("user") });
  test("user /admin/ is blocked", async ({ page }) => {
    await page.goto("admin/"); await settle(page);
    await expect(page.locator("main")).toContainText("This page is for the meetra team only");
    expect(await page.locator("main").innerText()).not.toMatch(/Seat requests|Dashboard|Approvals/);
  });
  test("user /host/?new=1 shows no host desk", async ({ page }) => {
    await page.goto("host/?new=1"); await settle(page);
    expect(await page.locator("main").innerText()).not.toMatch(/YOUR HOST DESK|Propose an event/i);
  });
});

test.describe("a host typing the admin URL is turned away", () => {
  test.use({ storageState: stateFile("host") });
  test("host /admin/ is blocked", async ({ page }) => {
    await page.goto("admin/"); await settle(page);
    await expect(page.locator("main")).toContainText("This page is for the meetra team only");
  });
});

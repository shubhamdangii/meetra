import { test, expect, settle, stateFile, field, dtLocal, planRef } from "./fixtures";

/** Audit: the admin must see the exact location (Maps link, address) of a host's proposal before approving it.
 *  Also: a logged-in member is never told to "log in" on the event page. (Proposals notify the main admins; the owner informed them.) */
test.describe.configure({ mode: "serial" });
let TITLE = "";
test.beforeEach(async ({}, info) => { TITLE = `QA_Loc ${info.project.name}`; });

test.describe("host proposes with a location", () => {
  test.use({ storageState: stateFile("host") });
  test("host sends a proposal with Maps link and address", async ({ page }, info) => {
    await page.goto("host/?new=1"); await settle(page, 3000);
    await page.getByText("Create from scratch").click();
    await field(page, "Title *").fill(TITLE);
    await field(page, "Area *").fill("Prahlad Nagar");
    await field(page, "Exact location (Google Maps link)").fill("https://maps.app.goo.gl/QAloc123");
    await page.locator(".field").filter({ has: page.locator('label:has-text("Full address")') }).locator("input, textarea").first().fill("QA 5 Location Road");
    const d = info.project.name === "desktop-chrome" ? 44 : 45;
    await field(page, "Starts *").fill(dtLocal(d, 19)); await field(page, "Ends *").fill(dtLocal(d, 21));
    await field(page, "Seats *").fill("6");
    await page.getByRole("button", { name: /Send to the team/ }).click();
    await expect(page.locator('[class*="toast"]').first()).toContainText(/sent/i, { timeout: 15_000 });
  });
});

test.describe("admin reviews it", () => {
  test.use({ storageState: stateFile("admin") });
  test("the review shows the Maps link and the address", async ({ page }) => {
    await page.goto("admin/"); await settle(page, 3500);
    await page.getByRole("button", { name: /Approvals/ }).first().click(); await settle(page, 2000);
    const row = page.locator("tr, li, article").filter({ hasText: TITLE }).first();
    await row.getByRole("button", { name: /Review/ }).click(); await settle(page, 2500);
    const box = page.locator(".adm-loc");
    await expect(box).toContainText("QA 5 Location Road");
    await expect(box.getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute("href", "https://maps.app.goo.gl/QAloc123");
    await page.screenshot({ path: test.info().outputPath("review-location.png") });
  });
});

test.describe("member on an event page", () => {
  test.use({ storageState: stateFile("user") });
  test("no 'log in' advice while logged in", async ({ page }) => {
    await page.goto("event/?id=" + (await planRef("QA_Free open event"))); await settle(page, 4000);
    await expect(page.locator(".priority")).not.toContainText(/log in|logging in/i);
  });
});

import { test, expect, settle, stateFile, field, dtLocal, type Page } from "./fixtures";

// Kept in its own file (not serial) so a failure here does not hide the rest of the host lifecycle.
const toast = (page: Page) => page.locator('[class*="toast"]').first();
// one host, three devices running together: each device gets its own days so the host is never double-booked
const off = (name: string) => (name === "iphone-13" ? 0 : name === "pixel-7" ? 1 : 2);

test.describe("host creates an event", () => {
  test.use({ storageState: stateFile("host") });
  async function openNewEventModal(page: Page) { await page.goto("host/?new=1"); await settle(page, 3000); }

  test("host creates a brand-new event from scratch (title, area, dates, seats only)", async ({ page }, info) => {
    await openNewEventModal(page);
    await page.getByText("Create from scratch").click();
    await field(page, "Title *").fill(`QA_Scratch ${info.project.name} ${Date.now()}`);
    await field(page, "Area *").fill("Prahlad Nagar");
    await field(page, "Starts *").fill(dtLocal(31 + off(info.project.name), 19));
    await field(page, "Ends *").fill(dtLocal(31 + off(info.project.name), 21));
    await field(page, "Seats *").fill("6");
    await field(page, "Description").fill("QA event created by the host lifecycle test");
    await page.getByRole("button", { name: "Send to the team →" }).click();
    await expect(toast(page)).toContainText(/sent/i, { timeout: 15_000 });
  });


  test("host can also add the exact Maps link (optional field)", async ({ page }, info) => {
    await openNewEventModal(page);
    await page.getByText("Create from scratch").click();
    await field(page, "Title *").fill(`QA_Scratch maps ${info.project.name} ${Date.now()}`);
    await field(page, "Area *").fill("Prahlad Nagar");
    await field(page, "Exact location (Google Maps link)").fill("https://maps.app.goo.gl/qa12345");
    await field(page, "Starts *").fill(dtLocal(34 + off(info.project.name), 19));
    await field(page, "Ends *").fill(dtLocal(34 + off(info.project.name), 21));
    await field(page, "Seats *").fill("6");
    await field(page, "Description").fill("QA event with a Maps link");
    await page.getByRole("button", { name: "Send to the team →" }).click();
    await expect(toast(page)).toContainText(/sent/i, { timeout: 15_000 });
  });
});

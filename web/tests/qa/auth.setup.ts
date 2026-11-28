// Logs in ONCE per role through the real login page (email + password) and saves each session for reuse.
import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ROLES, creds, stateFile } from "./fixtures";

for (const role of ROLES) {
  setup(`log in as ${role}`, async ({ page }) => {
    const c = creds(role);
    expect(c.email && c.password, "run the seed first (node tests/seed/seed.mjs)").toBeTruthy();
    await page.goto("login/");
    await page.locator("#em").fill(c.email);
    await page.locator("#pw").fill(c.password);
    await page.getByRole("button", { name: /^Log in/ }).last().click();
    await expect(page).not.toHaveURL(/\/login\/?(\?|$)/, { timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => /^sb-.*auth-token$/.test(k))), { timeout: 15_000 }).toBe(true);
    fs.mkdirSync(path.dirname(stateFile(role)), { recursive: true });
    await page.context().storageState({ path: stateFile(role) });
  });
}

import { test as base, expect, type Page, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../../..");
const readEnv = (f: string) => Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
export const ROLES = ["admin", "subadmin", "host", "user"] as const;
export type Role = (typeof ROLES)[number];
export const stateFile = (r: Role) => path.resolve(__dirname, "../../test-results/qa-auth", `${r}.json`);
/** Logins live only in .secrets and are never printed. */
export const creds = (r: Role) => { const a = readEnv(path.join(ROOT, ".secrets/test-accounts.env")); return { email: a[`QA_${r.toUpperCase()}_EMAIL`], password: a[`QA_${r.toUpperCase()}_PASSWORD`] }; };
const ORIGINAL_PROJECT = "eqzwolwhecotwiphmjrd";   // the original project: QA tests must never reach it

/** Every QA test: any request to the original project is blocked and fails the test. */
export const test = base.extend<{ guard: void }>({
  guard: [async ({ context }, use) => {
    const hits: string[] = [];
    await context.route((u) => u.href.includes(ORIGINAL_PROJECT), (route) => { hits.push(route.request().url().slice(0, 60)); return route.abort(); });
    await use();
    expect(hits, "a request tried to reach the ORIGINAL project").toEqual([]);
  }, { auto: true }],
});
export { expect };
export type { Page, Locator };

/** Wait for the app to finish its first load (Supabase data fetched). */
export const settle = (page: Page, ms = 2500) => page.waitForTimeout(ms);

/** Console and page errors collected while a page is used (the known Safari viewport warning is ignored). */
export function collectErrors(page: Page) {
  const list: string[] = [];
  page.on("pageerror", (e) => list.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|interactive-widget/.test(m.text())) list.push("console: " + m.text()); });
  return list;
}

// ---------- helpers shared by the QA specs ----------
export const tenv = () => readEnv(path.join(ROOT, ".secrets/test-supabase.env"));
/** plan_ref (the id used in event page URLs) of a QA_ event, looked up through the public API. */
export async function planRef(title: string): Promise<string> {
  const e = tenv();
  const r = await fetch(`${e.TEST_SUPABASE_URL}/rest/v1/custom_plans?select=plan_ref&deleted_at=is.null&order=starts_at.asc&title=eq.${encodeURIComponent(title)}`, { headers: { apikey: e.TEST_SUPABASE_ANON_KEY } });
  const j = (await r.json()) as { plan_ref: string }[];
  if (!j[0]) throw new Error(`QA event not found: ${title} (run the seed)`);
  return j[0].plan_ref;
}
export const isMobile = (info: { project: { name: string } }) => /iphone|pixel/.test(info.project.name);

/** Open the account menu (avatar button in the top bar). */
export async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: "Your account" }).first().click();
  await expect(page.getByRole("menu").last()).toBeVisible();
}
export async function logout(page: Page) {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page.getByText(/Logged out/).first()).toBeVisible();
}
/** Log in through the real login page (email + password). */
export async function loginAs(page: Page, role: Role) {
  const c = creds(role);
  await page.goto("login/");
  await page.locator("#em").fill(c.email);
  await page.locator("#pw").fill(c.password);
  await page.getByRole("button", { name: /^Log in/ }).last().click();
  await expect(page).not.toHaveURL(/\/login\/?(\?|$)/, { timeout: 20_000 });
}
/** A datetime-local value N days from now at the given hour (browser local time). */
export const dtLocal = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * 864e5); d.setHours(hour, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
};
/** A form control found by its label text (the app's labels are not linked by id). */
export const field = (scope: Page | Locator, label: string) =>
  scope.locator(".field").filter({ has: scope.locator(`label:text-is("${label}")`) }).locator("input, select, textarea").first();

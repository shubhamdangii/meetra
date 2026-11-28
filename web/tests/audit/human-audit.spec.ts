import { test, type Page, type BrowserContext, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { creds, tenv, field, dtLocal } from "../qa/fixtures";

/**
 * Human audit of the live site (QA_ accounts and QA_ events only). Every step is recorded, it never stops at the first problem:
 *   step result, console errors, sideways scroll, single words alone on the last line, a screenshot.
 * The log is written to test-results/audit/<device>.json and read by a person to write docs/AUDIT.md.
 */
test.describe.configure({ mode: "serial" });
type Row = { n: number; role: string; step: string; ok: boolean; note: string; console: string[]; overflow: boolean; orphans: string[]; shot: string };
const LOG: Row[] = [];
let N = 0, DEV = "";
const OUT = path.resolve(__dirname, "../../test-results/audit");
const settle = (p: Page, ms = 2500) => p.waitForTimeout(ms);
const say = (s: string) => console.log(`Now testing: ${s}`);

function watch(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/interactive-widget/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  return errs;
}

/** Single words alone on the last line of visible text blocks (headings, paragraphs, buttons, list items). */
async function orphans(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const els = Array.from(document.querySelectorAll("main h1, main h2, main h3, main p, main li, main button, main .btn, footer p, .tabbar b, .nudge span"));
    for (const el of els) {
      const he = el as HTMLElement; const r = he.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(he).visibility === "hidden" || r.bottom < 0) continue;
      const walker = document.createTreeWalker(he, NodeFilter.SHOW_TEXT);
      const words: { node: Text; start: number; end: number }[] = [];
      let t: Node | null;
      while ((t = walker.nextNode())) { const s = (t as Text).data; const re = /\S+/g; let m; while ((m = re.exec(s))) words.push({ node: t as Text, start: m.index, end: m.index + m[0].length }); }
      if (words.length < 3) continue;
      const top = (w: { node: Text; start: number; end: number }) => { const rg = document.createRange(); rg.setStart(w.node, w.start); rg.setEnd(w.node, w.end); const rs = rg.getClientRects(); return rs.length ? rs[0].top : NaN; };
      const a = top(words[words.length - 2]), b = top(words[words.length - 1]);
      if (!isNaN(a) && !isNaN(b) && b - a > 4) out.push((he.innerText || "").replace(/\s+/g, " ").trim().slice(-60));
      if (out.length >= 8) break;
    }
    return out;
  });
}

async function step(page: Page, errs: string[], role: string, name: string, fn: () => Promise<string | void>) {
  N++; say(`${role} - ${name}`);
  const before = errs.length; let ok = true, note = "";
  try { note = (await fn()) || "ok"; } catch (e) { ok = false; note = (e as Error).message.replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter(Boolean).slice(0, 3).join(" | ").slice(0, 300); }
  await settle(page, 600);
  const shot = path.join(OUT, DEV, `${String(N).padStart(3, "0")}-${role}-${name}`.replace(/[^\w.-]+/g, "_").slice(0, 110) + ".png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot }).catch(() => {});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
  const orph = await orphans(page).catch(() => [] as string[]);
  LOG.push({ n: N, role, step: name, ok, note, console: errs.slice(before), overflow, orphans: orph, shot: path.relative(path.resolve(__dirname, "../.."), shot) });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${DEV}.json`), JSON.stringify(LOG, null, 1));
}

async function login(page: Page, role: "admin" | "admin2" | "subadmin" | "host" | "user") {
  const c = creds(role);
  await page.goto("login/"); await settle(page, 2500);
  await page.locator("#em").fill(c.email); await page.locator("#pw").fill(c.password);
  await page.locator("#pw").press("Enter");
  await page.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname + u.search), { timeout: 25_000 });
  await settle(page, 2500);
}
async function logout(page: Page) {
  await page.getByRole("button", { name: "Your account" }).first().click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await settle(page, 2000);
}
async function planRef(title: string) {
  const t = tenv();
  const r = await fetch(`${t.TEST_SUPABASE_URL}/rest/v1/custom_plans?select=plan_ref&deleted_at=is.null&order=starts_at.asc&title=eq.${encodeURIComponent(title)}`, { headers: { apikey: t.TEST_SUPABASE_ANON_KEY } });
  const j = (await r.json()) as { plan_ref: string }[]; if (!j[0]) throw new Error("QA event not found: " + title); return j[0].plan_ref;
}
async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  // @ts-ignore plain .mjs helper shared with the seed script
  const { guard, liveConfig, connectDb } = await import("../seed/seed.mjs");
  guard(liveConfig().url); const db = await connectDb();
  try { return (await db.query(q, p)).rows as T[]; } finally { await db.end(); }
}
const bar = (p: Page) => p.getByRole("navigation", { name: "Main (mobile)" });
async function barState(p: Page) {
  if (!(await bar(p).count())) return "no bar element";
  return bar(p).evaluate((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return `display=${cs.display} class="${el.className}" opacity=${cs.opacity} top-from-bottom=${Math.round(innerHeight - r.top)} labels=${Array.from(el.querySelectorAll("b")).map((b) => b.textContent).join("/")}`; });
}
async function openNotes(p: Page) {
  await p.getByRole("button", { name: "Your account" }).first().click();
  const item = p.getByRole("menuitem", { name: /Notifications/ });
  const txt = await item.innerText();
  await item.click(); await settle(p, 1500);
  const list = await p.locator(".nt li").allInnerTexts();
  const unread = await p.locator(".nt li.new").count();
  return { menu: txt.replace(/\s+/g, " "), unread, list: list.map((x) => x.replace(/\s+/g, " ").slice(0, 90)) };
}
async function closeNotes(p: Page) { await p.getByRole("button", { name: /^Done$/ }).click().catch(() => p.keyboard.press("Escape")); await settle(p, 600); }
async function newCtx(browser: Browser, info: { project: { use: object } }): Promise<[BrowserContext, Page, string[]]> {
  const ctx = await browser.newContext({ ...info.project.use, recordVideo: { dir: path.resolve(__dirname, "../../test-results/videos", DEV) } });
  const page = await ctx.newPage(); const errs = watch(page); return [ctx, page, errs];
}
const TAG = () => `${DEV}-${Date.now().toString().slice(-5)}`;
let PROPOSED = "";

test.beforeAll(async ({}, info) => { DEV = info.project.name; });

test("1 logged-out visitor", async ({ browser }, info) => {
  const [ctx, page, errs] = await newCtx(browser, info); const R = "visitor";
  for (const [p, name] of [["", "landing"], ["events/", "explore"], ["past/", "past nights"], ["games/", "games"], ["swipe/", "discover swipe"], ["host/", "host page"], ["about/", "about-help"], ["safety/", "safety"], ["partners/", "partners"], ["merch/", "merch"], ["login/", "login page"]] as const) {
    await step(page, errs, R, name, async () => {
      const r = await page.goto(p); await settle(page, 3000);
      const t = await page.locator("main").innerText();
      if (/page you.?re looking for|not found|404/i.test(t.slice(0, 300))) throw new Error("page says not found");
      return `HTTP ${r?.status()}, bar: ${await barState(page)}`;
    });
  }
  await step(page, errs, R, "landing gallery and ticker", async () => {
    await page.goto(""); await settle(page, 3000);
    const head = (await page.locator("main h1").first().innerText()).replace(/\s+/g, " ");
    const plans = await page.locator(".tag").first().innerText().catch(() => "");
    for (let i = 0; i < 8; i++) { await page.evaluate(() => window.scrollBy(0, 700)); await settle(page, 500); }
    return `h1="${head}" tag="${plans}" scrolled the gallery`;
  });
  await step(page, errs, R, "one game page", async () => {
    await page.goto("games/"); await settle(page, 2500);
    const link = page.locator("main a[href*='game']").first(); const href = await link.getAttribute("href");
    await link.click(); await settle(page, 2500);
    return `opened ${href} -> ${page.url()}`;
  });
  await step(page, errs, R, "event page logged out", async () => {
    await page.goto("event/?id=" + (await planRef("QA_Open with location"))); await settle(page, 3500);
    const t = await page.locator("main").innerText();
    return `has request button: ${await page.locator("#book button[type=submit], #book a, a:has-text('Log in')").count()}; text: ${t.slice(0, 120).replace(/\s+/g, " ")}`;
  });
  await step(page, errs, R, "public host profile", async () => {
    const a = page.locator("a[href*='host-profile']").first();
    if (!(await a.count())) throw new Error("no link to the host's public profile on the event page");
    await a.click(); await settle(page, 3000);
    return `opened ${page.url()}: ${(await page.locator("main").innerText()).slice(0, 100).replace(/\s+/g, " ")}`;
  });
  await step(page, errs, R, "footer links", async () => {
    await page.goto("about/"); await settle(page, 2000);
    const hrefs = [...new Set(await page.locator("footer a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href).filter((h) => h.includes("/meetra"))))];
    const bad: string[] = [];
    for (const h of hrefs.slice(0, 25)) { const r = await page.goto(h); await settle(page, 1200); const t = await page.locator("main").innerText().catch(() => ""); if ((r && r.status() >= 400) || /not found/i.test(t.slice(0, 200))) bad.push(h); }
    if (bad.length) throw new Error("broken footer links: " + bad.join(", "));
    return `${hrefs.length} footer links open`;
  });
  await step(page, errs, R, "explore filters", async () => {
    await page.goto("events/"); await settle(page, 3000);
    const before = await page.locator("main a[href*='event/?id=']").count();
    const chip = page.locator("main button, main [role=tab]").filter({ hasText: /Games|games/ }).first();
    if (await chip.count()) { await chip.click(); await settle(page, 1500); }
    const after = await page.locator("main a[href*='event/?id=']").count();
    return `cards before ${before}, after Games filter ${after}`;
  });
  await ctx.close();
});

test("2 QA_user", async ({ browser }, info) => {
  const [ctx, page, errs] = await newCtx(browser, info); const R = "QA_user";
  await step(page, errs, R, "login", async () => { await login(page, "user"); return `bar: ${await barState(page)}`; });
  await step(page, errs, R, "profile no WhatsApp and 7-part score (26, 27)", async () => {
    await page.goto("profile/"); await settle(page, 4000);
    const main = await page.locator("main").innerText();
    const wa = main.match(/.{0,50}(WhatsApp|mobile number|Verify\b).{0,50}/i)?.[0];
    const parts = await page.locator(".ps-checks li").allInnerTexts();
    const sum = parts.reduce((s, x) => s + Number((x.match(/\+(\d+)/) ?? [0, 0])[1]), 0);
    const shown = await page.locator(".ps-num b").first().innerText();
    const sumLine = await page.locator(".ps-sum").innerText().catch(() => "(none)");
    if (wa) throw new Error("WhatsApp/mobile text on the profile: " + wa.replace(/\s+/g, " "));
    if (parts.length !== 7 || sum !== 100) throw new Error(`parts ${parts.length}, sum ${sum}`);
    return `score ${shown}, ${sumLine}, parts: ${parts.map((x) => x.replace(/\s+/g, " ")).join("; ")}`;
  });
  await step(page, errs, R, "save bio, score updates at once (27)", async () => {
    const before = Number(await page.locator(".ps-num b").first().innerText());
    await page.locator("#bio").fill(`QA audit bio ${TAG()}: board games, chai and long walks. Joining to meet new people in Ahmedabad soon.`);
    await page.getByRole("button", { name: /^Save$/ }).click(); await settle(page, 3500);
    const after = Number(await page.locator(".ps-num b").first().innerText());
    const msg = await page.locator(".form-msg").first().innerText().catch(() => "");
    return `before ${before}, after ${after}, message "${msg}"`;
  });
  await step(page, errs, R, "request a seat on a free event (24)", async () => {
    await page.goto("event/?id=" + (await planRef(`QA_Notify ${DEV === "phone" ? "iphone-13" : "desktop-chrome"}`))); await settle(page, 3500);
    await page.locator("#nm").fill("QA_user"); await page.locator("#book button[type=submit]").click();
    await page.locator(".status-card.s-pending").waitFor({ timeout: 20_000 });
    await settle(page, 2500);
    const badge = await page.locator(".avatar-badge").first().innerText().catch(() => "none");
    return `pending shown; badge ${badge}`;
  });
  await step(page, errs, R, "notifications after request", async () => { const n = await openNotes(page); await closeNotes(page); return JSON.stringify(n).slice(0, 400); });
  await step(page, errs, R, "cancel from Your plans", async () => {
    await page.goto("saved/"); await settle(page, 3500);
    const ev = `QA_Notify ${DEV === "phone" ? "iphone-13" : "desktop-chrome"}`;
    const card = page.locator("article, .plan-card, li").filter({ hasText: ev }).first();
    await card.getByRole("button", { name: /can't make it|Cancel|Withdraw/i }).click();
    const ok = page.getByRole("button", { name: /^(Yes|Cancel (my )?(spot|seat|request)|Confirm|Release|Withdraw)/i }).last();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await settle(page, 3000);
    return `after cancel: ${(await page.locator("main").innerText()).includes(ev) ? "still listed" : "gone from list"}`;
  });
  await step(page, errs, R, "request again after cancel (24, migration 080000)", async () => {
    const ev = `QA_Notify ${DEV === "phone" ? "iphone-13" : "desktop-chrome"}`;
    await page.goto("event/?id=" + (await planRef(ev))); await settle(page, 3500);
    await page.locator("#nm").fill("QA_user"); await page.locator("#book button[type=submit]").click();
    await page.locator(".status-card.s-pending").waitFor({ timeout: 20_000 }); await settle(page, 2500);
    const n = await openNotes(page); await closeNotes(page);
    const rec = n.list.filter((x) => x.includes(ev) && /received/i.test(x)).length;
    if (rec < 2) throw new Error(`only ${rec} "request received" notification(s) for ${ev}`);
    return `${rec} "received" notifications; menu "${n.menu}"`;
  });
  await step(page, errs, R, "mark one read, count drops", async () => {
    const n1 = await openNotes(page);
    await page.locator(".nt li.new a").first().click().catch(() => {}); await settle(page, 2500);
    await page.goto("events/"); await settle(page, 2500);
    const n2 = await openNotes(page); await closeNotes(page);
    return `unread before ${n1.unread}, after ${n2.unread}; menu "${n1.menu}" -> "${n2.menu}"`;
  });
  await step(page, errs, R, "past plans and rating", async () => {
    await page.goto("saved/"); await settle(page, 3500);
    const box = page.locator(".rate-box").first();
    if (!(await box.count())) throw new Error("no rating box under Past plans");
    await box.getByRole("radio", { name: /^5 stars$/ }).click();
    const send = box.getByRole("button", { name: /Send|Submit|Save|Rate/i }).first();
    await send.click(); await settle(page, 2500);
    return (await page.locator(".rate-box, .rate-done, main").first().innerText()).slice(0, 150).replace(/\s+/g, " ");
  });
  await step(page, errs, R, "explore filters and search", async () => {
    await page.goto("events/?q=QA_"); await settle(page, 3500);
    return `QA_ search shows ${await page.locator("main a[href*='event/?id=']").count()} cards`;
  });
  await step(page, errs, R, "logout, bottom bar (28)", async () => { await logout(page); return `bar: ${await barState(page)}`; });
  await step(page, errs, R, "login as host in the same browser, bottom bar (28)", async () => { await login(page, "host"); return `bar: ${await barState(page)}`; });
  await ctx.close();
});

test("3 QA_host", async ({ browser }, info) => {
  const [ctx, page, errs] = await newCtx(browser, info); const R = "QA_host";
  await step(page, errs, R, "login", async () => { await login(page, "host"); return `bar: ${await barState(page)}`; });
  await step(page, errs, R, "profile has no WhatsApp (26)", async () => {
    await page.goto("profile/"); await settle(page, 3500);
    if (/WhatsApp|Verify\b/i.test(await page.locator("main").innerText())) throw new Error("WhatsApp text on host profile");
    return "no WhatsApp";
  });
  await step(page, errs, R, "host desk own events and guests", async () => {
    await page.goto("host/"); await settle(page, 4000);
    const t = await page.locator("main").innerText();
    return `QA_Open with location: ${t.includes("QA_Open with location")}, other host's event shown: ${t.includes("QA_Other host event")}, text start: ${t.slice(0, 160).replace(/\s+/g, " ")}`;
  });
  await step(page, errs, R, "propose a new event with every field", async () => {
    PROPOSED = `QA_Audit full ${TAG()}`;
    await page.goto("host/?new=1"); await settle(page, 3000);
    await page.getByText("Create from scratch").click(); await settle(page, 800);
    const form = page.locator(".adm-modal, [role=dialog], form").last();
    const labels = (await form.locator("label").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim());
    await field(page, "Title *").fill(PROPOSED);
    const cat = field(page, "Category *"); if (await cat.count()) await cat.selectOption({ index: 2 }).catch(() => {});
    await field(page, "Area *").fill("Prahlad Nagar");
    await field(page, "Exact location (Google Maps link)").fill("https://maps.app.goo.gl/QAaudit123").catch(() => {});
    for (const [l, v] of [["Full address", "QA 1 Audit Road, Ahmedabad"], ["Landmark", "QA landmark"], ["Meeting point", "QA gate"]] as const) await page.locator(".field").filter({ has: page.locator(`label:has-text("${l}")`) }).locator("input, textarea").first().fill(v).catch(() => {});
    const off = DEV === "phone" ? 0 : 1;
    await field(page, "Starts *").fill(dtLocal(36 + off, 19));
    await field(page, "Ends *").fill(dtLocal(36 + off, 21));
    const rep = field(page, "Repeat"); if (await rep.count()) await rep.selectOption({ index: 1 }).catch(() => {});
    await field(page, "Seats *").fill("8");
    const pt = field(page, "Price type"); if (await pt.count()) await pt.selectOption({ index: 0 }).catch(() => {});
    await field(page, "Price ₹").fill("149").catch(() => {});
    await field(page, "Description").fill("QA audit event, every field filled.");
    await field(page, "How it unfolds (one step per line, max 6)").fill("Meet\nPlay\nChai").catch(() => {});
    await field(page, "Tags (comma separated, max 4)").fill("QA, audit").catch(() => {});
    await page.screenshot({ path: path.join(OUT, DEV, `host-form-filled.png`), fullPage: true });
    await page.getByRole("button", { name: /Send to the team/ }).click(); await settle(page, 4000);
    const toast = await page.locator('[class*="toast"]').first().innerText().catch(() => "");
    return `labels: ${labels.join(" | ")}; toast "${toast}"; house rules field: ${labels.some((l) => /rule/i.test(l))}`;
  });
  await step(page, errs, R, "proposal visible under waiting", async () => {
    await page.goto("host/"); await settle(page, 4000);
    return `waiting section: ${await page.getByRole("heading", { name: /Waiting/ }).count()}, lists proposal: ${(await page.locator("main").innerText()).includes(PROPOSED)}`;
  });
  await step(page, errs, R, "host notifications", async () => { const n = await openNotes(page); await closeNotes(page); return JSON.stringify(n).slice(0, 400); });
  await ctx.close();
});

test("4 QA_admin1", async ({ browser }, info) => {
  const [ctx, page, errs] = await newCtx(browser, info); const R = "QA_admin1";
  await step(page, errs, R, "login", async () => { await login(page, "admin"); return `bar: ${await barState(page)}`; });
  const tab = async (name: RegExp) => { await page.getByRole("button", { name }).or(page.getByRole("tab", { name })).first().click(); await settle(page, 2500); };
  await step(page, errs, R, "dashboard", async () => { await page.goto("admin/"); await settle(page, 4000); await tab(/Dashboard/); return (await page.locator("main").innerText()).slice(0, 300).replace(/\s+/g, " "); });
  await step(page, errs, R, "host proposal arrived in Approvals with all data", async () => {
    await tab(/Approvals/);
    const row = page.locator("tr, li, article").filter({ hasText: PROPOSED }).first();
    await row.waitFor({ timeout: 15_000 });
    await row.getByRole("button", { name: /Review/ }).click(); await settle(page, 2000);
    const t = await page.locator(".adm-modal, [role=dialog]").last().innerText();
    return `maps link shown: ${t.includes("QAaudit123")}, address shown: ${t.includes("Audit Road")}, price 149: ${t.includes("149")}, details: ${t.slice(0, 300).replace(/\s+/g, " ")}`;
  });
  await step(page, errs, R, "approve the host proposal", async () => {
    await page.getByRole("button", { name: "✓ Approve", exact: true }).click(); await settle(page, 800);
    await page.getByRole("button", { name: "Approve ✓", exact: true }).click(); await settle(page, 3000);
    return `toast "${await page.locator('[class*="toast"]').first().innerText().catch(() => "")}"`;
  });
  await step(page, errs, R, "approved event in Events library (29)", async () => {
    await tab(/Events/);
    const c = page.locator(".lib-card").filter({ hasText: PROPOSED }).first();
    return (await c.count()) ? (await c.innerText()).replace(/\s+/g, " ").slice(0, 200) : "NOT in the active Events library";
  });
  await step(page, errs, R, "user books QA_Host pick, admin approves in Seat requests", async () => {
    const ev = `QA_Host pick ${DEV === "phone" ? "iphone-13" : "desktop-chrome"}`;
    const [uctx, up] = await newCtx(browser, info);
    await login(up, "user"); await up.goto("event/?id=" + (await planRef(ev))); await settle(up, 3500);
    await up.locator("#nm").fill("QA_user"); await up.locator("#book button[type=submit]").click(); await up.locator(".status-card.s-pending").waitFor({ timeout: 20_000 });
    await uctx.close();
    await page.goto("admin/"); await settle(page, 3500); await tab(/Seat requests/);
    const row = page.locator("article, tr, li, .req-card, .sr-row").filter({ hasText: ev }).first();
    await row.waitFor({ timeout: 15_000 });
    const rowText = (await row.innerText()).replace(/\s+/g, " ").slice(0, 200);
    await row.getByRole("button", { name: /^Approve/ }).click(); await settle(page, 3000);
    return `row: ${rowText}`;
  });
  await step(page, errs, R, "Events card: active date, booked, needs host (29)", async () => {
    const ev = `QA_Host pick ${DEV === "phone" ? "iphone-13" : "desktop-chrome"}`;
    await tab(/Events/);
    const c = page.locator(".lib-card").filter({ hasText: ev }).first();
    return (await c.innerText()).replace(/\s+/g, " ").slice(0, 220);
  });
  await step(page, errs, R, "assign QA_host (goes to the other admin)", async () => {
    const ev = `QA_Host pick ${DEV === "phone" ? "iphone-13" : "desktop-chrome"}`;
    const c = page.locator(".lib-card").filter({ hasText: ev }).first();
    await c.getByRole("button", { name: /Assign a host|Needs a host/ }).click(); await settle(page, 1200);
    await page.locator(".adm-modal-bg").getByRole("button", { name: /QA_host/ }).first().click(); await settle(page, 3000);
    return `toast "${await page.locator('[class*="toast"]').first().innerText().catch(() => "")}"`;
  });
  await step(page, errs, R, "seat requests list and dashboard counts after", async () => {
    await tab(/Dashboard/); return (await page.locator("main").innerText()).slice(0, 300).replace(/\s+/g, " ");
  });
  await ctx.close();
});

test("5 QA_admin2 approves, host and user see it", async ({ browser }, info) => {
  const [ctx, page, errs] = await newCtx(browser, info); const R = "QA_admin2";
  const ev = `QA_Host pick ${DEV === "phone" ? "iphone-13" : "desktop-chrome"}`;
  await step(page, errs, R, "login", async () => { await login(page, "admin2"); return `bar: ${await barState(page)}`; });
  await step(page, errs, R, "approval request notification", async () => { const n = await openNotes(page); await closeNotes(page); return JSON.stringify(n).slice(0, 400); });
  await step(page, errs, R, "approve the host assignment", async () => {
    await page.goto("admin/"); await settle(page, 3500);
    await page.getByRole("button", { name: /Approvals/ }).or(page.getByRole("tab", { name: /Approvals/ })).first().click(); await settle(page, 2500);
    const row = page.locator("tr, li, article").filter({ hasText: ev }).first();
    await row.waitFor({ timeout: 15_000 });
    await row.getByRole("button", { name: /Review/ }).click(); await settle(page, 1500);
    await page.getByRole("button", { name: "✓ Approve", exact: true }).click(); await settle(page, 800);
    await page.getByRole("button", { name: "Approve ✓", exact: true }).click(); await settle(page, 3000);
    return `toast "${await page.locator('[class*="toast"]').first().innerText().catch(() => "")}"`;
  });
  await step(page, errs, R, "Events card after assignment", async () => {
    await page.getByRole("button", { name: /Events/ }).first().click(); await settle(page, 2500);
    return (await page.locator(".lib-card").filter({ hasText: ev }).first().innerText()).replace(/\s+/g, " ").slice(0, 200);
  });
  const [hctx, hp, herrs] = await newCtx(browser, info);
  await step(hp, herrs, "QA_host", "host desk shows the assigned event (30)", async () => {
    await login(hp, "host"); await hp.goto("host/"); await settle(hp, 4000);
    const has = (await hp.locator("main").innerText()).includes(ev);
    const n = await openNotes(hp); await closeNotes(hp);
    return `event in host desk: ${has}; host notifications: ${JSON.stringify(n).slice(0, 300)}`;
  });
  await hctx.close();
  const [uctx, up, uerrs] = await newCtx(browser, info);
  await step(up, uerrs, "QA_user", "host announced notification and event page host (24)", async () => {
    await login(up, "user");
    const n = await openNotes(up); await closeNotes(up);
    await up.goto("event/?id=" + (await planRef(ev))); await settle(up, 3500);
    return `announced: ${n.list.some((x) => /host/i.test(x) && x.includes(ev))}; event page shows QA_host: ${(await up.locator("main").innerText()).includes("QA_host")}`;
  });
  await uctx.close();
  await ctx.close();
});

test("6 QA_subadmin", async ({ browser }, info) => {
  const [ctx, page, errs] = await newCtx(browser, info); const R = "QA_subadmin";
  await step(page, errs, R, "login", async () => { await login(page, "subadmin"); return `bar: ${await barState(page)}`; });
  await step(page, errs, R, "profile has no WhatsApp (26)", async () => { await page.goto("profile/"); await settle(page, 3500); if (/WhatsApp|Verify\b/i.test(await page.locator("main").innerText())) throw new Error("WhatsApp text"); return "no WhatsApp"; });
  await step(page, errs, R, "city desk", async () => { await page.goto("admin/"); await settle(page, 4000); const t = await page.locator("main").innerText(); return `jaipur shown: ${t.includes("QA_Jaipur event")}; ${t.slice(0, 250).replace(/\s+/g, " ")}`; });
  await step(page, errs, R, "logout then admin1 login, bar (28)", async () => { await logout(page); await login(page, "admin"); return `bar: ${await barState(page)}`; });
  await step(page, errs, R, "admin1 profile no WhatsApp (26)", async () => { await page.goto("profile/"); await settle(page, 3500); if (/WhatsApp|Verify\b/i.test(await page.locator("main").innerText())) throw new Error("WhatsApp text"); return "no WhatsApp"; });
  await ctx.close();
});

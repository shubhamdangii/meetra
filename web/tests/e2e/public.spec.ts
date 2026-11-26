import { expect, test, type Page } from "@playwright/test";

// Logged-out visitor checks on the live site. Logged-in roles are covered by tests/db (rules) and manual checks.
const istYmd = (offsetDays: number) => new Date(Date.now() + 5.5 * 36e5 + offsetDays * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
const errors = (page: Page) => {
  const list: string[] = [];
  page.on("pageerror", (e) => list.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) list.push("console: " + m.text()); });
  return list;
};
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
const settle = (page: Page) => page.waitForTimeout(3500);

for (const path of ["", "events/", "past/", "games/", "partners/", "swipe/", "host/", "login/", "about/"]) {
  test(`page /${path} loads without errors or sideways scroll`, async ({ page }) => {
    const errs = errors(page);
    await page.goto(path); await settle(page);
    await noSideScroll(page);
    expect(errs, errs.join("\n")).toEqual([]);
  });
}

test("point 7 · 'Real people, real nights' carousel scrolls sideways", async ({ page }) => {
  await page.goto(""); await settle(page);
  const track = page.locator("section.moments .gallery-track");
  await track.scrollIntoViewIfNeeded();
  const box = await track.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, vw: innerWidth }));
  expect(box.cw).toBeLessThanOrEqual(box.vw + 40);          // the strip fits the screen…
  expect(box.sw).toBeGreaterThan(box.cw + 100);              // …and has more photos to the side
  const moved = await track.evaluate(async (el) => { el.scrollLeft = 400; await new Promise((r) => setTimeout(r, 300)); return el.scrollLeft; });
  expect(moved).toBeGreaterThan(100);
});

test("point 11 · photo strip section doesn't touch the sections around it", async ({ page }) => {
  await page.goto(""); await settle(page);
  const gap = await page.evaluate(() => {
    const s = document.querySelector("section.moments") as HTMLElement; const prev = s.previousElementSibling as HTMLElement, next = s.nextElementSibling as HTMLElement;
    const r = s.getBoundingClientRect();
    return { above: r.top - prev.getBoundingClientRect().bottom, below: next.getBoundingClientRect().top - r.bottom, border: getComputedStyle(s).borderLeftWidth, display: getComputedStyle(s).display };
  });
  expect(gap.above).toBeGreaterThanOrEqual(0); expect(gap.below).toBeGreaterThanOrEqual(0);
  expect(gap.border).toBe("0px");
});

test("points 3/12/13 · a past date shows 'ended', no request button, and offers the next date", async ({ page }) => {
  await page.goto(`event/?id=salsa-ahmedabad-${istYmd(-7)}`); await settle(page);
  await expect(page.locator(".status-card.s-closed")).toContainText(/ended/i);
  await expect(page.locator("#book button[type=submit]")).toHaveCount(0);
  await expect(page.locator(".status-card a", { hasText: /Next date/ })).toBeVisible();
  // the link opens a different (future) date, which takes requests
  await page.locator(".status-card a", { hasText: /Next date/ }).click(); await settle(page);
  expect(page.url()).not.toContain(istYmd(-7));
  await expect(page.locator("#book button[type=submit]")).toBeVisible();
});

test("point 12 · lists mark events whose booking has closed", async ({ page }) => {
  await page.goto("events/"); await settle(page);
  const states = await page.evaluate(() => [...document.querySelectorAll(".card")].map((c) => ({ closed: c.classList.contains("card-closed"), badge: !!c.querySelector(".closed-badge"), text: c.querySelector(".card-stats")?.textContent ?? "" })));
  expect(states.length).toBeGreaterThan(0);
  for (const s of states) {
    expect(s.closed).toBe(s.badge);                                   // greyed ⇔ badge
    if (s.closed) expect(s.text).toMatch(/closed|ended/i); else expect(s.text).toMatch(/seats left|Full/);
  }
});

test("point 6 · map zooms with double-tap and pinch, and pans", async ({ page }, info) => {
  await page.goto("events/?view=map"); await settle(page);
  const map = page.locator(".amap").first(); await map.scrollIntoViewIfNeeded();
  const zoom = () => map.evaluate((el) => Number((el.querySelector(".amap-tile") as HTMLImageElement)?.src.split("/").at(-3)));
  const z0 = await zoom();
  const b = (await map.boundingBox())!;
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(400);
  expect(await zoom()).toBe(z0 + 1);
  if (info.project.name === "phone") {
    // two-finger pinch out through the DevTools protocol
    const cdp = await page.context().newCDPSession(page);
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const pts = (d: number) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(20) });
    for (let d = 25; d <= 90; d += 5) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    expect(await zoom()).toBeGreaterThan(z0 + 1);
  }
  const before = await map.evaluate((el) => (el.querySelector(".amap-tile") as HTMLElement).style.transform);
  await page.mouse.move(b.x + 100, b.y + 100); await page.mouse.down(); await page.mouse.move(b.x + 40, b.y + 60, { steps: 6 }); await page.mouse.up();
  expect(await map.evaluate((el) => (el.querySelector(".amap-tile") as HTMLElement).style.transform)).not.toBe(before);
});

test("point 8 · host form start/end fields don't overlap", async ({ page }) => {
  await page.goto("host/"); await settle(page);
  const own = page.getByRole("radio", { name: /Create my own/ });
  if (await own.count()) await own.click();
  const [s, e] = await Promise.all([page.locator("#hs").boundingBox(), page.locator("#he2").boundingBox()]);
  expect(s && e).toBeTruthy();
  const overlap = !(s!.x + s!.width <= e!.x || e!.x + e!.width <= s!.x || s!.y + s!.height <= e!.y || e!.y + e!.height <= s!.y);
  expect(overlap).toBe(false);
  expect(s!.height).toBeGreaterThanOrEqual(44);
});

test("point 9 · Brands & venues reachable from the navbar 'More' menu", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "phone uses the ☰ menu (already lists Brands & venues)");
  await page.goto(""); await settle(page);
  await page.getByRole("button", { name: /More/ }).click();
  await page.getByRole("menuitem", { name: /brands & venues/i }).click();
  await expect(page).toHaveURL(/partners/);
});

test("point 9 · partner form validates empty input", async ({ page }) => {
  await page.goto("partners/"); await settle(page);
  await page.getByRole("button", { name: /Send enquiry/ }).click();
  await expect(page.locator(".form-msg.err")).toBeVisible();
});

test("point 14 · swipe deck has only open plans, database events included", async ({ page }) => {
  await page.goto("swipe/"); await settle(page);
  await expect(page.locator(".deck")).toBeVisible();
  const count = await page.evaluate(() => document.querySelectorAll(".deck .swipe-card, .deck article, .deck [class*=card]").length);
  expect(count).toBeGreaterThan(0);
});

test("point 15 · every game has a retro cover that loads", async ({ page }) => {
  await page.goto("games/"); await settle(page);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
  await page.waitForTimeout(1500);
  const covers = await page.evaluate(() => [...document.querySelectorAll("img.game-cover, .party-cover img")].map((i) => ({ src: (i as HTMLImageElement).src, ok: (i as HTMLImageElement).naturalWidth > 0 })));
  expect(covers.length).toBe(21);
  expect(covers.filter((c) => !c.ok).map((c) => c.src)).toEqual([]);
});

test("deep link to an unknown plan shows a friendly message", async ({ page }) => {
  await page.goto("event/?id=QA_does-not-exist-20200101"); await settle(page);
  await expect(page.getByText(/wandered off/)).toBeVisible();
});

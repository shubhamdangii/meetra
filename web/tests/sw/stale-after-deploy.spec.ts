// A phone must not keep showing an old copy of the site after a new deploy.
// GitHub Pages tells browsers "keep every file for 10 minutes" (max-age=600). The fake server below does the same,
// then "deploys" version 2 while the browser still holds version 1 inside that 10-minute window.
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startFakePages, type Version } from "./fake-pages";

const WEB = process.cwd();
const OUT = path.join(WEB, "out");
const ICON = "icons/icon-192.png";
const DATA = "events/__next.events.__PAGE__.txt";
const SHA: Record<Version, string> = { v1: "a".repeat(40), v2: "b".repeat(40) };

let pages: ReturnType<typeof startFakePages>;
let base = "";
const dirs = {} as Record<Version, string>;

test.beforeAll(async () => {
  for (const v of ["v1", "v2"] as Version[]) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), `meetra-sw-${v}-`));
    dirs[v] = d;
    const put = (rel: string, data: Buffer | string) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), data); };
    // The service worker as it is in the repo, stamped by the real build script the way a deploy does it.
    put("sw.js", fs.readFileSync(path.join(WEB, "public", "sw.js")));
    put("index.html", fs.readFileSync(path.join(OUT, "index.html"), "utf8").replace("</head>", `<meta name="build-marker" content="${v}"/></head>`));
    const icon = fs.readFileSync(path.join(OUT, ICON));
    put(ICON, v === "v2" ? Buffer.concat([icon, Buffer.from("v2-deploy")]) : icon);
    const data = fs.readFileSync(path.join(OUT, DATA));
    put(DATA, v === "v2" ? Buffer.concat([data, Buffer.from("\n#v2-deploy")]) : data);
    execFileSync(process.execPath, ["scripts/fix-export.mjs", d], { cwd: WEB, env: { ...process.env, GITHUB_SHA: SHA[v] }, stdio: "pipe" });
  }
  pages = startFakePages(OUT, dirs);
  base = await pages.listen();
});
test.afterAll(async () => { await pages.close(); for (const d of Object.values(dirs)) fs.rmSync(d, { recursive: true, force: true }); });

const visit = (page: Page) => page.goto(`${base}/meetra/`, { waitUntil: "load" });
const marker = (page: Page) => page.evaluate(() => document.querySelector('meta[name="build-marker"]')?.getAttribute("content"));
const iconSize = (page: Page) => page.evaluate(async () => (await (await fetch("/meetra/icons/icon-192.png")).arrayBuffer()).byteLength);
const dataText = (page: Page) => page.evaluate(async () => (await fetch("/meetra/events/__next.events.__PAGE__.txt")).text());

/** First visit registers the service worker, a reload puts the page under its control (like a returning visitor). */
async function returningVisitor(page: Page) {
  pages.setVersion("v1");
  await visit(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
}

test("a new deploy shows on the very next page load, not 10 minutes later", async ({ page }) => {
  await returningVisitor(page);
  expect(await marker(page)).toBe("v1");
  pages.setVersion("v2");
  await visit(page);
  expect(await marker(page)).toBe("v2");
});

test("a replaced photo or icon with the same file name updates by the next view", async ({ page }) => {
  await returningVisitor(page);
  const before = await iconSize(page);
  pages.setVersion("v2");
  await visit(page);
  // saved copy may show once while it refreshes in the background, the next view must be the new file
  await expect.poll(() => iconSize(page), { timeout: 8_000 }).toBe(before + "v2-deploy".length);
});

test("page data files (__next.*.txt) are fresh after a deploy", async ({ page }) => {
  await returningVisitor(page);
  expect(await dataText(page)).not.toContain("#v2-deploy");
  pages.setVersion("v2");
  await visit(page);
  expect(await dataText(page)).toContain("#v2-deploy");
});

test("every deploy stamps the service worker with its own build id", async ({ request }) => {
  const name = async (v: Version) => {
    pages.setVersion(v);
    const body = await (await request.get(`${base}/meetra/sw.js`)).text();
    expect(body).not.toContain("__BUILD__");
    return /const BUILD = "([0-9]+-[0-9a-f]{7})"/.exec(body)?.[1] ?? "(no build stamp in sw.js)";
  };
  const one = await name("v1"); const two = await name("v2");
  expect(one).toContain("aaaaaaa");
  expect(two).toContain("bbbbbbb");
  expect(one).not.toBe(two);
});

test("regression guard: the page still opens offline after a visit", async ({ page }) => {
  await returningVisitor(page);
  await page.context().setOffline(true);
  await page.reload();
  expect(await marker(page)).toBe("v1");
  await page.context().setOffline(false);
});

test("regression guard: install and push pieces are still there", async ({ page, request }) => {
  pages.setVersion("v1");
  await visit(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  expect((await request.get(`${base}/meetra/manifest.webmanifest`)).status()).toBe(200);
  const sw = await (await request.get(`${base}/meetra/sw.js`)).text();
  for (const piece of ['addEventListener("fetch"', 'addEventListener("push"', 'addEventListener("notificationclick"', 'skipWaiting', 'clients.claim']) {
    expect(sw, `sw.js should still contain ${piece}`).toContain(piece);
  }
});

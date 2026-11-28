// One command for the whole QA run on meetra-test:  npm run qa
//   1. config check  2. reset + seed QA data  3. role/permission check  4. build the test copy of the site
//   5. role + lifecycle tests (iPhone WebKit, Pixel Chromium, Desktop Chrome)  6. old public tests on the QA site
//   7. deployed-site smoke test (skip with --no-deployed)  8. TESTING.md + baseline report
// Flags: --no-build  --no-deployed  --no-seed
// Never prints credentials. Never touches the original project (every step has a guard).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const flag = (f) => process.argv.includes(f);
const pw = path.join(web, "node_modules/@playwright/test/cli.js");
const out = path.join(web, "test-results");
fs.mkdirSync(out, { recursive: true });
const steps = [];

function run(name, args, env = {}, { retries = 0, optional = false } = {}) {
  for (let i = 0; i <= retries; i++) {
    process.stdout.write(`\n=== ${name}${i ? ` (retry ${i})` : ""} ===\n`);
    const r = spawnSync(process.execPath, args, { cwd: web, stdio: "inherit", env: { ...process.env, ...env } });
    if (r.status === 0 || i === retries) { steps.push({ name, ok: r.status === 0, optional }); return r.status === 0; }
  }
}

run("config default check", ["tests/qa/config-default.test.mjs"]);
if (!flag("--no-seed")) {
  const ok = run("reset + seed QA data", ["tests/seed/seed.mjs"], {}, { retries: 2 });
  if (!ok) { console.error("seed failed: stopping (nothing else is meaningful without data)"); process.exit(1); }
  run("role and permission check", ["tests/seed/verify-roles.mjs"]);
}
if (!flag("--no-build")) { if (!run("build test copy of the site", ["tests/qa/build-test-site.mjs"])) process.exit(1); }

run("role + lifecycle tests (3 devices)", [pw, "test", "-c", "playwright.qa.config.ts"], { PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(out, "qa-report.json") });
run("old public tests on the QA site", [pw, "test", "-c", "playwright.config.ts", "--retries=0", "--reporter=list,json", "--output=test-results/e2e-out"],
  { BASE_URL: "http://localhost:3100/meetra/", PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(out, "e2e-report.json") });
if (!flag("--no-deployed")) run("deployed site smoke test", [pw, "test", "-c", "playwright.smoke.config.ts", "--reporter=list,json"], { PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(out, "smoke-report.json") }, { optional: true });

run("write TESTING.md and baseline report", ["tests/qa/report.mjs"]);
fs.writeFileSync(path.join(out, "qa-steps.json"), JSON.stringify(steps, null, 2));
console.log("\nDone. Report: web/test-results/qa/baseline.md   Checklist: TESTING.md");

// Proves the env-var change in src/lib/config.ts is safe:
//  1) with NO variables set, the site still points at the original (live) project, exactly as in git HEAD
//  2) with the variables set, it points at the value given.
// Run: node tests/qa/config-default.test.mjs   (needs Node 22.6+ for .ts imports)
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sh = (args, env = {}) => execFileSync(process.execPath, args, { cwd: web, encoding: "utf8", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", ...env } }).trim();
const probe = "import('./src/lib/config.ts').then(m=>console.log(JSON.stringify({u:m.CONFIG.supabaseUrl,k:m.CONFIG.supabaseAnonKey})))";
const run = (env) => JSON.parse(sh(["--experimental-strip-types", "--no-warnings", "-e", probe], env));

// the original values, read from the committed file (git HEAD), not from the working copy
const head = execFileSync("git", ["show", "HEAD:web/src/lib/config.ts"], { cwd: web, encoding: "utf8" });
const liveUrl = head.match(/supabaseUrl:\s*"([^"]+)"/)[1], liveKey = head.match(/supabaseAnonKey:\s*"([^"]+)"/)[1];

let fails = 0;
const check = (ok, msg) => { console.log((ok ? "PASS" : "FAIL") + " | " + msg); if (!ok) fails++; };
const none = run({});
check(none.u === liveUrl && none.k === liveKey, "no variables set -> URL and anon key are exactly the original (live) values");
const set = run({ NEXT_PUBLIC_SUPABASE_URL: "https://example-test.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key" });
check(set.u === "https://example-test.supabase.co" && set.k === "test-key", "variables set -> site uses them");
process.exit(fails ? 1 : 0);

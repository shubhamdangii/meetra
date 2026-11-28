// Builds a local static copy of the current code into web/out, pointed at the live Supabase project
// (the only project; URL and public anon key come from src/lib/config.ts). Nothing is printed that is secret.
// Run: node tests/qa/build-test-site.mjs
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guard, liveConfig } from "../seed/seed.mjs";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const live = liveConfig();
guard(live.url);
console.log("building the local site against the Supabase project (ref " + new URL(live.url).host.split(".")[0] + ")...");
execSync("npm run build", { cwd: web, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: live.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: live.anonKey } });

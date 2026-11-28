// Builds a static copy of the site that talks to meetra-test (NOT the live project) into web/out.
// Run: node tests/qa/build-test-site.mjs   (secrets are read from .secrets, never printed)
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv, guard } from "../seed/seed.mjs";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = readEnv(path.join(web, "../.secrets/test-supabase.env"));
guard(env.TEST_SUPABASE_URL, env);
console.log("building the site against meetra-test (ref " + new URL(env.TEST_SUPABASE_URL).host.split(".")[0] + ")...");
execSync("npm run build", { cwd: web, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: env.TEST_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: env.TEST_SUPABASE_ANON_KEY } });

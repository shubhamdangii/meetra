// First permission check on the live project with the QA accounts: log in as each role through the Supabase API and count what it can read.
// Never prints keys, passwords or tokens. Run: node tests/seed/verify-roles.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv, guard, liveConfig } from "./seed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const live = liveConfig();
const env = { TEST_SUPABASE_URL: live.url, TEST_SUPABASE_ANON_KEY: live.anonKey };
const acc = readEnv(path.join(root, ".secrets/test-accounts.env"));
guard(live.url);
const url = env.TEST_SUPABASE_URL.replace(/\/+$/, "");

async function login(key) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.TEST_SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: acc[`QA_${key}_EMAIL`], password: acc[`QA_${key}_PASSWORD`] }) });
  const j = await r.json(); return r.ok ? j.access_token : null;
}
const get = async (tok, table, query = "select=*") => {
  const r = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: env.TEST_SUPABASE_ANON_KEY, Authorization: "Bearer " + tok, Prefer: "count=exact", Range: "0-0" } });
  if (!r.ok) return "denied";
  return Number(r.headers.get("content-range")?.split("/")[1] ?? 0);
};
const rpc = async (tok, fn, body = {}) => (await (await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: env.TEST_SUPABASE_ANON_KEY, Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(body) })).json());

const out = {};
for (const key of ["ADMIN1", "ADMIN2", "SUBADMIN", "HOST", "USER"]) {
  const tok = await login(key);
  if (!tok) { console.log(`${key.toLowerCase()} | login FAILED`); continue; }
  const me = await rpc(tok, "me");
  const m = Array.isArray(me) ? me[0] : me;
  const reqs = await get(tok, "plan_requests", "select=id&plan_ref=like.x*");
  const plans = await get(tok, "custom_plans", "select=id&title=like.QA_*");
  const privs = await get(tok, "user_private");
  const notifs = await get(tok, "admin_notifications");
  const audit = await get(tok, "audit_log");
  const queue = await rpc(tok, "admin_all_requests").then((r) => (Array.isArray(r) ? r.length : "denied")).catch(() => "denied");
  const hostEv = await rpc(tok, "host_my_events").then((r) => (Array.isArray(r) ? r.filter((e) => e.title?.startsWith("QA_")).map((e) => e.title) : "denied")).catch(() => "denied");
  out[key] = { reqs, plans, privs, notifs, audit, queue, hostEv, role: m?.role, host: m?.is_host };
  console.log(`${key.toLowerCase().padEnd(8)} | login OK | role=${m?.role} host=${m?.is_host} | QA events ${plans}, seat requests ${reqs}, private profiles ${privs}, admin notifications ${notifs}, audit log ${audit}, admin request list ${queue}, host's own events ${Array.isArray(hostEv) ? hostEv.length : hostEv}`);
}

console.log("\nPermission checks");
const pass = (ok, msg) => console.log(`${ok ? "PASS" : "FAIL"} | ${msg}`);
const U = out.USER, H = out.HOST, A = out.ADMIN1, S = out.SUBADMIN, A2 = out.ADMIN2;
pass(U.audit === "denied" && U.notifs === 0 && U.queue === "denied", `QA_user cannot read admin-only data (audit log: ${U.audit}, admin notifications: ${U.notifs}, admin request list: ${U.queue})`);
pass(U.privs === 1, `QA_user sees only their own private profile (${U.privs} row)`);
pass(U.reqs === 6, `QA_user sees only their own 6 seat requests (${U.reqs})`);
pass(Array.isArray(H.hostEv) && H.hostEv.length === 8 && !H.hostEv.includes("QA_Other host event"), `QA_host sees only their own 8 events, not the other host's event (${Array.isArray(H.hostEv) ? H.hostEv.length : H.hostEv})`);
pass(H.reqs === 0 && H.privs === 1, `QA_host cannot read other people's seat requests or private profiles directly (requests ${H.reqs}, private profiles ${H.privs})`);
pass(H.audit === "denied" && H.queue === "denied", "QA_host cannot read the audit log or the admin request list");
pass(U.hostEv === "denied", "QA_user cannot use the host event list");
pass(A2.role === "admin" && A2.queue >= 6, `QA_admin2 is a main admin too (${A2.queue})`);
pass(A.role === "admin" && A.queue >= 6 && S.queue >= 6, `QA_admin1 (${A.queue}) and QA_subadmin (${S.queue}) both see all 6 requests in their request list`);
pass(S.role === "member" && S.queue >= 6, "QA_subadmin is a member plus a city admin, not a main admin");

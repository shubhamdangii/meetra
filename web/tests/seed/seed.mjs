// Seed / reset QA data on the meetra-test Supabase project ONLY.
//
//   node tests/seed/seed.mjs                 reset QA data, then re-create it
//   node tests/seed/seed.mjs --reset-only    just remove QA data
//
// Secrets are read from ../.secrets/test-supabase.env and never printed.
// Test logins are written to ../.secrets/test-accounts.env (git-ignored).
// Everything this script creates or deletes is marked QA_ (events, host) or uses
// the qa-*@meetra-test.invalid emails (accounts). Nothing else is ever touched.
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const require = createRequire(path.join(root, "web", "package.json"));

export const readEnv = (file) => Object.fromEntries(
  fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

/** Refuses (exit 2) unless the target is exactly the meetra-test URL and not the live one. Runs BEFORE any connection. */
export function guard(targetUrl, env) {
  const norm = (u) => String(u || "").trim().replace(/\/+$/, "").toLowerCase();
  const liveUrl = fs.readFileSync(path.join(root, "web/src/lib/config.ts"), "utf8").match(/supabaseUrl:\s*(?:process\.env\.\w+\s*\|\|\s*)?"([^"]+)"/)?.[1];
  const fail = (msg) => { console.error("REFUSED: " + msg); process.exit(2); };
  if (!env.TEST_SUPABASE_URL) fail("TEST_SUPABASE_URL is empty in .secrets/test-supabase.env.");
  if (!liveUrl) fail("could not read the live project URL from web/src/lib/config.ts, so I cannot prove this is not live.");
  if (norm(targetUrl) === norm(liveUrl)) fail("the target is the LIVE project. This script only works on meetra-test.");
  if (norm(targetUrl) !== norm(env.TEST_SUPABASE_URL)) fail("the target URL does not exactly match TEST_SUPABASE_URL in .secrets/test-supabase.env.");
  if (norm(env.TEST_SUPABASE_URL) === norm(liveUrl)) fail("TEST_SUPABASE_URL in .secrets is the LIVE project URL.");
  return new URL(env.TEST_SUPABASE_URL).host.split(".")[0];   // project ref
}

export async function connectDb(ref, env) {
  const { Client } = require("pg");
  const routes = [
    { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
    ...["aws-1", "aws-0"].map((p) => ({ host: `${p}-ap-southeast-1.pooler.supabase.com`, port: 5432, user: "postgres." + ref })),
  ];
  for (const r of routes) {
    const c = new Client({ ...r, database: "postgres", password: env.TEST_SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
    try { await c.connect(); return c; } catch { try { await c.end(); } catch { /* next route */ } }
  }
  throw new Error("could not reach the meetra-test database");
}

const EMAIL_LIKE = "qa-%@meetra-test.invalid";
const ACCOUNTS = [
  { key: "admin", name: "QA_Admin", email: "qa-admin@meetra-test.invalid" },
  { key: "subadmin", name: "QA_SubAdmin", email: "qa-subadmin@meetra-test.invalid" },
  { key: "host", name: "QA_Host", email: "qa-host@meetra-test.invalid" },
  { key: "user", name: "QA_User", email: "qa-user@meetra-test.invalid" },
];

async function main() {
  const resetOnly = process.argv.includes("--reset-only");
  const envFile = path.join(root, ".secrets/test-supabase.env");
  const env = readEnv(envFile);
  const argUrl = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
  const target = argUrl ?? process.env.SEED_URL ?? env.TEST_SUPABASE_URL;
  const ref = guard(target, env);
  const url = env.TEST_SUPABASE_URL.replace(/\/+$/, "");
  const adminHeaders = { apikey: env.TEST_SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.TEST_SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
  const db = await connectDb(ref, env);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const log = (...a) => console.log(...a);

  // ---------------- RESET: only QA_ rows and the four qa-* accounts ----------------
  const authUsers = async () => {
    const out = []; for (let page = 1; page < 20; page++) {
      const r = await (await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: adminHeaders })).json();
      out.push(...(r.users ?? [])); if ((r.users ?? []).length < 200) break;
    } return out;
  };
  const qaAuth = (await authUsers()).filter((u) => /^qa-[a-z]+@meetra-test\.invalid$/.test(u.email ?? ""));
  const qaAuthIds = qaAuth.map((u) => u.id);
  const qaUserIds = qaAuthIds.length ? (await q("select id from public.users where auth_id = any($1)", [qaAuthIds])).map((r) => r.id) : [];
  const plans = await q("select id, plan_ref, title from public.custom_plans where title like 'QA\\_%'");
  if (plans.some((p) => !p.title.startsWith("QA_"))) throw new Error("safety: non-QA plan matched");
  if (plans.length > 60) throw new Error("safety: too many plans match QA_ (" + plans.length + "); refusing to delete");
  const refs = plans.map((p) => p.plan_ref), planIds = plans.map((p) => p.id);
  const cnt = {};
  const del = async (label, sql, p) => { const r = await db.query(sql, p); cnt[label] = r.rowCount; };
  await db.query("begin");
  try {
    await del("requests", "delete from public.plan_requests where plan_ref = any($1) or user_id = any($2)", [refs, qaUserIds]);
    await del("locations", "delete from public.event_locations where plan_id = any($1)", [planIds]);
    await del("audit rows", "delete from public.audit_log where (entity_id = any($1)) or actor_id = any($2)", [[...planIds.map(String), ...refs], qaUserIds]);
    await del("change requests", "delete from public.admin_requests where maker_id = any($1) or checker_id = any($1)", [qaUserIds]);
    await del("events", "delete from public.custom_plans where id = any($1)", [planIds]);
    await del("host profiles", "delete from public.host_profiles where name like 'QA\\_%' or user_id = any($1)", [qaUserIds]);
    await del("team rows", "delete from public.city_admins where user_id = any($1)", [qaUserIds]);
    await del("admin email", "delete from public.main_admin_emails where email = 'qa-admin@meetra-test.invalid'");
    await db.query("commit");
  } catch (e) { await db.query("rollback"); throw e; }
  for (const id of qaAuthIds) {
    const dr = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
    if (!dr.ok) throw new Error("could not delete a QA account (" + dr.status + "): " + ((await dr.json().catch(() => ({}))).msg ?? "unknown"));
  }
  cnt.accounts = qaAuthIds.length;
  log("reset: removed", Object.entries(cnt).map(([k, v]) => `${v} ${k}`).join(", "));
  if (resetOnly) { await db.end(); return; }

  // ---------------- SEED ----------------
  const creds = {}, ids = {};
  // The app decides who is the main admin from this email list (private.is_admin), not from users.role.
  await q("insert into public.main_admin_emails (email) values ('qa-admin@meetra-test.invalid') on conflict do nothing");
  for (const a of ACCOUNTS) {
    const password = crypto.randomBytes(18).toString("base64url") + "9aZ";
    const r = await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: adminHeaders,
      body: JSON.stringify({ email: a.email, password, email_confirm: true, user_metadata: { full_name: a.name } }) });
    const j = await r.json(); if (!r.ok) throw new Error("create " + a.key + " failed: " + (j.msg || j.message || r.status));
    creds[a.key] = { email: a.email, password };
    ids[a.key] = (await q("select id from public.users where auth_id = $1", [j.id]))[0].id;
  }
  // write logins (never printed)
  fs.writeFileSync(path.join(root, ".secrets/test-accounts.env"),
    ACCOUNTS.map((a) => `QA_${a.key.toUpperCase()}_EMAIL=${creds[a.key].email}\nQA_${a.key.toUpperCase()}_PASSWORD=${creds[a.key].password}`).join("\n") + "\n");

  // profiles (server context: allowed to set these). Phones are fake test numbers.
  let n = 0;
  for (const a of ACCOUNTS) {
    n++;
    await q("update public.users set display_name = $2, city_slug = 'ahmedabad', occupation = 'QA tester' where id = $1", [ids[a.key], a.name]);
    await q(`update public.user_private set full_name = $2, date_of_birth = '1995-01-01', gender = 'prefer_not_to_say', phone = $3,
             accepted_rules_at = now() where user_id = $1`, [ids[a.key], a.name.replace("_", " "), "+9190000000" + String(n).padStart(2, "0")]);
  }
  await q("update public.users set role = 'admin' where id = $1", [ids.admin]);
  await q("insert into public.city_admins (user_id, city_slug) values ($1, 'ahmedabad')", [ids.subadmin]);
  const host = (await q(`insert into public.host_profiles (name, city_slug, bio, user_id, status) values ('QA_Host', 'ahmedabad', 'QA test host', $1, 'active') returning id`, [ids.host]))[0].id;
  const otherHost = (await q(`insert into public.host_profiles (name, city_slug, bio, status) values ('QA_Other Host', 'ahmedabad', 'QA second host (no login)', 'active') returning id`))[0].id;
  await q(`insert into public.hosts (user_id, city_slug, headline, status, verified_at) values ($1, 'ahmedabad', 'QA test host', 'active', now())`, [ids.host]);

  // events. Insert in the future (the app's rules require it), then move the "past" and "closed" ones with triggers off.
  const day = 864e5, at = (d, h) => { const t = new Date(Date.now() + d * day); t.setUTCHours(h, 30, 0, 0); return t; };   // 13:30 UTC = 7 pm IST
  const mk = async (title, startDays, o = {}) => {
    const s = at(startDays, 13), e = new Date(s.getTime() + 3 * 36e5);
    return (await q(`insert into public.custom_plans (city_slug, title, category, area, price, price_type, seats, blurb, status, is_active, host_id, starts_at, ends_at, audience)
      values ($9, $1, 'games', $10, $2, $3, $4, 'QA test event', 'approved', $5, $6, $7, $8, 'mixed') returning id, plan_ref`,
      [title, o.free ? 0 : (o.price ?? 99), o.free ? "free" : "reservation", o.seats ?? 12, o.active ?? true, o.host ?? null, s, e, o.city ?? "ahmedabad", o.city === "jaipur" ? "C-Scheme" : "Prahlad Nagar"]))[0];
  };
  const ev = {};
  ev.openLoc   = await mk("QA_Open with location", 3, { host });
  ev.openNoLoc = await mk("QA_Open without location", 4);
  ev.closed    = await mk("QA_Booking closed", 2);
  ev.past      = await mk("QA_Past event", 6, { host });
  ev.future    = await mk("QA_Future event", 20, { host });
  await mk("QA_Past event", 30, { host: otherHost });             // later date of the same title + city: the past event offers it as "Next date"
  ev.draft     = await mk("QA_Inactive draft", 7, { active: false });
  ev.full      = await mk("QA_Full event", 5, { seats: 2, host });
  ev.other     = await mk("QA_Other host event", 8, { host: otherHost });
  ev.free      = await mk("QA_Free open event", 11, { free: true });   // free: seats can be requested without Razorpay
  // lifecycle: host adds a date to it, admin approves. One copy per device so parallel runs never pick each other's request
  for (const [i, d] of ["iphone-13", "pixel-7", "desktop-chrome"].entries()) ev["toEdit" + i] = await mk(`QA_To edit ${d}`, 15 + i, { host });
  ev.toCancel  = await mk("QA_To cancel", 13, { host });                // lifecycle: cancelled, no bookings
  ev.jaipur    = await mk("QA_Jaipur event", 9, { city: "jaipur" });
  // one private set per test device, so phone and desktop runs never fight over the same event
  const devs = ["iphone-13", "pixel-7", "desktop-chrome"];
  for (const [i, d] of devs.entries()) {
    await mk(`QA_Free open ${d}`, 10 + i, { free: true });       // user lifecycle: request, approve, cancel
    await mk(`QA_Toggle ${d}`, 40 + i);                         // admin lifecycle: inactive/active, assign host
  }
   // outside the sub-admin's city
  await q(`insert into public.event_locations (plan_id, maps_url, address, landmark, meeting_point) values ($1, 'https://maps.google.com/?q=23.0225,72.5714', 'QA address, Ahmedabad', 'QA landmark', 'QA gate')`, [ev.openLoc.id]);
  await q(`insert into public.event_locations (plan_id, maps_url, address, landmark, meeting_point) values ($1, 'https://maps.google.com/?q=23.0300,72.5800', 'QA address 2, Ahmedabad', 'QA landmark', 'QA gate')`, [ev.other.id]);

  // move dates with triggers off (same method as tests/db/roles.test.mjs), keeping the derived columns consistent
  await db.query("begin"); await db.query("set local session_replication_role = replica");
  const move = (id, start, closes) => db.query(`update public.custom_plans set starts_at = $2, ends_at = $2::timestamptz + interval '3 hours', booking_closes_at = $3,
      starts_on = ($2::timestamptz at time zone 'Asia/Kolkata')::date, time_label = private.ist_label($2), end_label = private.ist_label($2::timestamptz + interval '3 hours') where id = $1`, [id, start, closes]);
  const now = Date.now();
  await move(ev.closed.id, new Date(now + 2 * 36e5), new Date(now - 36e5));            // starts in 2 h, booking closed 1 h ago
  await move(ev.past.id, new Date(now - 3 * day), new Date(now - 3 * day - 4 * 36e5)); // 3 days ago
  await db.query("commit");

  // seat requests / bookings from QA_user (server context = team rights, so statuses can be set directly)
  const rq = (ref, status, extra = "") => q(`insert into public.plan_requests (plan_ref, user_id, party_size, icebreaker, status ${extra ? "," + extra.split("|")[0] : ""})
      values ($1, $2, $3, 'QA request', $4 ${extra ? "," + extra.split("|")[1] : ""})`, [ref, ids.user, ref === ev.full.plan_ref ? 2 : 1, status]);
  await rq(ev.openLoc.plan_ref, "pending");
  await rq(ev.openNoLoc.plan_ref, "cancelled");
  await rq(ev.closed.plan_ref, "approved");
  await rq(ev.past.plan_ref, "attended", "checked_in_at|now() - interval '3 days'");
  await rq(ev.full.plan_ref, "approved", "paid_amount, paid_at|9900, now()");             // 2 seats taken of 2 = full
  await rq(ev.other.plan_ref, "pending");                                                  // belongs to ANOTHER host

  const seeded = (await q("select (select count(*) from public.custom_plans where title like 'QA\\_%')::int e, (select count(*) from public.plan_requests where user_id = $1)::int r", [ids.user]))[0];
  log(`seed: 4 accounts, 2 host profiles, ${seeded.e} events, ${seeded.r} requests. Logins saved to .secrets/test-accounts.env`);
  await db.end();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("seed failed:", e.message); process.exit(1); });

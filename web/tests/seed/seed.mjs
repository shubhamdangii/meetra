// Seed / reset QA data on the LIVE Supabase project (the only project there is).
//
//   node tests/seed/seed.mjs                 reset QA data, then re-create it
//   node tests/seed/seed.mjs --reset-only    just remove QA data
//   node tests/seed/seed.mjs --dry-run       print what would be deleted and created, write NOTHING
//
// Everything this script creates or deletes is QA data: events and host profiles named QA_..., and accounts with
// the emails qa-<name>@example.invalid. It refuses to run against any URL other than the project in src/lib/config.ts.
// The only secret used is the database password in .secrets/supabase.env (raw password, or SUPABASE_DB_PASSWORD=...);
// it is never printed. QA logins are written to .secrets/test-accounts.env (git-ignored), also never printed.
// No service-role key is needed: QA accounts are created directly in the auth tables.
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "../../..");
const require = createRequire(path.join(root, "web", "package.json"));

export const readEnv = (file) => Object.fromEntries(
  fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

/** The live project's public URL and anon key, read from web/src/lib/config.ts (both are public by design). */
export function liveConfig() {
  const src = fs.readFileSync(path.join(root, "web/src/lib/config.ts"), "utf8");
  const get = (k) => src.match(new RegExp(k + `:\\s*(?:process\\.env\\.\\w+\\s*\\|\\|\\s*)?"([^"]+)"`))?.[1];
  return { url: get("supabaseUrl"), anonKey: get("supabaseAnonKey") };
}

/** Refuses (exit 2) unless the target is exactly the live URL from config.ts. Runs BEFORE any connection. */
export function guard(targetUrl) {
  const norm = (u) => String(u || "").trim().replace(/\/+$/, "").toLowerCase();
  const { url: liveUrl } = liveConfig();
  const fail = (msg) => { console.error("REFUSED: " + msg); process.exit(2); };
  if (!liveUrl) fail("could not read the project URL from web/src/lib/config.ts.");
  if (norm(targetUrl) !== norm(liveUrl)) fail("the target URL is not the Meetra project in web/src/lib/config.ts. This script only works on that one project.");
  const ref = new URL(liveUrl).host.split(".")[0];
  const poolerFile = path.join(root, "supabase/.temp/pooler-url");
  if (!fs.existsSync(poolerFile)) fail("supabase/.temp/pooler-url is missing, so I cannot prove which database I would connect to.");
  const u = new URL(fs.readFileSync(poolerFile, "utf8").trim());
  if (!decodeURIComponent(u.username).endsWith("." + ref)) fail("the database in supabase/.temp/pooler-url is not the project in config.ts.");
  return ref;
}

export async function connectDb() {
  const { Client } = require("pg");
  const raw = fs.readFileSync(path.join(root, ".secrets/supabase.env"), "utf8").trim();
  const password = raw.replace(/^SUPABASE_DB_PASSWORD=/, "");
  const u = new URL(fs.readFileSync(path.join(root, "supabase/.temp/pooler-url"), "utf8").trim());
  const c = new Client({ host: u.hostname, port: +u.port, user: decodeURIComponent(u.username), password, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await c.connect();
  return c;
}

export const EMAIL_RE = /^qa-[a-z0-9]+@example\.invalid$/;
export const ACCOUNTS = [
  { key: "admin1", name: "QA_admin1", email: "qa-admin1@example.invalid" },
  { key: "admin2", name: "QA_admin2", email: "qa-admin2@example.invalid" },
  { key: "subadmin", name: "QA_subadmin", email: "qa-subadmin@example.invalid" },
  { key: "host", name: "QA_host", email: "qa-host@example.invalid" },
  { key: "user", name: "QA_user", email: "qa-user@example.invalid" },
];
const ADMIN_EMAILS = ["qa-admin1@example.invalid", "qa-admin2@example.invalid"];

/** Remove QA data only. With dryRun nothing is written: it counts what the same deletes would remove. */
export async function resetQa(db, { dryRun = false, log = console.log } = {}) {
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const qaAuth = (await q("select id, email from auth.users where email like 'qa-%@example.invalid'")).filter((u) => EMAIL_RE.test(u.email));
  const qaAuthIds = qaAuth.map((u) => u.id);
  const qaUserIds = qaAuthIds.length ? (await q("select id from public.users where auth_id = any($1)", [qaAuthIds])).map((r) => r.id) : [];
  const plans = await q("select id, plan_ref, title from public.custom_plans where title like 'QA\\_%'");
  if (plans.some((p) => !p.title.startsWith("QA_"))) throw new Error("safety: non-QA plan matched");
  if (plans.length > 80) throw new Error("safety: too many plans match QA_ (" + plans.length + "); refusing to delete");
  if (qaAuth.length > 10) throw new Error("safety: too many QA accounts match (" + qaAuth.length + "); refusing to delete");
  const refs = plans.map((p) => p.plan_ref), planIds = plans.map((p) => p.id);
  const hostRows = await q("select id, name from public.host_profiles where name like 'QA\\_%' or user_id = any($1)", [qaUserIds]);
  if (hostRows.some((h) => h.id === 23)) throw new Error("safety: host profile 23 matched; refusing to delete");
  const steps = [
    ["requests", "plan_requests", "plan_ref = any($1) or user_id = any($2)", [refs, qaUserIds]],
    ["locations", "event_locations", "plan_id = any($1)", [planIds]],
    ["audit rows", "audit_log", "(entity_id = any($1)) or actor_id = any($2)", [[...planIds.map(String), ...refs], qaUserIds]],
    ["change requests", "admin_requests", "maker_id = any($1) or checker_id = any($1)", [qaUserIds]],
    ["admin notifications", "admin_notifications", "user_id = any($1)", [qaUserIds]],
    ["events", "custom_plans", "id = any($1)", [planIds]],
    ["host profiles", "host_profiles", "(name like 'QA\\_%' or user_id = any($1)) and id <> 23", [qaUserIds]],
    ["team rows", "city_admins", "user_id = any($1)", [qaUserIds]],
    ["admin emails", "main_admin_emails", "email = any($1)", [ADMIN_EMAILS]],
  ];
  const cnt = {};
  if (dryRun) {
    for (const [label, table, where, p] of steps) cnt[label] = Number((await q(`select count(*) n from public.${table} where ${where}`, p))[0].n);
    cnt.accounts = qaAuthIds.length;
    log("WOULD delete:", Object.entries(cnt).map(([k, v]) => `${v} ${k}`).join(", "));
    if (plans.length) log("  events:", plans.map((p) => p.title).join(", "));
    return cnt;
  }
  await db.query("begin");
  try {
    for (const [label, table, where, p] of steps) cnt[label] = (await db.query(`delete from public.${table} where ${where}`, p)).rowCount;
    cnt.accounts = (await db.query("delete from auth.users where id = any($1) and email like 'qa-%@example.invalid'", [qaAuthIds])).rowCount;
    await db.query("commit");
  } catch (e) { await db.query("rollback"); throw e; }
  log("reset: removed", Object.entries(cnt).map(([k, v]) => `${v} ${k}`).join(", "));
  return cnt;
}

/** Create a confirmed email + password account directly in the auth tables (the sign-up trigger makes the public.users row). */
async function createAccount(db, a, password) {
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated', 'authenticated', $2, extensions.crypt($3, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', $4::jsonb, now(), now(), '', '', '', '')`, [id, a.email, password, JSON.stringify({ full_name: a.name })]);
  await db.query(`insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), $1::uuid, $2::jsonb, 'email', $3::text, now(), now(), now())`, [id, JSON.stringify({ sub: id, email: a.email, email_verified: true }), id]);
  return id;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const resetOnly = process.argv.includes("--reset-only");
  const argUrl = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
  guard(argUrl ?? process.env.SEED_URL ?? liveConfig().url);
  const db = await connectDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const log = (...a) => console.log(...a);
  try {
    await resetQa(db, { dryRun, log });
    if (dryRun) {
      log("WOULD create: accounts", ACCOUNTS.map((a) => a.name + " <" + a.email + ">").join(", "));
      log("WOULD create: 2 host profiles (QA_host, QA_Other Host), about 30 QA_ events, 6 QA seat requests from QA_user, admin emails for qa-admin1/qa-admin2 in main_admin_emails.");
      log("WOULD write: .secrets/test-accounts.env (random passwords, never printed). Nothing was written.");
      return;
    }
    if (resetOnly) return;

    // ---------------- SEED ----------------
    const creds = {}, ids = {};
    for (const e of ADMIN_EMAILS) await q("insert into public.main_admin_emails (email) values ($1) on conflict do nothing", [e]);   // the app decides main admins from this list, not users.role
    for (const a of ACCOUNTS) {
      const password = crypto.randomBytes(18).toString("base64url") + "9aZ";
      const authId = await createAccount(db, a, password);
      creds[a.key] = { email: a.email, password };
      ids[a.key] = (await q("select id from public.users where auth_id = $1", [authId]))[0].id;
    }
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
    await q("update public.users set role = 'admin' where id = any($1)", [[ids.admin1, ids.admin2]]);
    await q("insert into public.city_admins (user_id, city_slug) values ($1, 'ahmedabad')", [ids.subadmin]);
    const host = (await q(`insert into public.host_profiles (name, city_slug, bio, user_id, status) values ('QA_host', 'ahmedabad', 'QA test host', $1, 'active') returning id`, [ids.host]))[0].id;
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
    ev.jaipur    = await mk("QA_Jaipur event", 9, { city: "jaipur" });   // outside the sub-admin's city
    // one private set per test device, so phone and desktop runs never fight over the same event
    const devs = ["iphone-13", "pixel-7", "desktop-chrome"];
    for (const [i, d] of devs.entries()) {
      await mk(`QA_Free open ${d}`, 10 + i, { free: true });       // user lifecycle: request, approve, cancel
      await mk(`QA_Toggle ${d}`, 40 + i);                         // admin lifecycle: inactive/active, assign-host option
      await mk(`QA_Again ${d}`, 70 + i, { free: true });          // point 24: cancel, then ask again
      await mk(`QA_Notify ${d}`, 60 + i, { free: true });         // point 24: in-app notifications for QA_user
      await mk(`QA_Host pick ${d}`, 50 + i, { free: true });      // point 29: free, no host; a booking makes the assign-host option appear
    }
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
    await rq(ev.full.plan_ref, "approved", "paid_amount, paid_at|9900, now()");             // 2 seats taken of 2 = full. NEVER cancel this one: a paid cancel would call the refund function.
    await rq(ev.other.plan_ref, "pending");                                                  // belongs to ANOTHER host

    const seeded = (await q("select (select count(*) from public.custom_plans where title like 'QA\\_%')::int e, (select count(*) from public.plan_requests where user_id = $1)::int r", [ids.user]))[0];
    log(`seed: ${ACCOUNTS.length} accounts, 2 host profiles, ${seeded.e} events, ${seeded.r} requests. Logins saved to .secrets/test-accounts.env`);
  } finally { await db.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("seed failed:", e.message); process.exit(1); });

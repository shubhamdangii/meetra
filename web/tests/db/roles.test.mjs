// Role & rule tests that run against the real database inside ONE transaction that is always ROLLED BACK.
// Needs: ../.secrets/supabase.env (SUPABASE_DB_PASSWORD) and ../supabase/.temp/pooler-url (both git-ignored).
// Run: npm run test:db
import fs from "node:fs"; import path from "node:path"; import pg from "pg";

const root = path.resolve(import.meta.dirname, "../../..");
const pw = fs.readFileSync(`${root}/.secrets/supabase.env`, "utf8").trim().replace(/^SUPABASE_DB_PASSWORD=/, "");
const u = new URL(fs.readFileSync(`${root}/supabase/.temp/pooler-url`, "utf8").trim());
const c = new pg.Client({ host: u.hostname, port: +u.port, user: decodeURIComponent(u.username), password: pw, database: "postgres", ssl: { rejectUnauthorized: false } });

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; fails.push(name); console.log("  ✗", name, extra); } };
const q1 = async (sql, p) => (await c.query(sql, p)).rows[0];
/** Run sql as a role (auth id) or 'anon'; returns {ok,row,err}. Each call is isolated by a savepoint. */
async function as(who, sql, p = []) {
  await c.query("savepoint s");
  try {
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(who === "anon" ? { role: "anon" } : { sub: who, role: "authenticated" })]);
    await c.query(`set local role ${who === "anon" ? "anon" : "authenticated"}`);
    const r = await c.query(sql, p);
    await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '', true)"); await c.query("release savepoint s");
    return { ok: true, rows: r.rows, row: r.rows[0] };
  } catch (e) { await c.query("rollback to savepoint s"); await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '', true)"); return { ok: false, err: e.message }; }
}
const istDate = (d) => new Date(d.getTime() + 5.5 * 36e5).toISOString().slice(0, 10).replace(/-/g, "");
const iso = (h) => new Date(Date.now() + h * 36e5).toISOString();

await c.connect();
await c.query("begin");
try {
  const id = async (email) => q1("select au.id auth, u.id uid from auth.users au join public.users u on u.auth_id = au.id where lower(au.email) = $1", [email]);
  const A = await id("shujain19@gmail.com"), B = await id("akash.apply4@gmail.com");      // main admins
  const SUB = await id("aks100206@gmail.com");                                              // Ahmedabad sub-admin, also host #6
  const H = await id("shubhamdangii19@gmail.com");                                          // host #23
  const M = await id("shubham19dangi@gmail.com");                                           // member
  const hostId = async (uid) => (await q1("select id from public.host_profiles where user_id = $1 and deleted_at is null", [uid]))?.id;
  const H_ID = await hostId(H.uid), SUB_HOST = await hostId(SUB.uid);

  // QA events: one open, one closed (deadline passed, not started), one already started
  const mk = async (title, startH, closesH, host = null) => {
    const r = await q1(`insert into public.custom_plans (city_slug, title, category, starts_at, ends_at, booking_closes_at, area, price, price_type, seats, status, host_id, starts_on, time_label)
      values ('ahmedabad', $1, 'games', now() + make_interval(hours => $2), now() + make_interval(hours => $2 + 2), now() + make_interval(hours => $3), 'QA area', 0, 'free', 4, 'approved', $4, current_date, 'tbd') returning id, plan_ref`, [title, startH, closesH, host]);
    return r;
  };
  await c.query("set local session_replication_role = replica");   // insert past/closed rows directly (rules would refuse)
  const OPEN = await mk("QA_open", 48, 40, H_ID), CLOSED = await mk("QA_closed", 3, -1, H_ID), STARTED = await mk("QA_started", -2, -6, SUB_HOST);
  await c.query("update public.custom_plans set plan_ref = 'x' || id || '-ahmedabad-' || to_char((starts_at at time zone 'Asia/Kolkata')::date, 'YYYYMMDD') where title like 'QA\\_%'");
  const ref = async (r) => (await q1("select plan_ref from public.custom_plans where id = $1", [r.id])).plan_ref;
  OPEN.plan_ref = await ref(OPEN); CLOSED.plan_ref = await ref(CLOSED); STARTED.plan_ref = await ref(STARTED);
  await c.query("insert into public.plan_requests (plan_ref, user_id, status, party_size, icebreaker) values ($1, $2, 'pending', 1, 'QA_pending_started')", [STARTED.plan_ref, M.uid]);
  await c.query("set local session_replication_role = origin");

  console.log("\nPoint 3 · requests stop at the booking cutoff (server-side)");
  ok("member can request an open event", (await as(M.auth, "insert into public.plan_requests (plan_ref, status, party_size) select $1, 'pending', 1 where $2::uuid is not null returning id", [OPEN.plan_ref, M.uid])).ok);
  let r = await as(M.auth, "insert into public.plan_requests (plan_ref, status, party_size) select $1, 'pending', 1 where $2::uuid is not null", [CLOSED.plan_ref, M.uid]);
  ok("member blocked after the booking deadline", !r.ok && /no longer accepting|closed at|already happened/.test(r.err), r.err);
  r = await as(M.auth, "insert into public.plan_requests (plan_ref, status, party_size) select $1, 'pending', 1 where $2::uuid is not null", [`salsa-ahmedabad-${istDate(new Date(Date.now() - 2 * 864e5))}`, M.uid]);
  ok("member blocked on a past example plan", !r.ok && /no longer accepting|closed at|already happened/.test(r.err), r.err);
  r = await as(M.auth, "insert into public.plan_requests (plan_ref, status, party_size) select $1, 'pending', 1 where $2::uuid is not null returning id", [`salsa-ahmedabad-${istDate(new Date(Date.now() + 7 * 864e5))}`, M.uid]);
  ok("member can request a future example plan", r.ok, r.err);
  const pp = await q1("select open_ok from private.plan_price($1)", [CLOSED.plan_ref]);
  ok("payments refuse an order for a closed plan (open_ok=false)", pp.open_ok === false);

  console.log("\nPoint 1 · undecided requests close when the plan starts");
  const n = (await q1("select private.expire_requests() n")).n;
  const lapsed = await q1("select status, auto_closed_at from public.plan_requests where plan_ref = $1 and user_id = $2", [STARTED.plan_ref, M.uid]);
  ok("expire job closed the pending request on a started plan", n >= 1 && lapsed.status === "declined" && !!lapsed.auto_closed_at, JSON.stringify(lapsed));
  const stillOpen = await q1("select status from public.plan_requests where plan_ref = $1 and user_id = $2", [OPEN.plan_ref, M.uid]);
  ok("…but left the open plan's request pending", stillOpen.status === "pending");
  ok("expire job is scheduled every 15 minutes", !!(await q1("select 1 x from cron.job where jobname = 'meetra-expire-requests' and schedule = '*/15 * * * *'")));

  console.log("\nPoint 13 · each date is its own event");
  const d1 = `salsa-ahmedabad-${istDate(new Date(Date.now() + 7 * 864e5))}`, d2 = `salsa-ahmedabad-${istDate(new Date(Date.now() + 14 * 864e5))}`;
  await c.query("update public.plan_requests set status = 'declined' where plan_ref = $1 and user_id = $2", [d1, M.uid]);
  r = await as(M.auth, "insert into public.plan_requests (plan_ref, status, party_size) select $1, 'pending', 1 where $2::uuid is not null returning id", [d2, M.uid]);
  ok("a decline on one date doesn't block the next date", r.ok, r.err);

  console.log("\nPermissions · members");
  r = await as(M.auth, "update public.plan_requests set status = 'approved' where plan_ref = $1 and user_id = $2", [OPEN.plan_ref, M.uid]);
  ok("member can't approve their own request", !r.ok && /Only the meetra team/.test(r.err), r.err);
  r = await as(M.auth, "select count(*)::int n from public.plan_requests where user_id <> $1", [M.uid]);
  ok("member sees no one else's requests", r.ok && r.row.n === 0);
  r = await as(M.auth, "select * from public.event_locations"); ok("member can't read exact locations", !r.ok);
  r = await as(M.auth, "select public.admin_all_requests(null, null)"); ok("member can't open admin seat list", !r.ok);
  r = await as(M.auth, "select public.admin_events()"); ok("member can't open admin events", !r.ok);
  r = await as(M.auth, "select public.host_guest_list($1)", [OPEN.plan_ref]); ok("member can't open a host's guest list", !r.ok);
  r = await as(M.auth, "select public.add_event_image('Boards & Chai', 'https://x.supabase.co/storage/v1/object/public/event-media/a.jpg')"); ok("member can't add event photos", !r.ok);

  console.log("\nPermissions · logged-out visitors");
  r = await as("anon", "select count(*)::int n from public.plan_requests"); ok("visitor can't read seat requests", !r.ok || r.row.n === 0);
  r = await as("anon", "select public.admin_partner_leads()"); ok("visitor can't read brand/venue leads", !r.ok);
  r = await as("anon", "select public.plan_attendees($1) a", [OPEN.plan_ref]);
  ok("visitor sees who's coming as count + photos only", r.ok && Object.keys(r.row.a).every((k) => ["count", "people", "solo", "first_timers", "returning", "verified", "photos"].includes(k)));
  r = await as("anon", "select public.my_event_location($1)", [OPEN.plan_ref]); ok("visitor can't get an exact location", !r.ok);

  console.log("\nPermissions · hosts");
  r = await as(H.auth, "select count(*)::int n from public.host_guest_list($1)", [OPEN.plan_ref]); ok("host opens their own guest list", r.ok, r.err);
  r = await as(H.auth, "select public.host_guest_list($1)", [STARTED.plan_ref]); ok("host can't open another host's guest list", !r.ok);
  r = await as(H.auth, "update public.plan_requests set status = 'approved' where plan_ref = $1", [OPEN.plan_ref]);
  ok("host can't approve seats (team only)", !r.ok || (await q1("select status from public.plan_requests where plan_ref = $1 and user_id = $2", [OPEN.plan_ref, M.uid])).status === "pending");
  r = await as(H.auth, "select count(*)::int n from public.event_extras(null) where id = $1", [STARTED.id]); ok("host doesn't see another host's event details", r.ok && r.row.n === 0);
  r = await as(H.auth, "select public.admin_events()"); ok("host can't open admin events", !r.ok);
  r = await as(H.auth, "insert into public.host_applications (city_slug, plan_title, category, plan_id) select 'ahmedabad', 'QA_x', 'games', $1::bigint", [OPEN.id]);
  ok("existing host can't apply to be a host again", !r.ok && /already a meetra host/.test(r.err), r.err);

  console.log("\nPermissions · sub-admin (city team)");
  r = await as(SUB.auth, "select count(*)::int n from public.admin_all_requests(null, null) where city_slug <> 'ahmedabad'"); ok("sub-admin sees only their city's seat requests", r.ok && r.row.n === 0, r.err);
  r = await as(SUB.auth, "select public.admin_save_event_draft(null, '{}'::jsonb)"); ok("sub-admin can't create events (main admins only)", !r.ok && /Main admins only/.test(r.err), r.err);
  r = await as(SUB.auth, "select public.admin_partner_leads()"); ok("sub-admin can't read brand/venue leads", !r.ok);

  console.log("\nMaker-checker · admins");
  const draft = await as(A.auth, "select public.admin_save_event_draft(null, $1::jsonb) v", [JSON.stringify({ title: "QA_draft", city_slug: "ahmedabad", category: "games", starts_at: iso(72), ends_at: iso(74), area: "QA", price: 0, price_type: "free", seats: 6 })]);
  ok("admin saves an event draft", draft.ok, draft.err);
  const req = await as(A.auth, "select public.admin_submit_request('event','create',$1,null,'QA') v", [draft.row?.v]);
  const rid = (await q1("select id from public.admin_requests where req_no = $1", [req.row?.v]))?.id;
  r = await as(A.auth, "select public.admin_decide_request($1, true, 'self')", [rid]); ok("admin can't approve their own request", !r.ok, r.err);
  r = await as(B.auth, "select public.admin_decide_request($1, true, 'ok')", [rid]); ok("the other admin approves it", r.ok, r.err);
  ok("approved event is live", (await q1("select status from public.custom_plans where id = $1", [draft.row?.v])).status === "approved");

  console.log("\nEvents · Active / Inactive switch (no delete)");
  const LIVE = draft.row?.v; const liveRef = (await q1("select plan_ref from public.custom_plans where id = $1", [LIVE])).plan_ref;
  r = await as(H.auth, "select public.admin_set_event_active($1, false, 'QA')", [LIVE]); ok("host can't switch an event off", !r.ok && /Main admins only/.test(r.err), r.err);
  r = await as(SUB.auth, "select public.admin_set_event_active($1, false, 'QA')", [LIVE]); ok("sub-admin can't switch an event off", !r.ok, r.err);
  r = await as(M.auth, "select public.admin_set_event_active($1, false, 'QA')", [LIVE]); ok("member can't switch an event off", !r.ok, r.err);
  r = await as(M.auth, "update public.custom_plans set is_active = false where id = $1 returning id", [LIVE]); ok("member can't flip the column directly", !r.ok || !r.rows.length);
  r = await as(A.auth, "select public.admin_set_event_active($1, false, 'QA_reason')", [LIVE]); ok("main admin sets it inactive", r.ok, r.err);
  ok("…the row stays (nothing deleted) and is inactive", (await q1("select is_active, deleted_at from public.custom_plans where id = $1", [LIVE]))?.is_active === false);
  ok("…and it's in the activity log with the reason", (await q1("select details->>'reason' r from public.audit_log where entity = 'event' and entity_id = $1 and action = 'deactivated' order by id desc limit 1", [String(LIVE)]))?.r === "QA_reason");
  r = await as(M.auth, "insert into public.plan_requests (plan_ref, status, party_size) select $1, 'pending', 1 where $2::uuid is not null", [liveRef, M.uid]);
  ok("member can't request an inactive event", !r.ok && /isn't open/.test(r.err), r.err);
  r = await as(A.auth, "select public.admin_set_event_active($1, true, null)", [LIVE]); ok("main admin sets it active again", r.ok, r.err);
  r = await as(M.auth, "insert into public.plan_requests (plan_ref, status, party_size) select $1, 'pending', 1 where $2::uuid is not null", [liveRef, M.uid]);
  ok("…and members can request it again", r.ok, r.err);
  await c.query("update public.plan_requests set status = 'approved' where plan_ref = $1 and user_id = $2", [liveRef, M.uid]);
  r = await as(A.auth, "select public.admin_set_event_active($1, false, 'QA')", [LIVE]);
  ok("can't switch off an event with confirmed guests (cancel it instead)", !r.ok && /confirmed seat/.test(r.err), r.err);
  r = await as(A.auth, "select public.admin_set_event_active($1, false, 'QA')", [-1]); ok("unknown event is refused", !r.ok);

  console.log("\nEvents · girls only / boys only");
  await c.query("update public.custom_plans set audience = 'women' where id = $1", [LIVE]);
  const askSeat = (who) => as(who.auth, "insert into public.plan_requests (plan_ref, status, party_size) select $1, 'pending', 1 where $2::uuid is not null", [liveRef, who.uid]);
  await c.query("update public.user_private set gender = null where user_id = $1", [H.uid]);
  r = await askSeat(H); ok("girls-only plan asks members without a gender to add it", !r.ok && /Add your gender/.test(r.err), r.err);
  await c.query("update public.user_private set gender = 'man' where user_id = $1", [H.uid]);
  r = await askSeat(H); ok("girls-only plan refuses a man", !r.ok && /for girls only/.test(r.err), r.err);
  await c.query("update public.user_private set gender = 'woman' where user_id = $1", [H.uid]);
  r = await askSeat(H); ok("girls-only plan accepts a woman", r.ok, r.err);
  r = await as(A.auth, "select public.admin_save_event_draft($1, $2::jsonb) v", [LIVE, JSON.stringify({ audience: "everyone" })]);
  ok("an unknown audience value is refused", !r.ok, r.err);
  r = await as(A.auth, "update public.custom_plans set category = 'bhakti' where id = $1 returning id", [LIVE]);
  ok("new types (bhajan & bhakti) are allowed", r.ok || /permission|policy/.test(r.err ?? ""), r.err);

  console.log("\nEvent library · who can hide example plans");
  r = await as(A.auth, "select public.admin_hide_template('quiz-night', true)"); ok("main admin sets an example plan inactive", r.ok, r.err);
  ok("…and it's in the hidden list everyone reads", (await as("anon", "select count(*)::int n from public.hidden_templates where key = 'quiz-night'")).row?.n === 1);
  r = await as(A.auth, "select public.admin_hide_template('quiz-night', false)");
  ok("main admin sets it active again", r.ok && (await q1("select count(*)::int n from public.hidden_templates where key = 'quiz-night'")).n === 0, r.err);
  r = await as(H.auth, "select public.admin_hide_template('quiz-night', true)"); ok("host can't switch example plans off", !r.ok && /Main admins only/.test(r.err), r.err);
  r = await as(SUB.auth, "select public.admin_hide_template('quiz-night', true)"); ok("sub-admin can't switch example plans off", !r.ok, r.err);
  r = await as(M.auth, "insert into public.hidden_templates (key) values ('x')"); ok("member can't write the hidden list directly", !r.ok);
  r = await as(H.auth, "select public.host_save_event_draft(null, $1::jsonb) v", [JSON.stringify({ title: "QA_lib", category: "games", starts_at: iso(80), ends_at: iso(82), area: "QA", price: 99, price_type: "reservation", seats: 8, event_type: "Boards & Chai" })]);
  ok("host adds an event from a card (draft, their own event)", r.ok && (await q1("select host_id from public.custom_plans where id = $1", [r.row?.v]))?.host_id === H_ID, r.err);

  console.log("\nPoint 9 · brand & venue enquiries are trackable");
  r = await as("anon", "select public.submit_partner_enquiry('QA_name','QA_company','venue','ahmedabad','9876543210',null,null,'QA') v");
  ok("visitor sends an enquiry and gets a tracking code", r.ok && !!r.row.v.code, r.err);
  const code = r.row?.v.code;
  r = await as("anon", "select * from public.my_partner_enquiries($1::uuid[])", [[code]]);
  ok("…and can see its status with the code", r.ok && r.rows.length === 1 && r.rows[0].status === "new" && !("phone" in r.rows[0]));
  r = await as("anon", "select * from public.my_partner_enquiries($1::uuid[])", [["00000000-0000-0000-0000-000000000000"]]);
  ok("a wrong code shows nothing", r.ok && r.rows.length === 0);
  r = await as("anon", "select public.submit_partner_enquiry('Q','QA_company','venue','ahmedabad','9876543210',null,null,'')");
  ok("validation: too-short name refused", !r.ok, r.err);
  r = await as("anon", "select public.submit_partner_enquiry('QA_name','QA_company','venue','ahmedabad',null,null,null,'')");
  ok("validation: no phone and no email refused", !r.ok, r.err);
  r = await as("anon", "select public.submit_partner_enquiry($1,'QA_company','venue','ahmedabad','9876543210',null,null,$2) v", ["QA_<script>alert(1)</script>", "'; drop table users; --"]);
  ok("script/SQL text stored as plain text, not executed", r.ok && !!(await q1("select 1 x from public.users limit 1")));
} catch (e) { fail++; fails.push("CRASH " + e.message); console.log("  ✗ CRASH", e.message); }
await c.query("rollback");
await c.end();
console.log(`\nDB suite: ${pass} passed, ${fail} failed (everything rolled back)`);
if (fail) { console.log("Failed:", fails.join(" | ")); process.exit(1); }

// Removes everything that exists only for testing, before launch:
//   - all QA_ events, host profiles, seat requests, change requests and audit rows,
//   - the QA accounts (qa-*@example.invalid) and their admin-email rows,
//   - the TEMPORARY test admin, if you pass its email (it is not stored in this public repo).
//
//   npm run clean-for-launch                                  dry run: shows what would be removed, writes nothing
//   npm run clean-for-launch -- --temp-admin-email=<email>    dry run including the temporary admin
//   npm run clean-for-launch -- --yes [--temp-admin-email=<email>]   really removes it
//
// Real users, real events, host profile 23 and the owner admin accounts are never touched.
import { guard, liveConfig, connectDb, resetQa } from "./seed.mjs";

const yes = process.argv.includes("--yes");
const tempEmail = process.argv.find((a) => a.startsWith("--temp-admin-email="))?.slice(19).trim().toLowerCase();
guard(liveConfig().url);
const db = await connectDb();
try {
  console.log(yes ? "CLEAN FOR LAUNCH (writing)" : "CLEAN FOR LAUNCH (dry run, nothing is written; add --yes to remove)");
  await resetQa(db, { dryRun: !yes });
  if (tempEmail) {
    if (!/^[^@\s]+@[^@\s]+$/.test(tempEmail) || /^qa-[a-z0-9]+@example\.invalid$/.test(tempEmail)) throw new Error("not a usable temporary admin email");
    const rows = (await db.query("select email from public.main_admin_emails where lower(email) = $1", [tempEmail])).rows;
    console.log(`${yes ? "removing" : "WOULD remove"} the temporary admin from main_admin_emails (${rows.length} row) and set that account back to role member`);
    if (yes && rows.length) {
      await db.query("begin");
      await db.query("delete from public.main_admin_emails where lower(email) = $1", [tempEmail]);
      await db.query("update public.users set role = 'member' where auth_id = (select id from auth.users where lower(email) = $1)", [tempEmail]);
      await db.query("commit");
    }
  } else {
    console.log("temporary admin: not removed (pass --temp-admin-email=<email>; see CLAUDE.md for the undo SQL)");
  }
  const left = (await db.query("select count(*)::int n from public.custom_plans where title like 'QA\\_%'")).rows[0].n;
  console.log(`QA events left: ${left}${yes && left ? "  <- unexpected, investigate" : ""}`);
} catch (e) { try { await db.query("rollback"); } catch { /* none open */ } console.error("clean-for-launch failed:", e.message); process.exitCode = 1; }
finally { await db.end(); }

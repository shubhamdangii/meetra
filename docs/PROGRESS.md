# Progress (autonomous mode)

Done
- Batch 1 (28, 26, 27, 29, 24) and batch 2 (30, admin review shows location, no "log in" advice) are live.
- Human audit of the live site: docs/AUDIT.md.
- 2026-11-29 live cleanup (approved): admins now only shujain19 + akash; shubham19dangi is a member; city_admins empty;
  all events, requests, payments, reviews, admin requests, notifications, plan interest, WhatsApp login attempts deleted.
  Backup in .backups/2026-11-29-cleanup/ (git-ignored), rollback notes in docs/ROLLBACK-2026-11-29-cleanup.md.
  WARNING: 8 "Rooftop Open Mic" drafts (REQ-1091..1098) that the owner created AFTER the backup were also deleted;
  their data is in public.audit_log (entity event, "Draft created: Rooftop Open Mic") if they must be re-created.

Next (in order)
1. Step 3: npm script `seed:week` (web/tests/seed or web/scripts): 7 events, one per day from tomorrow (IST), built from the
   hidden templates in web/src/lib/data.ts (TEMPLATES, Ahmedabad/Jaipur variants), host_profiles #23, approved + is_active,
   house rules and Maps link filled, booking open until start; re-runnable, only touches events it created (mark them, e.g. a
   fixed blurb marker or created_by). No QA_ or "test" words. Report: two-person approval bypassed for this setup.
2. Step 4: verify in the browser pane with Google login (owner clicks Google himself if asked): admin shujain19 (dashboard,
   Events dates), host shubhamdangii19 (host desk 7 events), user shubham19dangi (Explore, request a seat, host/admin see it,
   notifications, cancel and remove the request, logout/login bottom bar). Phone + desktop sizes.
3. Step 5: CLAUDE.md + docs/PRE-LAUNCH.md: QA accounts gone, tests use the 3 real accounts with Google login, no QA_/test data,
   remove anything a test creates. Commit, push, wait for deploy.
4. Profile for every role (owner request): make it short and simple, and add an optional phone number field (no verification).
   Keep CONFIG.mobileVerification for verification only; the plain number field must show even when it is false.
5. House rules (owner decision): house rules apply to everyone; show/accept them for every event (host event form + event page).
6. Then points 31, 32, 33, audit #4 #6 #7 #9, and older points 1, 2, 4, 6, 22, 23, 25, 11, 12, 13-21, 3, 7-10.

Needs your decision
- Re-create the 8 "Rooftop Open Mic" drafts from the audit log? (deleted by mistake, see above)

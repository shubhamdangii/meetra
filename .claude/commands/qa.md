---
description: Run the full QA suite on the live project with QA_ data only (reset QA data, build, role and lifecycle tests) and report
---

Run the Meetra QA suite and report. Follow CLAUDE.md (TESTING PROTOCOL, DATA RULES). Do not fix website bugs and do not commit anything unless I ask.

1. Run `npm --prefix web run qa` (add `-- --no-deployed` to skip the deployed-site smoke test). It does, in order:
   - checks the Supabase env-var default still points at the original project,
   - RESETS QA data (deletes only `QA_` rows and the `qa-*@example.invalid` accounts, then re-creates them; refuses any URL but the project in config.ts),
   - checks permissions per role through the API,
   - builds a local copy of the site that talks to the live project,
   - runs the role and lifecycle tests on iPhone 13 (WebKit), Pixel 7 (Chromium) and Desktop Chrome,
   - runs the old public tests on the QA site, and the deployed-site smoke test,
   - writes `TESTING.md` (ticks only with evidence) and `web/test-results/qa/baseline.md`.
2. Never print or open anything in `/.secrets`. Never act as or approve through any real admin. If a step says REFUSED, stop and tell me.
3. Read `web/test-results/qa/baseline.md`, look at the failure screenshots, and give me a short report:
   - Feature | Role | Pass/Fail | Evidence (table),
   - failures grouped as REAL BUG, TEST PROBLEM or DATA PROBLEM (say why, from what you saw),
   - what was NOT tested, and what cannot be tested (payments, refunds, WhatsApp login, push, and every flow that would notify a real admin),
   - pass/fail counts per suite.
4. Never say "all working". List every unticked item in TESTING.md.
5. Afterwards the QA data is left in place for inspection. Remove it with `npm --prefix web run qa:reset`, and ALWAYS clean up after a run.

## Human-like end-to-end chains (CLAUDE.md, "HUMAN-LIKE END-TO-END TESTING")
Also run, by really performing every step in the browser with a screenshot or database proof per step (QA_ titles only, clean up after):
1. Host proposes an event, all fields filled, and again with optional fields empty (no Maps link).
2. Admin desk shows the request with all the data; the Maps link opens.
3. Second admin approval (QA_admin2); the event is live on Explore, event page, host desk, dashboard counts and Events library with the same details.
4. Assign a host; host desk, event page and dashboard counts agree.
5. QA_user requests a seat; host and admin see it; approve; user notification and seat counts agree everywhere.
6. Add a date, edit a date, change the schedule, cancel, delete, set inactive; every screen updates.
7. After every step check the console and that all roles see identical data.
Chains 1 to 4 and 6 notify the other main admins, including a friend's real account. Do NOT run them until the user says "akash is informed"; list them as NOT TESTED in the report. Chain 5 only notifies QA_user and may run.
Report as a table: Chain step | Role | Result | Evidence, plus every step NOT tested and why. Never write "all working" if any step is not tested.

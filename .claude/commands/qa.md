---
description: Run the full QA suite on meetra-test (reset QA data, build, role and lifecycle tests) and report
---

Run the Meetra QA suite and report. Follow CLAUDE.md (TESTING PROTOCOL, DATA RULES). Do not fix website bugs and do not commit anything unless I ask.

1. Run `npm --prefix web run qa` (add `-- --no-deployed` to skip the deployed-site smoke test). It does, in order:
   - checks the Supabase env-var default still points at the original project,
   - RESETS QA data on **meetra-test only** (deletes only `QA_` rows and the `qa-*@meetra-test.invalid` accounts, then re-creates them),
   - checks permissions per role through the API,
   - builds a local copy of the site that talks to meetra-test,
   - runs the role and lifecycle tests on iPhone 13 (WebKit), Pixel 7 (Chromium) and Desktop Chrome,
   - runs the old public tests on the QA site, and the deployed-site smoke test,
   - writes `TESTING.md` (ticks only with evidence) and `web/test-results/qa/baseline.md`.
2. Never print or open anything in `/.secrets`. Never connect to the original project. If a step says REFUSED, stop and tell me.
3. Read `web/test-results/qa/baseline.md`, look at the failure screenshots, and give me a short report:
   - Feature | Role | Pass/Fail | Evidence (table),
   - failures grouped as REAL BUG, TEST PROBLEM or DATA PROBLEM (say why, from what you saw),
   - what was NOT tested, and what cannot be tested on meetra-test (payments, refunds, WhatsApp login, push),
   - pass/fail counts per suite.
4. Never say "all working". List every unticked item in TESTING.md.
5. Afterwards the QA data is left in place for inspection. Remove it with `npm --prefix web run qa:reset`.

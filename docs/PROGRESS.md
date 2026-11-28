# Progress (autonomous mode)

Done
- Batch 1 (28, 26, 27, 29, 24) live; migrations up to 20261128080000.
- Human audit of live site: docs/AUDIT.md.
- Batch 2: point 30 (host told on assign/change/remove, migration 20261129000000, rollback in docs/), audit #2 (admin review shows exact location), audit #3 (no "log in" advice while logged in). Tests: web/tests/qa/13-host-assignment-notify.spec.ts, 14-approval-shows-location.spec.ts.

Next (in order)
1. Point 31: admin event form dates (end after start, closing before start, IST), Reset clears closing time, plain Hinglish errors. Code: web/src/components/admin/Events.tsx (validateEvent, EventForm).
2. Point 32: rate/review an attended event as any role, inline edit, never your own hosted/created event. Code: web/src/components/pages/SavedPage.tsx (rating box), public.submit_review (migration 20261123000000 line ~776).
3. Point 33: admin tabs easy on phone (labels, empty/success/error states, no dead buttons).
4. Audit #4, #6, #7, #9.
5. Older points: 1, 2, 4, 6, 22, 23, 25, 11, 12, 13-21, 3, 7-10.

Needs your decision
- Audit #5: add a "house rules" field to the host's event form? (it does not exist today)

How to test a point: `cd web; node tests/seed/seed.mjs; node tests/qa/build-test-site.mjs; npx playwright test -c playwright.qa.config.ts <spec> --project=setup --project=iphone-13 --project=desktop-chrome`, then `node tests/seed/seed.mjs --reset-only`.

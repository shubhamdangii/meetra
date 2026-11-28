# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview
meetra: hosted meetups for people coming solo. Static Next.js site on GitHub Pages (https://shubhamdangii.github.io/meetra/), Supabase for auth, database and functions.

## Layout
- `web/` - Next.js 16 + React 19 + Framer Motion, exported as static files. Pages in `web/src/app/<page>/page.tsx`, components in `web/src/components/pages/`, config in `web/src/lib/config.ts`, content in `web/src/lib/data.ts`, styles in `web/src/app/globals.css`.
- `supabase/` - migrations and edge functions (WhatsApp login).
- `db/` - readable schema (`schema.sql`) and notes (`README.md`).
- `.github/workflows/deploy.yml` - CI: audit, typecheck, build, deploy to Pages on push to `main`.
- `.secrets/` - git-ignored local secrets.

## Commands (run in `web/`)
- `npm install`
- `npm run dev` - dev server at http://localhost:3000/meetra/
- `npm run build` - static export to `web/out`
- `npm run typecheck`
- `npm run test:db` - database role tests
- `npm run test:e2e` - Playwright tests

## Notes
- Security lives in the database (row level security on every table). The Supabase anon key in `config.ts` is public by design.
- A Content Security Policy is set on every page; no third-party runtime scripts or fonts.
- Dependency versions are pinned; CI fails on high-severity `npm audit` findings.

# PROJECT
Meetra: events platform. Frontend in /web (deployed on GitHub Pages), backend in /supabase and /db. Roles: Admin, Sub-Admin, Host, User.
Test accounts and keys are in /.secrets. Never print, commit or paste them anywhere.

# HOW TO WORK
- Fix the root cause, make minimal changes, do not touch unrelated files.
- Never invent files, tables, columns or APIs. Check they exist first.
- Work on one section at a time. If a task is large, make a plan first and wait for my OK.

# TESTING PROTOCOL (mandatory)
- "Done" means you ran the app in a real browser with Playwright (iPhone WebKit, Pixel Chromium, desktop) and checked screenshots and console output. Reading code is not testing.
- Keep TESTING.md: a checklist of every feature x every role. Tick an item only with evidence (test name or screenshot path). List unticked items in the final report.
- Test full lifecycles: create event -> edit -> activate -> user requests seat -> host assigned -> booking -> cancel -> delete. Then log out, log in as another role, and check navigation, notifications and data.
- Test sad paths too: empty fields, double clicks, refresh mid-flow, back button, expired session.
- Every bug I report: reproduce with a FAILING test first, fix it, then the test must pass and stay in the repo.
- After coding, run a separate reviewer subagent with fresh context to find bugs in your work. Fix what it finds.
- Test on localhost and on the deployed URL.
- Final report: what was tested, what was NOT tested, screenshots, pass/fail counts. Never say "all working".

# UI RULES
- No long dash anywhere. Use "-" or a comma.
- No single word alone on the last line of any text.
- Everything must be responsive and work in iPhone Safari, Android Chrome and desktop.

# DATA RULES
- Prefix all test data with QA_ and clean it up after testing.
- Never delete or change real user data.

# APPROVAL RULE (mandatory)
Before changing any website file, for every point I give you, first reply with:
1. What I understood, in 1 or 2 simple lines.
2. The exact file path(s) you will change and what you will change in each (one line each).
3. Anything that could break or any question you have.
Then STOP and wait. Change files only after I reply "approved" (or "approved except <point>"). Writing and running tests that only reproduce a bug does not need approval. Changing website code or database migrations does. After the change, show a short summary of what was actually changed, file by file.

# SCOPE RULE (mandatory)
- Change ONLY what is in my numbered points list. Never add or change anything else, even if you think it is a bug or an improvement. If you find something extra, tell me in one line and wait. Do not change it.
- Do NOT change the "30+ hosted plans" headline. It is intentional: it shows "30+" until the real count passes 30.
- In every approval request, explain in simple Hinglish: (1) which of MY points this is for (use my point number), (2) what will visibly change on the website, in plain words, (3) the file names. Keep it short. No technical jargon.

# HUMAN-LIKE END-TO-END TESTING (mandatory)
Test every feature the way a real person would use it, as the real chain of roles, not as isolated clicks. "Done" means the whole chain worked in the browser with screenshots.

Chains that must be tested every time they are touched, by actually performing each step:
1. Host proposes an event with every field filled: title, categories, dates and times, scheduling or repeat dates, address, Google Maps link, seats, price, house rules. Also test with the optional fields empty (for example no Maps link).
2. Switch to an admin account and check that the request really ARRIVED in the admin desk with all the data the host entered (dates, Maps link, location, host). Open the Maps link and check it works.
3. Do the second admin approval (QA_admin2) and check that the event goes live on Explore, the event page, the host desk, the dashboard counts and the Events library, all with the same dates and details.
4. Assign a host: open the picker, assign, then check that the host sees the event, the event page shows the host, and the dashboard counts match.
5. As QA_user: request a seat, check the host and admin see the request, approve it, check the user's notification and the seat count everywhere.
6. Add a date, edit a date, change the schedule, cancel, delete and set inactive, and check that every screen updates and nothing is left inconsistent.
7. After every step, check the browser console and that the data is identical on every role's screen.
Each step needs a screenshot or database proof. If any link in the chain fails, report it as a bug, even if a smaller test passes.

NOTIFICATIONS: These chains notify other main admins. akash.apply4@gmail.com is a friend's account. Never act as him. Only run the chains that notify him after I say "akash is informed". Until then, list them as NOT TESTED. Use only QA_ titles, and clean up all QA_ data after each run.

REPORT: At the end of every task give a table: Chain step | Role | Result | Evidence, and list every step that was NOT tested and why. Never write "all working" if any step is not tested.

# ACCOUNTS (no passwords or keys here, ever)
There is ONE Supabase project: live (https://shubhamdangii.github.io/meetra/, project eqzwolwhecotwiphmjrd). The separate meetra-test project was deleted on 2026-11-28. All testing happens on live with fake QA_ data, because there are no real users and no real domain yet. The old rule "never touch the original project" is replaced by: touch QA_ data only.

## QA data and accounts (live)
- QA accounts are created by the seed script (`npm --prefix web run qa:seed`) with email + password: QA_admin1, QA_admin2 (both main admins), QA_subadmin (Ahmedabad), QA_host, QA_user. Emails are `qa-<name>@example.invalid`. Random passwords are written to the git-ignored `.secrets/test-accounts.env` and are never printed.
- The seed and reset (`qa:seed`, `qa:reset`, `qa:dry-run`) refuse any URL except the project in `web/src/lib/config.ts`, and delete only QA_ events, QA_ host profiles and `qa-*@example.invalid` accounts. `npm --prefix web run qa:dry-run` shows what would be created and deleted without writing.
- Playwright runs against a local build pointed at live (`npm --prefix web run qa:build`). The env-variable defaults in config.ts are unchanged.
- Never modify or delete a non-QA row, the owner accounts, "Board Games & Chai" or host profile 23.
- Payments, refunds, WhatsApp, Google login and push are not touched and not tested on live.
- NEVER run a flow that notifies a real person. Any change request (assign host, host adds an event or date, admin edits as a request, host application, partner enquiry) notifies EVERY other main admin, including real ones. Those flows are skipped and listed as NOT TESTED in TESTING.md. Never act as or approve through a friend's admin account.
- Before launch run `npm --prefix web run clean-for-launch` (dry run first) and follow `docs/PRE-LAUNCH.md`.

## Live admins and hosts
- Main admins are decided by email, not by a role column: an account is admin only if its CONFIRMED email is in public.main_admin_emails. The old "update users set role = 'admin'" in SETUP-LOGIN.md no longer grants admin.
- A working host is a row in public.host_profiles with user_id = the member's users.id, status 'active', deleted_at null. Normally created by "Approve as host" on an application, which the OTHER main admin must approve (maker-checker).
- Shubham logs in himself in the browser pane, one account at a time. Never ask for or type a password or code.
- The deployed site is the last pushed commit on main. Uncommitted local changes and unapplied migrations are NOT live, so test results on live may differ from localhost.
- Database migrations: show the exact SQL and wait for "approved" before applying. Never touch non-QA rows.

## Owner accounts and temporary test admin (live)
- Real email addresses are NOT written in this file (the repo is public). The mapping from label to email is in the git-ignored local file accounts-map.md inside the local secrets folder. Read it there when you need an email.
- Owned by Shubham: "main admin 1" (main admin), "my second admin (temporary, remove before launch)" (main admin), "my host account" (active host, host_profiles id 23).
- "main admin 2 (friend, no access)" belongs to a friend. Claude has no access and must never use or act as that account. Anything that notifies or needs approval from that account must be skipped unless Shubham says OK.
- TEMPORARY: "my second admin" was added to public.main_admin_emails on 2026-11-28 for testing. It MUST be removed before launch. Undo (replace REPLACE-WITH-EMAIL with the real address from the local accounts map):
  ```sql
  delete from public.main_admin_emails where email = 'REPLACE-WITH-EMAIL';
  update public.users set role = 'member'
  where auth_id = (select id from auth.users where lower(email) = 'REPLACE-WITH-EMAIL');
  ```
- Live migrations 20261128040000 (maps_url optional) and 20261128050000 (dashboard Inactive) were applied to live on 2026-11-28.
- Accounts are switched by Shubham logging in himself in the browser pane, one at a time. Claude never asks for or types passwords or codes.

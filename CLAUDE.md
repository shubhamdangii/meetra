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

# ACCOUNTS (no passwords or keys here, ever)
Two separate Supabase projects exist. Accounts do NOT carry over between them.

## meetra-test (the QA project)
- Holds the QA accounts that the seed script creates: QA admin, QA sub-admin (Ahmedabad), QA host, plain QA members. All names and emails start with QA_ or use the fake domain meetra-test.invalid.
- Their logins live only in the git-ignored local secrets folder. They work ONLY on meetra-test and never on the live site.
- Automated tests, the seed script and "reset QA data" run here. Safe to create and delete QA_ data.

## LIVE (https://shubhamdangii.github.io/meetra/, Supabase project eqzwolwhecotwiphmjrd)
- Only real Google accounts. No QA accounts exist here and none may be created.
- Main admins are decided by email, not by a role column: an account is admin only if its CONFIRMED email is in public.main_admin_emails (set by migration 20261123000000: "main admin 1" and "main admin 2"). The old "update users set role = 'admin'" in SETUP-LOGIN.md no longer grants admin.
- A working host is a row in public.host_profiles with user_id = the member's users.id, status 'active', deleted_at null. Normally created by "Approve as host" on an application, which the OTHER main admin must approve (maker-checker).
- Shubham's own live login is the only account to use for live checks. Never ask for or type a password or code. If not logged in, ask the user to log in in the browser pane.
- Live testing: no payments, refunds, WhatsApp or push. Prefix everything with QA_ and delete it afterwards. Never touch real events (for example "Board Games & Chai"). No direct database edits and no migrations from Claude.
- The deployed site is the last pushed commit on main. Uncommitted local changes and unapplied migrations are NOT live, so test results on live may differ from localhost.

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

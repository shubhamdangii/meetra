# Pre-launch checklist (remove test data and test access)

Meetra has one Supabase project, so test data lives next to real data until launch. Do all of this before telling anyone the site is open.

## 1. Remove QA data and the temporary admin
- [ ] Dry run (writes nothing): `npm --prefix web run clean-for-launch`
- [ ] Read the counts. They must only be QA_ events, QA_ host profiles, QA requests and the five `qa-*@example.invalid` accounts.
- [ ] Really remove: `npm --prefix web run clean-for-launch -- --yes --temp-admin-email=<the temporary admin's email>`
  (the email is in the git-ignored local accounts map, never in this repo; undo SQL is in CLAUDE.md)
- [ ] Run it again: it must report 0 of everything and `QA events left: 0`.

## 2. Check what is left
- [ ] Supabase Table editor: `public.main_admin_emails` lists only the real main admins.
- [ ] `auth.users` has no `@example.invalid` address.
- [ ] `public.host_profiles` has no name starting with `QA_`; the real host (id 23) is untouched.
- [ ] Explore shows no event starting with `QA_`.
- [ ] Delete `.secrets/test-accounts.env` (its logins no longer exist).

## 3. Launch items that are not test data
See `LAUNCH-CHECKLIST.md` (domain, WhatsApp login, Supabase plan, push alerts, 2-factor for admins).

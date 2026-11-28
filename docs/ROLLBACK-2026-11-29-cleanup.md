# Rollback notes: live cleanup of 2026-11-29

Before the cleanup every affected table was saved as JSON (all rows, before any delete) to the git-ignored folder
`.backups/2026-11-29-cleanup/` on Shubham's laptop (contains personal data: never commit or share it).

Tables saved: custom_plans, event_locations, event_photos, plan_requests, payments, host_reviews, admin_requests,
admin_notifications, plan_interest, city_admins, main_admin_emails, users, host_applications, partner_leads, wa_login_requests, audit_log.

To restore (Supabase SQL editor or a small node script with the database password), insert the saved rows back, parents first:
1. main_admin_emails, city_admins; and `update public.users set role = <saved role>` for changed accounts
2. custom_plans (keep the saved ids: `overriding system value` if the id is an identity column)
3. event_locations, host_reviews, plan_requests, payments, plan_interest, admin_requests, admin_notifications
Run it in one transaction. Triggers send notifications on inserts into plan_requests: disable them for the restore with
`set local session_replication_role = replica;` inside the transaction.

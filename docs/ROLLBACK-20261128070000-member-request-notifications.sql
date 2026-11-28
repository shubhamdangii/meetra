-- Undo for supabase/migrations/20261128070000_member_request_notifications.sql
-- Drops the two triggers and their functions. Notifications already created stay in admin_notifications (harmless; delete by kind if wanted:
--   delete from public.admin_notifications where kind in ('seat_requested', 'seat_updated', 'host_announced');  -- only if you want them gone)
begin;
drop trigger if exists plan_requests_notify_request on public.plan_requests;
drop trigger if exists custom_plans_notify_host on public.custom_plans;
drop function if exists private.notify_member_request();
drop function if exists private.notify_member_host();
commit;

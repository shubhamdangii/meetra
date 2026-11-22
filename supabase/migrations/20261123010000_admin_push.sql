-- Phone push for admin notifications: every new row in admin_notifications calls the
-- admin-push edge function (via pg_net) which sends it to that admin's subscribed phones.
-- The URL and shared secret live in private.app_settings (filled outside git, never committed).
create extension if not exists pg_net with schema extensions;

create table if not exists private.app_settings (key text primary key, value text not null);
revoke all on private.app_settings from public, anon, authenticated;

create or replace function private.push_admin_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare url text; secret text;
begin
  select value into url from private.app_settings where key = 'admin_push_url';
  select value into secret from private.app_settings where key = 'admin_push_secret';
  if url is null or secret is null then return new; end if;
  perform net.http_post(url := url, body := jsonb_build_object('id', new.id),
                        headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
                        timeout_milliseconds := 5000);
  return new;
exception when others then
  return new;   -- a push problem must never block the admin action itself
end $$;

drop trigger if exists admin_notifications_push on public.admin_notifications;
create trigger admin_notifications_push after insert on public.admin_notifications
  for each row execute function private.push_admin_notification();

-- Undo for 20261129000000_host_assignment_notifications.sql: back to the 20261128070000 version (members only, no host notification).
begin;
create or replace function private.notify_member_host()
returns trigger language plpgsql security definer set search_path = '' as $$
declare hn text; r record;
begin
  if new.host_id is null or new.host_id is not distinct from old.host_id then return new; end if;
  select name into hn from public.host_profiles where id = new.host_id;
  for r in select distinct user_id from public.plan_requests
           where plan_ref = new.plan_ref and status in ('pending', 'approved', 'waitlisted') loop
    perform private.notify(r.user_id, 'host_announced', '🎙️ Your host is announced',
      coalesce(hn, 'A host') || ' will host ' || new.title || '.', '/event/?id=' || new.plan_ref);
  end loop;
  return new;
end $$;
commit;

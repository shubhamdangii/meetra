-- In-app notifications for members about their seat REQUEST (the existing trigger only covers status changes):
--   a) the request is submitted (a new pending request) or updated (party size or note changed, status unchanged)
--   b) a host is announced for an event they requested or joined
-- They use the same table and bell as the other member notifications (admin_notifications, user_id = the member),
-- so read/unread and the unread count work as before. Only the member who made the request is notified.

create or replace function private.notify_member_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text := private.plan_title(new.plan_ref);
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform private.notify(new.user_id, 'seat_requested', '📨 Seat request received',
        'We got your request for ' || t || '. The team will confirm your seat soon.', '/event/?id=' || new.plan_ref);
    end if;
  elsif new.status is not distinct from old.status and new.status in ('pending', 'waitlisted', 'approved')
        and (new.party_size is distinct from old.party_size or new.icebreaker is distinct from old.icebreaker) then
    perform private.notify(new.user_id, 'seat_updated', '✏️ Seat request updated',
      'Your request for ' || t || ' was updated.', '/event/?id=' || new.plan_ref);
  end if;
  return new;
end $$;
drop trigger if exists plan_requests_notify_request on public.plan_requests;
create trigger plan_requests_notify_request after insert or update of party_size, icebreaker on public.plan_requests
  for each row execute function private.notify_member_request();

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
drop trigger if exists custom_plans_notify_host on public.custom_plans;
create trigger custom_plans_notify_host after update of host_id on public.custom_plans
  for each row execute function private.notify_member_host();

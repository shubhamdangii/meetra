-- Undo for supabase/migrations/20261128080000_request_again_notification.sql
-- Back to the version from 20261128070000 (no notification when a cancelled request becomes pending again).
begin;
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
commit;

-- Point 24 gap: asking for a seat again after cancelling does not make a new row, the website changes the old row from
-- 'cancelled' to 'pending'. That counted as a status change, so no "request received" notification was sent.
-- Now cancelled -> pending also sends "Seat request received". Everything else stays as in 20261128070000.
create or replace function private.notify_member_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text := private.plan_title(new.plan_ref);
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform private.notify(new.user_id, 'seat_requested', '📨 Seat request received',
        'We got your request for ' || t || '. The team will confirm your seat soon.', '/event/?id=' || new.plan_ref);
    end if;
  elsif old.status = 'cancelled' and new.status = 'pending' then
    perform private.notify(new.user_id, 'seat_requested', '📨 Seat request received',
      'We got your request for ' || t || '. The team will confirm your seat soon.', '/event/?id=' || new.plan_ref);
  elsif new.status is not distinct from old.status and new.status in ('pending', 'waitlisted', 'approved')
        and (new.party_size is distinct from old.party_size or new.icebreaker is distinct from old.icebreaker) then
    perform private.notify(new.user_id, 'seat_updated', '✏️ Seat request updated',
      'Your request for ' || t || ' was updated.', '/event/?id=' || new.plan_ref);
  end if;
  return new;
end $$;

drop trigger if exists plan_requests_notify_request on public.plan_requests;
create trigger plan_requests_notify_request after insert or update of status, party_size, icebreaker on public.plan_requests
  for each row execute function private.notify_member_request();

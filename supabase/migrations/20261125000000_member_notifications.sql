-- Members hear about their seats: a notification (site bell + phone push) when the team approves,
-- declines or waitlists a request, and when they're checked in. Seat changes also stream live
-- (Supabase Realtime) so "Your plans" and the door pass update the moment they change.

-- every logged-in member can read their own notifications (the table was admin-only in practice)
-- (policy admin_notif_read already allows user_id = current user)

-- members may subscribe this device for phone alerts too
create or replace function public.save_push_sub(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id();
begin
  if me is null then raise exception 'Log in first' using errcode = 'insufficient_privilege'; end if;
  insert into public.admin_push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, me, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
revoke all on function public.save_push_sub(text, text, text) from public, anon;
grant execute on function public.save_push_sub(text, text, text) to authenticated;

-- plan title for a seat (real events from the table; sample plans from their id)
create or replace function private.plan_title(p_ref text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select c.title from public.custom_plans c where c.plan_ref = p_ref),
                  initcap(replace(regexp_replace(p_ref, '-[a-z]+-[0-9]{8}$', ''), '-', ' ')))
$$;

create or replace function private.notify_member_seat()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text := private.plan_title(new.plan_ref); link text := '/saved/';
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'approved' and old.status <> 'attended' then
    perform private.notify(new.user_id, 'seat_approved', '🎉 Congrats! Your seat is confirmed',
      'You''re in for ' || t || '. Your door pass is ready in Your plans.', '/ticket/?id=' || new.plan_ref);
  elsif new.status = 'waitlisted' then
    perform private.notify(new.user_id, 'seat_waitlisted', '🕒 You''re on the waiting list',
      t || ' is full right now. We''ll tell you the moment a seat opens.', link);
  elsif new.status = 'declined' then
    perform private.notify(new.user_id, 'seat_declined', 'Not this time',
      'We couldn''t fit you into ' || t || '. Have a look at other plans this week.', '/events/');
  elsif new.status = 'attended' then
    perform private.notify(new.user_id, 'checked_in', '✅ You''re checked in',
      'Welcome to ' || t || '! Have the best time.', link);
  end if;
  return new;
end $$;
drop trigger if exists plan_requests_notify_member on public.plan_requests;
create trigger plan_requests_notify_member after update of status on public.plan_requests
  for each row execute function private.notify_member_seat();

-- live updates: members get their own seat rows (RLS still applies), and their own notifications
do $$ begin
  begin alter publication supabase_realtime add table public.plan_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.admin_notifications; exception when duplicate_object then null; end;
end $$;
alter table public.plan_requests replica identity full;

-- reviews open 30 minutes after a real event starts
create or replace function public.submit_review(p_plan_ref text, p_rating int, p_comment text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); c public.custom_plans; att timestamptz;
begin
  if me is null then raise exception 'Log in first' using errcode = 'insufficient_privilege'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Rating must be 1 to 5'; end if;
  select pr.checked_in_at into att from public.plan_requests pr where pr.plan_ref = p_plan_ref and pr.user_id = me and pr.status = 'attended';
  if not found then raise exception 'Only people who attended this plan can review it' using errcode = 'insufficient_privilege'; end if;
  select * into c from public.custom_plans where plan_ref = p_plan_ref;
  if c.id is not null and now() < c.starts_at + interval '30 minutes' then
    raise exception 'Reviews open 30 minutes after the plan starts' using errcode = 'check_violation';
  end if;
  if att is not null and att < now() - interval '30 days' then raise exception 'Reviews close 30 days after the plan'; end if;
  insert into public.host_reviews (plan_ref, event_id, host_id, user_id, rating, comment)
  values (p_plan_ref, c.id, c.host_id, me, p_rating, left(trim(coalesce(p_comment, '')), 600))
  on conflict (plan_ref, user_id) do update set rating = excluded.rating, comment = excluded.comment, created_at = now();
end $$;

-- "Host announced soon": real events may be saved without a host (the team) — nothing to change in the DB.

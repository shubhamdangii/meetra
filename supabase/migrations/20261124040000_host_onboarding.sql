-- =====================================================================
-- Host onboarding (one clean flow)
--  1. Member applies on /host/ (host_applications, unchanged form).
--  2. Team shortlists / calls / trials as before. "Approve as host" is now a
--     Maker-Checker request: the host profile is built from the member's own
--     profile (name, photo, phone, email, Instagram) and linked to their login.
--  3. The approved host gets a Host desk on /host/: propose events (drafts →
--     admin approval → live), see their events and guests, check guests in.
--  Hosts never approve/decline seats; that stays with the team.
-- =====================================================================

-- one host profile per member
create unique index if not exists host_profiles_one_per_user on public.host_profiles (user_id) where user_id is not null and deleted_at is null;
alter table public.host_profiles add column if not exists application_id bigint references public.host_applications (id) on delete set null;

-- link existing host profiles to the member with the same confirmed email
update public.host_profiles h set user_id = u.id
from public.users u join auth.users au on au.id = u.auth_id
where h.user_id is null and h.deleted_at is null and h.email is not null and au.email_confirmed_at is not null
  and lower(au.email) = lower(h.email)
  and not exists (select 1 from public.host_profiles x where x.user_id = u.id and x.deleted_at is null);

-- the logged-in member's host profile (active), or null
create or replace function private.my_host_id()
returns bigint language sql stable security definer set search_path = '' as $$
  select h.id from public.host_profiles h
  where h.user_id = private.current_user_id() and h.deleted_at is null and h.status = 'active'
  limit 1
$$;

-- is the logged-in member the host of this plan?
create or replace function private.is_plan_host(p_ref text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.custom_plans c where c.plan_ref = p_ref and c.deleted_at is null
                 and c.host_id is not null and c.host_id = private.my_host_id())
$$;

-- ---------- 1. approving an application goes through Maker-Checker ----------
alter table public.admin_requests drop constraint if exists admin_requests_action_check;
alter table public.admin_requests add constraint admin_requests_action_check
  check (action in ('create', 'update', 'cancel', 'delete', 'activate', 'deactivate', 'add_sub_admin', 'remove_sub_admin'));

-- applications: nobody sets 'approved' by hand any more; it happens when the host request is approved
create or replace function private.host_application_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved'
     and coalesce(current_setting('meetra.applying_host', true), '') <> '1' then
    raise exception 'Use "Approve as host" so the other admin can confirm it' using errcode = 'insufficient_privilege';
  end if;
  if auth.uid() is not null and not private.is_city_admin(coalesce(new.city_slug, old.city_slug)) then
    if tg_op = 'INSERT' then
      if new.status <> 'applied' or new.team_note is not null then
        raise exception 'New applications start as applied' using errcode = 'check_violation';
      end if;
    elsif new.status <> old.status and new.status <> 'withdrawn' then
      raise exception 'Only the meetra team can change an application''s status' using errcode = 'insufficient_privilege';
    elsif new.team_note is distinct from old.team_note or new.user_id <> old.user_id then
      raise exception 'Only the meetra team can do that' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

-- Main admin: send "make this applicant a host" to the other admin. Payload comes from their profile.
create or replace function public.admin_approve_host_application(p_app_id bigint, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare a public.host_applications; u public.users; p public.user_private; em text; payload jsonb;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  select * into a from public.host_applications where id = p_app_id;
  if not found then raise exception 'Application not found'; end if;
  if a.status in ('rejected', 'withdrawn') then raise exception 'This application is %', a.status; end if;
  if exists (select 1 from public.host_profiles h where h.user_id = a.user_id and h.deleted_at is null) then
    raise exception 'This member is already a host';
  end if;
  if exists (select 1 from public.admin_requests r where r.entity = 'host' and r.action = 'create' and r.status = 'pending'
             and (r.new_value ->> 'application_id')::bigint = p_app_id) then
    raise exception 'Already waiting for approval';
  end if;
  select * into u from public.users where id = a.user_id;
  select * into p from public.user_private where user_id = a.user_id;
  select lower(au.email) into em from auth.users au where au.id = u.auth_id;
  payload := jsonb_build_object(
    'name', coalesce(nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''), u.display_name),
    'city_slug', a.city_slug,
    'bio', left(coalesce(nullif(u.bio, ''), a.pitch, ''), 400),
    'photo_url', u.avatar_url,
    'phone', p.phone,
    'email', coalesce(p.email, em),
    'instagram', nullif(regexp_replace(coalesce(p.instagram_url, ''), '^https://(www\.)?instagram\.com/|/$', '', 'g'), ''),
    'gallery', '[]'::jsonb,
    'user_id', a.user_id,
    'application_id', a.id);
  return public.admin_submit_request('host', 'create', null, payload, coalesce(nullif(trim(p_note), ''), 'Approve application: ' || a.plan_title));
end $$;
revoke all on function public.admin_approve_host_application(bigint, text) from public, anon;
grant execute on function public.admin_approve_host_application(bigint, text) to authenticated;

-- host create now links the member and closes their application
create or replace function private.apply_host(p_action text, p_id bigint, j jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare h public.host_profiles; nid bigint;
  gal text[] := case when j ? 'gallery' then coalesce(array(select jsonb_array_elements_text(j -> 'gallery')), '{}') end;
  uid uuid := nullif(j ->> 'user_id', '')::uuid; app bigint := nullif(j ->> 'application_id', '')::bigint;
begin
  if gal is not null and exists (select 1 from unnest(gal) g where g !~ '^https://') then
    raise exception 'Gallery photos must be https:// links' using errcode = 'check_violation';
  end if;
  if p_action = 'create' then
    if uid is not null and exists (select 1 from public.host_profiles x where x.user_id = uid and x.deleted_at is null) then
      raise exception 'This member is already a host';
    end if;
    insert into public.host_profiles (name, city_slug, bio, photo_url, phone, email, instagram, gallery, created_by, user_id, application_id)
    values (trim(j ->> 'name'), j ->> 'city_slug', coalesce(j ->> 'bio', ''), nullif(j ->> 'photo_url', ''), nullif(j ->> 'phone', ''),
            nullif(lower(j ->> 'email'), ''), nullif(j ->> 'instagram', ''), coalesce(gal, '{}'), private.current_user_id(), uid, app)
    returning id into nid;
    if app is not null then
      perform set_config('meetra.applying_host', '1', true);
      update public.host_applications set status = 'approved',
        team_note = coalesce(team_note, 'Welcome! Your Host desk is open on this page.') where id = app;
      perform set_config('meetra.applying_host', '', true);
    end if;
    return nid;
  end if;
  select * into h from public.host_profiles where id = p_id for update;
  if not found or h.deleted_at is not null then raise exception 'That host no longer exists' using errcode = 'no_data_found'; end if;
  if p_action = 'update' then
    if j ? 'city_slug' and j ->> 'city_slug' <> h.city_slug and exists (
        select 1 from public.custom_plans c where c.host_id = p_id and c.deleted_at is null and c.status in ('pending', 'approved') and c.ends_at > now()) then
      raise exception '% has upcoming events in %. Move or cancel them before changing the city.', h.name, h.city_slug using errcode = 'check_violation';
    end if;
    update public.host_profiles set
      name = case when j ? 'name' then trim(j ->> 'name') else name end,
      city_slug = case when j ? 'city_slug' then j ->> 'city_slug' else city_slug end,
      bio = case when j ? 'bio' then coalesce(j ->> 'bio', '') else bio end,
      photo_url = case when j ? 'photo_url' then nullif(j ->> 'photo_url', '') else photo_url end,
      phone = case when j ? 'phone' then nullif(j ->> 'phone', '') else phone end,
      email = case when j ? 'email' then nullif(lower(j ->> 'email'), '') else email end,
      instagram = case when j ? 'instagram' then nullif(j ->> 'instagram', '') else instagram end,
      gallery = coalesce(gal, gallery)
    where id = p_id;
  elsif p_action in ('activate', 'deactivate') then
    if p_action = 'deactivate' and exists (select 1 from public.custom_plans c where c.host_id = p_id and c.deleted_at is null
        and c.status in ('pending', 'approved') and c.ends_at > now()) then
      raise exception '% has upcoming events. Give them another host or cancel them first.', h.name using errcode = 'check_violation';
    end if;
    update public.host_profiles set status = case p_action when 'activate' then 'active' else 'inactive' end where id = p_id;
  elsif p_action = 'delete' then
    if exists (select 1 from public.custom_plans c where c.host_id = p_id and c.deleted_at is null and c.status in ('pending', 'approved') and c.ends_at > now()) then
      raise exception '% has upcoming events. Give them another host or cancel them first.', h.name using errcode = 'check_violation';
    end if;
    update public.host_profiles set deleted_at = now(), status = 'inactive' where id = p_id;
  else
    raise exception 'Unknown host action %', p_action;
  end if;
  return p_id;
end $$;

-- applications list: say whether a host profile / pending request already exists
drop function if exists public.admin_host_applications();
create or replace function public.admin_host_applications()
returns table (id bigint, created_at timestamptz, city_slug text, plan_title text, category text, pitch text, experience text,
               frequency text, group_size smallint, availability text, status text, team_note text,
               display_name text, full_name text, avatar_url text, phone text, instagram_url text, linkedin_url text, profile_score smallint,
               host_id bigint, pending_req text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team() then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
  return query
  select a.id, a.created_at, a.city_slug, a.plan_title, a.category, a.pitch, a.experience, a.frequency, a.group_size, a.availability,
         a.status, a.team_note, u.display_name, p.full_name, u.avatar_url, p.phone, p.instagram_url, p.linkedin_url, u.profile_score,
         (select h.id from public.host_profiles h where h.user_id = a.user_id and h.deleted_at is null limit 1),
         (select r.req_no from public.admin_requests r where r.entity = 'host' and r.action = 'create' and r.status = 'pending'
            and (r.new_value ->> 'application_id')::bigint = a.id limit 1)
  from public.host_applications a join public.users u on u.id = a.user_id left join public.user_private p on p.user_id = u.id
  where private.is_city_admin(a.city_slug)
  order by (a.status in ('rejected', 'withdrawn', 'approved')), u.profile_score desc, a.created_at;
end $$;
revoke all on function public.admin_host_applications() from public, anon;
grant execute on function public.admin_host_applications() to authenticated;

-- ---------- 2. Host desk ----------
create or replace function public.my_host()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when h.id is null then null else jsonb_build_object('id', h.id, 'name', h.name, 'city_slug', h.city_slug, 'bio', h.bio,
    'photo_url', h.photo_url, 'status', h.status,
    'avg_rating', (select round(avg(r.rating)::numeric, 1) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null),
    'reviews', (select count(*) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null)) end
  from (select 1) one left join public.host_profiles h on h.user_id = private.current_user_id() and h.deleted_at is null
$$;

-- the host's events (every status), with seat numbers and the latest admin decision
create or replace function public.host_my_events()
returns table (id bigint, plan_ref text, title text, city_slug text, category text, starts_at timestamptz, ends_at timestamptz,
               booking_closes_at timestamptz, area text, price int, price_type text, seats smallint, emoji text, blurb text,
               steps text[], tags text[], status text, display_status text, confirmed int, attended int, pending int,
               req_id bigint, req_no text, req_status text, req_remark text)
language plpgsql stable security definer set search_path = '' as $$
declare me bigint := private.my_host_id();
begin
  if me is null then raise exception 'Only approved hosts can do this' using errcode = 'insufficient_privilege'; end if;
  return query
  select c.id, c.plan_ref, c.title, c.city_slug, c.category, c.starts_at, c.ends_at, c.booking_closes_at, c.area, c.price, c.price_type,
         c.seats, c.emoji, c.blurb, c.steps, c.tags, c.status, private.event_display_status(c),
         coalesce((select sum(pr.party_size) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status in ('approved', 'attended')), 0)::int,
         coalesce((select sum(pr.party_size) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status = 'attended'), 0)::int,
         (select count(*) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status = 'pending')::int,
         r.id, r.req_no, r.status, r.checker_remark
  from public.custom_plans c
  left join lateral (select x.* from public.admin_requests x where x.entity = 'event' and x.target_id = c.id order by x.id desc limit 1) r on true
  where c.host_id = me and c.deleted_at is null
  order by c.starts_at desc nulls last;
end $$;

-- save a draft (new or existing). City and host are always the host's own.
create or replace function public.host_save_event_draft(p_id bigint, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me bigint := private.my_host_id(); h public.host_profiles; r public.custom_plans; n public.custom_plans; nid bigint;
  j jsonb := coalesce(p_payload, '{}'::jsonb) - 'host_id' - 'city_slug';
begin
  if me is null then raise exception 'Only approved hosts can do this' using errcode = 'insufficient_privilege'; end if;
  select * into h from public.host_profiles where id = me;
  if p_id is null then
    n := private.event_merge(r, j);
    insert into public.custom_plans (city_slug, title, category, host_id, starts_at, ends_at, booking_closes_at, area, price, price_type,
                                     seats, emoji, blurb, steps, tags, status, created_by, starts_on, time_label)
    values (h.city_slug, n.title, n.category, me, n.starts_at, n.ends_at, n.booking_closes_at, n.area, coalesce(n.price, 0),
            coalesce(n.price_type, 'reservation'), coalesce(n.seats, 12), coalesce(n.emoji, '✨'), coalesce(n.blurb, ''),
            coalesce(n.steps, '{}'), coalesce(n.tags, '{}'), 'draft', private.current_user_id(), current_date, 'tbd')
    returning id into nid;
    return nid;
  end if;
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null or r.host_id is distinct from me then raise exception 'Event not found'; end if;
  if r.status <> 'draft' then raise exception 'Only drafts can be edited. Ask the team to change a live event.'; end if;
  n := private.event_merge(r, j);
  update public.custom_plans set title = n.title, category = n.category, starts_at = n.starts_at, ends_at = n.ends_at,
    booking_closes_at = n.booking_closes_at, area = n.area, price = n.price, price_type = n.price_type, seats = n.seats,
    emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags
  where id = p_id;
  return p_id;
end $$;

-- send a draft to the admins (Maker = host, Checker = any main admin)
create or replace function public.host_submit_event(p_id bigint, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare me bigint := private.my_host_id(); ev public.custom_plans; r public.admin_requests; a uuid; hn text;
begin
  if me is null then raise exception 'Only approved hosts can do this' using errcode = 'insufficient_privilege'; end if;
  select * into ev from public.custom_plans where id = p_id;
  if not found or ev.deleted_at is not null or ev.host_id is distinct from me then raise exception 'Event not found'; end if;
  if ev.status <> 'draft' then raise exception 'This event is already %', ev.status; end if;
  if exists (select 1 from public.admin_requests x where x.entity = 'event' and x.target_id = p_id and x.status = 'pending') then
    raise exception 'Already waiting for approval';
  end if;
  r.entity := 'event'; r.action := 'create'; r.target_id := p_id; r.new_value := private.event_fields(ev);
  perform private.dry_run(r);   -- dates, overlaps etc. are checked now, not at approval time
  insert into public.admin_requests (entity, action, target_id, target_label, old_value, new_value, maker_id, maker_note)
  values ('event', 'create', p_id, ev.title, null, private.event_fields(ev), private.current_user_id(), nullif(trim(p_note), ''))
  returning * into r;
  update public.custom_plans set status = 'pending' where id = p_id;
  select name into hn from public.host_profiles where id = me;
  perform private.log('submitted', 'request', r.req_no, r.req_no || ' submitted by host ' || hn || ': new event "' || ev.title || '"',
                      jsonb_build_object('new', r.new_value, 'target_id', p_id, 'entity', 'event'));
  for a in select * from private.main_admin_ids() loop
    perform private.notify(a, 'approval', 'Host event to review: ' || r.req_no, hn || ' proposed "' || ev.title || '"', private.request_link(r.req_no));
  end loop;
  return r.req_no;
end $$;

-- a rejected event goes back to draft (admin_decide_request already does this); the host edits it and submits again.
-- withdraw a pending one
create or replace function public.host_withdraw_event(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare me bigint := private.my_host_id(); r public.admin_requests;
begin
  if me is null then raise exception 'Only approved hosts can do this' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.custom_plans c where c.id = p_id and c.host_id = me) then raise exception 'Event not found'; end if;
  select * into r from public.admin_requests x where x.entity = 'event' and x.target_id = p_id and x.status = 'pending' and x.action = 'create' for update;
  if not found then raise exception 'Nothing is waiting for approval'; end if;
  update public.admin_requests set status = 'withdrawn', decided_at = now() where id = r.id;
  update public.custom_plans set status = 'draft' where id = p_id and status = 'pending';
  perform private.log('withdrawn', 'request', r.req_no, r.req_no || ' withdrawn by host');
end $$;

create or replace function public.host_discard_draft(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare me bigint := private.my_host_id();
begin
  if me is null then raise exception 'Only approved hosts can do this' using errcode = 'insufficient_privilege'; end if;
  update public.custom_plans set deleted_at = now() where id = p_id and host_id = me and status = 'draft' and deleted_at is null;
  if not found then raise exception 'Only drafts can be discarded'; end if;
end $$;

-- guest list for the host's own event (first name, photo, seats; phone so they can reach a late guest)
create or replace function public.host_guest_list(p_plan_ref text)
returns table (request_id bigint, display_name text, full_name text, avatar_url text, phone text, status text, party_size smallint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_plan_host(p_plan_ref) then raise exception 'Only the host of this plan can see its guests' using errcode = 'insufficient_privilege'; end if;
  return query
  select r.id, u.display_name, p.full_name, u.avatar_url, p.phone, r.status, r.party_size
  from public.plan_requests r join public.users u on u.id = r.user_id left join public.user_private p on p.user_id = u.id
  where r.plan_ref = p_plan_ref and r.status in ('approved', 'attended')
  order by r.status, u.display_name;
end $$;

-- door check-in: the plan's host may check their own guests in (and undo)
create or replace function public.admin_check_in(p_request_id bigint, p_plan_ref text default null, p_undo boolean default false)
returns table (request_id bigint, plan_ref text, display_name text, avatar_url text, party_size smallint,
               status text, checked_in_at timestamptz, already boolean)
language plpgsql security definer set search_path = '' as $$
declare r public.plan_requests%rowtype; was boolean;
begin
  select * into r from public.plan_requests pr where pr.id = p_request_id;
  if not found then raise exception 'No pass with this number' using errcode = 'no_data_found'; end if;
  if not (private.can_manage_plan(r.plan_ref) or private.is_plan_host(r.plan_ref)) then
    raise exception 'This pass is for a plan you don''t run' using errcode = 'insufficient_privilege';
  end if;
  if p_plan_ref is not null and r.plan_ref <> p_plan_ref then
    raise exception 'This pass is for another plan (%)', r.plan_ref using errcode = 'check_violation';
  end if;
  if r.status not in ('approved', 'attended') then
    raise exception 'Not confirmed for this plan (status: %)', r.status using errcode = 'check_violation';
  end if;
  was := r.status = 'attended';
  perform set_config('meetra.door', '1', true);
  if p_undo then
    update public.plan_requests set status = 'approved', checked_in_at = null, checked_in_by = null where id = r.id;
  elsif not was then
    update public.plan_requests set status = 'attended', checked_in_at = now(), checked_in_by = private.current_user_id() where id = r.id;
  end if;
  perform set_config('meetra.door', '', true);
  return query
  select pr.id, pr.plan_ref, u.display_name, u.avatar_url, pr.party_size, pr.status, pr.checked_in_at, was and not p_undo
  from public.plan_requests pr join public.users u on u.id = pr.user_id where pr.id = r.id;
end $$;
revoke all on function public.admin_check_in(bigint, text, boolean) from public, anon;
grant execute on function public.admin_check_in(bigint, text, boolean) to authenticated;

-- the seat-request rules let the door check-in (approved <-> attended) through for the plan's host
create or replace function private.plan_request_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare team boolean := auth.uid() is null or private.can_manage_plan(new.plan_ref)
  or (coalesce(current_setting('meetra.door', true), '') = '1' and tg_op = 'UPDATE' and private.is_plan_host(new.plan_ref)
      and old.status in ('approved', 'attended') and new.status in ('approved', 'attended'));
begin
  if not team then
    if tg_op = 'INSERT' then
      if new.status not in ('pending', 'waitlisted') or new.decided_at is not null then
        raise exception 'New requests must be pending or on the waiting list' using errcode = 'check_violation';
      end if;
    else
      if new.plan_ref <> old.plan_ref or new.user_id <> old.user_id or new.decided_at is distinct from old.decided_at then
        raise exception 'You can only cancel or re-send your own request' using errcode = 'insufficient_privilege';
      end if;
      if new.status <> old.status
         and not (new.status = 'cancelled'
                  or (old.status = 'cancelled' and new.status in ('pending', 'waitlisted'))) then
        raise exception 'Only the meetra team can approve or decline' using errcode = 'insufficient_privilege';
      end if;
      if old.status = 'attended' then
        raise exception 'This plan is already checked in' using errcode = 'insufficient_privilege';
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.plan_ref <> old.plan_ref then
    raise exception 'A request cannot move to another plan' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'declined', 'waitlisted') and team
     and not (old.status = 'attended' and new.status = 'approved') then
    new.decided_at := now();
  end if;
  return new;
end $$;

-- the admin desk "Approval Center" list now also shows host-made requests (maker is not an admin)
-- (admin_requests_list already lists every row; nothing to change)

do $$ declare f text; begin
  foreach f in array array['public.my_host()', 'public.host_my_events()', 'public.host_save_event_draft(bigint, jsonb)',
    'public.host_submit_event(bigint, text)', 'public.host_withdraw_event(bigint)', 'public.host_discard_draft(bigint)',
    'public.host_guest_list(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

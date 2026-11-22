-- =====================================================================
-- PHASE 2: two main admins + Maker-Checker, hosts, real events with
-- statuses and date rules, reviews, audit log, admin notifications.
--
--  * Main admins = emails in public.main_admin_emails (exactly the two owners).
--    Both have full access. Sub-admins (city_admins) only handle seat
--    requests, door check-in and host applications for their city.
--  * Every important change (event create/update/cancel/delete, host
--    add/edit/deactivate/remove, sub-admin add/remove) is a REQUEST made by one
--    admin (maker) and applied ONLY when the OTHER admin (checker) approves it.
--    Nobody can approve their own request. Rejections need a remark.
--    Rejected requests can be edited and resubmitted by the maker.
--  * Nothing reaches the live site until it is approved.
--  * Events and hosts are soft-deleted (deleted_at), never erased.
--  * audit_log keeps every admin action (append-only).
-- =====================================================================

-- ---------- 0. Helpers ----------
create or replace function private.jsonb_diff(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.k, jsonb_build_object('old', a -> s.k, 'new', b -> s.k)), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(a, '{}'::jsonb) || coalesce(b, '{}'::jsonb)) as k) s
  where (a -> s.k) is distinct from (b -> s.k) and s.k not in ('updated_at', 'created_at')
$$;

-- "8 pm", "7:30 am" in India time
create or replace function private.ist_label(t timestamptz)
returns text language sql stable set search_path = '' as $$
  select case when t is null then null
              when extract(minute from (t at time zone 'Asia/Kolkata')) = 0 then lower(to_char(t at time zone 'Asia/Kolkata', 'FMHH12 AM'))
              else lower(to_char(t at time zone 'Asia/Kolkata', 'FMHH12:MI AM')) end
$$;

-- ---------- 1. The two main admins ----------
create table if not exists public.main_admin_emails (
  email    text primary key check (email = lower(email) and email like '%@%'),
  added_at timestamptz not null default now()
);
alter table public.main_admin_emails enable row level security;
revoke all on public.main_admin_emails from anon, authenticated;
insert into public.main_admin_emails (email) values ('shujain19@gmail.com'), ('akash.apply4@gmail.com')
on conflict do nothing;

-- Main admin = logged in with a CONFIRMED email that is on the list (and not banned).
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u join auth.users au on au.id = u.auth_id
    where u.auth_id = auth.uid() and not u.is_banned and au.email_confirmed_at is not null
      and lower(au.email) in (select m.email from public.main_admin_emails m))
$$;

-- keep users.role in sync for display
update public.users u set role = case when exists (
    select 1 from auth.users au where au.id = u.auth_id and au.email_confirmed_at is not null
      and lower(au.email) in (select m.email from public.main_admin_emails m)) then 'admin' else 'member' end
where u.role is distinct from case when exists (
    select 1 from auth.users au where au.id = u.auth_id and au.email_confirmed_at is not null
      and lower(au.email) in (select m.email from public.main_admin_emails m)) then 'admin' else 'member' end;

create or replace function private.sync_admin_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.users u set role = 'admin'
  where u.auth_id = new.id and new.email_confirmed_at is not null
    and lower(new.email) in (select m.email from public.main_admin_emails m) and u.role <> 'admin';
  return new;
end $$;
drop trigger if exists sync_admin_role on auth.users;
create trigger sync_admin_role after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.sync_admin_role();

create or replace function private.user_name(p uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(pp.full_name, ''), u.display_name) from public.users u left join public.user_private pp on pp.user_id = u.id where u.id = p
$$;

-- ---------- 2. Audit log (append-only) ----------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid references public.users (id) on delete set null,
  actor_name text,
  action     text not null,          -- created, updated, submitted, approved, rejected, cancelled, deleted, ...
  entity     text not null,          -- event, host, request, team, seat_request, review
  entity_id  text,
  summary    text not null,
  details    jsonb not null default '{}'::jsonb
);
create index if not exists audit_entity_idx on public.audit_log (entity, entity_id, at desc);
create index if not exists audit_at_idx on public.audit_log (at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

create or replace function private.log(p_action text, p_entity text, p_entity_id text, p_summary text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id();
begin
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, details)
  values (me, coalesce(private.user_name(me), case when auth.uid() is null then 'system' else 'someone' end),
          p_action, p_entity, p_entity_id, p_summary, coalesce(p_details, '{}'::jsonb));
end $$;

-- ---------- 3. Admin notifications (+ phone push subscriptions) ----------
create table if not exists public.admin_notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_notif_user_idx on public.admin_notifications (user_id, created_at desc);
alter table public.admin_notifications enable row level security;
revoke all on public.admin_notifications from anon, authenticated;
grant select on public.admin_notifications to authenticated;
create policy admin_notif_read on public.admin_notifications for select to authenticated
  using (user_id = (select private.current_user_id()));

create table if not exists public.admin_push_subs (
  endpoint   text primary key check (endpoint like 'https://%'),
  user_id    uuid not null references public.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_push_subs enable row level security;
revoke all on public.admin_push_subs from anon, authenticated;

-- every main admin (by user id) except one
create or replace function private.main_admin_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.users u join auth.users au on au.id = u.auth_id
  where not u.is_banned and au.email_confirmed_at is not null and lower(au.email) in (select m.email from public.main_admin_emails m)
$$;

create or replace function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link)
$$;

create or replace function public.admin_notifications_mark_read(p_ids bigint[] default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.admin_notifications set read_at = now()
  where user_id = private.current_user_id() and read_at is null and (p_ids is null or id = any (p_ids));
end $$;

create or replace function public.admin_save_push_sub(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  insert into public.admin_push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, private.current_user_id(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- ---------- 4. Hosts ----------
create table if not exists public.host_profiles (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(trim(name)) between 2 and 60),
  city_slug   text not null references public.cities (slug) on update cascade,
  bio         text not null default '' check (char_length(bio) <= 400),
  photo_url   text check (photo_url is null or photo_url ~ '^https://'),
  phone       text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  instagram   text check (instagram is null or char_length(instagram) <= 60),
  user_id     uuid references public.users (id) on delete set null,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists host_profiles_city_idx on public.host_profiles (city_slug) where deleted_at is null;
create trigger host_profiles_set_updated_at before update on public.host_profiles for each row execute function private.set_updated_at();
alter table public.host_profiles enable row level security;
revoke all on public.host_profiles from anon, authenticated;
grant select (id, name, city_slug, bio, photo_url, status) on public.host_profiles to anon, authenticated;
create policy host_profiles_read on public.host_profiles for select to anon, authenticated
  using ((status = 'active' and deleted_at is null) or (select private.is_admin()));

-- ---------- 5. Events (custom_plans) ----------
alter table public.custom_plans add column if not exists host_id bigint references public.host_profiles (id);
alter table public.custom_plans add column if not exists starts_at timestamptz;
alter table public.custom_plans add column if not exists ends_at timestamptz;
alter table public.custom_plans add column if not exists booking_closes_at timestamptz;
alter table public.custom_plans add column if not exists plan_ref text unique;
alter table public.custom_plans add column if not exists deleted_at timestamptz;
alter table public.custom_plans add column if not exists approved_at timestamptz;
alter table public.custom_plans add column if not exists cancel_reason text check (char_length(cancel_reason) <= 300);
alter table public.custom_plans drop constraint if exists custom_plans_status_check;
update public.custom_plans set status = case status when 'published' then 'approved' when 'hidden' then 'draft' else status end;
alter table public.custom_plans alter column status set default 'draft';
alter table public.custom_plans add constraint custom_plans_status_check check (status in ('draft', 'pending', 'approved', 'cancelled'));
create index if not exists custom_plans_host_idx on public.custom_plans (host_id, starts_at) where deleted_at is null;

-- Dates, host and overlap rules (enforced for every write, whoever makes it).
create or replace function private.custom_plan_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare h public.host_profiles%rowtype; clash record; dates_changed boolean;
begin
  if new.starts_at is null or new.ends_at is null then
    raise exception 'Start and end date/time are required' using errcode = 'check_violation';
  end if;
  if new.ends_at <= new.starts_at then
    raise exception 'The end must be after the start' using errcode = 'check_violation';
  end if;
  if new.ends_at - new.starts_at > interval '7 days' then
    raise exception 'An event can last at most 7 days' using errcode = 'check_violation';
  end if;
  new.booking_closes_at := coalesce(new.booking_closes_at, new.starts_at - interval '2 hours');
  if new.booking_closes_at >= new.starts_at then
    raise exception 'Booking deadline must be before the event starts' using errcode = 'check_violation';
  end if;
  dates_changed := tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
                   or new.booking_closes_at is distinct from old.booking_closes_at;
  if dates_changed and new.deleted_at is null and new.status <> 'cancelled' then
    if new.starts_at <= now() then raise exception 'The start date/time can''t be in the past' using errcode = 'check_violation'; end if;
    if new.booking_closes_at <= now() then raise exception 'The booking deadline is already past' using errcode = 'check_violation'; end if;
  end if;
  if tg_op = 'UPDATE' and old.approved_at is not null and new.city_slug <> old.city_slug then
    raise exception 'An approved event can''t move to another city. Cancel it and create a new one.' using errcode = 'check_violation';
  end if;

  if new.host_id is not null then
    select * into h from public.host_profiles where id = new.host_id;
    if not found or h.deleted_at is not null then raise exception 'That host no longer exists' using errcode = 'check_violation'; end if;
    if h.city_slug <> new.city_slug then
      raise exception '% hosts in %, not in %', h.name, h.city_slug, new.city_slug using errcode = 'check_violation';
    end if;
    if h.status <> 'active' and new.status in ('pending', 'approved')
       and (tg_op = 'INSERT' or new.host_id is distinct from old.host_id or new.status is distinct from old.status) then
      raise exception '% is inactive. Activate the host first or pick another.', h.name using errcode = 'check_violation';
    end if;
    if new.status in ('pending', 'approved') and new.deleted_at is null then
      select c.title, c.starts_at into clash from public.custom_plans c
      where c.host_id = new.host_id and c.id <> new.id and c.deleted_at is null and c.status in ('pending', 'approved')
        and tstzrange(c.starts_at, c.ends_at) && tstzrange(new.starts_at, new.ends_at)
      limit 1;
      if found then
        raise exception '% is already hosting "%" at that time (%). Pick another time or host.', h.name, clash.title,
          to_char(clash.starts_at at time zone 'Asia/Kolkata', 'DD Mon, FMHH12:MI AM') using errcode = 'check_violation';
      end if;
    end if;
    new.host_name := h.name;
  else
    new.host_name := null;
  end if;

  new.starts_on  := (new.starts_at at time zone 'Asia/Kolkata')::date;
  new.time_label := private.ist_label(new.starts_at);
  new.end_label  := private.ist_label(new.ends_at);
  if new.plan_ref is null then
    new.plan_ref := 'x' || new.id || '-' || new.city_slug || '-' || to_char(new.starts_on, 'YYYYMMDD');
  end if;
  if new.status = 'approved' and new.approved_at is null then new.approved_at := now(); end if;

  -- never erase an event that people are confirmed for
  if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.plan_requests pr where pr.plan_ref = new.plan_ref and pr.status in ('approved', 'attended')) then
    raise exception 'This event has confirmed bookings, so it can''t be deleted. Cancel it instead.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists custom_plans_rules on public.custom_plans;
create trigger custom_plans_rules before insert or update on public.custom_plans
  for each row execute function private.custom_plan_rules();

-- event history
create or replace function private.custom_plan_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.log('created', 'event', new.id::text, 'Draft created: ' || new.title, to_jsonb(new));
  else
    d := private.jsonb_diff(to_jsonb(old), to_jsonb(new));
    if d = '{}'::jsonb then return new; end if;
    perform private.log(
      case when new.deleted_at is not null and old.deleted_at is null then 'deleted'
           when new.status <> old.status then new.status else 'updated' end,
      'event', new.id::text,
      case when new.deleted_at is not null and old.deleted_at is null then 'Deleted: '
           when new.status <> old.status then 'Status ' || old.status || ' → ' || new.status || ': '
           else 'Updated: ' end || new.title, d);
  end if;
  return new;
end $$;
drop trigger if exists custom_plans_history on public.custom_plans;
create trigger custom_plans_history after insert or update on public.custom_plans
  for each row execute function private.custom_plan_history();

create or replace function private.host_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.log('created', 'host', new.id::text, 'Host added: ' || new.name, to_jsonb(new) - 'phone' - 'email');
  else
    d := private.jsonb_diff(to_jsonb(old), to_jsonb(new));
    if d <> '{}'::jsonb then
      perform private.log(case when new.deleted_at is not null and old.deleted_at is null then 'deleted'
                               when new.status <> old.status then new.status else 'updated' end,
                          'host', new.id::text, 'Host ' || coalesce(case when new.status <> old.status then new.status end, 'updated') || ': ' || new.name, d);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists host_profiles_history on public.host_profiles;
create trigger host_profiles_history after insert or update on public.host_profiles for each row execute function private.host_history();

-- Only drafts/approved+not deleted are public; writes go through the admin functions below.
drop policy if exists custom_plans_read on public.custom_plans;
drop policy if exists custom_plans_insert on public.custom_plans;
drop policy if exists custom_plans_update on public.custom_plans;
drop policy if exists custom_plans_delete on public.custom_plans;
revoke insert, update, delete on public.custom_plans from authenticated;
create policy custom_plans_read on public.custom_plans for select to anon, authenticated
  using ((status in ('approved', 'cancelled') and deleted_at is null) or (select private.is_admin()));

-- Seat requests: only for open plans (sample plans: not in the past; real events: approved and before the booking deadline)
create or replace function private.plan_request_open()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.custom_plans%rowtype; d date;
begin
  if tg_op = 'UPDATE' and not (old.status = 'cancelled' and new.status in ('pending', 'waitlisted')) then return new; end if;
  if auth.uid() is null or private.can_manage_plan(new.plan_ref) then return new; end if;
  if new.plan_ref like 'x%' then
    select * into c from public.custom_plans where plan_ref = new.plan_ref;
    if not found or c.deleted_at is not null or c.status <> 'approved' then
      raise exception 'This plan isn''t open for requests' using errcode = 'check_violation';
    end if;
    if now() >= c.booking_closes_at then
      raise exception 'Requests for this plan closed at %', to_char(c.booking_closes_at at time zone 'Asia/Kolkata', 'DD Mon, FMHH12:MI AM') using errcode = 'check_violation';
    end if;
  else
    begin d := to_date(substring(new.plan_ref from '([0-9]{8})$'), 'YYYYMMDD'); exception when others then d := null; end;
    if d is not null and d < (now() at time zone 'Asia/Kolkata')::date then
      raise exception 'This plan has already happened' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists plan_requests_open on public.plan_requests;
create trigger plan_requests_open before insert or update on public.plan_requests
  for each row execute function private.plan_request_open();

-- seat decisions by the team go into the log; nobody hard-deletes requests any more
create or replace function private.plan_request_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null and private.can_manage_plan(new.plan_ref)
     and new.user_id <> private.current_user_id() then
    perform private.log(new.status, 'seat_request', new.id::text,
      'Seat request #' || new.id || ' (' || new.plan_ref || '): ' || old.status || ' → ' || new.status,
      jsonb_build_object('plan_ref', new.plan_ref, 'member', private.user_name(new.user_id)));
  end if;
  return new;
end $$;
drop trigger if exists plan_requests_history on public.plan_requests;
create trigger plan_requests_history after update on public.plan_requests
  for each row execute function private.plan_request_history();
drop policy if exists plan_requests_admin_delete on public.plan_requests;
revoke delete on public.plan_requests from authenticated;

-- ---------- 6. Maker-Checker requests ----------
create sequence if not exists public.admin_request_no_seq start 1001;
create table if not exists public.admin_requests (
  id             bigint generated always as identity primary key,
  req_no         text not null unique default ('REQ-' || nextval('public.admin_request_no_seq')),
  entity         text not null check (entity in ('event', 'host', 'team')),
  action         text not null check (action in ('create', 'update', 'cancel', 'delete', 'activate', 'deactivate', 'add_sub_admin', 'remove_sub_admin')),
  target_id      bigint,
  target_label   text not null,
  old_value      jsonb,
  new_value      jsonb not null default '{}'::jsonb,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  maker_id       uuid not null references public.users (id),
  maker_note     text check (char_length(maker_note) <= 500),
  checker_id     uuid references public.users (id),
  checker_remark text check (char_length(checker_remark) <= 500),
  resubmits      int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  decided_at     timestamptz,
  constraint admin_requests_no_self_check check (checker_id is null or checker_id <> maker_id)
);
create unique index if not exists admin_requests_one_pending on public.admin_requests (entity, target_id) where status = 'pending' and target_id is not null;
create index if not exists admin_requests_status_idx on public.admin_requests (status, created_at desc);
create trigger admin_requests_set_updated_at before update on public.admin_requests for each row execute function private.set_updated_at();
alter table public.admin_requests enable row level security;
revoke all on public.admin_requests from anon, authenticated;

-- Build an event row from a base row + JSON of fields
create or replace function private.event_merge(b public.custom_plans, j jsonb)
returns public.custom_plans language plpgsql stable set search_path = '' as $$
declare r public.custom_plans := b;
begin
  if j ? 'title'      then r.title := trim(j ->> 'title'); end if;
  if j ? 'category'   then r.category := j ->> 'category'; end if;
  if j ? 'city_slug'  then r.city_slug := j ->> 'city_slug'; end if;
  if j ? 'host_id'    then r.host_id := nullif(j ->> 'host_id', '')::bigint; end if;
  if j ? 'starts_at'  then r.starts_at := nullif(j ->> 'starts_at', '')::timestamptz; end if;
  if j ? 'ends_at'    then r.ends_at := nullif(j ->> 'ends_at', '')::timestamptz; end if;
  if j ? 'booking_closes_at' then r.booking_closes_at := nullif(j ->> 'booking_closes_at', '')::timestamptz; end if;
  if j ? 'area'       then r.area := trim(j ->> 'area'); end if;
  if j ? 'price'      then r.price := coalesce(nullif(j ->> 'price', '')::int, 0); end if;
  if j ? 'price_type' then r.price_type := j ->> 'price_type'; end if;
  if j ? 'seats'      then r.seats := (j ->> 'seats')::smallint; end if;
  if j ? 'emoji'      then r.emoji := coalesce(nullif(trim(j ->> 'emoji'), ''), '✨'); end if;
  if j ? 'blurb'      then r.blurb := coalesce(j ->> 'blurb', ''); end if;
  if j ? 'steps'      then r.steps := coalesce(array(select jsonb_array_elements_text(j -> 'steps')), '{}'); end if;
  if j ? 'tags'       then r.tags := coalesce(array(select jsonb_array_elements_text(j -> 'tags')), '{}'); end if;
  return r;
end $$;

create or replace function private.event_fields(r public.custom_plans)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('title', r.title, 'category', r.category, 'city_slug', r.city_slug, 'host_id', r.host_id,
    'host_name', r.host_name, 'starts_at', r.starts_at, 'ends_at', r.ends_at, 'booking_closes_at', r.booking_closes_at,
    'area', r.area, 'price', r.price, 'price_type', r.price_type, 'seats', r.seats, 'emoji', r.emoji,
    'blurb', r.blurb, 'steps', to_jsonb(r.steps), 'tags', to_jsonb(r.tags))
$$;

create or replace function private.host_fields(h public.host_profiles)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('name', h.name, 'city_slug', h.city_slug, 'bio', h.bio, 'photo_url', h.photo_url,
    'phone', h.phone, 'email', h.email, 'instagram', h.instagram, 'status', h.status)
$$;

-- Write an event change for real (used by approve, and by the dry run at submit time)
create or replace function private.apply_event(p_action text, p_id bigint, j jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.custom_plans; n public.custom_plans;
begin
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null then raise exception 'That event no longer exists' using errcode = 'no_data_found'; end if;
  if p_action = 'create' then
    if r.status not in ('draft', 'pending') then raise exception 'This event is already %', r.status; end if;
    n := private.event_merge(r, coalesce(j, '{}'::jsonb));
    update public.custom_plans set title = n.title, category = n.category, city_slug = n.city_slug, host_id = n.host_id,
      starts_at = n.starts_at, ends_at = n.ends_at, booking_closes_at = n.booking_closes_at, area = n.area, price = n.price,
      price_type = n.price_type, seats = n.seats, emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags,
      status = 'approved' where id = p_id;
  elsif p_action = 'update' then
    if r.status <> 'approved' then raise exception 'Only approved events can be changed this way (this one is %)', r.status; end if;
    n := private.event_merge(r, j);
    if n.seats < (select coalesce(sum(pr.party_size), 0) from public.plan_requests pr where pr.plan_ref = r.plan_ref and pr.status in ('approved', 'attended')) then
      raise exception 'Seats can''t go below the number of confirmed guests' using errcode = 'check_violation';
    end if;
    update public.custom_plans set title = n.title, category = n.category, city_slug = n.city_slug, host_id = n.host_id,
      starts_at = n.starts_at, ends_at = n.ends_at, booking_closes_at = n.booking_closes_at, area = n.area, price = n.price,
      price_type = n.price_type, seats = n.seats, emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags
    where id = p_id;
  elsif p_action = 'cancel' then
    if r.status <> 'approved' then raise exception 'Only approved events can be cancelled'; end if;
    update public.custom_plans set status = 'cancelled', cancel_reason = left(j ->> 'reason', 300) where id = p_id;
  elsif p_action = 'delete' then
    update public.custom_plans set deleted_at = now() where id = p_id;
  else
    raise exception 'Unknown event action %', p_action;
  end if;
end $$;

create or replace function private.apply_host(p_action text, p_id bigint, j jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare h public.host_profiles; nid bigint;
begin
  if p_action = 'create' then
    insert into public.host_profiles (name, city_slug, bio, photo_url, phone, email, instagram, created_by)
    values (trim(j ->> 'name'), j ->> 'city_slug', coalesce(j ->> 'bio', ''), nullif(j ->> 'photo_url', ''), nullif(j ->> 'phone', ''),
            nullif(lower(j ->> 'email'), ''), nullif(j ->> 'instagram', ''), private.current_user_id())
    returning id into nid;
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
      instagram = case when j ? 'instagram' then nullif(j ->> 'instagram', '') else instagram end
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

create or replace function private.apply_team(p_action text, j jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if p_action = 'add_sub_admin' then
    if not exists (select 1 from public.cities c where c.slug = j ->> 'city') then raise exception 'Unknown city'; end if;
    select u.id into uid from public.users u left join auth.users au on au.id = u.auth_id left join public.user_private p on p.user_id = u.id
    where lower(au.email) = lower(trim(j ->> 'email')) or lower(p.email) = lower(trim(j ->> 'email')) limit 1;
    if uid is null then raise exception 'No member with this email yet. Ask them to log in on the website once.' using errcode = 'no_data_found'; end if;
    insert into public.city_admins (user_id, city_slug, added_by) values (uid, j ->> 'city', private.current_user_id()) on conflict do nothing;
  elsif p_action = 'remove_sub_admin' then
    delete from public.city_admins where user_id = (j ->> 'user_id')::uuid and city_slug = j ->> 'city';
  else
    raise exception 'Unknown team action %', p_action;
  end if;
end $$;

create or replace function private.apply_request(r public.admin_requests)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if r.entity = 'event' then perform private.apply_event(r.action, r.target_id, r.new_value);
  elsif r.entity = 'host' then perform private.apply_host(r.action, r.target_id, r.new_value);
  elsif r.entity = 'team' then perform private.apply_team(r.action, r.new_value);
  end if;
end $$;

-- Try the change and roll it back: catches bad dates / overlaps / missing hosts at submit time.
create or replace function private.dry_run(r public.admin_requests)
returns void language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.apply_request(r);
    raise exception using errcode = 'P0099', message = 'dry-run-ok';
  exception when sqlstate 'P0099' then null;
  end;
end $$;

create or replace function private.request_link(p_no text) returns text language sql immutable set search_path = '' as $$
  select '/admin/?tab=approvals&req=' || p_no
$$;

-- Maker: submit a change for the other admin to approve. Returns the Request ID.
create or replace function public.admin_submit_request(p_entity text, p_action text, p_target bigint, p_payload jsonb, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); r public.admin_requests; ev public.custom_plans; h public.host_profiles; lbl text; oldv jsonb; newv jsonb := coalesce(p_payload, '{}'::jsonb); a uuid;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  if p_entity = 'event' then
    select * into ev from public.custom_plans where id = p_target;
    if not found or ev.deleted_at is not null then raise exception 'Event not found' using errcode = 'no_data_found'; end if;
    lbl := ev.title;
    if p_action = 'create' then
      if ev.status <> 'draft' then raise exception 'Only drafts can be sent for approval (this one is %)', ev.status; end if;
      newv := private.event_fields(ev); oldv := null;
    elsif p_action = 'update' then
      newv := newv - 'host_name';
      oldv := (select jsonb_object_agg(k, private.event_fields(ev) -> k) from jsonb_object_keys(newv) k);
      if private.jsonb_diff(oldv, newv) = '{}'::jsonb then raise exception 'Nothing changed'; end if;
    elsif p_action in ('cancel', 'delete') then
      oldv := jsonb_build_object('status', ev.status);
      if p_action = 'cancel' and char_length(trim(coalesce(newv ->> 'reason', ''))) < 3 then raise exception 'Write a reason for cancelling'; end if;
      if p_action = 'delete' and exists (select 1 from public.plan_requests pr where pr.plan_ref = ev.plan_ref and pr.status in ('approved', 'attended')) then
        raise exception 'This event has confirmed bookings, so it can''t be deleted. Cancel it instead.' using errcode = 'check_violation';
      end if;
    else raise exception 'Unknown action'; end if;
  elsif p_entity = 'host' then
    if p_action = 'create' then
      lbl := coalesce(trim(newv ->> 'name'), 'New host');
    else
      select * into h from public.host_profiles where id = p_target;
      if not found or h.deleted_at is not null then raise exception 'Host not found' using errcode = 'no_data_found'; end if;
      lbl := h.name;
      if p_action = 'update' then
        oldv := (select jsonb_object_agg(k, private.host_fields(h) -> k) from jsonb_object_keys(newv) k);
        if private.jsonb_diff(oldv, newv) = '{}'::jsonb then raise exception 'Nothing changed'; end if;
      else oldv := jsonb_build_object('status', h.status); end if;
    end if;
  elsif p_entity = 'team' then
    lbl := coalesce(newv ->> 'email', newv ->> 'name', 'Sub-admin') || ' · ' || coalesce(newv ->> 'city', '');
  else raise exception 'Unknown entity'; end if;

  if p_target is not null and exists (select 1 from public.admin_requests x where x.entity = p_entity and x.target_id = p_target and x.status = 'pending') then
    raise exception 'There is already a pending request for this %. Wait for it to be approved or rejected.', p_entity;
  end if;

  r.entity := p_entity; r.action := p_action; r.target_id := p_target; r.new_value := newv;
  perform private.dry_run(r);   -- raises the real problem (dates, overlap, …) right away

  insert into public.admin_requests (entity, action, target_id, target_label, old_value, new_value, maker_id, maker_note)
  values (p_entity, p_action, p_target, lbl, oldv, newv, me, nullif(trim(p_note), ''))
  returning * into r;
  if p_entity = 'event' and p_action = 'create' then update public.custom_plans set status = 'pending' where id = p_target; end if;

  perform private.log('submitted', 'request', r.req_no, r.req_no || ' submitted: ' || p_action || ' ' || p_entity || ' "' || lbl || '"',
                      jsonb_build_object('old', oldv, 'new', newv, 'target_id', p_target, 'entity', p_entity));
  for a in select * from private.main_admin_ids() loop
    if a <> me then
      perform private.notify(a, 'approval', 'Approval needed: ' || r.req_no,
        coalesce(private.user_name(me), 'An admin') || ' wants to ' || replace(p_action, '_', ' ') || ' ' || p_entity || ' "' || lbl || '"',
        private.request_link(r.req_no));
    end if;
  end loop;
  return r.req_no;
end $$;

-- Checker: approve or reject (never your own). Rejection needs a remark.
create or replace function public.admin_decide_request(p_id bigint, p_approve boolean, p_remark text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); r public.admin_requests; ev public.custom_plans;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  select * into r from public.admin_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'no_data_found'; end if;
  if r.status <> 'pending' then raise exception '% is already %', r.req_no, r.status; end if;
  if r.maker_id = me then raise exception 'You can''t approve or reject your own request. The other admin has to check it.' using errcode = 'insufficient_privilege'; end if;
  if not p_approve and char_length(trim(coalesce(p_remark, ''))) < 3 then raise exception 'Write a reason for rejecting (at least 3 characters)'; end if;

  if p_approve then
    if r.entity = 'event' and r.action in ('create', 'update') then
      select * into ev from public.custom_plans where id = r.target_id;
      if coalesce((r.new_value ->> 'starts_at')::timestamptz, ev.starts_at) <= now() then
        raise exception 'This event''s start time has already passed. Reject it so the maker can pick a new date.';
      end if;
    end if;
    perform private.apply_request(r);
    update public.admin_requests set status = 'approved', checker_id = me, checker_remark = nullif(trim(p_remark), ''), decided_at = now() where id = p_id;
  else
    update public.admin_requests set status = 'rejected', checker_id = me, checker_remark = trim(p_remark), decided_at = now() where id = p_id;
    if r.entity = 'event' and r.action = 'create' then update public.custom_plans set status = 'draft' where id = r.target_id and status = 'pending'; end if;
  end if;
  perform private.log(case when p_approve then 'approved' else 'rejected' end, 'request', r.req_no,
    r.req_no || ' ' || case when p_approve then 'approved' else 'rejected' end || ': ' || r.action || ' ' || r.entity || ' "' || r.target_label || '"',
    jsonb_build_object('remark', p_remark, 'maker', private.user_name(r.maker_id)));
  perform private.notify(r.maker_id, case when p_approve then 'approved' else 'rejected' end,
    r.req_no || ' ' || case when p_approve then 'approved ✓' else 'rejected' end,
    '"' || r.target_label || '"' || case when p_approve then ' is now live.' else ': ' || trim(p_remark) end,
    private.request_link(r.req_no));
  return case when p_approve then 'approved' else 'rejected' end;
end $$;

-- Maker: edit a rejected request and send it again.
create or replace function public.admin_resubmit_request(p_id bigint, p_payload jsonb default null, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); r public.admin_requests; ev public.custom_plans; newv jsonb; a uuid;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  select * into r from public.admin_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'no_data_found'; end if;
  if r.maker_id <> me then raise exception 'Only the admin who made this request can resubmit it' using errcode = 'insufficient_privilege'; end if;
  if r.status <> 'rejected' then raise exception 'Only rejected requests can be resubmitted'; end if;
  if r.target_id is not null and exists (select 1 from public.admin_requests x where x.entity = r.entity and x.target_id = r.target_id and x.status = 'pending') then
    raise exception 'There is already a pending request for this %', r.entity;
  end if;
  newv := coalesce(p_payload, r.new_value);
  if r.entity = 'event' and r.action = 'create' then
    -- the draft itself holds the new values
    select * into ev from public.custom_plans where id = r.target_id;
    ev := private.event_merge(ev, newv);
    update public.custom_plans set title = ev.title, category = ev.category, city_slug = ev.city_slug, host_id = ev.host_id,
      starts_at = ev.starts_at, ends_at = ev.ends_at, booking_closes_at = ev.booking_closes_at, area = ev.area, price = ev.price,
      price_type = ev.price_type, seats = ev.seats, emoji = ev.emoji, blurb = ev.blurb, steps = ev.steps, tags = ev.tags
    where id = r.target_id;
    select * into ev from public.custom_plans where id = r.target_id;
    newv := private.event_fields(ev);
  end if;
  r.new_value := newv;
  perform private.dry_run(r);
  update public.admin_requests set new_value = newv, status = 'pending', checker_id = null, decided_at = null,
    maker_note = coalesce(nullif(trim(p_note), ''), maker_note), resubmits = resubmits + 1,
    target_label = case when r.entity = 'event' and newv ? 'title' then newv ->> 'title' when r.entity = 'host' and newv ? 'name' then newv ->> 'name' else target_label end
  where id = p_id;
  if r.entity = 'event' and r.action = 'create' then update public.custom_plans set status = 'pending' where id = r.target_id; end if;
  perform private.log('resubmitted', 'request', r.req_no, r.req_no || ' edited and resubmitted', jsonb_build_object('new', newv));
  for a in select * from private.main_admin_ids() loop
    if a <> me then perform private.notify(a, 'approval', 'Resubmitted: ' || r.req_no, '"' || r.target_label || '" was edited after your rejection. Please check again.', private.request_link(r.req_no)); end if;
  end loop;
  return r.req_no;
end $$;

-- Maker: take back a pending request.
create or replace function public.admin_withdraw_request(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.admin_requests;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  select * into r from public.admin_requests where id = p_id for update;
  if not found or r.maker_id <> private.current_user_id() then raise exception 'Only the admin who made this request can withdraw it'; end if;
  if r.status not in ('pending', 'rejected') then raise exception '% is already %', r.req_no, r.status; end if;
  update public.admin_requests set status = 'withdrawn', decided_at = now() where id = p_id;
  if r.entity = 'event' and r.action = 'create' then update public.custom_plans set status = 'draft' where id = r.target_id and status = 'pending'; end if;
  perform private.log('withdrawn', 'request', r.req_no, r.req_no || ' withdrawn by maker');
end $$;

create or replace function public.admin_requests_list(p_status text default null, p_limit int default 200)
returns table (id bigint, req_no text, entity text, action text, target_id bigint, target_label text, old_value jsonb, new_value jsonb,
               status text, maker_id uuid, maker_name text, maker_note text, checker_name text, checker_remark text,
               resubmits int, created_at timestamptz, decided_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select r.id, r.req_no, r.entity, r.action, r.target_id, r.target_label, r.old_value, r.new_value, r.status, r.maker_id,
         private.user_name(r.maker_id), r.maker_note, private.user_name(r.checker_id), r.checker_remark, r.resubmits,
         r.created_at, r.decided_at, r.maker_id = private.current_user_id()
  from public.admin_requests r
  where p_status is null or r.status = p_status
  order by (r.status = 'pending') desc, r.created_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;

-- ---------- 7. Drafts (not live, no approval needed) ----------
create or replace function public.admin_save_event_draft(p_id bigint, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r public.custom_plans; n public.custom_plans; nid bigint;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  if p_id is null then
    n := private.event_merge(r, p_payload);
    insert into public.custom_plans (city_slug, title, category, host_id, starts_at, ends_at, booking_closes_at, area, price, price_type,
                                     seats, emoji, blurb, steps, tags, status, created_by, starts_on, time_label)
    values (n.city_slug, n.title, n.category, n.host_id, n.starts_at, n.ends_at, n.booking_closes_at, n.area, coalesce(n.price, 0),
            coalesce(n.price_type, 'reservation'), coalesce(n.seats, 12), coalesce(n.emoji, '✨'), coalesce(n.blurb, ''),
            coalesce(n.steps, '{}'), coalesce(n.tags, '{}'), 'draft', private.current_user_id(), current_date, 'tbd')
    returning id into nid;
    return nid;
  end if;
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null then raise exception 'Event not found'; end if;
  if r.status <> 'draft' then raise exception 'Only drafts can be edited directly. For a live event, use "Request change".'; end if;
  n := private.event_merge(r, p_payload);
  update public.custom_plans set title = n.title, category = n.category, city_slug = n.city_slug, host_id = n.host_id,
    starts_at = n.starts_at, ends_at = n.ends_at, booking_closes_at = n.booking_closes_at, area = n.area, price = n.price,
    price_type = n.price_type, seats = n.seats, emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags
  where id = p_id;
  return p_id;
end $$;

create or replace function public.admin_discard_draft(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  update public.custom_plans set deleted_at = now() where id = p_id and status = 'draft' and deleted_at is null;
  if not found then raise exception 'Only drafts can be discarded directly'; end if;
end $$;

-- ---------- 8. Reviews (only people who were checked in) ----------
create table if not exists public.host_reviews (
  id         bigint generated always as identity primary key,
  plan_ref   text not null,
  event_id   bigint references public.custom_plans (id),
  host_id    bigint references public.host_profiles (id),
  user_id    uuid not null references public.users (id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text not null default '' check (char_length(comment) <= 600),
  hidden_at  timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_ref, user_id)
);
create index if not exists host_reviews_host_idx on public.host_reviews (host_id) where hidden_at is null;
alter table public.host_reviews enable row level security;
revoke all on public.host_reviews from anon, authenticated;
grant select on public.host_reviews to authenticated;
create policy host_reviews_read_own on public.host_reviews for select to authenticated
  using (user_id = (select private.current_user_id()) or (select private.is_admin()));

create or replace function public.submit_review(p_plan_ref text, p_rating int, p_comment text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); c public.custom_plans; att timestamptz;
begin
  if me is null then raise exception 'Log in first' using errcode = 'insufficient_privilege'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Rating must be 1 to 5'; end if;
  select pr.checked_in_at into att from public.plan_requests pr where pr.plan_ref = p_plan_ref and pr.user_id = me and pr.status = 'attended';
  if not found then raise exception 'Only people who attended this plan can review it' using errcode = 'insufficient_privilege'; end if;
  if att is not null and att < now() - interval '30 days' then raise exception 'Reviews close 30 days after the plan'; end if;
  select * into c from public.custom_plans where plan_ref = p_plan_ref;
  insert into public.host_reviews (plan_ref, event_id, host_id, user_id, rating, comment)
  values (p_plan_ref, c.id, c.host_id, me, p_rating, left(trim(coalesce(p_comment, '')), 600))
  on conflict (plan_ref, user_id) do update set rating = excluded.rating, comment = excluded.comment, created_at = now();
end $$;

-- public: average rating per host, and reviews of one plan (first names only)
create or replace function public.host_ratings(p_ids bigint[])
returns table (host_id bigint, avg_rating numeric, reviews int)
language sql stable security definer set search_path = '' as $$
  select r.host_id, round(avg(r.rating)::numeric, 1), count(*)::int from public.host_reviews r
  where r.host_id = any (p_ids) and r.hidden_at is null group by r.host_id
$$;
create or replace function public.plan_reviews(p_plan_ref text)
returns table (rating smallint, comment text, first_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.rating, r.comment, split_part(u.display_name, ' ', 1), r.created_at
  from public.host_reviews r join public.users u on u.id = r.user_id
  where r.plan_ref = p_plan_ref and r.hidden_at is null order by r.created_at desc limit 50
$$;

create or replace function public.admin_hide_review(p_id bigint, p_hide boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  update public.host_reviews set hidden_at = case when p_hide then now() end where id = p_id;
  perform private.log(case when p_hide then 'hidden' else 'shown' end, 'review', p_id::text, 'Review #' || p_id || case when p_hide then ' hidden' else ' shown again' end);
end $$;

-- ---------- 9. Admin reads: events, hosts, host profile, dashboard, activity, team ----------
create or replace function private.event_display_status(c public.custom_plans)
returns text language sql stable set search_path = '' as $$
  select case when c.deleted_at is not null then 'deleted'
              when c.status = 'approved' and c.ends_at < now() then 'completed'
              when c.status = 'approved' then 'active'
              else c.status end
$$;

create or replace function public.admin_events()
returns table (id bigint, plan_ref text, title text, city_slug text, category text, host_id bigint, host_name text,
               starts_at timestamptz, ends_at timestamptz, booking_closes_at timestamptz, area text, price int, price_type text,
               seats smallint, emoji text, blurb text, steps text[], tags text[], status text, display_status text,
               confirmed int, pending int, waitlisted int, pending_req text, cancel_reason text, created_by_name text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select c.id, c.plan_ref, c.title, c.city_slug, c.category, c.host_id, c.host_name, c.starts_at, c.ends_at, c.booking_closes_at,
         c.area, c.price, c.price_type, c.seats, c.emoji, c.blurb, c.steps, c.tags, c.status, private.event_display_status(c),
         coalesce((select sum(pr.party_size) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status in ('approved', 'attended')), 0)::int,
         (select count(*) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status = 'pending')::int,
         (select count(*) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status = 'waitlisted')::int,
         (select x.req_no from public.admin_requests x where x.entity = 'event' and x.target_id = c.id and x.status = 'pending' limit 1),
         c.cancel_reason, private.user_name(c.created_by), c.updated_at
  from public.custom_plans c
  where c.deleted_at is null
  order by c.starts_at desc nulls last;
end $$;

create or replace function public.admin_hosts()
returns table (id bigint, name text, city_slug text, bio text, photo_url text, phone text, email text, instagram text, status text,
               total_events int, active_events int, upcoming_events int, completed_events int, bookings int,
               avg_rating numeric, reviews int, cities text[], pending_req text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select h.id, h.name, h.city_slug, h.bio, h.photo_url, h.phone, h.email, h.instagram, h.status,
         (select count(*) from public.custom_plans c where c.host_id = h.id and c.deleted_at is null and c.status in ('approved', 'cancelled'))::int,
         (select count(*) from public.custom_plans c where c.host_id = h.id and c.deleted_at is null and c.status = 'approved' and now() between c.starts_at and c.ends_at)::int,
         (select count(*) from public.custom_plans c where c.host_id = h.id and c.deleted_at is null and c.status = 'approved' and c.starts_at > now())::int,
         (select count(*) from public.custom_plans c where c.host_id = h.id and c.deleted_at is null and c.status = 'approved' and c.ends_at < now())::int,
         coalesce((select sum(pr.party_size) from public.plan_requests pr join public.custom_plans c on c.plan_ref = pr.plan_ref
                   where c.host_id = h.id and pr.status in ('approved', 'attended')), 0)::int,
         (select round(avg(r.rating)::numeric, 1) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null),
         (select count(*) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null)::int,
         coalesce((select array_agg(distinct c.city_slug) from public.custom_plans c where c.host_id = h.id and c.deleted_at is null), array[h.city_slug]),
         (select x.req_no from public.admin_requests x where x.entity = 'host' and x.target_id = h.id and x.status = 'pending' limit 1),
         h.created_at
  from public.host_profiles h where h.deleted_at is null
  order by h.status, h.name;
end $$;

create or replace function public.admin_host_detail(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'city', c.city_slug, 'starts_at', c.starts_at,
        'status', private.event_display_status(c), 'seats', c.seats,
        'booked', coalesce((select sum(pr.party_size) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status in ('approved', 'attended')), 0),
        'attended', (select count(*) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status = 'attended'),
        'avg_rating', (select round(avg(r.rating)::numeric, 1) from public.host_reviews r where r.plan_ref = c.plan_ref and r.hidden_at is null),
        'reviews', (select count(*) from public.host_reviews r where r.plan_ref = c.plan_ref and r.hidden_at is null))
        order by c.starts_at desc) from public.custom_plans c where c.host_id = p_id and c.deleted_at is null), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment, 'by', private.user_name(r.user_id),
        'event', c.title, 'at', r.created_at, 'hidden', r.hidden_at is not null) order by r.created_at desc)
        from public.host_reviews r left join public.custom_plans c on c.id = r.event_id where r.host_id = p_id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'who', a.actor_name, 'what', a.summary) order by a.at desc)
        from public.audit_log a where a.entity = 'host' and a.entity_id = p_id::text), '[]'::jsonb));
end $$;

create or replace function public.admin_event_history(p_id bigint)
returns table (at timestamptz, who text, action text, summary text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select a.at, a.actor_name, a.action, a.summary, a.details from public.audit_log a
  where (a.entity = 'event' and a.entity_id = p_id::text)
     or (a.entity = 'request' and (a.details ->> 'entity') = 'event' and (a.details ->> 'target_id') = p_id::text)
  order by a.at desc limit 200;
end $$;

create or replace function public.admin_activity(p_entity text default null, p_limit int default 200)
returns table (id bigint, at timestamptz, who text, action text, entity text, entity_id text, summary text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select a.id, a.at, a.actor_name, a.action, a.entity, a.entity_id, a.summary, a.details from public.audit_log a
  where p_entity is null or a.entity = p_entity
  order by a.at desc limit least(greatest(p_limit, 1), 1000);
end $$;

create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare j jsonb;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  with ev as (select c.*, private.event_display_status(c) ds,
                coalesce((select sum(pr.party_size) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status in ('approved', 'attended')), 0)::int booked
              from public.custom_plans c where c.deleted_at is null),
       rq as (select pr.*, coalesce(private.plan_city(pr.plan_ref), 'other') city from public.plan_requests pr)
  select jsonb_build_object(
    'events', jsonb_build_object(
       'active', (select count(*) from ev where ds = 'active'),
       'upcoming', (select count(*) from ev where ds = 'active' and starts_at > now()),
       'ongoing', (select count(*) from ev where ds = 'active' and starts_at <= now()),
       'completed', (select count(*) from ev where ds = 'completed'),
       'draft', (select count(*) from ev where ds = 'draft'),
       'pending', (select count(*) from ev where ds = 'pending'),
       'cancelled', (select count(*) from ev where ds = 'cancelled')),
    'by_city', coalesce((select jsonb_agg(x order by x ->> 'city') from (
       select jsonb_build_object('city', ci.slug, 'name', ci.name,
         'active', (select count(*) from ev where ev.city_slug = ci.slug and ds = 'active'),
         'completed', (select count(*) from ev where ev.city_slug = ci.slug and ds = 'completed'),
         'cancelled', (select count(*) from ev where ev.city_slug = ci.slug and ds = 'cancelled'),
         'requests', (select count(*) from rq where rq.city = ci.slug and rq.status <> 'cancelled'),
         'confirmed', (select coalesce(sum(party_size), 0) from rq where rq.city = ci.slug and rq.status in ('approved', 'attended'))) x
       from public.cities ci) s), '[]'::jsonb),
    'requests', jsonb_build_object(
       'total', (select count(*) from rq),
       'pending', (select count(*) from rq where status = 'pending'),
       'approved', (select count(*) from rq where status = 'approved'),
       'attended', (select count(*) from rq where status = 'attended'),
       'waitlisted', (select count(*) from rq where status = 'waitlisted'),
       'declined', (select count(*) from rq where status = 'declined'),
       'cancelled', (select count(*) from rq where status = 'cancelled'),
       'confirmed_seats', (select coalesce(sum(party_size), 0) from rq where status in ('approved', 'attended'))),
    'approvals', jsonb_build_object(
       'pending', (select count(*) from public.admin_requests where status = 'pending'),
       'waiting_for_me', (select count(*) from public.admin_requests where status = 'pending' and maker_id <> private.current_user_id()),
       'approved', (select count(*) from public.admin_requests where status = 'approved'),
       'rejected', (select count(*) from public.admin_requests where status = 'rejected')),
    'occupancy', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'city', city_slug, 'starts_at', starts_at,
       'seats', seats, 'booked', booked, 'status', ds) order by starts_at) from (select * from ev where ds in ('active', 'completed')
       order by abs(extract(epoch from starts_at - now())) limit 12) o), '[]'::jsonb),
    'hosts', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'city', h.city_slug, 'status', h.status,
       'events', (select count(*) from ev where ev.host_id = h.id and ds in ('active', 'completed')),
       'completed', (select count(*) from ev where ev.host_id = h.id and ds = 'completed'),
       'bookings', (select coalesce(sum(booked), 0) from ev where ev.host_id = h.id),
       'avg_rating', (select round(avg(r.rating)::numeric, 1) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null),
       'reviews', (select count(*) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null))
       order by h.name) from public.host_profiles h where h.deleted_at is null), '[]'::jsonb),
    'requests_14d', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'n',
       (select count(*) from rq where (rq.created_at at time zone 'Asia/Kolkata')::date = d::date)) order by d)
       from generate_series((now() at time zone 'Asia/Kolkata')::date - 13, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') d), '[]'::jsonb)
  ) into j;
  return j;
end $$;

create or replace function public.admin_team()
returns table (user_id uuid, display_name text, email text, avatar_url text, is_super boolean, cities text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select u.id, u.display_name, au.email::text, u.avatar_url, true, '{}'::text[]
  from public.main_admin_emails m left join auth.users au on lower(au.email) = m.email left join public.users u on u.auth_id = au.id
  union all
  select u.id, u.display_name, coalesce(p.email, au.email::text), u.avatar_url, false,
         (select array_agg(ca.city_slug order by ca.city_slug) from public.city_admins ca where ca.user_id = u.id)
  from public.users u left join public.user_private p on p.user_id = u.id left join auth.users au on au.id = u.auth_id
  where exists (select 1 from public.city_admins ca where ca.user_id = u.id);
end $$;
-- main-admin emails (shown even before Akash first logs in)
create or replace function public.admin_main_emails()
returns table (email text, joined boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query select m.email, exists (select 1 from auth.users au where lower(au.email) = m.email and au.email_confirmed_at is not null)
  from public.main_admin_emails m order by m.added_at;
end $$;

-- Sub-admins are now added/removed only through approved requests
revoke execute on function public.admin_add_city_admin(text, text) from authenticated;
revoke execute on function public.admin_remove_city_admin(uuid, text) from authenticated;

-- ---------- 10. Grants ----------
do $$ declare f text; begin
  foreach f in array array[
    'public.admin_notifications_mark_read(bigint[])', 'public.admin_save_push_sub(text, text, text)',
    'public.admin_submit_request(text, text, bigint, jsonb, text)', 'public.admin_decide_request(bigint, boolean, text)',
    'public.admin_resubmit_request(bigint, jsonb, text)', 'public.admin_withdraw_request(bigint)', 'public.admin_requests_list(text, int)',
    'public.admin_save_event_draft(bigint, jsonb)', 'public.admin_discard_draft(bigint)', 'public.submit_review(text, int, text)',
    'public.admin_hide_review(bigint, boolean)', 'public.admin_events()', 'public.admin_hosts()', 'public.admin_host_detail(bigint)',
    'public.admin_event_history(bigint)', 'public.admin_activity(text, int)', 'public.admin_dashboard()', 'public.admin_team()',
    'public.admin_main_emails()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.host_ratings(bigint[]) from public;
grant execute on function public.host_ratings(bigint[]) to anon, authenticated;
revoke all on function public.plan_reviews(text) from public;
grant execute on function public.plan_reviews(text) to anon, authenticated;

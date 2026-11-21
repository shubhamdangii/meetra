-- =====================================================================
-- meetra — database schema (Postgres 15+ on Supabase)
-- ---------------------------------------------------------------------
-- Run once in Supabase → SQL Editor (or `supabase db push`).
-- Sections:
--   0. Extensions & private schema
--   1. Helper: updated_at trigger
--   2. Tables
--   3. Indexes
--   4. Business-rule triggers (capacity, status changes, seat counter)
--   5. Row Level Security (RLS) policies
--   6. Grants (which columns the browser may read/write)
--   7. Supabase Auth hooks (Google / WhatsApp login → profile, verified flags)
--   8. Profile completeness (required fields before requesting a seat)
--   9. Profile photos (Storage bucket + policies)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions & private schema
-- ---------------------------------------------------------------------
-- (gen_random_uuid() is built into Postgres 13+, no extension needed.)

-- Helper functions live in a schema the Supabase API does NOT expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;  -- policies need to call them

-- ---------------------------------------------------------------------
-- 1. updated_at trigger (shared)
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- Cities the site runs in. Small lookup table so adding Udaipur is one INSERT.
create table public.cities (
  slug        text primary key check (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  name        text not null,
  is_live     boolean not null default false,
  timezone    text not null default 'Asia/Kolkata',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Members. PUBLIC profile only — what other guests see on a host card or review.
-- NO phone, email, full name or birth date here (see user_private).
create table public.users (
  id           uuid primary key default gen_random_uuid(),
  auth_id      uuid unique references auth.users (id) on delete cascade,    -- Supabase login (deleting it deletes the profile)
  display_name text not null check (char_length(display_name) between 1 and 60),  -- first name shown to others
  avatar_url   text check (avatar_url is null or avatar_url ~ '^https://'),
  bio          text check (char_length(bio) <= 500),
  city_slug    text references public.cities (slug) on update cascade,
  occupation   text check (char_length(occupation) <= 80),                  -- "Designer at …", "Student"
  role         text not null default 'member' check (role in ('member', 'admin')),
  is_banned    boolean not null default false,
  -- Both set automatically by private.refresh_profile_status:
  -- profile_score 0–100 = how much of the profile is filled and verified.
  -- Seats and the waiting list go to higher scores first.
  profile_score        smallint not null default 0 check (profile_score between 0 and 100),
  -- set when every profile field is filled; NULL = not complete yet (no one is blocked by it)
  profile_completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- PRIVATE profile: identity and contact details, protected row by row.
-- Visible only to: the member, hosts of events the member requested, admins.
create table public.user_private (
  user_id           uuid primary key references public.users (id) on delete cascade,
  full_name         text check (char_length(full_name) between 2 and 100),
  date_of_birth     date check (date_of_birth > date '1900-01-01'),        -- 18+ is checked by trigger
  gender            text check (gender in ('woman', 'man', 'non_binary', 'prefer_not_to_say')),
  phone             text check (phone ~ '^\+[1-9][0-9]{7,14}$'),           -- WhatsApp number, E.164: +919876543210
  phone_verified_at timestamptz,     -- set ONLY from Supabase Auth (WhatsApp OTP); members can't set it
  email             text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_verified_at timestamptz,     -- set ONLY from Supabase Auth (Google login)
  instagram_url     text check (instagram_url is null or instagram_url ~* '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$'),
  linkedin_url      text check (linkedin_url  is null or linkedin_url  ~* '^https://([a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_-]{3,100}/?$'),
  heard_from        text check (char_length(heard_from) <= 100),            -- "Instagram", "a friend", …
  accepted_rules_at timestamptz,     -- ticked "I agree to the house rules"
  whatsapp_ok       boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Hosts are members verified by the team.
create table public.hosts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references public.users (id) on delete cascade,
  city_slug    text not null references public.cities (slug) on update cascade,
  headline     text check (char_length(headline) <= 140),
  bio          text check (char_length(bio) <= 1000),
  status       text not null default 'pending' check (status in ('pending', 'active', 'paused', 'removed')),
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint hosts_active_needs_verification check (status <> 'active' or verified_at is not null)
);

-- One row per dated meetup (each date of a recurring plan is its own row).
create table public.events (
  id            bigint generated always as identity primary key,
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  template_key  text,                     -- e.g. 'introverts-dinner'; groups the dates of a recurring plan
  host_id       uuid not null references public.hosts (id) on delete restrict,
  city_slug     text not null references public.cities (slug) on update cascade,
  category      text not null check (category in ('food', 'sports', 'games', 'night', 'outing', 'art', 'film', 'trips')),
  title         text not null check (char_length(title) between 3 and 120),
  description   text check (char_length(description) <= 4000),
  area          text not null check (char_length(area) <= 80),     -- shown publicly ("C-Scheme")
  address       text check (char_length(address) <= 300),          -- exact spot; shown only after approval (see README)
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  price_type    text not null check (price_type in ('free', 'reservation', 'per_person', 'estimate')),
  price_paise   integer not null default 0 check (price_paise >= 0), -- money in paise: ₹99 = 9900
  capacity      integer not null check (capacity between 1 and 500),
  seats_taken   integer not null default 0 check (seats_taken >= 0), -- maintained by trigger
  women_only    boolean not null default false,
  status        text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint events_time_order   check (ends_at > starts_at),
  constraint events_max_length   check (ends_at - starts_at <= interval '4 days'),
  constraint events_free_is_zero check ((price_type = 'free') = (price_paise = 0)),
  constraint events_not_overfull check (seats_taken <= capacity)
);

-- A member asking for a seat. One row per member per event.
create table public.seat_requests (
  id           bigint generated always as identity primary key,
  event_id     bigint not null references public.events (id) on delete cascade,
  user_id      uuid   not null references public.users (id) on delete cascade,
  party_size   smallint not null default 1 check (party_size between 1 and 2),  -- 2 = bringing a friend
  icebreaker   text check (char_length(icebreaker) <= 300),
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'waitlisted', 'declined', 'cancelled', 'attended', 'no_show')),
  decided_at   timestamptz,          -- when the host approved / declined
  paid_at      timestamptz,          -- set by the payment webhook (not built yet)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint seat_requests_one_per_user unique (event_id, user_id)
);

-- ♥ saved plans.
create table public.saved_events (
  user_id     uuid   not null references public.users (id) on delete cascade,
  event_id    bigint not null references public.events (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- Reviews, only from members who attended (enforced by RLS + trigger).
create table public.reviews (
  id           bigint generated always as identity primary key,
  event_id     bigint not null references public.events (id) on delete cascade,
  user_id      uuid   not null references public.users (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  headline     text check (char_length(headline) <= 120),
  body         text check (char_length(body) <= 2000),
  is_public    boolean not null default false,       -- member agrees to show it on the site
  status       text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reviews_one_per_user unique (event_id, user_id)
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['cities','users','user_private','hosts','events','seat_requests','saved_events','reviews'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Indexes (for the site's main queries)
-- ---------------------------------------------------------------------
-- Explore page: upcoming published events in a city, by date (optionally by category).
create index events_city_date_idx
  on public.events (city_slug, starts_at)
  where status = 'published';
create index events_city_category_date_idx
  on public.events (city_slug, category, starts_at)
  where status = 'published';
-- Host dashboard + FK lookups.
create index events_host_date_idx      on public.events (host_id, starts_at);
-- "More dates for this plan".
create index events_template_date_idx  on public.events (template_key, city_slug, starts_at) where template_key is not null;

-- Seat requests: by event (host sees the list) — covered by unique (event_id, user_id);
-- plus by event+status for "approved / waitlist" lists.
create index seat_requests_event_status_idx on public.seat_requests (event_id, status);
-- Your plans page: a member's requests, newest first.
create index seat_requests_user_idx         on public.seat_requests (user_id, created_at desc);

-- Saved events by user — covered by the primary key (user_id, event_id).
-- Reverse lookup (FK cascade when an event is deleted, "how many saved this").
create index saved_events_event_idx on public.saved_events (event_id);

-- Reviews: per event, per user, and the public wall (newest published first).
create index reviews_event_idx      on public.reviews (event_id);
create index reviews_user_idx       on public.reviews (user_id);
create index reviews_public_wall_idx on public.reviews (created_at desc) where status = 'published' and is_public;

-- Lookups used inside RLS helper functions.
create index users_city_idx on public.users (city_slug);
create index hosts_city_idx on public.hosts (city_slug) where status = 'active';
-- (users.auth_id and hosts.user_id are already indexed by their UNIQUE constraints.)

-- ---------------------------------------------------------------------
-- 4. Helper functions used by policies and triggers
--    SECURITY DEFINER = runs with the owner's rights, so policies can look
--    things up without recursive RLS checks. search_path is pinned for safety.
-- ---------------------------------------------------------------------
create or replace function private.current_user_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.users u where u.auth_id = auth.uid() and not u.is_banned
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users u
                 where u.auth_id = auth.uid() and u.role = 'admin' and not u.is_banned)
$$;

-- Is the logged-in member the host of this event?
create or replace function private.is_event_host(p_event_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    join public.hosts h on h.id = e.host_id
    where e.id = p_event_id
      and h.user_id = (select private.current_user_id())
      and h.status = 'active')
$$;

-- Set-returning helpers, evaluated ONCE per query inside policies
-- (much faster than calling a function for each of 100,000 rows).
create or replace function private.my_hosted_event_ids()
returns setof bigint language sql stable security definer set search_path = '' as $$
  select e.id from public.events e
  join public.hosts h on h.id = e.host_id
  where h.user_id = (select private.current_user_id()) and h.status = 'active'
$$;

create or replace function private.my_host_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select h.id from public.hosts h where h.user_id = (select private.current_user_id())
$$;

create or replace function private.my_active_host_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select h.id from public.hosts h where h.user_id = (select private.current_user_id()) and h.status = 'active'
$$;

-- Whose phone numbers may the logged-in member see (besides their own)?
-- Members who requested a seat at an event they host, while that event is
-- upcoming or ended less than 7 days ago (hosts don't keep access forever).
create or replace function private.visible_contact_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct sr.user_id
  from public.seat_requests sr
  join public.events e on e.id = sr.event_id
  join public.hosts  h on h.id = e.host_id
  where h.user_id = (select private.current_user_id())
    and h.status = 'active'
    and sr.status in ('pending', 'approved', 'waitlisted', 'attended')
    and e.ends_at > now() - interval '7 days'
$$;

-- Did this member attend this event (used for reviews)?
create or replace function private.attended(p_event_id bigint, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.seat_requests sr
                 where sr.event_id = p_event_id and sr.user_id = p_user_id and sr.status = 'attended')
$$;

-- The browser doesn't need to know its own users.id: these default to "me".
alter table public.seat_requests alter column user_id set default private.current_user_id();
alter table public.saved_events  alter column user_id set default private.current_user_id();
alter table public.reviews       alter column user_id set default private.current_user_id();

-- "Who am I?" for the logged-in browser (includes role, which is otherwise hidden).
create or replace function public.me()
returns table (id uuid, display_name text, avatar_url text, city_slug text, role text, is_host boolean,
               profile_score smallint, profile_complete boolean, phone_verified boolean, email_verified boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.display_name, u.avatar_url, u.city_slug, u.role,
         exists (select 1 from public.hosts h where h.user_id = u.id and h.status = 'active'),
         u.profile_score,
         u.profile_completed_at is not null,
         p.phone_verified_at is not null,
         p.email_verified_at is not null
  from public.users u
  left join public.user_private p on p.user_id = u.id
  where u.auth_id = auth.uid()
$$;
revoke all on function public.me() from public, anon;
grant execute on function public.me() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Business-rule triggers
-- ---------------------------------------------------------------------

-- Seat requests: who may change what, and never overfill an event.
-- A request "holds seats" while approved or attended.
create or replace function private.seat_request_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_server boolean := auth.uid() is null;          -- SQL editor / service role / seed script
  is_host   boolean;
  is_admin  boolean;
  holds_old boolean;
  holds_new boolean;
  ev        public.events%rowtype;
begin
  if not is_server then
    is_host  := private.is_event_host(new.event_id);
    is_admin := private.is_admin();

    if tg_op = 'INSERT' then
      -- Members can only create their own request, and it always starts as pending.
      if new.status <> 'pending' or new.paid_at is not null or new.decided_at is not null then
        raise exception 'New seat requests must be pending' using errcode = 'check_violation';
      end if;
    elsif not (is_host or is_admin) then
      -- Members may only cancel, and may not change anything else.
      if new.status <> 'cancelled'
         or new.event_id <> old.event_id or new.user_id <> old.user_id
         or new.party_size <> old.party_size or new.paid_at is distinct from old.paid_at then
        raise exception 'You can only cancel your own request' using errcode = 'insufficient_privilege';
      end if;
    elsif new.paid_at is distinct from old.paid_at and not is_admin then
      raise exception 'Payments are recorded by the server only' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'declined', 'waitlisted') then
    new.decided_at := coalesce(new.decided_at, now());
  end if;

  -- Capacity check (row lock on the event serialises concurrent approvals).
  holds_old := tg_op = 'UPDATE' and old.status in ('approved', 'attended');
  holds_new := new.status in ('approved', 'attended');
  if holds_new and (not holds_old or new.party_size > old.party_size) then
    select * into ev from public.events where id = new.event_id for update;
    if ev.seats_taken - (case when holds_old then old.party_size else 0 end) + new.party_size > ev.capacity then
      raise exception 'Event % is full', new.event_id using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger seat_requests_rules
  before insert or update on public.seat_requests
  for each row execute function private.seat_request_rules();

-- Keep events.seats_taken in sync (so the public site can show "4 seats left"
-- without being allowed to read anyone's seat request).
create or replace function private.seat_request_counter()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_hold int := 0;
  new_hold int := 0;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status in ('approved', 'attended') then old_hold := old.party_size; end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status in ('approved', 'attended') then new_hold := new.party_size; end if;

  if tg_op = 'UPDATE' and old.event_id <> new.event_id then
    update public.events set seats_taken = seats_taken - old_hold where id = old.event_id;
    update public.events set seats_taken = seats_taken + new_hold where id = new.event_id;
  elsif tg_op = 'DELETE' then
    update public.events set seats_taken = seats_taken - old_hold where id = old.event_id;
  elsif new_hold <> old_hold then
    update public.events set seats_taken = seats_taken + (new_hold - old_hold) where id = new.event_id;
  end if;
  return null;
end $$;

create trigger seat_requests_counter
  after insert or update or delete on public.seat_requests
  for each row execute function private.seat_request_counter();

-- Hosts may not rewrite who hosts an event, change its counter, or move it to another host.
create or replace function private.event_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Updates made by our own triggers (the seat counter) are always allowed.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'UPDATE' and (new.host_id <> old.host_id or new.seats_taken <> old.seats_taken) then
      raise exception 'Only admins can change the host or seat count' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'INSERT' and new.seats_taken <> 0 then
      raise exception 'seats_taken starts at 0' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger events_rules
  before insert or update on public.events
  for each row execute function private.event_rules();

-- Reviews: only after the event ended; members can't self-publish.
create or replace function private.review_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'INSERT' and not exists (select 1 from public.events e where e.id = new.event_id and e.ends_at < now()) then
      raise exception 'You can review a plan after it ends' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' then
      new.status := 'pending';
    elsif new.status <> old.status or new.event_id <> old.event_id or new.user_id <> old.user_id then
      raise exception 'Only admins can moderate reviews' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

create trigger reviews_rules
  before insert or update on public.reviews
  for each row execute function private.review_rules();

-- ---------------------------------------------------------------------
-- 6. Row Level Security
--    RLS is ON for every table: with no matching policy, access is denied.
-- ---------------------------------------------------------------------
alter table public.cities        enable row level security;
alter table public.users         enable row level security;
alter table public.user_private  enable row level security;
alter table public.hosts         enable row level security;
alter table public.events        enable row level security;
alter table public.seat_requests enable row level security;
alter table public.saved_events  enable row level security;
alter table public.reviews       enable row level security;

-- cities: public read; admins manage.
create policy cities_read  on public.cities for select to anon, authenticated using (true);
create policy cities_admin on public.cities for all    to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- users: public profile is readable (names on reviews & host cards).
-- Which COLUMNS are readable is limited by grants in section 7.
create policy users_read        on public.users for select to anon, authenticated using (not is_banned or id = (select private.current_user_id()));
create policy users_update_self on public.users for update to authenticated
  using (auth_id = auth.uid()) with check (auth_id = auth.uid());
create policy users_admin       on public.users for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- user_private (PHONE NUMBERS): owner, the event's host, admins. Nobody else.
create policy user_private_read on public.user_private for select to authenticated
  using (
    user_id = (select private.current_user_id())
    or (select private.is_admin())
    or user_id in (select private.visible_contact_ids())
  );
create policy user_private_insert_self on public.user_private for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy user_private_update_self on public.user_private for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy user_private_admin on public.user_private for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
-- (no policy for anon: logged-out visitors can never read this table)

-- hosts: active hosts are public; a host can edit their own bio; admins verify.
create policy hosts_read        on public.hosts for select to anon, authenticated
  using (status = 'active' or user_id = (select private.current_user_id()));
create policy hosts_update_self on public.hosts for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy hosts_apply       on public.hosts for insert to authenticated
  with check (user_id = (select private.current_user_id()) and status = 'pending' and verified_at is null);
create policy hosts_admin       on public.hosts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
-- Note: hosts_update_self + column grants (section 7) stop hosts verifying themselves.

-- events: published/completed/cancelled are public; hosts manage their own; admins all.
create policy events_read on public.events for select to anon, authenticated
  using (status in ('published', 'completed', 'cancelled')
         or host_id in (select private.my_host_ids()));
create policy events_host_insert on public.events for insert to authenticated
  with check (host_id in (select private.my_active_host_ids()));
create policy events_host_update on public.events for update to authenticated
  using (host_id in (select private.my_active_host_ids()))
  with check (host_id in (select private.my_active_host_ids()));
create policy events_admin on public.events for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- seat_requests: the member, the event's host, admins.
create policy seat_requests_read on public.seat_requests for select to authenticated
  using (user_id = (select private.current_user_id())
         or event_id in (select private.my_hosted_event_ids())
         or (select private.is_admin()));
create policy seat_requests_insert_self on public.seat_requests for insert to authenticated
  with check (user_id = (select private.current_user_id())
              and exists (select 1 from public.events e
                          where e.id = event_id and e.status = 'published' and e.starts_at > now()));
create policy seat_requests_update on public.seat_requests for update to authenticated
  using (user_id = (select private.current_user_id()) or event_id in (select private.my_hosted_event_ids()) or (select private.is_admin()))
  with check (user_id = (select private.current_user_id()) or event_id in (select private.my_hosted_event_ids()) or (select private.is_admin()));
-- (what each of them may change is enforced by the seat_request_rules trigger)
create policy seat_requests_admin_delete on public.seat_requests for delete to authenticated
  using ((select private.is_admin()));

-- saved_events: strictly your own.
create policy saved_events_own on public.saved_events for all to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));

-- reviews: published+public ones are readable by everyone; you see your own; admins all.
create policy reviews_read on public.reviews for select to anon, authenticated
  using ((status = 'published' and is_public) or user_id = (select private.current_user_id()));
create policy reviews_insert_attended on public.reviews for insert to authenticated
  with check (user_id = (select private.current_user_id()) and private.attended(event_id, user_id));
create policy reviews_update_own on public.reviews for update to authenticated
  using (user_id = (select private.current_user_id()))
  with check (user_id = (select private.current_user_id()));
create policy reviews_delete_own on public.reviews for delete to authenticated
  using (user_id = (select private.current_user_id()));
create policy reviews_admin on public.reviews for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- 7. Grants — column-level limits on top of RLS
--    RLS decides WHICH ROWS; grants decide WHICH COLUMNS.
--    Note: with column grants, the browser must list columns explicitly
--    (select=id,display_name) — `select *` on users/hosts is refused.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.cities to anon, authenticated;
grant insert, update, delete on public.cities to authenticated;          -- RLS: admins only

-- users: hide auth_id, role, is_banned from the browser.
grant select (id, display_name, avatar_url, bio, city_slug, occupation, profile_completed_at, created_at)
  on public.users to anon, authenticated;
grant update (display_name, avatar_url, bio, city_slug, occupation) on public.users to authenticated;

-- user_private: the row is created at sign-up; members edit their own fields
-- but can NEVER set phone_verified_at / email_verified_at (only login does).
grant select on public.user_private to authenticated;                    -- RLS restricts rows
grant update (full_name, date_of_birth, gender, phone, email, instagram_url, linkedin_url,
              heard_from, accepted_rules_at, whatsapp_ok)
  on public.user_private to authenticated;

-- hosts: members can apply and edit text; never set status/verified_at themselves.
grant select (id, user_id, city_slug, headline, bio, status, verified_at, created_at) on public.hosts to anon, authenticated;
grant insert (user_id, city_slug, headline, bio)                                     on public.hosts to authenticated;
grant update (headline, bio)                                                         on public.hosts to authenticated;

-- events: everything except the exact address is public.
grant select (id, slug, template_key, host_id, city_slug, category, title, description, area,
              starts_at, ends_at, price_type, price_paise, capacity, seats_taken, women_only, status, created_at, updated_at)
  on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;                  -- RLS: hosts (own) and admins

grant select, insert, update, delete on public.seat_requests to authenticated;
grant select, insert, delete on public.saved_events to authenticated;
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;

-- Admin tools that need hidden columns (role, address, …) should run on a
-- server with the secret key, or through security-definer functions.
-- The exact address is released through this function only to approved guests, the host and admins:
create or replace function public.event_address(p_event_id bigint)
returns text language sql stable security definer set search_path = '' as $$
  select e.address from public.events e
  where e.id = p_event_id
    and (private.is_event_host(e.id) or private.is_admin()
         or exists (select 1 from public.seat_requests sr
                    where sr.event_id = e.id and sr.user_id = private.current_user_id()
                      and sr.status in ('approved', 'attended')))
$$;
revoke all on function public.event_address(bigint) from public, anon;
grant execute on function public.event_address(bigint) to authenticated;

grant usage on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 8. Login (Supabase Auth) → profile
--    Google login:   email + email_confirmed_at, name and photo in metadata.
--    WhatsApp login: phone + phone_confirmed_at (after the OTP is entered).
-- ---------------------------------------------------------------------
create or replace function private.e164(p text)
returns text language sql immutable as $$
  select case when p ~ '^\+?[1-9][0-9]{7,14}$' then '+' || ltrim(p, '+') end
$$;

create or replace function private.clean_email(p text)
returns text language sql immutable as $$
  select case when p ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(p) end
$$;

-- New login → create the member's public and private rows, pre-filled from Google.
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_id   uuid;
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  fullname text  := nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), '');
  photo    text  := coalesce(meta ->> 'avatar_url', meta ->> 'picture');
  ph       text  := private.e164(new.phone);
  em       text  := private.clean_email(new.email);
begin
  insert into public.users (auth_id, display_name, avatar_url)
  values (new.id,
          left(coalesce(split_part(fullname, ' ', 1), 'New member'), 60),
          case when photo ~ '^https://' then photo end)
  returning id into new_id;

  insert into public.user_private (user_id, full_name, phone, phone_verified_at, email, email_verified_at)
  values (new_id,
          case when char_length(fullname) between 2 and 100 then fullname end,
          ph, case when ph is not null then new.phone_confirmed_at end,
          em, case when em is not null then new.email_confirmed_at end);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Login details confirmed later (WhatsApp OTP entered, phone/email added) → mark verified.
create or replace function private.handle_auth_user_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ph text := private.e164(new.phone);
  em text := private.clean_email(new.email);
begin
  update public.user_private p
     set phone             = case when ph is not null and new.phone_confirmed_at is not null then ph else p.phone end,
         phone_verified_at = case when ph is not null and new.phone_confirmed_at is not null then new.phone_confirmed_at else p.phone_verified_at end,
         email             = case when em is not null and new.email_confirmed_at is not null then em else p.email end,
         email_verified_at = case when em is not null and new.email_confirmed_at is not null then new.email_confirmed_at else p.email_verified_at end
   where p.user_id = (select u.id from public.users u where u.auth_id = new.id);
  return new;
end $$;

create trigger on_auth_user_updated
  after update of phone, email, phone_confirmed_at, email_confirmed_at on auth.users
  for each row execute function private.handle_auth_user_updated();

-- Member edits their private profile: 18+ only; changing a verified number or
-- email removes its "verified" mark until it is confirmed again through login.
create or replace function private.user_private_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.date_of_birth is not null and new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'You must be 18 or older to join' using errcode = 'check_violation';
  end if;
  if auth.uid() is not null and tg_op = 'UPDATE' then          -- a member, not the login system
    if new.phone is distinct from old.phone then new.phone_verified_at := null; end if;
    if new.email is distinct from old.email then new.email_verified_at := null; end if;
  end if;
  return new;
end $$;

create trigger user_private_rules
  before insert or update on public.user_private
  for each row execute function private.user_private_rules();

-- PROFILE SCORE (0–100): nobody is blocked; more details = higher priority.
-- Keep these weights in sync with docs/profile.html (scoreParts).
--   photo 15 · first name 5 · city 5 · occupation 5 · bio 20+ chars 10 · bio 80+ chars 5
--   full name 5 · date of birth 5 · gender 5
--   WhatsApp number 5 · WhatsApp verified 10 · email 5 · email verified 5
--   Instagram 5 · LinkedIn 5 · house rules accepted 5
-- PROFILE COMPLETE = every item except the second social link and long bio,
-- with at least one of phone/email verified.
create or replace function private.refresh_profile_status(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  u     public.users%rowtype;
  p     public.user_private%rowtype;
  bio   int;
  score int;
  done  boolean;
begin
  select * into u from public.users where id = p_user_id;
  select * into p from public.user_private where user_id = p_user_id;
  if u.id is null then return; end if;
  bio := char_length(trim(coalesce(u.bio, '')));

  score := (case when u.avatar_url is not null then 15 else 0 end)
         + (case when u.display_name <> 'New member' then 5 else 0 end)
         + (case when u.city_slug is not null then 5 else 0 end)
         + (case when nullif(trim(u.occupation), '') is not null then 5 else 0 end)
         + (case when bio >= 20 then 10 else 0 end)
         + (case when bio >= 80 then 5 else 0 end)
         + (case when p.full_name is not null then 5 else 0 end)
         + (case when p.date_of_birth is not null then 5 else 0 end)
         + (case when p.gender is not null then 5 else 0 end)
         + (case when p.phone is not null then 5 else 0 end)
         + (case when p.phone_verified_at is not null then 10 else 0 end)
         + (case when p.email is not null then 5 else 0 end)
         + (case when p.email_verified_at is not null then 5 else 0 end)
         + (case when p.instagram_url is not null then 5 else 0 end)
         + (case when p.linkedin_url is not null then 5 else 0 end)
         + (case when p.accepted_rules_at is not null then 5 else 0 end);

  done := u.display_name <> 'New member' and u.avatar_url is not null and u.city_slug is not null
          and nullif(trim(u.occupation), '') is not null and bio >= 20
          and p.full_name is not null and p.date_of_birth is not null and p.gender is not null
          and p.phone is not null and p.email is not null
          and (p.instagram_url is not null or p.linkedin_url is not null)
          and p.accepted_rules_at is not null
          and (p.phone_verified_at is not null or p.email_verified_at is not null);
  done := coalesce(done, false);

  update public.users
     set profile_score = score,
         profile_completed_at = case when done then coalesce(profile_completed_at, now()) end
   where id = p_user_id
     and (profile_score <> score or (profile_completed_at is null) = done);   -- only when something changed
end $$;

create or replace function private.refresh_profile_status_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'users' then
    perform private.refresh_profile_status(new.id);
  else
    perform private.refresh_profile_status(new.user_id);
  end if;
  return null;
end $$;

create trigger users_profile_status
  after update of display_name, avatar_url, bio, city_slug, occupation on public.users
  for each row execute function private.refresh_profile_status_trg();
create trigger user_private_profile_status
  after insert or update on public.user_private
  for each row execute function private.refresh_profile_status_trg();

-- ---------------------------------------------------------------------
-- 9. Profile photos (Supabase Storage)
--    Public bucket "avatars"; each member may only write inside a folder
--    named after their own login id: avatars/<auth uid>/photo.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Starter data
insert into public.cities (slug, name, is_live) values
  ('jaipur', 'Jaipur', true),
  ('ahmedabad', 'Ahmedabad', true),
  ('udaipur', 'Udaipur', false);

-- =====================================================================
-- 10. PLANS ON THE WEBSITE: seat requests, waiting list, swipe interest
--     The meetups on the site still come from docs/assets/js/data.js, so
--     these tables point at a plan by its website id (plan_ref), e.g.
--     'introverts-dinner-jaipur-20261123' (the part after event.html#).
--
--     PRIORITY: anyone logged in can request. Seats and waiting-list places
--     go to the highest profile_score first, then whoever asked earlier.
-- =====================================================================

create table public.plan_requests (
  id          bigint generated always as identity primary key,
  plan_ref    text not null check (plan_ref ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  user_id     uuid not null default private.current_user_id() references public.users (id) on delete cascade,
  party_size  smallint not null default 1 check (party_size between 1 and 2),
  icebreaker  text check (char_length(icebreaker) <= 300),
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'waitlisted', 'declined', 'cancelled')),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint plan_requests_one_per_user unique (plan_ref, user_id)
);
create index plan_requests_plan_status_idx on public.plan_requests (plan_ref, status);
create index plan_requests_user_idx        on public.plan_requests (user_id, created_at desc);
create trigger plan_requests_set_updated_at before update on public.plan_requests
  for each row execute function private.set_updated_at();

-- Swipe interest. One row per device per plan (works logged out too);
-- user_id is filled in when the swiper is logged in.
create table public.plan_interest (
  device_id   uuid not null,
  plan_ref    text not null check (plan_ref ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  user_id     uuid references public.users (id) on delete set null,
  reaction    text not null check (reaction in ('interested', 'skip')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (device_id, plan_ref)
);
create index plan_interest_plan_idx on public.plan_interest (plan_ref, reaction);
create trigger plan_interest_set_updated_at before update on public.plan_interest
  for each row execute function private.set_updated_at();

-- Members can only ask, cancel, or ask again after cancelling.
-- Approving, declining and waitlisting is done by admins (or admin_fill_plan).
create or replace function private.plan_request_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin() then
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
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'declined', 'waitlisted')
     and (auth.uid() is null or private.is_admin()) then
    new.decided_at := now();
  end if;
  return new;
end $$;

create trigger plan_requests_rules
  before insert or update on public.plan_requests
  for each row execute function private.plan_request_rules();

alter table public.plan_requests enable row level security;
alter table public.plan_interest enable row level security;

create policy plan_requests_read on public.plan_requests for select to authenticated
  using (user_id = (select private.current_user_id()) or (select private.is_admin()));
create policy plan_requests_insert_self on public.plan_requests for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy plan_requests_update on public.plan_requests for update to authenticated
  using (user_id = (select private.current_user_id()) or (select private.is_admin()))
  with check (user_id = (select private.current_user_id()) or (select private.is_admin()));
create policy plan_requests_admin_delete on public.plan_requests for delete to authenticated
  using ((select private.is_admin()));
create policy plan_interest_admin_read on public.plan_interest for select to authenticated
  using ((select private.is_admin()));
-- (nobody writes plan_interest directly; the browser uses record_interest())

-- Supabase gives new tables full access by default; take it back, then grant only what's needed.
revoke all on public.plan_requests, public.plan_interest from anon, authenticated;
grant select on public.plan_requests to authenticated;
grant insert (plan_ref, party_size, icebreaker, status) on public.plan_requests to authenticated;
grant update (status, party_size, icebreaker)           on public.plan_requests to authenticated;
grant delete on public.plan_requests to authenticated;            -- RLS: admins only
grant select on public.plan_interest to authenticated;            -- RLS: admins only

-- Swipe right / left. Anyone may call it (logged in or not).
create or replace function public.record_interest(p_device uuid, p_plan_ref text, p_reaction text)
returns void language sql security definer set search_path = '' as $$
  insert into public.plan_interest (device_id, plan_ref, user_id, reaction)
  values (p_device, p_plan_ref, private.current_user_id(), p_reaction)
  on conflict (device_id, plan_ref) do update
    set reaction = excluded.reaction,
        user_id  = coalesce(excluded.user_id, public.plan_interest.user_id)
$$;
revoke all on function public.record_interest(uuid, text, text) from public;
grant execute on function public.record_interest(uuid, text, text) to anon, authenticated;

-- Public numbers for plan pages: confirmed seats, waiting list, interested.
-- Counts only, no names or personal data.
create or replace function public.plan_counts(p_refs text[])
returns table (plan_ref text, approved_seats int, waitlisted int, interested int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if cardinality(p_refs) > 300 then
    raise exception 'Ask for at most 300 plans at a time' using errcode = 'program_limit_exceeded';
  end if;
  return query
  select r.ref,
         coalesce((select sum(pr.party_size)::int from public.plan_requests pr where pr.plan_ref = r.ref and pr.status = 'approved'), 0),
         coalesce((select count(*)::int from public.plan_requests pr where pr.plan_ref = r.ref and pr.status = 'waitlisted'), 0),
         coalesce((select count(*)::int from public.plan_interest pi where pi.plan_ref = r.ref and pi.reaction = 'interested'), 0)
  from unnest(p_refs) as r(ref);
end $$;
revoke all on function public.plan_counts(text[]) from public;
grant execute on function public.plan_counts(text[]) to anon, authenticated;

-- "You're #3 on the waiting list" (by priority: profile score, then time).
create or replace function public.my_waitlist_position(p_plan_ref text)
returns int language sql stable security definer set search_path = '' as $$
  select x.pos::int from (
    select r.user_id, row_number() over (order by u.profile_score desc, r.created_at) as pos
    from public.plan_requests r join public.users u on u.id = r.user_id
    where r.plan_ref = p_plan_ref and r.status = 'waitlisted'
  ) x
  where x.user_id = private.current_user_id()
$$;
revoke all on function public.my_waitlist_position(text) from public, anon;
grant execute on function public.my_waitlist_position(text) to authenticated;

-- ---------- Admin tools (each checks the caller is an admin) ----------

-- Everyone who asked for one plan, best profiles first, with contact details.
create or replace function public.admin_plan_queue(p_plan_ref text)
returns table (request_id bigint, display_name text, full_name text, avatar_url text, phone text, email text,
               instagram_url text, linkedin_url text, occupation text, profile_score smallint,
               phone_verified boolean, email_verified boolean, status text, party_size smallint,
               icebreaker text, requested_at timestamptz, priority int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select q.* from (
    select r.id, u.display_name, p.full_name, u.avatar_url, p.phone, p.email, p.instagram_url, p.linkedin_url,
           u.occupation, u.profile_score, p.phone_verified_at is not null, p.email_verified_at is not null,
           r.status, r.party_size, r.icebreaker, r.created_at,
           (row_number() over (order by (r.status in ('cancelled', 'declined')), u.profile_score desc, r.created_at))::int as prio
    from public.plan_requests r
    join public.users u on u.id = r.user_id
    left join public.user_private p on p.user_id = u.id
    where r.plan_ref = p_plan_ref
  ) q
  order by q.prio;
end $$;

-- Fill a plan automatically: keep everyone already approved, then approve the
-- highest-priority pending / waiting people until the seats run out; everyone
-- else goes on the waiting list in priority order. Run again after a cancellation.
create or replace function public.admin_fill_plan(p_plan_ref text, p_capacity int)
returns table (approved int, waitlisted int, seats_left int)
language plpgsql security definer set search_path = '' as $$
declare
  left_seats int;
  a int := 0;
  w int := 0;
  r record;
begin
  if not private.is_admin() then raise exception 'Admins only' using errcode = 'insufficient_privilege'; end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 500 then raise exception 'Capacity must be 1 to 500'; end if;
  perform pg_advisory_xact_lock(hashtext('plan:' || p_plan_ref));   -- one fill at a time per plan

  select p_capacity - coalesce(sum(pr.party_size), 0) into left_seats
  from public.plan_requests pr where pr.plan_ref = p_plan_ref and pr.status = 'approved';

  for r in
    select pr.id, pr.party_size, pr.status from public.plan_requests pr join public.users u on u.id = pr.user_id
    where pr.plan_ref = p_plan_ref and pr.status in ('pending', 'waitlisted')
    order by u.profile_score desc, pr.created_at
  loop
    if r.party_size <= left_seats then
      update public.plan_requests set status = 'approved' where id = r.id;
      left_seats := left_seats - r.party_size; a := a + 1;
    else
      if r.status <> 'waitlisted' then
        update public.plan_requests set status = 'waitlisted' where id = r.id;
      end if;
      w := w + 1;
    end if;
  end loop;
  return query select a, w, greatest(left_seats, 0);
end $$;

-- Interest and demand for every plan that has any activity.
create or replace function public.admin_interest_summary()
returns table (plan_ref text, interested int, skipped int, requests int, approved_seats int, waitlisted int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  with refs as (select pi.plan_ref as ref from public.plan_interest pi union select pr.plan_ref from public.plan_requests pr)
  select refs.ref,
         (select count(*)::int from public.plan_interest x where x.plan_ref = refs.ref and x.reaction = 'interested'),
         (select count(*)::int from public.plan_interest x where x.plan_ref = refs.ref and x.reaction = 'skip'),
         (select count(*)::int from public.plan_requests x where x.plan_ref = refs.ref and x.status <> 'cancelled'),
         (select coalesce(sum(x.party_size), 0)::int from public.plan_requests x where x.plan_ref = refs.ref and x.status = 'approved'),
         (select count(*)::int from public.plan_requests x where x.plan_ref = refs.ref and x.status = 'waitlisted')
  from refs;
end $$;

revoke all on function public.admin_plan_queue(text)      from public, anon;
revoke all on function public.admin_fill_plan(text, int)  from public, anon;
revoke all on function public.admin_interest_summary()    from public, anon;
grant execute on function public.admin_plan_queue(text)     to authenticated;
grant execute on function public.admin_fill_plan(text, int) to authenticated;
grant execute on function public.admin_interest_summary()   to authenticated;

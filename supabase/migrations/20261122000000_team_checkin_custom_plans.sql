-- =====================================================================
-- Team roles, door check-in and plans added from the admin page.
--
--  * Main admin  = users.role = 'admin'. Can do everything, and is the only
--                  one who can add or remove city admins.
--  * City admin  = a row in city_admins. Can run ONLY their city: approve /
--                  decline seat requests, check guests in at the door, move
--                  host applications, and add / edit plans for that city.
--                  Cannot manage the team, delete data or see other cities.
--  * Door check-in: an approved request becomes 'attended' when its pass is scanned.
--  * custom_plans: one-off plans (launches, specials) added from the admin page.
--                  The website shows them next to the plans in data.ts.
-- =====================================================================

-- ---------- 1. City admins ----------
create table public.city_admins (
  user_id    uuid not null references public.users (id) on delete cascade,
  city_slug  text not null references public.cities (slug) on update cascade on delete cascade,
  added_by   uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, city_slug)
);
alter table public.city_admins enable row level security;
revoke all on public.city_admins from anon, authenticated;
grant select on public.city_admins to authenticated;
create policy city_admins_read on public.city_admins for select to authenticated
  using (user_id = (select private.current_user_id()) or (select private.is_admin()));
-- (nobody writes it directly; the main admin uses admin_add_city_admin / admin_remove_city_admin)

-- City of a website plan id: "introverts-dinner-jaipur-20261123" → "jaipur"
create or replace function private.plan_city(p_ref text)
returns text language sql immutable set search_path = '' as $$
  select substring(p_ref from '-([a-z]+)-[0-9]{8}$')
$$;

-- Main admin, or city admin of this city.
create or replace function private.is_city_admin(p_city text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (
    select 1 from public.city_admins ca join public.users u on u.id = ca.user_id
    where u.auth_id = auth.uid() and not u.is_banned and ca.city_slug = p_city)
$$;

create or replace function private.is_team()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (
    select 1 from public.city_admins ca join public.users u on u.id = ca.user_id
    where u.auth_id = auth.uid() and not u.is_banned)
$$;

create or replace function private.can_manage_plan(p_ref text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_city_admin(private.plan_city(p_ref))
$$;

-- What the logged-in member may run: is_super = main admin; cities = cities they run.
create or replace function public.my_team_access()
returns table (is_super boolean, cities text[])
language sql stable security definer set search_path = '' as $$
  select private.is_admin(),
         case when private.is_admin() then (select coalesce(array_agg(c.slug order by c.slug), '{}') from public.cities c)
              else (select coalesce(array_agg(ca.city_slug order by ca.city_slug), '{}')
                    from public.city_admins ca where ca.user_id = private.current_user_id()) end
$$;
revoke all on function public.my_team_access() from public, anon;
grant execute on function public.my_team_access() to authenticated;

-- ---------- 2. Door check-in ----------
alter table public.plan_requests drop constraint if exists plan_requests_status_check;
alter table public.plan_requests add constraint plan_requests_status_check
  check (status in ('pending', 'approved', 'waitlisted', 'declined', 'cancelled', 'attended'));
alter table public.plan_requests add column if not exists checked_in_at timestamptz;
alter table public.plan_requests add column if not exists checked_in_by uuid references public.users (id) on delete set null;

-- Same rules as before, but the team for the plan's city may decide (not only the main admin).
create or replace function private.plan_request_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare team boolean := auth.uid() is null or private.can_manage_plan(new.plan_ref);
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
  if tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'declined', 'waitlisted') and team then
    new.decided_at := now();
  end if;
  return new;
end $$;

drop policy if exists plan_requests_read on public.plan_requests;
drop policy if exists plan_requests_update on public.plan_requests;
create policy plan_requests_read on public.plan_requests for select to authenticated
  using (user_id = (select private.current_user_id()) or private.can_manage_plan(plan_ref));
create policy plan_requests_update on public.plan_requests for update to authenticated
  using (user_id = (select private.current_user_id()) or private.can_manage_plan(plan_ref))
  with check (user_id = (select private.current_user_id()) or private.can_manage_plan(plan_ref));
-- delete stays main-admin only (plan_requests_admin_delete)

-- Scan a door pass: approved → attended. p_plan_ref (optional) guards against a pass for another plan.
create or replace function public.admin_check_in(p_request_id bigint, p_plan_ref text default null, p_undo boolean default false)
returns table (request_id bigint, plan_ref text, display_name text, avatar_url text, party_size smallint,
               status text, checked_in_at timestamptz, already boolean)
language plpgsql security definer set search_path = '' as $$
declare r public.plan_requests%rowtype; was boolean;
begin
  select * into r from public.plan_requests pr where pr.id = p_request_id;
  if not found then raise exception 'No pass with this number' using errcode = 'no_data_found'; end if;
  if not private.can_manage_plan(r.plan_ref) then raise exception 'This pass is for a city you don''t run' using errcode = 'insufficient_privilege'; end if;
  if p_plan_ref is not null and r.plan_ref <> p_plan_ref then
    raise exception 'This pass is for another plan (%)', r.plan_ref using errcode = 'check_violation';
  end if;
  if r.status not in ('approved', 'attended') then
    raise exception 'Not confirmed for this plan (status: %)', r.status using errcode = 'check_violation';
  end if;
  was := r.status = 'attended';
  if p_undo then
    update public.plan_requests set status = 'approved', checked_in_at = null, checked_in_by = null where id = r.id;
  elsif not was then
    update public.plan_requests set status = 'attended', checked_in_at = now(), checked_in_by = private.current_user_id() where id = r.id;
  end if;
  return query
  select pr.id, pr.plan_ref, u.display_name, u.avatar_url, pr.party_size, pr.status, pr.checked_in_at, was and not p_undo
  from public.plan_requests pr join public.users u on u.id = pr.user_id where pr.id = r.id;
end $$;
revoke all on function public.admin_check_in(bigint, text, boolean) from public, anon;
grant execute on function public.admin_check_in(bigint, text, boolean) to authenticated;

-- ---------- 3. Existing admin tools: allowed for the city team, counting attended seats ----------
create or replace function public.plan_counts(p_refs text[])
returns table (plan_ref text, approved_seats int, waitlisted int, interested int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if cardinality(p_refs) > 300 then
    raise exception 'Ask for at most 300 plans at a time' using errcode = 'program_limit_exceeded';
  end if;
  return query
  select r.ref,
         coalesce((select sum(pr.party_size)::int from public.plan_requests pr where pr.plan_ref = r.ref and pr.status in ('approved', 'attended')), 0),
         coalesce((select count(*)::int from public.plan_requests pr where pr.plan_ref = r.ref and pr.status = 'waitlisted'), 0),
         coalesce((select count(*)::int from public.plan_interest pi where pi.plan_ref = r.ref and pi.reaction = 'interested'), 0)
  from unnest(p_refs) as r(ref);
end $$;

create or replace function public.admin_plan_queue(p_plan_ref text)
returns table (request_id bigint, display_name text, full_name text, avatar_url text, phone text, email text,
               instagram_url text, linkedin_url text, occupation text, profile_score smallint,
               phone_verified boolean, email_verified boolean, status text, party_size smallint,
               icebreaker text, requested_at timestamptz, priority int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_manage_plan(p_plan_ref) then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
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

create or replace function public.admin_fill_plan(p_plan_ref text, p_capacity int)
returns table (approved int, waitlisted int, seats_left int)
language plpgsql security definer set search_path = '' as $$
declare
  left_seats int;
  a int := 0;
  w int := 0;
  r record;
begin
  if not private.can_manage_plan(p_plan_ref) then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 500 then raise exception 'Capacity must be 1 to 500'; end if;
  perform pg_advisory_xact_lock(hashtext('plan:' || p_plan_ref));

  select p_capacity - coalesce(sum(pr.party_size), 0) into left_seats
  from public.plan_requests pr where pr.plan_ref = p_plan_ref and pr.status in ('approved', 'attended');

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

create or replace function public.admin_interest_summary()
returns table (plan_ref text, interested int, skipped int, requests int, approved_seats int, waitlisted int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team() then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
  return query
  with refs as (select pi.plan_ref as ref from public.plan_interest pi union select pr.plan_ref from public.plan_requests pr)
  select refs.ref,
         (select count(*)::int from public.plan_interest x where x.plan_ref = refs.ref and x.reaction = 'interested'),
         (select count(*)::int from public.plan_interest x where x.plan_ref = refs.ref and x.reaction = 'skip'),
         (select count(*)::int from public.plan_requests x where x.plan_ref = refs.ref and x.status <> 'cancelled'),
         (select coalesce(sum(x.party_size), 0)::int from public.plan_requests x where x.plan_ref = refs.ref and x.status in ('approved', 'attended')),
         (select count(*)::int from public.plan_requests x where x.plan_ref = refs.ref and x.status = 'waitlisted')
  from refs
  where private.is_city_admin(private.plan_city(refs.ref));
end $$;

-- Host applications: city team handles their own city.
create or replace function private.host_application_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
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

drop policy if exists host_apps_read on public.host_applications;
drop policy if exists host_apps_update on public.host_applications;
create policy host_apps_read on public.host_applications for select to authenticated
  using (user_id = (select private.current_user_id()) or private.is_city_admin(city_slug));
create policy host_apps_update on public.host_applications for update to authenticated
  using (user_id = (select private.current_user_id()) or private.is_city_admin(city_slug))
  with check (user_id = (select private.current_user_id()) or private.is_city_admin(city_slug));

create or replace function public.admin_host_applications()
returns table (id bigint, created_at timestamptz, city_slug text, plan_title text, category text, pitch text, experience text,
               frequency text, group_size smallint, availability text, status text, team_note text,
               display_name text, full_name text, avatar_url text, phone text, instagram_url text, linkedin_url text, profile_score smallint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team() then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
  return query
  select a.id, a.created_at, a.city_slug, a.plan_title, a.category, a.pitch, a.experience, a.frequency, a.group_size, a.availability,
         a.status, a.team_note, u.display_name, p.full_name, u.avatar_url, p.phone, p.instagram_url, p.linkedin_url, u.profile_score
  from public.host_applications a join public.users u on u.id = a.user_id left join public.user_private p on p.user_id = u.id
  where private.is_city_admin(a.city_slug)
  order by (a.status in ('rejected', 'withdrawn', 'approved')), u.profile_score desc, a.created_at;
end $$;

-- ---------- 4. Team management (main admin only) ----------
create or replace function public.admin_team()
returns table (user_id uuid, display_name text, email text, avatar_url text, is_super boolean, cities text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admin only' using errcode = 'insufficient_privilege'; end if;
  return query
  select u.id, u.display_name, coalesce(p.email, au.email::text), u.avatar_url, u.role = 'admin',
         coalesce((select array_agg(ca.city_slug order by ca.city_slug) from public.city_admins ca where ca.user_id = u.id), '{}')
  from public.users u
  left join public.user_private p on p.user_id = u.id
  left join auth.users au on au.id = u.auth_id
  where u.role = 'admin' or exists (select 1 from public.city_admins ca where ca.user_id = u.id)
  order by u.role = 'admin' desc, u.display_name;
end $$;

create or replace function public.admin_add_city_admin(p_email text, p_city text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid; nm text;
begin
  if not private.is_admin() then raise exception 'Main admin only' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.cities c where c.slug = p_city) then raise exception 'Unknown city'; end if;
  select u.id, u.display_name into uid, nm from public.users u
    left join auth.users au on au.id = u.auth_id
    left join public.user_private p on p.user_id = u.id
  where lower(au.email) = lower(trim(p_email)) or lower(p.email) = lower(trim(p_email))
  limit 1;
  if uid is null then
    raise exception 'No member with this email yet. Ask them to log in on the website once, then add them.' using errcode = 'no_data_found';
  end if;
  insert into public.city_admins (user_id, city_slug, added_by) values (uid, p_city, private.current_user_id())
  on conflict do nothing;
  return nm;
end $$;

create or replace function public.admin_remove_city_admin(p_user uuid, p_city text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admin only' using errcode = 'insufficient_privilege'; end if;
  delete from public.city_admins where user_id = p_user and city_slug = p_city;
end $$;

revoke all on function public.admin_team() from public, anon;
revoke all on function public.admin_add_city_admin(text, text) from public, anon;
revoke all on function public.admin_remove_city_admin(uuid, text) from public, anon;
grant execute on function public.admin_team() to authenticated;
grant execute on function public.admin_add_city_admin(text, text) to authenticated;
grant execute on function public.admin_remove_city_admin(uuid, text) to authenticated;

-- ---------- 5. Plans added from the admin page ----------
create table public.custom_plans (
  id          bigint generated always as identity primary key,
  city_slug   text not null references public.cities (slug) on update cascade,
  title       text not null check (char_length(title) between 3 and 100),
  category    text not null check (category in ('food', 'sports', 'games', 'night', 'outing', 'art', 'film', 'trips')),
  starts_on   date not null,
  time_label  text not null check (char_length(time_label) between 2 and 12),   -- "8 pm", "7:30 am"
  end_label   text check (char_length(end_label) <= 12),
  area        text not null check (char_length(area) between 2 and 60),
  price       int not null default 0 check (price between 0 and 100000),     -- rupees
  price_type  text not null default 'reservation' check (price_type in ('free', 'reservation', 'per person', 'estimate')),
  seats       smallint not null default 12 check (seats between 2 and 500),
  emoji       text not null default '✨' check (char_length(emoji) <= 8),
  blurb       text not null default '' check (char_length(blurb) <= 600),
  steps       text[] not null default '{}' check (cardinality(steps) <= 6),
  tags        text[] not null default '{}' check (cardinality(tags) <= 4),
  host_name   text check (char_length(host_name) <= 60),
  status      text not null default 'published' check (status in ('published', 'hidden', 'cancelled')),
  created_by  uuid default private.current_user_id() references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index custom_plans_city_day_idx on public.custom_plans (city_slug, starts_on);
create trigger custom_plans_set_updated_at before update on public.custom_plans
  for each row execute function private.set_updated_at();
alter table public.custom_plans enable row level security;
revoke all on public.custom_plans from anon, authenticated;
grant select on public.custom_plans to anon, authenticated;
grant insert (city_slug, title, category, starts_on, time_label, end_label, area, price, price_type, seats, emoji, blurb, steps, tags, host_name, status)
  on public.custom_plans to authenticated;
grant update (title, category, starts_on, time_label, end_label, area, price, price_type, seats, emoji, blurb, steps, tags, host_name, status)
  on public.custom_plans to authenticated;
grant delete on public.custom_plans to authenticated;
create policy custom_plans_read on public.custom_plans for select to anon, authenticated
  using (status <> 'hidden' or private.is_city_admin(city_slug));
create policy custom_plans_insert on public.custom_plans for insert to authenticated
  with check (private.is_city_admin(city_slug));
create policy custom_plans_update on public.custom_plans for update to authenticated
  using (private.is_city_admin(city_slug)) with check (private.is_city_admin(city_slug));
create policy custom_plans_delete on public.custom_plans for delete to authenticated
  using ((select private.is_admin()));

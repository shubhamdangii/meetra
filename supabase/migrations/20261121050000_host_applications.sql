-- =====================================================================
-- Host waiting list: members apply to host, the team moves them through
-- applied → shortlisted → call_scheduled → trial → approved (or waitlisted / rejected).
-- Place in line = order of applying within the same city, best profiles first.
-- =====================================================================

create table public.host_applications (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default private.current_user_id() references public.users (id) on delete cascade,
  city_slug       text not null references public.cities (slug) on update cascade,
  plan_title      text not null check (char_length(plan_title) between 3 and 120),
  category        text not null check (category in ('food', 'sports', 'games', 'night', 'outing', 'art', 'film', 'trips', 'other')),
  pitch           text check (char_length(pitch) <= 1500),          -- what happens, who it's for
  experience      text check (char_length(experience) <= 800),      -- have you hosted before?
  frequency       text check (frequency in ('once', 'monthly', 'fortnightly', 'weekly')),
  group_size      smallint check (group_size between 2 and 200),
  availability    text check (char_length(availability) <= 200),    -- "weekday evenings", "Sunday mornings"
  status          text not null default 'applied'
                  check (status in ('applied', 'shortlisted', 'call_scheduled', 'trial', 'approved', 'waitlisted', 'rejected', 'withdrawn')),
  team_note       text check (char_length(team_note) <= 1000),      -- visible to the applicant ("Call on Sat 4 pm")
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index host_applications_city_status_idx on public.host_applications (city_slug, status, created_at);
create unique index host_applications_one_open_per_user on public.host_applications (user_id)
  where status in ('applied', 'shortlisted', 'call_scheduled', 'trial', 'waitlisted');
create trigger host_applications_set_updated_at before update on public.host_applications
  for each row execute function private.set_updated_at();

-- Members can apply and withdraw; only admins move an application forward or write notes.
create or replace function private.host_application_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin() then
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
create trigger host_applications_rules before insert or update on public.host_applications
  for each row execute function private.host_application_rules();

alter table public.host_applications enable row level security;
revoke all on public.host_applications from anon, authenticated;

create policy host_apps_read on public.host_applications for select to authenticated
  using (user_id = (select private.current_user_id()) or (select private.is_admin()));
create policy host_apps_insert on public.host_applications for insert to authenticated
  with check (user_id = (select private.current_user_id()));
create policy host_apps_update on public.host_applications for update to authenticated
  using (user_id = (select private.current_user_id()) or (select private.is_admin()))
  with check (user_id = (select private.current_user_id()) or (select private.is_admin()));

grant select on public.host_applications to authenticated;
grant insert (city_slug, plan_title, category, pitch, experience, frequency, group_size, availability) on public.host_applications to authenticated;
grant update (plan_title, category, pitch, experience, frequency, group_size, availability, status, team_note) on public.host_applications to authenticated;

-- "You're #4 in line for Jaipur" — open applications in the same city, best profiles first, then earliest.
create or replace function public.my_host_queue_position()
returns table (application_id bigint, city_slug text, place int, total int)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select a.* from public.host_applications a
    where a.user_id = private.current_user_id() and a.status in ('applied', 'shortlisted', 'call_scheduled', 'waitlisted')
    order by a.created_at desc limit 1
  ), line as (
    select a.id, a.city_slug,
           row_number() over (partition by a.city_slug order by (a.status = 'shortlisted') desc, u.profile_score desc, a.created_at) as pos,
           count(*) over (partition by a.city_slug) as total
    from public.host_applications a join public.users u on u.id = a.user_id
    where a.status in ('applied', 'shortlisted', 'call_scheduled', 'waitlisted')
      and a.city_slug = (select city_slug from mine)
  )
  select line.id, line.city_slug, line.pos::int, line.total::int from line join mine on mine.id = line.id
$$;
revoke all on function public.my_host_queue_position() from public, anon;
grant execute on function public.my_host_queue_position() to authenticated;

-- Admin list with the applicant's contact details and score.
create or replace function public.admin_host_applications()
returns table (id bigint, created_at timestamptz, city_slug text, plan_title text, category text, pitch text, experience text,
               frequency text, group_size smallint, availability text, status text, team_note text,
               display_name text, full_name text, avatar_url text, phone text, instagram_url text, linkedin_url text, profile_score smallint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select a.id, a.created_at, a.city_slug, a.plan_title, a.category, a.pitch, a.experience, a.frequency, a.group_size, a.availability,
         a.status, a.team_note, u.display_name, p.full_name, u.avatar_url, p.phone, p.instagram_url, p.linkedin_url, u.profile_score
  from public.host_applications a join public.users u on u.id = a.user_id left join public.user_private p on p.user_id = u.id
  order by (a.status in ('rejected', 'withdrawn', 'approved')), u.profile_score desc, a.created_at;
end $$;
revoke all on function public.admin_host_applications() from public, anon;
grant execute on function public.admin_host_applications() to authenticated;

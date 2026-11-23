-- Sub-admins can be invited by email before they ever log in.
-- When the approved invite's email logs in (confirmed), they become a sub-admin automatically.
-- Also blocks adding a main admin or someone who is already sub-admin of that city.
create table if not exists public.sub_admin_invites (
  email      text not null check (email = lower(email) and email like '%@%'),
  city_slug  text not null references public.cities (slug) on update cascade on delete cascade,
  invited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (email, city_slug)
);
alter table public.sub_admin_invites enable row level security;
revoke all on public.sub_admin_invites from anon, authenticated;

-- turn invites for this login into city_admins rows
create or replace function private.claim_sub_admin_invites(p_auth uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare em text; uid uuid;
begin
  select lower(au.email), u.id into em, uid from auth.users au join public.users u on u.auth_id = au.id
  where au.id = p_auth and au.email_confirmed_at is not null;
  if uid is null then return; end if;
  insert into public.city_admins (user_id, city_slug, added_by)
  select uid, i.city_slug, i.invited_by from public.sub_admin_invites i where i.email = em
  on conflict do nothing;
  delete from public.sub_admin_invites where email = em;
end $$;

-- run on login-time calls: my_team_access is called right after every login
create or replace function public.my_team_access()
returns table (is_super boolean, cities text[])
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and exists (select 1 from public.sub_admin_invites i join auth.users au on lower(au.email) = i.email where au.id = auth.uid()) then
    perform private.claim_sub_admin_invites(auth.uid());
  end if;
  return query
  select private.is_admin(),
         case when private.is_admin() then (select coalesce(array_agg(c.slug order by c.slug), '{}') from public.cities c)
              else (select coalesce(array_agg(ca.city_slug order by ca.city_slug), '{}')
                    from public.city_admins ca where ca.user_id = private.current_user_id()) end;
end $$;
revoke all on function public.my_team_access() from public, anon;
grant execute on function public.my_team_access() to authenticated;

create or replace function private.apply_team(p_action text, j jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid; em text := lower(trim(coalesce(j ->> 'email', ''))); c text := j ->> 'city';
begin
  if p_action = 'add_sub_admin' then
    if not exists (select 1 from public.cities ci where ci.slug = c) then raise exception 'Unknown city'; end if;
    if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'Enter a valid email address'; end if;
    if em in (select m.email from public.main_admin_emails m) then raise exception '% is a main admin and already has full access', em; end if;
    select u.id into uid from public.users u left join auth.users au on au.id = u.auth_id left join public.user_private p on p.user_id = u.id
    where lower(au.email) = em or lower(p.email) = em limit 1;
    if uid is not null and exists (select 1 from public.city_admins ca where ca.user_id = uid and ca.city_slug = c) then
      raise exception '% is already a sub-admin for %', em, c;
    end if;
    if uid is not null then
      insert into public.city_admins (user_id, city_slug, added_by) values (uid, c, private.current_user_id()) on conflict do nothing;
    else
      insert into public.sub_admin_invites (email, city_slug, invited_by) values (em, c, private.current_user_id()) on conflict do nothing;
    end if;
  elsif p_action = 'remove_sub_admin' then
    if j ? 'user_id' and nullif(j ->> 'user_id', '') is not null then
      delete from public.city_admins where user_id = (j ->> 'user_id')::uuid and city_slug = c;
    end if;
    delete from public.sub_admin_invites where email = em and city_slug = c;
  else
    raise exception 'Unknown team action %', p_action;
  end if;
end $$;

-- block a second pending add/remove for the same email + city
create or replace function private.team_request_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.entity = 'team' and new.status = 'pending' and exists (
      select 1 from public.admin_requests x where x.entity = 'team' and x.status = 'pending' and x.id <> new.id
        and lower(x.new_value ->> 'email') = lower(new.new_value ->> 'email') and x.new_value ->> 'city' = new.new_value ->> 'city') then
    raise exception 'There is already a pending team request for % in %', new.new_value ->> 'email', new.new_value ->> 'city';
  end if;
  return new;
end $$;
drop trigger if exists admin_requests_team_guard on public.admin_requests;
create trigger admin_requests_team_guard before insert or update on public.admin_requests
  for each row execute function private.team_request_guard();

-- Team list now also shows invites that haven't logged in yet
drop function if exists public.admin_team();
create or replace function public.admin_team()
returns table (user_id uuid, display_name text, email text, avatar_url text, is_super boolean, cities text[], invited boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query
  select u.id, u.display_name, coalesce(p.email, au.email::text), u.avatar_url, false,
         (select array_agg(ca.city_slug order by ca.city_slug) from public.city_admins ca where ca.user_id = u.id), false
  from public.users u left join public.user_private p on p.user_id = u.id left join auth.users au on au.id = u.auth_id
  where exists (select 1 from public.city_admins ca where ca.user_id = u.id)
  union all
  select null::uuid, i.email, i.email, null::text, false, array_agg(i.city_slug order by i.city_slug), true
  from public.sub_admin_invites i group by i.email;
end $$;
revoke all on function public.admin_team() from public, anon;
grant execute on function public.admin_team() to authenticated;

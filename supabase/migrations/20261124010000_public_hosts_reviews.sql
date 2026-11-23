-- Public host profiles (rating, reviews, gallery), weekly featured reviews, home-page counts.

-- ---------- host gallery ----------
alter table public.host_profiles add column if not exists gallery text[] not null default '{}'
  check (cardinality(gallery) <= 12);
grant select (gallery) on public.host_profiles to anon, authenticated;

-- photos for hosts: public to read, only main admins upload (files are just storage; who shows up
-- on the site still goes through Maker-Checker because the URLs live in the host request)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('host-media', 'host-media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists host_media_read on storage.objects;
drop policy if exists host_media_insert on storage.objects;
drop policy if exists host_media_delete on storage.objects;
create policy host_media_read on storage.objects for select to anon, authenticated using (bucket_id = 'host-media');
create policy host_media_insert on storage.objects for insert to authenticated with check (bucket_id = 'host-media' and (select private.is_admin()));
create policy host_media_delete on storage.objects for delete to authenticated using (bucket_id = 'host-media' and (select private.is_admin()));

-- host requests may carry a gallery
create or replace function private.host_fields(h public.host_profiles)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('name', h.name, 'city_slug', h.city_slug, 'bio', h.bio, 'photo_url', h.photo_url,
    'phone', h.phone, 'email', h.email, 'instagram', h.instagram, 'status', h.status, 'gallery', to_jsonb(h.gallery))
$$;

create or replace function private.apply_host(p_action text, p_id bigint, j jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare h public.host_profiles; nid bigint;
  gal text[] := case when j ? 'gallery' then coalesce(array(select jsonb_array_elements_text(j -> 'gallery')), '{}') end;
begin
  if gal is not null and exists (select 1 from unnest(gal) g where g !~ '^https://') then
    raise exception 'Gallery photos must be https:// links' using errcode = 'check_violation';
  end if;
  if p_action = 'create' then
    insert into public.host_profiles (name, city_slug, bio, photo_url, phone, email, instagram, gallery, created_by)
    values (trim(j ->> 'name'), j ->> 'city_slug', coalesce(j ->> 'bio', ''), nullif(j ->> 'photo_url', ''), nullif(j ->> 'phone', ''),
            nullif(lower(j ->> 'email'), ''), nullif(j ->> 'instagram', ''), coalesce(gal, '{}'), private.current_user_id())
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

-- admin list needs the gallery too
drop function if exists public.admin_hosts();
create or replace function public.admin_hosts()
returns table (id bigint, name text, city_slug text, bio text, photo_url text, phone text, email text, instagram text, status text,
               total_events int, active_events int, upcoming_events int, completed_events int, bookings int,
               avg_rating numeric, reviews int, cities text[], pending_req text, created_at timestamptz, gallery text[])
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
         h.created_at, h.gallery
  from public.host_profiles h where h.deleted_at is null
  order by h.status, h.name;
end $$;
revoke all on function public.admin_hosts() from public, anon;
grant execute on function public.admin_hosts() to authenticated;

-- ---------- public reads ----------
-- Active hosts, best rated first (then most reviews, then most events). p_city null = all cities.
create or replace function public.public_hosts(p_city text default null, p_limit int default 10)
returns table (id bigint, name text, city_slug text, bio text, photo_url text, gallery text[],
               avg_rating numeric, reviews int, events int, upcoming int)
language sql stable security definer set search_path = '' as $$
  select h.id, h.name, h.city_slug, h.bio, h.photo_url, h.gallery,
         (select round(avg(r.rating)::numeric, 1) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null),
         (select count(*) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null)::int,
         (select count(*) from public.custom_plans c where c.host_id = h.id and c.deleted_at is null and c.status = 'approved')::int,
         (select count(*) from public.custom_plans c where c.host_id = h.id and c.deleted_at is null and c.status = 'approved' and c.starts_at > now())::int
  from public.host_profiles h
  where h.status = 'active' and h.deleted_at is null and (p_city is null or h.city_slug = p_city)
  order by 7 desc nulls last, 8 desc, 9 desc, h.name
  limit least(greatest(coalesce(p_limit, 10), 1), 100)
$$;

create or replace function public.public_host_count(p_city text default null)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.host_profiles h where h.status = 'active' and h.deleted_at is null and (p_city is null or h.city_slug = p_city)
$$;

-- One host's public profile: reviews (first names only) and their events
create or replace function public.public_host(p_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when h.id is null then null else jsonb_build_object(
    'id', h.id, 'name', h.name, 'city', h.city_slug, 'bio', h.bio, 'photo_url', h.photo_url, 'gallery', to_jsonb(h.gallery),
    'avg_rating', (select round(avg(r.rating)::numeric, 1) from public.host_reviews r where r.host_id = h.id and r.hidden_at is null),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('rating', r.rating, 'comment', r.comment, 'first_name', split_part(u.display_name, ' ', 1),
        'event', c.title, 'at', r.created_at) order by r.created_at desc)
        from public.host_reviews r join public.users u on u.id = r.user_id left join public.custom_plans c on c.id = r.event_id
        where r.host_id = h.id and r.hidden_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('plan_ref', c.plan_ref, 'title', c.title, 'starts_at', c.starts_at, 'emoji', c.emoji,
        'upcoming', c.starts_at > now(), 'status', c.status,
        'avg_rating', (select round(avg(r.rating)::numeric, 1) from public.host_reviews r where r.plan_ref = c.plan_ref and r.hidden_at is null),
        'reviews', (select count(*) from public.host_reviews r where r.plan_ref = c.plan_ref and r.hidden_at is null)) order by c.starts_at desc)
        from public.custom_plans c where c.host_id = h.id and c.deleted_at is null and c.status in ('approved', 'cancelled')), '[]'::jsonb)
  ) end
  from (select 1) one left join public.host_profiles h on h.id = p_id and h.status = 'active' and h.deleted_at is null
$$;

-- "What people say": automatic, chosen per week. This week's best reviews (4-5 stars with a comment);
-- if fewer than 3, the best ones from the last 8 weeks fill in. p_city null = all cities.
create or replace function public.featured_reviews(p_city text default null, p_limit int default 8)
returns table (rating smallint, comment text, first_name text, plan_ref text, event_title text, created_at timestamptz, this_week boolean)
language sql stable security definer set search_path = '' as $$
  with wk as (select date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as start),
  pool as (
    select r.rating, r.comment, split_part(u.display_name, ' ', 1) fn, r.plan_ref, c.title, r.created_at,
           r.created_at >= (select start from wk) as this_week
    from public.host_reviews r join public.users u on u.id = r.user_id left join public.custom_plans c on c.plan_ref = r.plan_ref
    where r.hidden_at is null and r.rating >= 4 and char_length(trim(r.comment)) >= 8
      and r.created_at >= (select start from wk) - interval '8 weeks'
      and (p_city is null or coalesce(c.city_slug, private.plan_city(r.plan_ref)) = p_city)
  )
  select rating, comment, fn, plan_ref, title, created_at, this_week from pool
  order by this_week desc, rating desc, created_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

do $$ declare f text; begin
  foreach f in array array['public.public_hosts(text, int)', 'public.public_host_count(text)', 'public.public_host(bigint)', 'public.featured_reviews(text, int)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

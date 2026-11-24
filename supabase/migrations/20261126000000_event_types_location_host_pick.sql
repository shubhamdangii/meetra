-- =====================================================================
-- Events get a type (= a folder in public/images/events) and a photo,
-- an optional exact Google Maps link that only confirmed (paid) guests see,
-- a public "who's coming" (count + profile photos only), photo uploads for hosts/admins,
-- and the host flow: applicants pick an event (existing unassigned one or a new one),
-- admins assign / create an event while approving, and existing hosts can't apply again.
-- =====================================================================

-- ---------- 1. event type + photo (public), exact location (private) ----------
alter table public.custom_plans add column if not exists event_type text check (char_length(event_type) <= 60);
alter table public.custom_plans add column if not exists image_url text check (image_url ~ '^(https://|/images/)' and char_length(image_url) <= 500);

create table if not exists public.event_locations (
  plan_id bigint primary key references public.custom_plans (id) on delete cascade,
  maps_url text not null check (char_length(maps_url) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.event_locations enable row level security;   -- no policies: only the functions below read or write it
revoke all on public.event_locations from anon, authenticated;

create or replace function private.valid_maps_url(u text)
returns boolean language sql immutable set search_path = '' as $$
  select u ~* '^https://((www\.)?google\.[a-z.]{2,8}/maps|maps\.google\.[a-z.]{2,8}/|maps\.app\.goo\.gl/|goo\.gl/maps/)[^\s<>"]*$'
$$;

-- writes (or clears) the exact location when the payload carries maps_url
create or replace function private.save_event_location(p_id bigint, j jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare u text;
begin
  if j is null or not (j ? 'maps_url') then return; end if;
  u := nullif(trim(j ->> 'maps_url'), '');
  if u is null then delete from public.event_locations where plan_id = p_id; return; end if;
  if not private.valid_maps_url(u) then
    raise exception 'Exact location must be a Google Maps link (google.com/maps, maps.app.goo.gl or goo.gl/maps)' using errcode = 'check_violation';
  end if;
  insert into public.event_locations (plan_id, maps_url) values (p_id, u)
  on conflict (plan_id) do update set maps_url = excluded.maps_url, updated_at = now();
end $$;

create or replace function private.event_merge(b public.custom_plans, j jsonb)
returns public.custom_plans language plpgsql stable set search_path = '' as $$
declare r public.custom_plans := b;
begin
  if j ? 'title'      then r.title := trim(j ->> 'title'); end if;
  if j ? 'category'   then r.category := j ->> 'category'; end if;
  if j ? 'category_other' then r.category_other := nullif(trim(j ->> 'category_other'), ''); end if;
  if j ? 'event_type' then r.event_type := nullif(trim(j ->> 'event_type'), ''); end if;
  if j ? 'image_url'  then r.image_url := nullif(trim(j ->> 'image_url'), ''); end if;
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
  select jsonb_build_object('title', r.title, 'category', r.category, 'category_other', r.category_other, 'event_type', r.event_type,
    'image_url', r.image_url, 'city_slug', r.city_slug, 'host_id', r.host_id,
    'host_name', r.host_name, 'starts_at', r.starts_at, 'ends_at', r.ends_at, 'booking_closes_at', r.booking_closes_at,
    'area', r.area, 'price', r.price, 'price_type', r.price_type, 'seats', r.seats, 'emoji', r.emoji,
    'blurb', r.blurb, 'steps', to_jsonb(r.steps), 'tags', to_jsonb(r.tags))
$$;

create or replace function private.apply_event(p_action text, p_id bigint, j jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.custom_plans; n public.custom_plans;
begin
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null then raise exception 'That event no longer exists' using errcode = 'no_data_found'; end if;
  if p_action in ('create', 'update') then
    if p_action = 'create' and r.status not in ('draft', 'pending') then raise exception 'This event is already %', r.status; end if;
    if p_action = 'update' and r.status <> 'approved' then raise exception 'Only approved events can be changed this way (this one is %)', r.status; end if;
    n := private.event_merge(r, coalesce(j, '{}'::jsonb));
    if p_action = 'update' and n.seats < (select coalesce(sum(pr.party_size), 0) from public.plan_requests pr where pr.plan_ref = r.plan_ref and pr.status in ('approved', 'attended')) then
      raise exception 'Seats can''t go below the number of confirmed guests' using errcode = 'check_violation';
    end if;
    update public.custom_plans set title = n.title, category = n.category, category_other = n.category_other, event_type = n.event_type, image_url = n.image_url,
      city_slug = n.city_slug, host_id = n.host_id,
      starts_at = n.starts_at, ends_at = n.ends_at, booking_closes_at = n.booking_closes_at, area = n.area, price = n.price,
      price_type = n.price_type, seats = n.seats, emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags,
      status = case when p_action = 'create' then 'approved' else status end
    where id = p_id;
    perform private.save_event_location(p_id, j);
  elsif p_action = 'cancel' then
    if r.status <> 'approved' then raise exception 'Only approved events can be cancelled'; end if;
    update public.custom_plans set status = 'cancelled', cancel_reason = left(j ->> 'reason', 300) where id = p_id;
  elsif p_action = 'delete' then
    update public.custom_plans set deleted_at = now() where id = p_id;
  else
    raise exception 'Unknown event action %', p_action;
  end if;
end $$;

create or replace function public.admin_save_event_draft(p_id bigint, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r public.custom_plans; n public.custom_plans; nid bigint;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  if p_id is null then
    n := private.event_merge(r, p_payload);
    insert into public.custom_plans (city_slug, title, category, category_other, event_type, image_url, host_id, starts_at, ends_at, booking_closes_at, area, price, price_type,
                                     seats, emoji, blurb, steps, tags, status, created_by, starts_on, time_label)
    values (n.city_slug, n.title, n.category, n.category_other, n.event_type, n.image_url, n.host_id, n.starts_at, n.ends_at, n.booking_closes_at, n.area, coalesce(n.price, 0),
            coalesce(n.price_type, 'reservation'), coalesce(n.seats, 12), coalesce(n.emoji, '✨'), coalesce(n.blurb, ''),
            coalesce(n.steps, '{}'), coalesce(n.tags, '{}'), 'draft', private.current_user_id(), current_date, 'tbd')
    returning id into nid;
    perform private.save_event_location(nid, p_payload);
    return nid;
  end if;
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null then raise exception 'Event not found'; end if;
  if r.status <> 'draft' then raise exception 'Only drafts can be edited directly. For a live event, use "Request change".'; end if;
  n := private.event_merge(r, p_payload);
  update public.custom_plans set title = n.title, category = n.category, category_other = n.category_other, event_type = n.event_type, image_url = n.image_url,
    city_slug = n.city_slug, host_id = n.host_id,
    starts_at = n.starts_at, ends_at = n.ends_at, booking_closes_at = n.booking_closes_at, area = n.area, price = n.price,
    price_type = n.price_type, seats = n.seats, emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags
  where id = p_id;
  perform private.save_event_location(p_id, p_payload);
  return p_id;
end $$;

create or replace function public.host_save_event_draft(p_id bigint, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me bigint := private.my_host_id(); h public.host_profiles; r public.custom_plans; n public.custom_plans; nid bigint;
  j jsonb := coalesce(p_payload, '{}'::jsonb) - 'host_id' - 'city_slug';
begin
  if me is null then raise exception 'Only approved hosts can do this' using errcode = 'insufficient_privilege'; end if;
  select * into h from public.host_profiles where id = me;
  if p_id is null then
    n := private.event_merge(r, j);
    insert into public.custom_plans (city_slug, title, category, category_other, event_type, image_url, host_id, starts_at, ends_at, booking_closes_at, area, price, price_type,
                                     seats, emoji, blurb, steps, tags, status, created_by, starts_on, time_label)
    values (h.city_slug, n.title, n.category, n.category_other, n.event_type, n.image_url, me, n.starts_at, n.ends_at, n.booking_closes_at, n.area, coalesce(n.price, 0),
            coalesce(n.price_type, 'reservation'), coalesce(n.seats, 12), coalesce(n.emoji, '✨'), coalesce(n.blurb, ''),
            coalesce(n.steps, '{}'), coalesce(n.tags, '{}'), 'draft', private.current_user_id(), current_date, 'tbd')
    returning id into nid;
    perform private.save_event_location(nid, j);
    return nid;
  end if;
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null or r.host_id is distinct from me then raise exception 'Event not found'; end if;
  if r.status <> 'draft' then raise exception 'Only drafts can be edited. Ask the team to change a live event.'; end if;
  n := private.event_merge(r, j);
  update public.custom_plans set title = n.title, category = n.category, category_other = n.category_other, event_type = n.event_type, image_url = n.image_url,
    starts_at = n.starts_at, ends_at = n.ends_at,
    booking_closes_at = n.booking_closes_at, area = n.area, price = n.price, price_type = n.price_type, seats = n.seats,
    emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags
  where id = p_id;
  perform private.save_event_location(p_id, j);
  return p_id;
end $$;

-- type, photo and exact location of events the caller manages (admins: all; hosts: their own) — for the edit forms
create or replace function public.event_extras(p_ids bigint[] default null)
returns table (id bigint, event_type text, image_url text, maps_url text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.event_type, c.image_url, l.maps_url
  from public.custom_plans c left join public.event_locations l on l.plan_id = c.id
  where c.deleted_at is null and (p_ids is null or c.id = any(p_ids))
    and (private.is_team() or (c.host_id is not null and c.host_id = private.my_host_id()))
$$;
revoke all on function public.event_extras(bigint[]) from public, anon;
grant execute on function public.event_extras(bigint[]) to authenticated;

-- ---------- 2. exact location: only for confirmed + paid guests (and the team / the host) ----------
create or replace function public.my_event_location(p_plan_ref text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.custom_plans; u text; ok boolean := false;
begin
  select * into c from public.custom_plans where plan_ref = p_plan_ref and deleted_at is null;
  if not found then return null; end if;
  select maps_url into u from public.event_locations where plan_id = c.id;
  if u is null then return jsonb_build_object('maps_url', null, 'allowed', false); end if;
  if private.can_manage_plan(p_plan_ref) or private.is_plan_host(p_plan_ref) then ok := true;
  else
    select true into ok from public.plan_requests pr
    where pr.plan_ref = p_plan_ref and pr.user_id = private.current_user_id()
      and pr.status in ('approved', 'attended')
      and (pr.paid_at is not null or c.price_type = 'free' or coalesce(c.price, 0) = 0)
    limit 1;
  end if;
  if not coalesce(ok, false) then return jsonb_build_object('maps_url', null, 'allowed', false); end if;
  return jsonb_build_object('maps_url', u, 'allowed', true);
end $$;
revoke all on function public.my_event_location(text) from public, anon;
grant execute on function public.my_event_location(text) to authenticated;

-- ---------- 3. who's coming: count + profile photos only (no names, no ids) ----------
create or replace function public.plan_attendees(p_plan_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'count', coalesce((select sum(pr.party_size) from public.plan_requests pr
                       where pr.plan_ref = p_plan_ref and pr.status in ('approved', 'attended')), 0),
    'photos', coalesce((select jsonb_agg(x.avatar_url) from (
                 select u.avatar_url from public.plan_requests pr join public.users u on u.id = pr.user_id
                 where pr.plan_ref = p_plan_ref and pr.status in ('approved', 'attended')
                   and u.avatar_url is not null and u.avatar_url ~ '^https://' and not u.is_banned
                 order by pr.decided_at nulls last, pr.id limit 24) x), '[]'::jsonb))
$$;
revoke all on function public.plan_attendees(text) from public;
grant execute on function public.plan_attendees(text) to anon, authenticated;

-- ---------- 4. event photos uploaded from the UI ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = true;
drop policy if exists event_media_read on storage.objects;
drop policy if exists event_media_insert on storage.objects;
create policy event_media_read on storage.objects for select to anon, authenticated using (bucket_id = 'event-media');
create policy event_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-media' and ((select private.is_team()) or (select private.my_host_id()) is not null));

create table if not exists public.event_type_images (
  id bigint generated always as identity primary key,
  event_type text not null check (char_length(event_type) between 1 and 60),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  uploaded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists event_type_images_type on public.event_type_images (event_type, created_at desc);
alter table public.event_type_images enable row level security;
drop policy if exists event_type_images_read on public.event_type_images;
create policy event_type_images_read on public.event_type_images for select to anon, authenticated using (true);
grant select on public.event_type_images to anon, authenticated;

create or replace function public.add_event_image(p_type text, p_url text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare nid bigint;
begin
  if not (private.is_team() or private.my_host_id() is not null) then
    raise exception 'Only hosts and the team can add photos' using errcode = 'insufficient_privilege';
  end if;
  if p_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/event-media/' then
    raise exception 'Upload the photo first' using errcode = 'check_violation';
  end if;
  if char_length(trim(coalesce(p_type, ''))) < 1 then raise exception 'Pick the event type first'; end if;
  insert into public.event_type_images (event_type, url, uploaded_by) values (trim(p_type), p_url, private.current_user_id()) returning id into nid;
  return nid;
end $$;
revoke all on function public.add_event_image(text, text) from public, anon;
grant execute on function public.add_event_image(text, text) to authenticated;

-- ---------- 5. host applications name the event ----------
alter table public.host_applications add column if not exists plan_id bigint references public.custom_plans (id) on delete set null;
alter table public.host_applications add column if not exists new_event jsonb;

create or replace function private.host_application_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.custom_plans;
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
      if exists (select 1 from public.host_profiles h where h.user_id = new.user_id and h.deleted_at is null) then
        raise exception 'You''re already a meetra host. Your Host desk is on this page.' using errcode = 'check_violation';
      end if;
      if new.plan_id is null and new.new_event is null then
        raise exception 'Tell us which event you''ll host: pick one or describe a new one' using errcode = 'check_violation';
      end if;
      if new.plan_id is not null then
        select * into c from public.custom_plans where id = new.plan_id;
        if not found or c.deleted_at is not null or c.status <> 'approved' or c.host_id is not null or c.starts_at <= now() then
          raise exception 'That event isn''t open for a host any more. Pick another one.' using errcode = 'check_violation';
        end if;
        if c.city_slug <> new.city_slug then raise exception 'That event is in another city' using errcode = 'check_violation'; end if;
        new.new_event := null;
      elsif char_length(trim(coalesce(new.new_event ->> 'title', ''))) < 3 then
        raise exception 'Give your new event a title (at least 3 characters)' using errcode = 'check_violation';
      end if;
    elsif new.status <> old.status and new.status <> 'withdrawn' then
      raise exception 'Only the meetra team can change an application''s status' using errcode = 'insufficient_privilege';
    elsif new.team_note is distinct from old.team_note or new.user_id <> old.user_id
          or new.plan_id is distinct from old.plan_id or new.new_event is distinct from old.new_event then
      raise exception 'Only the meetra team can do that' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

-- events with no host yet (for the "pick an event" lists)
create or replace function public.unassigned_events(p_city text default null)
returns table (id bigint, plan_ref text, title text, city_slug text, event_type text, starts_at timestamptz, area text, status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.plan_ref, c.title, c.city_slug, c.event_type, c.starts_at, c.area, c.status
  from public.custom_plans c
  where c.deleted_at is null and c.host_id is null and c.starts_at > now()
    and (c.status = 'approved' or (c.status in ('draft', 'pending') and private.is_team()))
    and (p_city is null or c.city_slug = p_city)
  order by c.starts_at
$$;
revoke all on function public.unassigned_events(text) from public;
grant execute on function public.unassigned_events(text) to anon, authenticated;

-- Main admin: approve as host + (optionally) assign an existing event or create a new one, all in one request.
drop function if exists public.admin_approve_host_application(bigint, text);
create or replace function public.admin_approve_host_application(p_app_id bigint, p_note text default null,
  p_plan_id bigint default null, p_new_event jsonb default null, p_skip_event boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare a public.host_applications; u public.users; p public.user_private; em text; payload jsonb; c public.custom_plans;
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
  if p_skip_event then
    payload := payload || jsonb_build_object('event_choice', 'none');
  elsif p_new_event is not null then
    if char_length(trim(coalesce(p_new_event ->> 'title', ''))) < 3 then raise exception 'The new event needs a title'; end if;
    payload := payload || jsonb_build_object('event_choice', 'new', 'new_event', (p_new_event - 'host_id') || jsonb_build_object('city_slug', a.city_slug));
  elsif p_plan_id is not null then
    select * into c from public.custom_plans where id = p_plan_id;
    if not found or c.deleted_at is not null or c.host_id is not null then raise exception 'That event already has a host. Pick another.'; end if;
    if c.city_slug <> a.city_slug then raise exception 'That event is in %, the host is in %', c.city_slug, a.city_slug; end if;
    payload := payload || jsonb_build_object('event_choice', 'existing', 'assign_plan_id', c.id,
      'assign_event', c.title || ' · ' || to_char(c.starts_at at time zone 'Asia/Kolkata', 'DD Mon, FMHH12:MI AM'));
  end if;
  return public.admin_submit_request('host', 'create', null, payload, coalesce(nullif(trim(p_note), ''), 'Approve application: ' || a.plan_title));
end $$;
revoke all on function public.admin_approve_host_application(bigint, text, bigint, jsonb, boolean) from public, anon;
grant execute on function public.admin_approve_host_application(bigint, text, bigint, jsonb, boolean) to authenticated;

-- host create: link the member, close the application, then assign / create their event
create or replace function private.apply_host(p_action text, p_id bigint, j jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare h public.host_profiles; nid bigint; a public.host_applications; n public.custom_plans; ev jsonb; pid bigint; eid bigint; choice text;
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
      select * into a from public.host_applications where id = app;
      perform set_config('meetra.applying_host', '1', true);
      update public.host_applications set status = 'approved',
        team_note = coalesce(team_note, 'Welcome! Your Host desk is open on this page.') where id = app;
      perform set_config('meetra.applying_host', '', true);
    end if;

    choice := coalesce(j ->> 'event_choice', case when a.plan_id is not null then 'applicant_existing' when a.new_event is not null then 'applicant_new' end);
    if choice = 'existing' then
      -- picked by the admin while approving: must still be free
      pid := (j ->> 'assign_plan_id')::bigint;
      update public.custom_plans set host_id = nid where id = pid and host_id is null and deleted_at is null;
      if not found then raise exception 'That event got a host in the meantime. Pick another one.'; end if;
    elsif choice = 'new' then
      -- created by the admin while approving: goes live straight away with this host
      ev := j -> 'new_event';
      n := private.event_merge(null::public.custom_plans, ev);
      insert into public.custom_plans (city_slug, title, category, category_other, event_type, image_url, host_id, starts_at, ends_at, booking_closes_at, area, price, price_type,
                                       seats, emoji, blurb, steps, tags, status, created_by, starts_on, time_label)
      values (j ->> 'city_slug', n.title, coalesce(n.category, 'other'), n.category_other, n.event_type, n.image_url, nid, n.starts_at, n.ends_at, n.booking_closes_at,
              coalesce(n.area, ''), coalesce(n.price, 0), coalesce(n.price_type, 'reservation'), coalesce(n.seats, 12), coalesce(n.emoji, '✨'),
              coalesce(n.blurb, ''), coalesce(n.steps, '{}'), coalesce(n.tags, '{}'), 'approved', private.current_user_id(), current_date, 'tbd')
      returning id into eid;
      perform private.save_event_location(eid, ev);
    elsif choice = 'applicant_existing' then
      -- the applicant's pick, if nobody took it meanwhile
      update public.custom_plans set host_id = nid where id = a.plan_id and host_id is null and deleted_at is null and status in ('draft', 'pending', 'approved');
    elsif choice = 'applicant_new' then
      -- the applicant's own event becomes a draft on their Host desk (they finish it and send it to the team)
      begin
        n := private.event_merge(null::public.custom_plans, a.new_event);
        insert into public.custom_plans (city_slug, title, category, category_other, event_type, host_id, starts_at, ends_at, area, price, price_type,
                                         seats, emoji, blurb, status, created_by, starts_on, time_label)
        values (a.city_slug, n.title, coalesce(n.category, a.category), n.category_other, n.event_type, nid, n.starts_at, n.ends_at, coalesce(n.area, ''),
                99, 'reservation', coalesce(a.group_size, 12), '✨', coalesce(a.pitch, ''), 'draft', private.current_user_id(), current_date, 'tbd');
      exception when others then
        null;   -- dates already passed etc.: the host simply proposes it again from the desk
      end;
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

-- applications list also shows which event the applicant named
drop function if exists public.admin_host_applications();
create or replace function public.admin_host_applications()
returns table (id bigint, created_at timestamptz, city_slug text, plan_title text, category text, pitch text, experience text,
               frequency text, group_size smallint, availability text, status text, team_note text,
               display_name text, full_name text, avatar_url text, phone text, instagram_url text, linkedin_url text, profile_score smallint,
               host_id bigint, pending_req text, plan_id bigint, plan_event text, new_event jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team() then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
  return query
  select a.id, a.created_at, a.city_slug, a.plan_title, a.category, a.pitch, a.experience, a.frequency, a.group_size, a.availability,
         a.status, a.team_note, u.display_name, p.full_name, u.avatar_url, p.phone, p.instagram_url, p.linkedin_url, u.profile_score,
         (select h.id from public.host_profiles h where h.user_id = a.user_id and h.deleted_at is null limit 1),
         (select r.req_no from public.admin_requests r where r.entity = 'host' and r.action = 'create' and r.status = 'pending'
            and (r.new_value ->> 'application_id')::bigint = a.id limit 1),
         a.plan_id,
         (select c.title || ' · ' || to_char(c.starts_at at time zone 'Asia/Kolkata', 'DD Mon, FMHH12:MI AM') from public.custom_plans c where c.id = a.plan_id),
         a.new_event
  from public.host_applications a join public.users u on u.id = a.user_id left join public.user_private p on p.user_id = u.id
  where private.is_city_admin(a.city_slug)
  order by (a.status in ('rejected', 'withdrawn', 'approved')), u.profile_score desc, a.created_at;
end $$;
revoke all on function public.admin_host_applications() from public, anon;
grant execute on function public.admin_host_applications() to authenticated;

-- Photo diaries: the host or the team adds photos from a plan (once it has started); everyone can browse them on Past nights.
create table if not exists public.event_photos (
  id bigint generated always as identity primary key,
  plan_ref text not null,
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  taken_at timestamptz not null default now(),
  caption text check (char_length(caption) <= 80),
  uploaded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists event_photos_plan on public.event_photos (plan_ref, taken_at);
alter table public.event_photos enable row level security;
drop policy if exists event_photos_read on public.event_photos;
create policy event_photos_read on public.event_photos for select to anon, authenticated using (true);
grant select on public.event_photos to anon, authenticated;

create or replace function public.add_event_photo(p_plan_ref text, p_url text, p_taken_at timestamptz default null, p_caption text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare c public.custom_plans; nid bigint;
begin
  if not (private.can_manage_plan(p_plan_ref) or private.is_plan_host(p_plan_ref)) then
    raise exception 'Only the host of this plan or the team can add photos' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.custom_plans where plan_ref = p_plan_ref and deleted_at is null;
  if not found then raise exception 'Plan not found'; end if;
  if now() < c.starts_at - interval '1 hour' then raise exception 'Photos can be added once the plan starts'; end if;
  if p_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/event-media/' then raise exception 'Upload the photo first'; end if;
  if (select count(*) from public.event_photos where plan_ref = p_plan_ref) >= 60 then raise exception 'A diary holds up to 60 photos'; end if;
  insert into public.event_photos (plan_ref, url, taken_at, caption, uploaded_by)
  values (p_plan_ref, p_url,
          -- keep the photo's own time if it's on the plan's day, else the upload time
          case when p_taken_at between c.starts_at - interval '6 hours' and c.ends_at + interval '12 hours' then p_taken_at else least(now(), c.ends_at) end,
          nullif(trim(p_caption), ''), private.current_user_id())
  returning id into nid;
  return nid;
end $$;
revoke all on function public.add_event_photo(text, text, timestamptz, text) from public, anon;
grant execute on function public.add_event_photo(text, text, timestamptz, text) to authenticated;

create or replace function public.edit_event_photo(p_id bigint, p_caption text default null, p_delete boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.event_photos;
begin
  select * into p from public.event_photos where id = p_id;
  if not found then return; end if;
  if not (private.can_manage_plan(p.plan_ref) or private.is_plan_host(p.plan_ref)) then
    raise exception 'Only the host of this plan or the team can change its photos' using errcode = 'insufficient_privilege';
  end if;
  if p_delete then delete from public.event_photos where id = p_id;
  else update public.event_photos set caption = nullif(trim(left(coalesce(p_caption, ''), 80)), '') where id = p_id; end if;
end $$;
revoke all on function public.edit_event_photo(bigint, text, boolean) from public, anon;
grant execute on function public.edit_event_photo(bigint, text, boolean) to authenticated;

-- the list of diaries (newest plan first)
create or replace function public.photo_diaries(p_city text default null)
returns table (plan_ref text, title text, city_slug text, category text, starts_at timestamptz, area text, photos int, cover text, first_at timestamptz, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.plan_ref, c.title, c.city_slug, c.category, c.starts_at, c.area, count(p.id)::int,
         (array_agg(p.url order by p.taken_at))[1], min(p.taken_at), max(p.taken_at)
  from public.event_photos p join public.custom_plans c on c.plan_ref = p.plan_ref and c.deleted_at is null
  where p_city is null or c.city_slug = p_city
  group by c.plan_ref, c.title, c.city_slug, c.category, c.starts_at, c.area
  order by c.starts_at desc
$$;
revoke all on function public.photo_diaries(text) from public;
grant execute on function public.photo_diaries(text) to anon, authenticated;

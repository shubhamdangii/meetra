-- event lists return the "Other" category text too
drop function if exists public.admin_events();
create or replace function public.admin_events()
returns table (id bigint, plan_ref text, title text, city_slug text, category text, host_id bigint, host_name text,
               starts_at timestamptz, ends_at timestamptz, booking_closes_at timestamptz, area text, price int, price_type text,
               seats smallint, emoji text, blurb text, steps text[], tags text[], status text, display_status text,
               confirmed int, pending int, waitlisted int, pending_req text, cancel_reason text, created_by_name text, updated_at timestamptz, category_other text)
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
         c.cancel_reason, private.user_name(c.created_by), c.updated_at, c.category_other
  from public.custom_plans c
  where c.deleted_at is null
  order by c.starts_at desc nulls last;
end $$;
revoke all on function public.admin_events() from public, anon;
grant execute on function public.admin_events() to authenticated;

drop function if exists public.host_my_events();
create or replace function public.host_my_events()
returns table (id bigint, plan_ref text, title text, city_slug text, category text, starts_at timestamptz, ends_at timestamptz,
               booking_closes_at timestamptz, area text, price int, price_type text, seats smallint, emoji text, blurb text,
               steps text[], tags text[], status text, display_status text, confirmed int, attended int, pending int,
               req_id bigint, req_no text, req_status text, req_remark text, category_other text)
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
         r.id, r.req_no, r.status, r.checker_remark, c.category_other
  from public.custom_plans c
  left join lateral (select x.* from public.admin_requests x where x.entity = 'event' and x.target_id = c.id order by x.id desc limit 1) r on true
  where c.host_id = me and c.deleted_at is null
  order by c.starts_at desc nulls last;
end $$;
revoke all on function public.host_my_events() from public, anon;
grant execute on function public.host_my_events() to authenticated;

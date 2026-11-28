-- Admin dashboard: an approved event that is switched inactive (and has not ended) is no longer counted or labelled "Active".
-- Same wording as the Event library: it shows these under Inactive.
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare j jsonb;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  with ev as (select c.*,
                case when c.status = 'approved' and not c.is_active and c.ends_at >= now() then 'inactive' else private.event_display_status(c) end ds,
                coalesce((select sum(pr.party_size) from public.plan_requests pr where pr.plan_ref = c.plan_ref and pr.status in ('approved', 'attended')), 0)::int booked
              from public.custom_plans c where c.deleted_at is null),
       rq as (select pr.*, coalesce(private.plan_city(pr.plan_ref), 'other') city from public.plan_requests pr)
  select jsonb_build_object(
    'events', jsonb_build_object(
       'active', (select count(*) from ev where ds = 'active'),
       'upcoming', (select count(*) from ev where ds = 'active' and starts_at > now()),
       'ongoing', (select count(*) from ev where ds = 'active' and starts_at <= now()),
       'inactive', (select count(*) from ev where ds = 'inactive'),
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
       'seats', seats, 'booked', booked, 'status', ds) order by starts_at) from (select * from ev where ds in ('active', 'inactive', 'completed')
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

revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

-- Seat requests across every plan the caller manages (main admins: all; sub-admins: their cities),
-- optionally between two plan dates. Used by the Seat requests "All events" view.
create or replace function public.admin_all_requests(p_from date default null, p_to date default null)
returns table (request_id bigint, plan_ref text, plan_date date, city_slug text, display_name text, full_name text, avatar_url text,
               phone text, instagram_url text, linkedin_url text, occupation text, profile_score smallint,
               phone_verified boolean, email_verified boolean, status text, party_size smallint, icebreaker text,
               requested_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team() then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
  return query
  select r.id, r.plan_ref, d.day, private.plan_city(r.plan_ref), u.display_name, p.full_name, u.avatar_url, p.phone,
         p.instagram_url, p.linkedin_url, u.occupation, u.profile_score, p.phone_verified_at is not null, p.email_verified_at is not null,
         r.status, r.party_size, r.icebreaker, r.created_at, r.decided_at
  from public.plan_requests r
  join public.users u on u.id = r.user_id
  left join public.user_private p on p.user_id = u.id
  cross join lateral (select to_date(substring(r.plan_ref from '([0-9]{8})$'), 'YYYYMMDD') as day) d
  where private.can_manage_plan(r.plan_ref)
    and (p_from is null or d.day >= p_from) and (p_to is null or d.day <= p_to)
  order by d.day, (r.status in ('cancelled', 'declined')), u.profile_score desc, r.created_at
  limit 2000;
end $$;
revoke all on function public.admin_all_requests(date, date) from public, anon;
grant execute on function public.admin_all_requests(date, date) to authenticated;

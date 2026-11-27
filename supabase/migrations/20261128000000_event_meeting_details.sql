-- Clear location details for every event.
--   public  (anyone): landmark ("Opposite Law Garden"), meeting point ("Host waits at the entrance with a yellow card")
--   private (confirmed + paid guests, hosts, team): full address and the Google Maps pin
alter table public.event_locations
  add column if not exists address text check (address is null or length(address) <= 200),
  add column if not exists landmark text check (landmark is null or length(landmark) <= 120),
  add column if not exists meeting_point text check (meeting_point is null or length(meeting_point) <= 200);

-- every save path (admin draft, host draft, approved change) calls this with the event payload; only keys present are changed
create or replace function private.save_event_location(p_id bigint, j jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare u text; r public.event_locations;
begin
  if j is null or not (j ?| array['maps_url', 'address', 'landmark', 'meeting_point']) then return; end if;
  u := nullif(trim(j ->> 'maps_url'), '');
  if j ? 'maps_url' and u is not null and not private.valid_maps_url(u) then
    raise exception 'Exact location must be a Google Maps link (google.com/maps, maps.app.goo.gl or goo.gl/maps)' using errcode = 'check_violation';
  end if;
  insert into public.event_locations (plan_id) values (p_id) on conflict (plan_id) do nothing;
  update public.event_locations set
    maps_url      = case when j ? 'maps_url'      then u                                            else maps_url end,
    address       = case when j ? 'address'       then nullif(left(trim(j ->> 'address'), 200), '')       else address end,
    landmark      = case when j ? 'landmark'      then nullif(left(trim(j ->> 'landmark'), 120), '')      else landmark end,
    meeting_point = case when j ? 'meeting_point' then nullif(left(trim(j ->> 'meeting_point'), 200), '') else meeting_point end,
    updated_at = now()
  where plan_id = p_id returning * into r;
  if r.maps_url is null and r.address is null and r.landmark is null and r.meeting_point is null then
    delete from public.event_locations where plan_id = p_id;
  end if;
end $$;

-- private part: address + pin, same rule as before (confirmed and paid, or the host / team)
create or replace function public.my_event_location(p_plan_ref text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.custom_plans; l public.event_locations; ok boolean := false;
begin
  select * into c from public.custom_plans where plan_ref = p_plan_ref and deleted_at is null;
  if not found then return null; end if;
  select * into l from public.event_locations where plan_id = c.id;
  if l.maps_url is null and l.address is null then return jsonb_build_object('maps_url', null, 'address', null, 'allowed', false); end if;
  if private.can_manage_plan(p_plan_ref) or private.is_plan_host(p_plan_ref) then ok := true;
  else
    select true into ok from public.plan_requests pr
    where pr.plan_ref = p_plan_ref and pr.user_id = private.current_user_id()
      and pr.status in ('approved', 'attended')
      and (pr.paid_at is not null or c.price_type = 'free' or coalesce(c.price, 0) = 0)
    limit 1;
  end if;
  if not coalesce(ok, false) then return jsonb_build_object('maps_url', null, 'address', null, 'allowed', false, 'has_address', l.address is not null); end if;
  return jsonb_build_object('maps_url', l.maps_url, 'address', l.address, 'allowed', true);
end $$;

-- public part: landmark + meeting point of live events, for every visitor
create or replace function public.event_meeting_info(p_plan_ref text)
returns table (landmark text, meeting_point text, has_pin boolean)
language sql stable security definer set search_path = '' as $$
  select l.landmark, l.meeting_point, (l.maps_url is not null or l.address is not null)
  from public.custom_plans c join public.event_locations l on l.plan_id = c.id
  where c.plan_ref = p_plan_ref and c.deleted_at is null and c.status = 'approved'
$$;
revoke all on function public.event_meeting_info(text) from public;
grant execute on function public.event_meeting_info(text) to anon, authenticated;

-- edit forms get the new fields
drop function if exists public.event_extras(bigint[]);
create or replace function public.event_extras(p_ids bigint[] default null)
returns table (id bigint, event_type text, image_url text, maps_url text, is_active boolean, address text, landmark text, meeting_point text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.event_type, c.image_url, l.maps_url, c.is_active, l.address, l.landmark, l.meeting_point
  from public.custom_plans c left join public.event_locations l on l.plan_id = c.id
  where c.deleted_at is null and (p_ids is null or c.id = any(p_ids))
    and (private.is_team() or (c.host_id is not null and c.host_id = private.my_host_id()))
$$;
revoke all on function public.event_extras(bigint[]) from public, anon;
grant execute on function public.event_extras(bigint[]) to authenticated;

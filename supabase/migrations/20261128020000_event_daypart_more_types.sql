-- More event types, and Day / Night as a choice (empty = worked out from the start time).
alter table public.custom_plans drop constraint if exists custom_plans_category_check;
alter table public.custom_plans add constraint custom_plans_category_check
  check (category = any (array['food','chai','sports','fitness','games','tech','bhakti','music','dance','comedy','books',
                               'workshop','networking','volunteer','night','outing','art','film','trips','other']));

alter table public.custom_plans add column if not exists day_part text check (day_part is null or day_part in ('day', 'night'));

-- every save path passes the payload through here (audience + day/night + location)
create or replace function private.save_event_location(p_id bigint, j jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare u text; r public.event_locations;
begin
  if j is null then return; end if;
  if j ? 'audience' then
    if coalesce(j ->> 'audience', 'mixed') not in ('mixed', 'men', 'women') then
      raise exception 'Audience must be mixed, boys only or girls only' using errcode = 'check_violation';
    end if;
    update public.custom_plans set audience = coalesce(j ->> 'audience', 'mixed') where id = p_id;
  end if;
  if j ? 'day_part' then
    if nullif(j ->> 'day_part', '') is not null and j ->> 'day_part' not in ('day', 'night') then
      raise exception 'Time of day must be day or night' using errcode = 'check_violation';
    end if;
    update public.custom_plans set day_part = nullif(j ->> 'day_part', '') where id = p_id;
  end if;
  if not (j ?| array['maps_url', 'address', 'landmark', 'meeting_point']) then return; end if;
  u := nullif(trim(j ->> 'maps_url'), '');
  if j ? 'maps_url' and u is not null and not private.valid_maps_url(u) then
    raise exception 'Exact location must be a Google Maps link (google.com/maps, maps.app.goo.gl or goo.gl/maps)' using errcode = 'check_violation';
  end if;
  insert into public.event_locations (plan_id) values (p_id) on conflict (plan_id) do nothing;
  update public.event_locations set
    maps_url      = case when j ? 'maps_url'      then u                                                    else maps_url end,
    address       = case when j ? 'address'       then nullif(left(trim(j ->> 'address'), 200), '')       else address end,
    landmark      = case when j ? 'landmark'      then nullif(left(trim(j ->> 'landmark'), 120), '')      else landmark end,
    meeting_point = case when j ? 'meeting_point' then nullif(left(trim(j ->> 'meeting_point'), 200), '') else meeting_point end,
    updated_at = now()
  where plan_id = p_id returning * into r;
  if r.maps_url is null and r.address is null and r.landmark is null and r.meeting_point is null then
    delete from public.event_locations where plan_id = p_id;
  end if;
end $$;

-- edit forms + the event library get audience and day/night too
drop function if exists public.event_extras(bigint[]);
create or replace function public.event_extras(p_ids bigint[] default null)
returns table (id bigint, event_type text, image_url text, maps_url text, is_active boolean, address text, landmark text, meeting_point text, audience text, day_part text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.event_type, c.image_url, l.maps_url, c.is_active, l.address, l.landmark, l.meeting_point, c.audience, c.day_part
  from public.custom_plans c left join public.event_locations l on l.plan_id = c.id
  where c.deleted_at is null and (p_ids is null or c.id = any(p_ids))
    and (private.is_team() or (c.host_id is not null and c.host_id = private.my_host_id()))
$$;
revoke all on function public.event_extras(bigint[]) from public, anon;
grant execute on function public.event_extras(bigint[]) to authenticated;

-- Sorting events: audience (mixed / boys only / girls only) + new types (chai, tech, bhajan & bhakti).
-- Day vs night is worked out from the start time on the site, so nobody has to tag it.
alter table public.custom_plans drop constraint if exists custom_plans_category_check;
alter table public.custom_plans add constraint custom_plans_category_check
  check (category = any (array['food','sports','games','night','outing','art','film','trips','chai','tech','bhakti','other']));

alter table public.custom_plans add column if not exists audience text not null default 'mixed'
  check (audience in ('mixed', 'men', 'women'));

-- every save path (admin draft, host draft, approved change) already passes the payload through here
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

-- requests: a boys-only / girls-only plan checks the member's gender (from their private profile)
create or replace function private.plan_audience_ok()
returns trigger language plpgsql security definer set search_path = '' as $$
declare aud text; g text;
begin
  if tg_op = 'UPDATE' and not (old.status = 'cancelled' and new.status in ('pending', 'waitlisted')) then return new; end if;
  if auth.uid() is null or private.can_manage_plan(new.plan_ref) then return new; end if;
  select audience into aud from public.custom_plans where plan_ref = new.plan_ref;
  if aud is null or aud = 'mixed' then return new; end if;
  select gender into g from public.user_private where user_id = new.user_id;
  if g is null then
    raise exception 'This plan is % only. Add your gender in your profile to request a seat.', case aud when 'women' then 'for girls' else 'for boys' end using errcode = 'check_violation';
  end if;
  if (aud = 'women' and g <> 'woman') or (aud = 'men' and g <> 'man') then
    raise exception 'This plan is % only.', case aud when 'women' then 'for girls' else 'for boys' end using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists plan_audience_ok on public.plan_requests;
create trigger plan_audience_ok before insert or update on public.plan_requests for each row execute function private.plan_audience_ok();

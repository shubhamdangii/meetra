-- Events are never deleted by admins: they're switched Active / Inactive (hidden from the site, no new requests).
alter table public.custom_plans add column if not exists is_active boolean not null default true;

-- requests: inactive events and inactive example plans take no requests
create or replace function private.plan_request_open()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.custom_plans%rowtype; d date;
begin
  if tg_op = 'UPDATE' and not (old.status = 'cancelled' and new.status in ('pending', 'waitlisted')) then return new; end if;
  if auth.uid() is null or private.can_manage_plan(new.plan_ref) then return new; end if;
  if new.plan_ref like 'x%' then
    select * into c from public.custom_plans where plan_ref = new.plan_ref;
    if not found or c.deleted_at is not null or c.status <> 'approved' or not c.is_active then
      raise exception 'This plan isn''t open for requests' using errcode = 'check_violation';
    end if;
    if now() >= c.booking_closes_at then
      raise exception 'Requests for this plan closed at %', to_char(c.booking_closes_at at time zone 'Asia/Kolkata', 'DD Mon, FMHH12:MI AM') using errcode = 'check_violation';
    end if;
  else
    begin d := to_date(substring(new.plan_ref from '([0-9]{8})$'), 'YYYYMMDD'); exception when others then d := null; end;
    if d is not null and d < (now() at time zone 'Asia/Kolkata')::date then
      raise exception 'This plan has already happened' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.hidden_templates h where new.plan_ref like h.key || '-%') then
      raise exception 'This plan isn''t open for requests' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create or replace function private.plan_open(p_ref text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare c public.custom_plans; d text;
begin
  select * into c from public.custom_plans where plan_ref = p_ref;
  if found then
    return c.deleted_at is null and c.status = 'approved' and c.is_active and now() < coalesce(c.booking_closes_at, c.starts_at - interval '4 hours');
  end if;
  if exists (select 1 from public.hidden_templates h where p_ref like h.key || '-%') then return false; end if;
  d := substring(p_ref from '([0-9]{8})$');
  if d is null then return false; end if;
  return to_date(d, 'YYYYMMDD') >= (now() at time zone 'Asia/Kolkata')::date;
end $$;

-- payments use the same switch
create or replace function private.plan_price(p_ref text)
returns table (price int, price_type text, seats int, open_ok boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare c public.custom_plans;
begin
  select * into c from public.custom_plans where plan_ref = p_ref;
  if found then
    return query select c.price, c.price_type, c.seats::int,
      (c.deleted_at is null and c.status = 'approved' and c.is_active and now() < c.booking_closes_at),
      case when c.deleted_at is not null or c.status <> 'approved' or not c.is_active then 'This plan isn''t open for requests'
           when now() >= c.booking_closes_at then 'Requests for this plan are closed' end;
  else
    return query select null::int, null::text, null::int, private.plan_open(p_ref),
      case when private.plan_open(p_ref) then null else 'Requests for this plan are closed' end;
  end if;
end $$;

-- main admins: switch a live event Active / Inactive. Guests with a confirmed seat must be handled first (cancel the event instead);
-- requests still waiting are closed (paid ones are refunded by the decline trigger).
create or replace function public.admin_set_event_active(p_id bigint, p_active boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.custom_plans; n int;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  select * into c from public.custom_plans where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Event not found'; end if;
  if c.status <> 'approved' then raise exception 'Only live events can be switched (this one is %)', c.status; end if;
  if c.is_active = p_active then return; end if;
  if not p_active then
    select coalesce(sum(party_size), 0) into n from public.plan_requests where plan_ref = c.plan_ref and status in ('approved', 'attended');
    if n > 0 then raise exception '% guest(s) already have a confirmed seat. Cancel the event (with a reason) so they are told and refunded.', n using errcode = 'check_violation'; end if;
    update public.plan_requests set status = 'declined', auto_closed_at = now() where plan_ref = c.plan_ref and status in ('pending', 'waitlisted');
  end if;
  update public.custom_plans set is_active = p_active where id = p_id;
  insert into public.audit_log (actor_id, action, entity, entity_id, summary, details)
  values (private.current_user_id(), case when p_active then 'activated' else 'deactivated' end, 'event', p_id::text,
          case when p_active then 'Event set Active: ' else 'Event set Inactive: ' end || c.title,
          jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), '')));
end $$;
revoke all on function public.admin_set_event_active(bigint, boolean, text) from public, anon;
grant execute on function public.admin_set_event_active(bigint, boolean, text) to authenticated;

-- edit forms / library: include the switch
drop function if exists public.event_extras(bigint[]);
create or replace function public.event_extras(p_ids bigint[] default null)
returns table (id bigint, event_type text, image_url text, maps_url text, is_active boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.event_type, c.image_url, l.maps_url, c.is_active
  from public.custom_plans c left join public.event_locations l on l.plan_id = c.id
  where c.deleted_at is null and (p_ids is null or c.id = any(p_ids))
    and (private.is_team() or (c.host_id is not null and c.host_id = private.my_host_id()))
$$;
revoke all on function public.event_extras(bigint[]) from public, anon;
grant execute on function public.event_extras(bigint[]) to authenticated;

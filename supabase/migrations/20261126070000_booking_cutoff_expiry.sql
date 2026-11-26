-- Booking cutoff enforced on the server, and requests nobody decided on are closed once the plan starts.

-- is this plan still taking requests? Real events: their booking deadline. Example plans: until their day (IST).
create or replace function private.plan_open(p_ref text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare c public.custom_plans; d text;
begin
  select * into c from public.custom_plans where plan_ref = p_ref;
  if found then
    return c.deleted_at is null and c.status = 'approved' and now() < coalesce(c.booking_closes_at, c.starts_at - interval '4 hours');
  end if;
  d := substring(p_ref from '([0-9]{8})$');
  if d is null then return false; end if;
  return to_date(d, 'YYYYMMDD') >= (now() at time zone 'Asia/Kolkata')::date;
end $$;

-- has this plan started? (requests still undecided after this are closed automatically)
create or replace function private.plan_started(p_ref text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare c public.custom_plans; d text;
begin
  select * into c from public.custom_plans where plan_ref = p_ref;
  if found then return now() >= c.starts_at or c.deleted_at is not null or c.status = 'cancelled'; end if;
  d := substring(p_ref from '([0-9]{8})$');
  if d is null then return false; end if;
  return to_date(d, 'YYYYMMDD') < (now() at time zone 'Asia/Kolkata')::date;
end $$;

-- members can't ask (or re-ask) once requests are closed
create or replace function private.plan_request_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare team boolean := auth.uid() is null or private.can_manage_plan(new.plan_ref)
  or (coalesce(current_setting('meetra.door', true), '') = '1' and tg_op = 'UPDATE' and private.is_plan_host(new.plan_ref)
      and old.status in ('approved', 'attended') and new.status in ('approved', 'attended'));
begin
  if not team then
    if tg_op = 'INSERT' then
      if new.status not in ('pending', 'waitlisted') or new.decided_at is not null then
        raise exception 'New requests must be pending or on the waiting list' using errcode = 'check_violation';
      end if;
      if not private.plan_open(new.plan_ref) then
        raise exception 'This event is no longer accepting requests' using errcode = 'check_violation';
      end if;
    else
      if new.plan_ref <> old.plan_ref or new.user_id <> old.user_id or new.decided_at is distinct from old.decided_at then
        raise exception 'You can only cancel or re-send your own request' using errcode = 'insufficient_privilege';
      end if;
      if new.status <> old.status
         and not (new.status = 'cancelled'
                  or (old.status = 'cancelled' and new.status in ('pending', 'waitlisted'))) then
        raise exception 'Only the meetra team can approve or decline' using errcode = 'insufficient_privilege';
      end if;
      if old.status = 'cancelled' and new.status in ('pending', 'waitlisted') and not private.plan_open(new.plan_ref) then
        raise exception 'This event is no longer accepting requests' using errcode = 'check_violation';
      end if;
      if old.status = 'attended' then
        raise exception 'This plan is already checked in' using errcode = 'insufficient_privilege';
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.plan_ref <> old.plan_ref then
    raise exception 'A request cannot move to another plan' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'declined', 'waitlisted') and team
     and not (old.status = 'attended' and new.status = 'approved') then
    new.decided_at := now();
  end if;
  return new;
end $$;

-- payments: example plans also close (the order is refused before any money moves)
create or replace function private.plan_price(p_ref text)
returns table (price int, price_type text, seats int, open_ok boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare c public.custom_plans;
begin
  select * into c from public.custom_plans where plan_ref = p_ref;
  if found then
    return query select c.price, c.price_type, c.seats::int,
      (c.deleted_at is null and c.status = 'approved' and now() < c.booking_closes_at),
      case when c.deleted_at is not null or c.status <> 'approved' then 'This plan isn''t open for requests'
           when now() >= c.booking_closes_at then 'Requests for this plan are closed' end;
  else
    return query select null::int, null::text, null::int, private.plan_open(p_ref),
      case when private.plan_open(p_ref) then null else 'Requests for this plan are closed' end;
  end if;
end $$;

-- requests nobody decided on are closed when the plan starts (paid ones are refunded by the decline trigger)
alter table public.plan_requests add column if not exists auto_closed_at timestamptz;
create or replace function private.expire_requests()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.plan_requests r set status = 'declined', auto_closed_at = now()
  where r.status in ('pending', 'waitlisted') and private.plan_started(r.plan_ref);
  get diagnostics n = row_count;
  return n;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'meetra-expire-requests';
select cron.schedule('meetra-expire-requests', '*/15 * * * *', 'select private.expire_requests()');

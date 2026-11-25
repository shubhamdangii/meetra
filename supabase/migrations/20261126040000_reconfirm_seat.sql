-- "I'm in ✅": confirmed guests re-confirm they're coming in the 3 days before the plan.
alter table public.plan_requests add column if not exists reconfirmed_at timestamptz;

create or replace function public.reconfirm_seat(p_request_id bigint)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare r public.plan_requests; c public.custom_plans; starts timestamptz;
begin
  select * into r from public.plan_requests where id = p_request_id and user_id = private.current_user_id();
  if not found then raise exception 'Seat not found' using errcode = 'no_data_found'; end if;
  if r.status <> 'approved' then raise exception 'Only a confirmed seat can be re-confirmed'; end if;
  select * into c from public.custom_plans where plan_ref = r.plan_ref;
  if c.id is not null then
    if c.price_type <> 'free' and coalesce(c.price, 0) > 0 and r.paid_at is null then raise exception 'Pay to confirm your seat first'; end if;
    starts := c.starts_at;
    if now() < starts - interval '3 days' then raise exception 'You can re-confirm in the 3 days before the plan'; end if;
    if now() > starts then raise exception 'This plan has already started'; end if;
  end if;
  update public.plan_requests set reconfirmed_at = coalesce(reconfirmed_at, now()) where id = p_request_id returning reconfirmed_at into starts;
  return starts;
end $$;
revoke all on function public.reconfirm_seat(bigint) from public, anon;
grant execute on function public.reconfirm_seat(bigint) to authenticated;

-- door lists: which confirmed guests said "I'm in" (team or the plan's own host)
create or replace function public.plan_reconfirmed(p_plan_ref text)
returns table (request_id bigint, reconfirmed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.can_manage_plan(p_plan_ref) or private.is_plan_host(p_plan_ref)) then
    raise exception 'Team or the plan''s host only' using errcode = 'insufficient_privilege';
  end if;
  return query select r.id, r.reconfirmed_at from public.plan_requests r
    where r.plan_ref = p_plan_ref and r.reconfirmed_at is not null and r.status in ('approved', 'attended');
end $$;
revoke all on function public.plan_reconfirmed(text) from public, anon;
grant execute on function public.plan_reconfirmed(text) to authenticated;

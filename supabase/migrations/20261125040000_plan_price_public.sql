-- Server-only price lookup for the payments function (service role). Not callable from browsers.
create or replace function public.plan_price_public(p_ref text)
returns table (price int, price_type text, seats int, open_ok boolean, reason text, title text)
language sql stable security definer set search_path = '' as $$
  select p.price, p.price_type, p.seats, p.open_ok, p.reason, (select c.title from public.custom_plans c where c.plan_ref = p_ref)
  from private.plan_price(p_ref) p
$$;
revoke all on function public.plan_price_public(text) from public, anon, authenticated;
grant execute on function public.plan_price_public(text) to service_role;

-- Razorpay payments (test mode first).
--  * Requesting a seat on a paid plan: the member pays first (Razorpay Checkout: UPI/QR, cards,
--    netbanking, wallets). Only a verified payment creates the seat request (edge function `payments`).
--  * Waiting list is free. When the team approves a waitlisted (or older unpaid) request, the member
--    gets "Pay to confirm".
--  * Declined, or cancelled before approval → automatic refund (edge function `pay-refund`).
--  * The key secret lives only in the edge functions (Supabase secrets).

create table if not exists public.payments (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.users (id) on delete cascade,
  plan_ref        text not null,
  request_id      bigint references public.plan_requests (id) on delete set null,
  party_size      smallint not null default 1 check (party_size between 1 and 2),
  icebreaker      text check (char_length(icebreaker) <= 300),
  amount          int not null check (amount > 0),          -- paise
  currency        text not null default 'INR',
  rzp_order_id    text not null unique,
  rzp_payment_id  text unique,
  status          text not null default 'created' check (status in ('created', 'paid', 'refund_pending', 'refunded', 'refund_failed', 'failed')),
  refund_id       text,
  refund_error    text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  refunded_at     timestamptz
);
create index if not exists payments_request_idx on public.payments (request_id);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (user_id = (select private.current_user_id()) or (select private.is_admin()));

-- what the member and the team see on the seat itself (written only by the payment functions)
alter table public.plan_requests add column if not exists paid_amount int;           -- paise, null = not paid
alter table public.plan_requests add column if not exists paid_at timestamptz;
alter table public.plan_requests add column if not exists refund_status text check (refund_status in ('pending', 'refunded', 'failed'));

-- refund automatically: declined by the team, or cancelled by the member before approval
create or replace function private.refund_on_decline()
returns trigger language plpgsql security definer set search_path = '' as $$
declare url text; secret text;
begin
  if new.status is not distinct from old.status or new.paid_at is null or new.refund_status is not null then return new; end if;
  if not (new.status = 'declined' or (new.status = 'cancelled' and old.status in ('pending', 'waitlisted'))) then return new; end if;
  select value into url from private.app_settings where key = 'pay_refund_url';
  select value into secret from private.app_settings where key = 'admin_push_secret';
  if url is null or secret is null then return new; end if;
  update public.plan_requests set refund_status = 'pending' where id = new.id;
  perform net.http_post(url := url, body := jsonb_build_object('request_id', new.id),
                        headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
                        timeout_milliseconds := 8000);
  return new;
exception when others then
  return new;   -- never block the seat decision; the team can retry from the Razorpay dashboard
end $$;
drop trigger if exists plan_requests_refund on public.plan_requests;
create trigger plan_requests_refund after update of status on public.plan_requests
  for each row execute function private.refund_on_decline();

-- seat price the server trusts: real events from the table (sample plans pass their listed price)
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
    return query select null::int, null::text, null::int, true, null::text;
  end if;
end $$;

-- admins: seat list shows payment
drop function if exists public.admin_all_requests(date, date);
create or replace function public.admin_all_requests(p_from date default null, p_to date default null)
returns table (request_id bigint, plan_ref text, plan_date date, city_slug text, display_name text, full_name text, avatar_url text,
               phone text, instagram_url text, linkedin_url text, occupation text, profile_score smallint,
               phone_verified boolean, email_verified boolean, status text, party_size smallint, icebreaker text,
               requested_at timestamptz, decided_at timestamptz, paid_amount int, paid_at timestamptz, refund_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team() then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
  return query
  select r.id, r.plan_ref, d.day, coalesce(cp.city_slug, private.plan_city(r.plan_ref)), u.display_name, p.full_name, u.avatar_url, p.phone,
         p.instagram_url, p.linkedin_url, u.occupation, u.profile_score, p.phone_verified_at is not null, p.email_verified_at is not null,
         r.status, r.party_size, r.icebreaker, r.created_at, r.decided_at, r.paid_amount, r.paid_at, r.refund_status
  from public.plan_requests r
  join public.users u on u.id = r.user_id
  left join public.user_private p on p.user_id = u.id
  left join public.custom_plans cp on cp.plan_ref = r.plan_ref
  cross join lateral (select coalesce(cp.starts_on, to_date(substring(r.plan_ref from '([0-9]{8})$'), 'YYYYMMDD')) as day) d
  where private.can_manage_plan(r.plan_ref)
    and (p_from is null or d.day >= p_from) and (p_to is null or d.day <= p_to)
  order by d.day, (r.status in ('cancelled', 'declined')), u.profile_score desc, r.created_at
  limit 2000;
end $$;
revoke all on function public.admin_all_requests(date, date) from public, anon;
grant execute on function public.admin_all_requests(date, date) to authenticated;

-- member notification wording when a seat still needs paying
create or replace function private.notify_member_seat()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text := private.plan_title(new.plan_ref); link text := '/saved/'; pr record;
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into pr from private.plan_price(new.plan_ref);
  if new.status = 'approved' and old.status <> 'attended' then
    if new.paid_at is null and coalesce(pr.price, 1) > 0 and coalesce(pr.price_type, 'reservation') <> 'free' then
      perform private.notify(new.user_id, 'seat_approved', '🎉 A seat is yours! Pay to confirm',
        'You got a seat at ' || t || '. Pay in Your plans to lock it in.', link);
    else
      perform private.notify(new.user_id, 'seat_approved', '🎉 Congrats! Your seat is confirmed',
        'You''re in for ' || t || '. Your door pass is ready in Your plans.', '/ticket/?id=' || new.plan_ref);
    end if;
  elsif new.status = 'waitlisted' then
    perform private.notify(new.user_id, 'seat_waitlisted', '🕒 You''re on the waiting list',
      t || ' is full right now. We''ll tell you the moment a seat opens.', link);
  elsif new.status = 'declined' then
    perform private.notify(new.user_id, 'seat_declined', 'Not this time',
      'We couldn''t fit you into ' || t || case when new.paid_at is not null then '. Your payment is being refunded.' else '.' end, '/events/');
  elsif new.status = 'attended' then
    perform private.notify(new.user_id, 'checked_in', '✅ You''re checked in', 'Welcome to ' || t || '! Have the best time.', link);
  end if;
  return new;
end $$;

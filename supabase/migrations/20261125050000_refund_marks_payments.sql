-- Refunds: the trigger marks exactly which payments to refund (at decline/cancel time), so a payment made
-- after the member re-requests the same plan is never refunded by a late-running refund call.
create or replace function private.refund_on_decline()
returns trigger language plpgsql security definer set search_path = '' as $$
declare url text; secret text;
begin
  if new.status is not distinct from old.status or new.paid_at is null or new.refund_status is not null then return new; end if;
  if not (new.status = 'declined' or (new.status = 'cancelled' and old.status in ('pending', 'waitlisted'))) then return new; end if;
  select value into url from private.app_settings where key = 'pay_refund_url';
  select value into secret from private.app_settings where key = 'admin_push_secret';
  if url is null or secret is null then return new; end if;
  update public.payments set status = 'refund_pending' where request_id = new.id and status = 'paid';
  update public.plan_requests set refund_status = 'pending' where id = new.id;
  perform net.http_post(url := url, body := jsonb_build_object('request_id', new.id),
                        headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
                        timeout_milliseconds := 8000);
  return new;
exception when others then
  return new;   -- never block the seat decision; the team can retry from the Razorpay dashboard
end $$;

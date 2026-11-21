-- =====================================================================
-- Free WhatsApp login: the member SENDS a code to meetra's WhatsApp
-- number (user-initiated messages are free), Meta forwards it to our
-- webhook, and the browser that asked for the code gets logged in.
-- Only the server functions (service role) touch this table.
-- =====================================================================

create table public.wa_login_requests (
  id            uuid primary key default gen_random_uuid(),
  purpose       text not null default 'login' check (purpose in ('login', 'link')),
  code          text not null check (code ~ '^[0-9]{6}$'),
  secret_hash   text not null,                      -- sha-256 of a random secret kept only in the browser
  link_user_id  uuid references auth.users (id) on delete cascade,   -- for 'link': the logged-in member adding a number
  phone         text check (phone ~ '^[1-9][0-9]{7,14}$'),            -- filled from the WhatsApp sender (digits, no +)
  status        text not null default 'pending' check (status in ('pending', 'verified', 'used', 'expired')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '10 minutes',
  verified_at   timestamptz,
  constraint wa_link_needs_user check (purpose <> 'link' or link_user_id is not null)
);

-- A code can only be waiting once at a time.
create unique index wa_login_requests_pending_code on public.wa_login_requests (code) where status = 'pending';
create index wa_login_requests_created on public.wa_login_requests (created_at);

alter table public.wa_login_requests enable row level security;   -- no policies: browsers can't read or write it
revoke all on public.wa_login_requests from anon, authenticated;

-- Server helper: which login account owns this phone number (digits, no +)?
create or replace function public.wa_find_user_by_phone(p_phone text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where phone = p_phone order by created_at limit 1
$$;
revoke all on function public.wa_find_user_by_phone(text) from public, anon, authenticated;
grant execute on function public.wa_find_user_by_phone(text) to service_role;

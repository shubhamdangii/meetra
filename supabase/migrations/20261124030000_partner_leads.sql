-- Brands & venues: enquiries saved in the database (no login needed), managed in Admin → Brands.
create table if not exists public.partner_leads (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(trim(name)) between 2 and 80),
  company     text not null check (char_length(trim(company)) between 2 and 120),
  kind        text not null check (kind in ('venue', 'brand', 'team', 'other')),
  city_slug   text references public.cities (slug) on update cascade,
  phone       text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  link        text check (link is null or char_length(link) <= 200),
  message     text not null default '' check (char_length(message) <= 1500),
  status      text not null default 'new' check (status in ('new', 'talking', 'won', 'not_now')),
  admin_note  text check (char_length(admin_note) <= 1500),
  owner_id    uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint partner_leads_contact check (phone is not null or email is not null)
);
create index if not exists partner_leads_status_idx on public.partner_leads (status, created_at desc);
create trigger partner_leads_set_updated_at before update on public.partner_leads for each row execute function private.set_updated_at();
alter table public.partner_leads enable row level security;
revoke all on public.partner_leads from anon, authenticated;

-- public: send an enquiry (at most 3 from the same phone/email per day)
create or replace function public.submit_partner_lead(p_name text, p_company text, p_kind text, p_city text, p_phone text, p_email text, p_link text, p_message text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare nid bigint; ph text; em text := nullif(lower(trim(coalesce(p_email, ''))), ''); a uuid;
begin
  ph := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  if ph is not null then
    if length(ph) = 10 then ph := '+91' || ph; elsif length(ph) = 12 and ph like '91%' then ph := '+' || ph; else ph := '+' || ph; end if;
  end if;
  if ph is null and em is null then raise exception 'Add a WhatsApp number or an email so we can reply' using errcode = 'check_violation'; end if;
  if (select count(*) from public.partner_leads l where l.created_at > now() - interval '1 day' and ((ph is not null and l.phone = ph) or (em is not null and l.email = em))) >= 3 then
    raise exception 'We already have your enquiry. We''ll reply soon!' using errcode = 'check_violation';
  end if;
  insert into public.partner_leads (name, company, kind, city_slug, phone, email, link, message)
  values (trim(p_name), trim(p_company), coalesce(nullif(p_kind, ''), 'other'), nullif(p_city, ''), ph, em, nullif(trim(coalesce(p_link, '')), ''), left(trim(coalesce(p_message, '')), 1500))
  returning id into nid;
  for a in select * from private.main_admin_ids() loop
    perform private.notify(a, 'partner', 'New brand/venue enquiry', trim(p_company) || ' (' || coalesce(nullif(p_kind, ''), 'other') || ') · ' || trim(p_name), '/admin/?tab=brands');
  end loop;
  return nid;
end $$;
revoke all on function public.submit_partner_lead(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_partner_lead(text, text, text, text, text, text, text, text) to anon, authenticated;

-- admins: list and update (status / note / owner). Main admins only.
create or replace function public.admin_partner_leads()
returns table (id bigint, name text, company text, kind text, city_slug text, phone text, email text, link text, message text,
               status text, admin_note text, owner_name text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  return query select l.id, l.name, l.company, l.kind, l.city_slug, l.phone, l.email, l.link, l.message, l.status, l.admin_note,
    private.user_name(l.owner_id), l.created_at, l.updated_at from public.partner_leads l order by (l.status in ('won', 'not_now')), l.created_at desc;
end $$;

create or replace function public.admin_update_partner_lead(p_id bigint, p_status text, p_note text, p_take boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare old public.partner_leads;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  select * into old from public.partner_leads where id = p_id for update;
  if not found then raise exception 'Enquiry not found'; end if;
  update public.partner_leads set status = coalesce(p_status, status), admin_note = coalesce(p_note, admin_note),
    owner_id = case when p_take then private.current_user_id() else owner_id end where id = p_id;
  perform private.log('updated', 'partner', p_id::text, 'Brand enquiry "' || old.company || '": ' || old.status || ' → ' || coalesce(p_status, old.status),
    jsonb_build_object('note', p_note));
end $$;
revoke all on function public.admin_partner_leads() from public, anon;
grant execute on function public.admin_partner_leads() to authenticated;
revoke all on function public.admin_update_partner_lead(bigint, text, text, boolean) from public, anon;
grant execute on function public.admin_update_partner_lead(bigint, text, text, boolean) to authenticated;

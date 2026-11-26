-- Brands & venues: whoever sends an enquiry can follow its status (by a private tracking code, and by their login if they had one).
alter table public.partner_leads add column if not exists track_code uuid not null default gen_random_uuid();
alter table public.partner_leads add column if not exists submitted_by uuid references public.users (id) on delete set null;
create unique index if not exists partner_leads_track_code on public.partner_leads (track_code);

-- same checks as submit_partner_lead, but returns the tracking code too
create or replace function public.submit_partner_enquiry(p_name text, p_company text, p_kind text, p_city text, p_phone text, p_email text, p_link text, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare nid bigint; code uuid;
begin
  nid := public.submit_partner_lead(p_name, p_company, p_kind, p_city, p_phone, p_email, p_link, p_message);
  update public.partner_leads set submitted_by = private.current_user_id() where id = nid returning track_code into code;
  return jsonb_build_object('id', nid, 'code', code);
end $$;
revoke all on function public.submit_partner_enquiry(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_partner_enquiry(text, text, text, text, text, text, text, text) to anon, authenticated;

-- status of my enquiries: the codes saved on this device, plus anything sent while logged in. No contact details are returned.
create or replace function public.my_partner_enquiries(p_codes uuid[] default '{}')
returns table (id bigint, company text, kind text, status text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.company, l.kind, l.status, l.created_at, l.updated_at from public.partner_leads l
  where l.track_code = any (coalesce(p_codes, '{}')) or (l.submitted_by is not null and l.submitted_by = private.current_user_id())
  order by l.created_at desc limit 20
$$;
revoke all on function public.my_partner_enquiries(uuid[]) from public;
grant execute on function public.my_partner_enquiries(uuid[]) to anon, authenticated;

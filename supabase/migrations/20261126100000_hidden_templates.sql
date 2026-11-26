-- Event library: main admins can remove an example plan (from data.ts) from the site, and bring it back.
create table if not exists public.hidden_templates (
  key text primary key check (char_length(key) between 2 and 60),
  hidden_by uuid references public.users (id) on delete set null,
  hidden_at timestamptz not null default now()
);
alter table public.hidden_templates enable row level security;
drop policy if exists hidden_templates_read on public.hidden_templates;
create policy hidden_templates_read on public.hidden_templates for select to anon, authenticated using (true);
grant select on public.hidden_templates to anon, authenticated;

create or replace function public.admin_hide_template(p_key text, p_hide boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  if p_hide then
    insert into public.hidden_templates (key, hidden_by) values (p_key, private.current_user_id()) on conflict (key) do nothing;
  else
    delete from public.hidden_templates where key = p_key;
  end if;
  insert into public.audit_log (actor_id, action, entity, summary)
  values (private.current_user_id(), case when p_hide then 'deleted' else 'restored' end, 'event',
          case when p_hide then 'Example plan removed from the site: ' else 'Example plan restored: ' end || p_key);
end $$;
revoke all on function public.admin_hide_template(text, boolean) from public, anon;
grant execute on function public.admin_hide_template(text, boolean) to authenticated;

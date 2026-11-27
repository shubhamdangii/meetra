-- Merch drop 01: members register interest in a piece (colour + size). Nothing is paid here.
create table if not exists public.merch_interest (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  item text not null check (item ~ '^[a-z0-9-]{2,40}$'),
  colour text not null check (char_length(colour) between 1 and 30),
  size text not null check (size in ('XS','S','M','L','XL','XXL','One size')),
  created_at timestamptz not null default now(),
  unique (user_id, item)
);
alter table public.merch_interest enable row level security;
-- members see only their own; the team sees all (all writes go through the functions below)
drop policy if exists merch_own on public.merch_interest;
create policy merch_own on public.merch_interest for select to authenticated using (user_id = private.current_user_id() or private.is_team());
revoke insert, update, delete on public.merch_interest from anon, authenticated;
grant select on public.merch_interest to authenticated;

create or replace function public.join_merch_drop(p_item text, p_colour text, p_size text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id();
begin
  if me is null then raise exception 'Log in to join the drop' using errcode = 'insufficient_privilege'; end if;
  insert into public.merch_interest (user_id, item, colour, size) values (me, p_item, left(trim(p_colour), 30), p_size)
  on conflict (user_id, item) do update set colour = excluded.colour, size = excluded.size, created_at = now();
end $$;

create or replace function public.leave_merch_drop(p_item text)
returns void language sql security definer set search_path = '' as $$
  delete from public.merch_interest where user_id = private.current_user_id() and item = p_item
$$;

-- how many people want each piece (team only)
create or replace function public.admin_merch_interest()
returns table (item text, colour text, size text, people bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team() then raise exception 'Team only' using errcode = 'insufficient_privilege'; end if;
  return query select m.item, m.colour, m.size, count(*) from public.merch_interest m group by 1, 2, 3 order by 4 desc;
end $$;

revoke all on function public.join_merch_drop(text, text, text), public.leave_merch_drop(text), public.admin_merch_interest() from public, anon;
grant execute on function public.join_merch_drop(text, text, text), public.leave_merch_drop(text), public.admin_merch_interest() to authenticated;

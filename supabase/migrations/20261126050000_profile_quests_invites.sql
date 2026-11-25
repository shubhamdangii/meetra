-- Profile quests (three words + a prompt) and "bring your people" invites with points.

-- 1. quests: hosts and other guests can read these; members edit their own
alter table public.users add column if not exists three_words text[] not null default '{}' check (cardinality(three_words) <= 3);
alter table public.users add column if not exists prompt_q text check (char_length(prompt_q) <= 80);
alter table public.users add column if not exists prompt_a text check (char_length(prompt_a) <= 160);
grant select (three_words, prompt_q, prompt_a) on public.users to anon, authenticated;
grant update (three_words, prompt_q, prompt_a) on public.users to authenticated;

-- 2. invites
alter table public.users add column if not exists invite_code text unique;
alter table public.users add column if not exists referred_by uuid references public.users (id) on delete set null;
alter table public.users add column if not exists referred_at timestamptz;

-- my code + how my friends are doing (+10 when a friend finishes their profile, +20 when they come to a plan)
create or replace function public.my_invites()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); code text; joined int; completed int; came int;
begin
  if me is null then raise exception 'Log in first' using errcode = 'insufficient_privilege'; end if;
  select invite_code into code from public.users where id = me;
  while code is null loop
    code := lower(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=', 'xyz'), 1, 7));
    begin
      update public.users set invite_code = code where id = me;
    exception when unique_violation then code := null;
    end;
  end loop;
  select count(*), count(*) filter (where u.profile_score >= 60),
         count(*) filter (where exists (select 1 from public.plan_requests r where r.user_id = u.id and r.status = 'attended'))
    into joined, completed, came
  from public.users u where u.referred_by = me;
  return jsonb_build_object('code', code, 'joined', joined, 'completed', completed, 'came', came, 'points', completed * 10 + came * 20);
end $$;
revoke all on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

-- a new member opened a friend's link: remember who invited them (once, only for new accounts)
create or replace function public.claim_invite(p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); u public.users; inviter uuid;
begin
  if me is null then return false; end if;
  select * into u from public.users where id = me;
  if u.referred_by is not null or u.created_at < now() - interval '7 days' then return false; end if;
  select id into inviter from public.users where invite_code = lower(trim(p_code)) and id <> me;
  if inviter is null then return false; end if;
  update public.users set referred_by = inviter, referred_at = now() where id = me;
  return true;
end $$;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

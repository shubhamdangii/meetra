-- "Who's coming" gets a crowd summary (no names): how many come solo, first-timers vs regulars, verified members.
-- Reviews get quick host tags (made me feel welcome / kept it flowing / felt safe).

create or replace function public.plan_attendees(p_plan_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with g as (
    select pr.user_id, pr.party_size, u.avatar_url, u.is_banned, pr.decided_at, pr.id,
      exists (select 1 from public.plan_requests x where x.user_id = pr.user_id and x.status = 'attended' and x.plan_ref <> p_plan_ref) as been_before,
      exists (select 1 from public.user_private up where up.user_id = pr.user_id and up.phone_verified_at is not null) as verified
    from public.plan_requests pr join public.users u on u.id = pr.user_id
    where pr.plan_ref = p_plan_ref and pr.status in ('approved', 'attended')
  )
  select jsonb_build_object(
    'count', coalesce((select sum(party_size) from g), 0),
    'people', (select count(*) from g),
    'solo', (select count(*) from g where party_size = 1),
    'first_timers', (select count(*) from g where not been_before),
    'returning', (select count(*) from g where been_before),
    'verified', (select count(*) from g where verified),
    'photos', coalesce((select jsonb_agg(x.avatar_url) from (
                 select avatar_url from g where avatar_url is not null and avatar_url ~ '^https://' and not is_banned
                 order by decided_at nulls last, id limit 24) x), '[]'::jsonb))
$$;
revoke all on function public.plan_attendees(text) from public;
grant execute on function public.plan_attendees(text) to anon, authenticated;

-- review tags
alter table public.host_reviews add column if not exists tags text[] not null default '{}'
  check (tags <@ array['welcome', 'flowing', 'safe', 'fun', 'organised']::text[]);

drop function if exists public.submit_review(text, int, text);
create or replace function public.submit_review(p_plan_ref text, p_rating int, p_comment text default '', p_tags text[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); c public.custom_plans; att timestamptz;
  t text[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_tags, '{}')) x
                        where x = any (array['welcome', 'flowing', 'safe', 'fun', 'organised'])), '{}');
begin
  if me is null then raise exception 'Log in first' using errcode = 'insufficient_privilege'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Rating must be 1 to 5'; end if;
  select pr.checked_in_at into att from public.plan_requests pr where pr.plan_ref = p_plan_ref and pr.user_id = me and pr.status = 'attended';
  if not found then raise exception 'Only people who attended this plan can review it' using errcode = 'insufficient_privilege'; end if;
  select * into c from public.custom_plans where plan_ref = p_plan_ref;
  if c.id is not null and now() < c.starts_at + interval '30 minutes' then
    raise exception 'Reviews open 30 minutes after the plan starts' using errcode = 'check_violation';
  end if;
  if att is not null and att < now() - interval '30 days' then raise exception 'Reviews close 30 days after the plan'; end if;
  insert into public.host_reviews (plan_ref, event_id, host_id, user_id, rating, comment, tags)
  values (p_plan_ref, c.id, c.host_id, me, p_rating, left(trim(coalesce(p_comment, '')), 600), t)
  on conflict (plan_ref, user_id) do update set rating = excluded.rating, comment = excluded.comment, tags = excluded.tags, created_at = now();
end $$;
revoke all on function public.submit_review(text, int, text, text[]) from public, anon;
grant execute on function public.submit_review(text, int, text, text[]) to authenticated;

-- a host's most-given tags (shown on the host card / profile)
create or replace function public.host_tag_counts(p_host_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb) from (
    select unnest(r.tags) tag, count(*) n from public.host_reviews r
    where r.host_id = p_host_id and r.hidden_at is null group by 1) s
$$;
revoke all on function public.host_tag_counts(bigint) from public;
grant execute on function public.host_tag_counts(bigint) to anon, authenticated;

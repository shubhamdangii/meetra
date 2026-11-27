-- Profile score: users and user_private are saved separately, and each trigger could read the other table before it
-- committed, leaving a stale score. The profile page now asks for one final recompute after saving.
create or replace function public.refresh_my_profile()
returns smallint language plpgsql security definer set search_path = '' as $$
declare me uuid := private.current_user_id(); s smallint;
begin
  if me is null then raise exception 'Log in first' using errcode = 'insufficient_privilege'; end if;
  perform private.refresh_profile_status(me);
  select profile_score into s from public.users where id = me;
  return s;
end $$;
revoke all on function public.refresh_my_profile() from public, anon;
grant execute on function public.refresh_my_profile() to authenticated;

-- fix scores that are already stale
select private.refresh_profile_status(id) from public.users;

-- Undo for supabase/migrations/20261128060000_profile_score_simple.sql
-- Restores the previous score function (the one from 20261122100000_profile_score_no_socials.sql), the original trigger column list,
-- and re-scores every profile with the old weights. Run it as one transaction in the Supabase SQL editor.
begin;

create or replace function private.refresh_profile_status(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  u     public.users%rowtype;
  p     public.user_private%rowtype;
  bio   int;
  score int;
  done  boolean;
begin
  select * into u from public.users where id = p_user_id;
  select * into p from public.user_private where user_id = p_user_id;
  if u.id is null then return; end if;
  bio := char_length(trim(coalesce(u.bio, '')));

  score := (case when u.avatar_url is not null then 15 else 0 end)
         + (case when u.display_name <> 'New member' then 5 else 0 end)
         + (case when u.city_slug is not null then 5 else 0 end)
         + (case when nullif(trim(u.occupation), '') is not null then 5 else 0 end)
         + (case when bio >= 20 then 10 else 0 end)
         + (case when bio >= 80 then 10 else 0 end)
         + (case when p.full_name is not null then 5 else 0 end)
         + (case when p.date_of_birth is not null then 5 else 0 end)
         + (case when p.gender is not null then 5 else 0 end)
         + (case when p.phone is not null then 5 else 0 end)
         + (case when p.phone_verified_at is not null then 10 else 0 end)
         + (case when p.email is not null then 5 else 0 end)
         + (case when p.email_verified_at is not null then 5 else 0 end)
         + (case when p.accepted_rules_at is not null then 10 else 0 end);

  done := u.display_name <> 'New member' and u.avatar_url is not null and u.city_slug is not null
          and nullif(trim(u.occupation), '') is not null and bio >= 20
          and p.full_name is not null and p.date_of_birth is not null and p.gender is not null
          and p.phone is not null and p.email is not null
          and p.accepted_rules_at is not null
          and (p.phone_verified_at is not null or p.email_verified_at is not null);
  done := coalesce(done, false);

  update public.users
     set profile_score = least(score, 100),
         profile_completed_at = case when done then coalesce(profile_completed_at, now()) end
   where id = p_user_id
     and (profile_score <> least(score, 100) or (profile_completed_at is null) = done);
end $$;

drop trigger if exists users_profile_status on public.users;
create trigger users_profile_status
  after update of display_name, avatar_url, bio, city_slug, occupation on public.users
  for each row execute function private.refresh_profile_status_trg();

select private.refresh_profile_status(id) from public.users;
commit;

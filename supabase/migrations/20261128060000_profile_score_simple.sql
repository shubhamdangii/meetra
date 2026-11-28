-- Profile score, simple and exact: 7 parts, always 100 at most.
--   photo 20 · bio 20+ characters 15 · longer bio 80+ characters 10 · house rules 15
--   · verified email 15 · three words 10 · prompt answer 15            = 100
-- Phone number and WhatsApp verification no longer count (they are switched off in the app for now).
-- The old parts (first name, city, occupation, full name, date of birth, gender, phone, email) are no longer scored.
--
-- "Profile complete" (the tick in the account menu) no longer needs a phone or a verified phone/email either:
-- first name, photo, city, occupation, bio 20+, full name, date of birth, gender and the house rules.
--
-- The score is also refreshed when the three words or the prompt answer change (they were not watched before).
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

  score := (case when u.avatar_url is not null then 20 else 0 end)
         + (case when bio >= 20 then 15 else 0 end)
         + (case when bio >= 80 then 10 else 0 end)
         + (case when p.accepted_rules_at is not null then 15 else 0 end)
         + (case when p.email_verified_at is not null then 15 else 0 end)
         + (case when cardinality(u.three_words) = 3 then 10 else 0 end)
         + (case when nullif(trim(coalesce(u.prompt_a, '')), '') is not null then 15 else 0 end);

  done := u.display_name <> 'New member' and u.avatar_url is not null and u.city_slug is not null
          and nullif(trim(u.occupation), '') is not null and bio >= 20
          and p.full_name is not null and p.date_of_birth is not null and p.gender is not null
          and p.accepted_rules_at is not null;
  done := coalesce(done, false);

  update public.users
     set profile_score = least(score, 100),
         profile_completed_at = case when done then coalesce(profile_completed_at, now()) end
   where id = p_user_id
     and (profile_score <> least(score, 100) or (profile_completed_at is null) = done);
end $$;

drop trigger if exists users_profile_status on public.users;
create trigger users_profile_status
  after update of display_name, avatar_url, bio, city_slug, occupation, three_words, prompt_a on public.users
  for each row execute function private.refresh_profile_status_trg();

-- Re-score everyone with the new split (owner accounts only exist so far).
select private.refresh_profile_status(id) from public.users;

-- Privacy: when a login (auth.users) is deleted, delete the member's profile and
-- everything attached to it (private details, requests, saves, reviews) instead
-- of leaving an orphaned profile behind.
alter table public.users drop constraint users_auth_id_fkey;
alter table public.users add constraint users_auth_id_fkey
  foreign key (auth_id) references auth.users (id) on delete cascade;

-- Remove profiles already orphaned by deleted test logins.
delete from public.users where auth_id is null;

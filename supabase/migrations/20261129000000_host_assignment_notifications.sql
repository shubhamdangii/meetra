-- Point 30: the HOST is told when the team assigns, changes or removes them on an event.
-- Replaces private.notify_member_host (from 20261128070000): members are still told when a host is announced,
-- and now the new host gets "You are hosting ..." and a removed host gets "You are no longer hosting ...".
create or replace function private.notify_member_host()
returns trigger language plpgsql security definer set search_path = '' as $$
declare hn text; new_uid uuid; old_uid uuid; r record;
        d text := to_char(new.starts_at at time zone 'Asia/Kolkata', 'FMDD Mon, FMHH12:MI am');
begin
  if new.host_id is not distinct from old.host_id then return new; end if;
  select name, user_id into hn, new_uid from public.host_profiles where id = new.host_id;
  select user_id into old_uid from public.host_profiles where id = old.host_id;

  if new.host_id is not null then
    for r in select distinct user_id from public.plan_requests
             where plan_ref = new.plan_ref and status in ('pending', 'approved', 'waitlisted') loop
      perform private.notify(r.user_id, 'host_announced', '🎙️ Your host is announced',
        coalesce(hn, 'A host') || ' will host ' || new.title || '.', '/event/?id=' || new.plan_ref);
    end loop;
    if new_uid is not null and new_uid is distinct from old_uid then
      perform private.notify(new_uid, 'host_assigned', '🎙️ You are hosting ' || new.title,
        'The team made you the host of ' || new.title || ' on ' || d || '. It is in your host desk now.', '/host/');
    end if;
  end if;

  if old_uid is not null and old_uid is distinct from new_uid then
    perform private.notify(old_uid, 'host_removed', 'You are no longer hosting ' || new.title,
      'The team changed the host of ' || new.title || ' on ' || d || '. It is no longer in your host desk.', '/host/');
  end if;
  return new;
end $$;

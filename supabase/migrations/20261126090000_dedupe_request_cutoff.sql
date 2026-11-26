-- The booking cutoff is already enforced by private.plan_request_open() (phase 2). Remove the duplicate check added to plan_request_rules on 26 Nov.
create or replace function private.plan_request_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare team boolean := auth.uid() is null or private.can_manage_plan(new.plan_ref)
  or (coalesce(current_setting('meetra.door', true), '') = '1' and tg_op = 'UPDATE' and private.is_plan_host(new.plan_ref)
      and old.status in ('approved', 'attended') and new.status in ('approved', 'attended'));
begin
  if not team then
    if tg_op = 'INSERT' then
      if new.status not in ('pending', 'waitlisted') or new.decided_at is not null then
        raise exception 'New requests must be pending or on the waiting list' using errcode = 'check_violation';
      end if;
    else
      if new.plan_ref <> old.plan_ref or new.user_id <> old.user_id or new.decided_at is distinct from old.decided_at then
        raise exception 'You can only cancel or re-send your own request' using errcode = 'insufficient_privilege';
      end if;
      if new.status <> old.status
         and not (new.status = 'cancelled'
                  or (old.status = 'cancelled' and new.status in ('pending', 'waitlisted'))) then
        raise exception 'Only the meetra team can approve or decline' using errcode = 'insufficient_privilege';
      end if;
      if old.status = 'attended' then
        raise exception 'This plan is already checked in' using errcode = 'insufficient_privilege';
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.plan_ref <> old.plan_ref then
    raise exception 'A request cannot move to another plan' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'declined', 'waitlisted') and team
     and not (old.status = 'attended' and new.status = 'approved') then
    new.decided_at := now();
  end if;
  return new;
end $$;

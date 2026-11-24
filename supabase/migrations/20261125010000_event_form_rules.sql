-- Event form rules: an "Other" category with the host's own words, free events cost 0,
-- and bookings close at least 4 hours before the start (default exactly 4 hours before).
alter table public.custom_plans drop constraint if exists custom_plans_category_check;
alter table public.custom_plans add constraint custom_plans_category_check
  check (category in ('food', 'sports', 'games', 'night', 'outing', 'art', 'film', 'trips', 'other'));
alter table public.custom_plans add column if not exists category_other text check (char_length(category_other) <= 40);

create or replace function private.event_merge(b public.custom_plans, j jsonb)
returns public.custom_plans language plpgsql stable set search_path = '' as $$
declare r public.custom_plans := b;
begin
  if j ? 'title'      then r.title := trim(j ->> 'title'); end if;
  if j ? 'category'   then r.category := j ->> 'category'; end if;
  if j ? 'category_other' then r.category_other := nullif(trim(j ->> 'category_other'), ''); end if;
  if j ? 'city_slug'  then r.city_slug := j ->> 'city_slug'; end if;
  if j ? 'host_id'    then r.host_id := nullif(j ->> 'host_id', '')::bigint; end if;
  if j ? 'starts_at'  then r.starts_at := nullif(j ->> 'starts_at', '')::timestamptz; end if;
  if j ? 'ends_at'    then r.ends_at := nullif(j ->> 'ends_at', '')::timestamptz; end if;
  if j ? 'booking_closes_at' then r.booking_closes_at := nullif(j ->> 'booking_closes_at', '')::timestamptz; end if;
  if j ? 'area'       then r.area := trim(j ->> 'area'); end if;
  if j ? 'price'      then r.price := coalesce(nullif(j ->> 'price', '')::int, 0); end if;
  if j ? 'price_type' then r.price_type := j ->> 'price_type'; end if;
  if j ? 'seats'      then r.seats := (j ->> 'seats')::smallint; end if;
  if j ? 'emoji'      then r.emoji := coalesce(nullif(trim(j ->> 'emoji'), ''), '✨'); end if;
  if j ? 'blurb'      then r.blurb := coalesce(j ->> 'blurb', ''); end if;
  if j ? 'steps'      then r.steps := coalesce(array(select jsonb_array_elements_text(j -> 'steps')), '{}'); end if;
  if j ? 'tags'       then r.tags := coalesce(array(select jsonb_array_elements_text(j -> 'tags')), '{}'); end if;
  return r;
end $$;

create or replace function private.event_fields(r public.custom_plans)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('title', r.title, 'category', r.category, 'category_other', r.category_other, 'city_slug', r.city_slug, 'host_id', r.host_id,
    'host_name', r.host_name, 'starts_at', r.starts_at, 'ends_at', r.ends_at, 'booking_closes_at', r.booking_closes_at,
    'area', r.area, 'price', r.price, 'price_type', r.price_type, 'seats', r.seats, 'emoji', r.emoji,
    'blurb', r.blurb, 'steps', to_jsonb(r.steps), 'tags', to_jsonb(r.tags))
$$;

-- apply_event writes every field through the same list; keep category_other in it
create or replace function private.apply_event(p_action text, p_id bigint, j jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.custom_plans; n public.custom_plans;
begin
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null then raise exception 'That event no longer exists' using errcode = 'no_data_found'; end if;
  if p_action in ('create', 'update') then
    if p_action = 'create' and r.status not in ('draft', 'pending') then raise exception 'This event is already %', r.status; end if;
    if p_action = 'update' and r.status <> 'approved' then raise exception 'Only approved events can be changed this way (this one is %)', r.status; end if;
    n := private.event_merge(r, coalesce(j, '{}'::jsonb));
    if p_action = 'update' and n.seats < (select coalesce(sum(pr.party_size), 0) from public.plan_requests pr where pr.plan_ref = r.plan_ref and pr.status in ('approved', 'attended')) then
      raise exception 'Seats can''t go below the number of confirmed guests' using errcode = 'check_violation';
    end if;
    update public.custom_plans set title = n.title, category = n.category, category_other = n.category_other, city_slug = n.city_slug, host_id = n.host_id,
      starts_at = n.starts_at, ends_at = n.ends_at, booking_closes_at = n.booking_closes_at, area = n.area, price = n.price,
      price_type = n.price_type, seats = n.seats, emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags,
      status = case when p_action = 'create' then 'approved' else status end
    where id = p_id;
  elsif p_action = 'cancel' then
    if r.status <> 'approved' then raise exception 'Only approved events can be cancelled'; end if;
    update public.custom_plans set status = 'cancelled', cancel_reason = left(j ->> 'reason', 300) where id = p_id;
  elsif p_action = 'delete' then
    update public.custom_plans set deleted_at = now() where id = p_id;
  else
    raise exception 'Unknown event action %', p_action;
  end if;
end $$;

-- drafts (admin + host) keep category_other too: they go through event_merge, but their UPDATE lists the columns
create or replace function private.custom_plan_keep_other()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category <> 'other' then new.category_other := null; end if;
  if new.category = 'other' and new.category_other is null then new.category_other := 'Something new'; end if;
  if new.price_type = 'free' then new.price := 0; end if;
  return new;
end $$;
drop trigger if exists custom_plans_keep_other on public.custom_plans;
create trigger custom_plans_keep_other before insert or update on public.custom_plans
  for each row execute function private.custom_plan_keep_other();

-- 4-hour booking window (checked whenever the dates change)
create or replace function private.custom_plan_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare h public.host_profiles%rowtype; clash record; dates_changed boolean;
begin
  if new.starts_at is null or new.ends_at is null then
    raise exception 'Start and end date/time are required' using errcode = 'check_violation';
  end if;
  if new.ends_at <= new.starts_at then
    raise exception 'The end must be after the start' using errcode = 'check_violation';
  end if;
  if new.ends_at - new.starts_at > interval '7 days' then
    raise exception 'An event can last at most 7 days' using errcode = 'check_violation';
  end if;
  new.booking_closes_at := coalesce(new.booking_closes_at, new.starts_at - interval '4 hours');
  if new.booking_closes_at >= new.starts_at then
    raise exception 'Booking deadline must be before the event starts' using errcode = 'check_violation';
  end if;
  dates_changed := tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
                   or new.booking_closes_at is distinct from old.booking_closes_at;
  if dates_changed and new.deleted_at is null and new.status <> 'cancelled' then
    if new.starts_at <= now() then raise exception 'The start date/time can''t be in the past' using errcode = 'check_violation'; end if;
    if new.booking_closes_at > new.starts_at - interval '4 hours' then
      raise exception 'Bookings must close at least 4 hours before the start' using errcode = 'check_violation';
    end if;
    if new.booking_closes_at <= now() then raise exception 'The booking deadline is already past' using errcode = 'check_violation'; end if;
  end if;
  if tg_op = 'UPDATE' and old.approved_at is not null and new.city_slug <> old.city_slug then
    raise exception 'An approved event can''t move to another city. Cancel it and create a new one.' using errcode = 'check_violation';
  end if;

  if new.host_id is not null then
    select * into h from public.host_profiles where id = new.host_id;
    if not found or h.deleted_at is not null then raise exception 'That host no longer exists' using errcode = 'check_violation'; end if;
    if h.city_slug <> new.city_slug then
      raise exception '% hosts in %, not in %', h.name, h.city_slug, new.city_slug using errcode = 'check_violation';
    end if;
    if h.status <> 'active' and new.status in ('pending', 'approved')
       and (tg_op = 'INSERT' or new.host_id is distinct from old.host_id or new.status is distinct from old.status) then
      raise exception '% is inactive. Activate the host first or pick another.', h.name using errcode = 'check_violation';
    end if;
    if new.status in ('pending', 'approved') and new.deleted_at is null then
      select c.title, c.starts_at into clash from public.custom_plans c
      where c.host_id = new.host_id and c.id <> new.id and c.deleted_at is null and c.status in ('pending', 'approved')
        and tstzrange(c.starts_at, c.ends_at) && tstzrange(new.starts_at, new.ends_at)
      limit 1;
      if found then
        raise exception '% is already hosting "%" at that time (%). Pick another time or host.', h.name, clash.title,
          to_char(clash.starts_at at time zone 'Asia/Kolkata', 'DD Mon, FMHH12:MI AM') using errcode = 'check_violation';
      end if;
    end if;
    new.host_name := h.name;
  else
    new.host_name := null;
  end if;

  new.starts_on  := (new.starts_at at time zone 'Asia/Kolkata')::date;
  new.time_label := private.ist_label(new.starts_at);
  new.end_label  := private.ist_label(new.ends_at);
  if new.plan_ref is null then
    new.plan_ref := 'x' || new.id || '-' || new.city_slug || '-' || to_char(new.starts_on, 'YYYYMMDD');
  end if;
  if new.status = 'approved' and new.approved_at is null then new.approved_at := now(); end if;

  if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.plan_requests pr where pr.plan_ref = new.plan_ref and pr.status in ('approved', 'attended')) then
    raise exception 'This event has confirmed bookings, so it can''t be deleted. Cancel it instead.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- drafts: write category_other as well
create or replace function public.admin_save_event_draft(p_id bigint, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r public.custom_plans; n public.custom_plans; nid bigint;
begin
  if not private.is_admin() then raise exception 'Main admins only' using errcode = 'insufficient_privilege'; end if;
  if p_id is null then
    n := private.event_merge(r, p_payload);
    insert into public.custom_plans (city_slug, title, category, category_other, host_id, starts_at, ends_at, booking_closes_at, area, price, price_type,
                                     seats, emoji, blurb, steps, tags, status, created_by, starts_on, time_label)
    values (n.city_slug, n.title, n.category, n.category_other, n.host_id, n.starts_at, n.ends_at, n.booking_closes_at, n.area, coalesce(n.price, 0),
            coalesce(n.price_type, 'reservation'), coalesce(n.seats, 12), coalesce(n.emoji, '✨'), coalesce(n.blurb, ''),
            coalesce(n.steps, '{}'), coalesce(n.tags, '{}'), 'draft', private.current_user_id(), current_date, 'tbd')
    returning id into nid;
    return nid;
  end if;
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null then raise exception 'Event not found'; end if;
  if r.status <> 'draft' then raise exception 'Only drafts can be edited directly. For a live event, use "Request change".'; end if;
  n := private.event_merge(r, p_payload);
  update public.custom_plans set title = n.title, category = n.category, category_other = n.category_other, city_slug = n.city_slug, host_id = n.host_id,
    starts_at = n.starts_at, ends_at = n.ends_at, booking_closes_at = n.booking_closes_at, area = n.area, price = n.price,
    price_type = n.price_type, seats = n.seats, emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags
  where id = p_id;
  return p_id;
end $$;

create or replace function public.host_save_event_draft(p_id bigint, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me bigint := private.my_host_id(); h public.host_profiles; r public.custom_plans; n public.custom_plans; nid bigint;
  j jsonb := coalesce(p_payload, '{}'::jsonb) - 'host_id' - 'city_slug';
begin
  if me is null then raise exception 'Only approved hosts can do this' using errcode = 'insufficient_privilege'; end if;
  select * into h from public.host_profiles where id = me;
  if p_id is null then
    n := private.event_merge(r, j);
    insert into public.custom_plans (city_slug, title, category, category_other, host_id, starts_at, ends_at, booking_closes_at, area, price, price_type,
                                     seats, emoji, blurb, steps, tags, status, created_by, starts_on, time_label)
    values (h.city_slug, n.title, n.category, n.category_other, me, n.starts_at, n.ends_at, n.booking_closes_at, n.area, coalesce(n.price, 0),
            coalesce(n.price_type, 'reservation'), coalesce(n.seats, 12), coalesce(n.emoji, '✨'), coalesce(n.blurb, ''),
            coalesce(n.steps, '{}'), coalesce(n.tags, '{}'), 'draft', private.current_user_id(), current_date, 'tbd')
    returning id into nid;
    return nid;
  end if;
  select * into r from public.custom_plans where id = p_id for update;
  if not found or r.deleted_at is not null or r.host_id is distinct from me then raise exception 'Event not found'; end if;
  if r.status <> 'draft' then raise exception 'Only drafts can be edited. Ask the team to change a live event.'; end if;
  n := private.event_merge(r, j);
  update public.custom_plans set title = n.title, category = n.category, category_other = n.category_other, starts_at = n.starts_at, ends_at = n.ends_at,
    booking_closes_at = n.booking_closes_at, area = n.area, price = n.price, price_type = n.price_type, seats = n.seats,
    emoji = n.emoji, blurb = n.blurb, steps = n.steps, tags = n.tags
  where id = p_id;
  return p_id;
end $$;

-- event lists for admins and hosts include category_other (added at the end so existing callers keep working)

-- Members who log in only with WhatsApp get a placeholder login address
-- (<number>@wa.meetra.invalid). Never treat it as a real, verified email.
create or replace function private.clean_email(p text)
returns text language sql immutable as $$
  select case when p ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and p !~* '@wa\.meetra\.invalid$' then lower(p) end
$$;

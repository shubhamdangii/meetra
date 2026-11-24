-- members send the event they'll host with their application
grant insert (plan_id, new_event) on public.host_applications to authenticated;

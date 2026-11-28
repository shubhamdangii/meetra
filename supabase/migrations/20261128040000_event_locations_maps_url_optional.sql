-- Saving an event failed with "null value in column maps_url ... violates not-null constraint".
-- The location is optional: save_event_location creates a row that may hold only an address, landmark or
-- meeting point (and deletes it when every field is empty). The original table definition still said NOT NULL.
alter table public.event_locations alter column maps_url drop not null;

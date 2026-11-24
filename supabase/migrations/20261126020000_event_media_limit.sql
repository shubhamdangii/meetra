-- photos are resized in the browser (max 1600 px, ~350 KB), so the server cap can be tight
update storage.buckets set file_size_limit = 2097152 where id = 'event-media';

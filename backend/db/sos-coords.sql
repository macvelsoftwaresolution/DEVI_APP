-- E5: SOS GPS location stored encrypted (sos_history.coords = AES-GCM "lat,lng", bound to the alert).
-- New alerts leave the plain latitude / longitude columns empty, so they must allow NULL.
-- Run once in Supabase Dashboard → SQL Editor, BEFORE deploying the backend that writes coords.
-- Older rows keep plain columns until `npm run rotate:key -- --apply` moves them into coords.

alter table public.sos_history add column if not exists coords text;
alter table public.sos_history alter column latitude drop not null;
alter table public.sos_history alter column longitude drop not null;

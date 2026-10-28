-- DEVI – who closed an SOS alert, and when
--
-- resolved_by: 'user'  = she pressed "I'm safe" in the app (guardian link shows SAFE)
--              'admin' = closed on the dashboard (guardian link does NOT show SAFE)
-- resolved_at: when it was closed (guardian links expire 24h after this)
--
-- Run once in Supabase Dashboard → SQL Editor. Safe to run more than once.
-- Until it is run the backend still works, but it saves only the status: after a server restart
-- guardian links no longer show SAFE and expire 24h after the alert time.

alter table public.sos_history add column if not exists resolved_at timestamptz;
alter table public.sos_history add column if not exists resolved_by text;

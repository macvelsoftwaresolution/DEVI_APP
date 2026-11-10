-- DEVI – SOS sends survive a crash between saving the alert and queueing its sends (L3)
--
-- notify_plan:          who this SOS is sent to (encrypted, field sos_history.notify_plan).
--                       Saved in the same insert as the alert, so an alert never exists without it.
-- dispatch_started_at:  when a server took on sending it. Set by the insert itself.
-- dispatched_at:        when every send had its retry job queued. From then the queue owns them.
--
-- An ACTIVE alert with a plan, no dispatched_at and a dispatch_started_at older than 30 seconds
-- was cut off (crash, restart, error). The server picks it up again and sends it
-- (src/services/sosDispatch.service.js).
--
-- Run once in Supabase Dashboard → SQL Editor. Safe to run more than once.
-- Until it is run the backend still works as before, without this protection, and logs an error
-- on every SOS.

alter table public.sos_history add column if not exists notify_plan text;
alter table public.sos_history add column if not exists dispatch_started_at timestamptz;
alter table public.sos_history add column if not exists dispatched_at timestamptz;

-- The resumer looks only at unfinished alerts, so this index stays small
create index if not exists sos_history_unfinished_dispatch_idx
  on public.sos_history (dispatch_started_at)
  where dispatched_at is null and notify_plan is not null;

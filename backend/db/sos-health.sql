-- DEVI – how the SOS retry queue is doing, for the health check and its alerts (REL1, REL2)
--
-- depth:                  every job in the queue (retries waiting, calls and WhatsApps being watched)
-- overdue:                jobs due for over 60 seconds that no worker has taken. The worker reads
--                         every 15 seconds, so a number here means it is stuck or falling behind.
-- oldest_overdue_seconds: how long the oldest due job has waited
--
-- Only counts: no job content leaves the database.
-- Run once in Supabase Dashboard → SQL Editor, after db/sos-queue.sql. Safe to run more than once.
-- Until it is run the health check reports the queue as "unknown" (warn), and nothing else changes.

create or replace function public.sos_queue_health()
returns table (depth bigint, overdue bigint, oldest_overdue_seconds integer)
language sql
security definer
set search_path = ''
as $$
  select
    count(*)::bigint,
    (count(*) filter (where vt <= now() - interval '60 seconds'))::bigint,
    coalesce(extract(epoch from now() - min(vt) filter (where vt <= now()))::integer, 0)
  from pgmq.q_sos_notify;
$$;

-- Backend only (secret key = service_role)
revoke all on function public.sos_queue_health() from public, anon, authenticated;
grant execute on function public.sos_queue_health() to service_role;

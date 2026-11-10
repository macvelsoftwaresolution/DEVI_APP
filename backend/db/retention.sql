-- DEVI – delete what is no longer needed (S5, and the retention part of section 10)
--
-- Called once a day by the backend (src/services/retention.service.js), with the number of days
-- each kind of data is kept (RETENTION_* in .env). 0 days means keep forever.
--
--   queue archive   pgmq.a_sos_notify: retry jobs that ended (encrypted guardian numbers)
--   whatsapp        whatsapp_statuses: delivery statuses, needed for minutes (L4)
--   otp             otp_codes: sign-in code rows, needed for an hour (send limit)
--   send plan       sos_history.notify_plan cleared, not the alert: needed for 2 hours (L3)
--   sos             sos_history rows themselves, with their press-1 records (cascade). Off by
--                   default: how long SOS history is kept is a legal decision. Evidence files in
--                   Cloudinary are not deleted by this.
--
-- Deletes at most p_batch rows per kind per call, so no table is locked for long. The backend
-- calls again until nothing is left.
--
-- Run once in Supabase Dashboard → SQL Editor, after db/sos-queue.sql, db/whatsapp-status.sql,
-- db/otp.sql and db/sos-dispatch.sql. Safe to run more than once.
-- Until it is run nothing is deleted, and the health check warns.

create or replace function public.run_retention(
  p_queue_days integer,
  p_whatsapp_days integer,
  p_otp_days integer,
  p_plan_days integer,
  p_sos_days integer,
  p_batch integer default 5000
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_queue integer := 0;
  n_whatsapp integer := 0;
  n_otp integer := 0;
  n_plan integer := 0;
  n_sos integer := 0;
begin
  if coalesce(p_queue_days, 0) > 0 then
    delete from pgmq.a_sos_notify
    where msg_id in (
      select msg_id from pgmq.a_sos_notify
      where archived_at < now() - make_interval(days => p_queue_days)
      limit p_batch
    );
    get diagnostics n_queue = row_count;
  end if;

  if coalesce(p_whatsapp_days, 0) > 0 then
    delete from public.whatsapp_statuses
    where id in (
      select id from public.whatsapp_statuses
      where created_at < now() - make_interval(days => p_whatsapp_days)
      limit p_batch
    );
    get diagnostics n_whatsapp = row_count;
  end if;

  if coalesce(p_otp_days, 0) > 0 then
    delete from public.otp_codes
    where phone_hash in (
      select phone_hash from public.otp_codes
      where sent_at < now() - make_interval(days => p_otp_days)
      limit p_batch
    );
    get diagnostics n_otp = row_count;
  end if;

  if coalesce(p_plan_days, 0) > 0 then
    update public.sos_history set notify_plan = null
    where id in (
      select id from public.sos_history
      where notify_plan is not null
        and created_at < now() - make_interval(days => p_plan_days)
      limit p_batch
    );
    get diagnostics n_plan = row_count;
  end if;

  if coalesce(p_sos_days, 0) > 0 then
    delete from public.sos_history
    where id in (
      select id from public.sos_history
      where created_at < now() - make_interval(days => p_sos_days)
      limit p_batch
    );
    get diagnostics n_sos = row_count;
  end if;

  return json_build_object(
    'queueArchive', n_queue,
    'whatsappStatuses', n_whatsapp,
    'otpCodes', n_otp,
    'sendPlans', n_plan,
    'sos', n_sos
  );
end;
$$;

-- Backend only (secret key = service_role)
revoke all on function public.run_retention(integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.run_retention(integer, integer, integer, integer, integer, integer) to service_role;

-- Keeps the clean-up of notify_plan from reading the whole table
create index if not exists sos_history_plan_created_idx
  on public.sos_history (created_at)
  where notify_plan is not null;

-- DEVI – fresh start (10 Nov 2026): DELETES ALL DATA, keeps every table, function and setting
--
-- Only before launch, and only on the project you mean: check the project name at the top of the
-- Supabase dashboard first. Every user, guardian, SOS, press-1 record, sign-in code, retry job,
-- WhatsApp status, admin account and audit row is deleted for good.
--
-- Why: the live server was started with an ENCRYPTION_KEY that is not in its .env any more, so the
-- data written with it cannot be read once the server restarts with a new key.
--
-- Order:
--   1. Server .env: new secrets, including a new ENCRYPTION_KEY (see backend/.env.example).
--      Do NOT restart yet.
--   2. Run this file in Supabase Dashboard → SQL Editor, on the PRODUCTION project.
--   3. On the server: empty backend/data/sos-journal (written with the old key), then
--      cd backend && pm2 reload ecosystem.config.cjs
--   4. Empty the Cloudinary folder devi_emergency_evidence
--   5. Everyone signs up again in the app; operators get new accounts (npm run admin:user)

-- 1. App data (guardians, press-1 records go with their users and alerts)
truncate table
  public.sos_guardian_acks,
  public.sos_history,
  public.guardians,
  public.users,
  public.otp_codes,
  public.whatsapp_statuses
  restart identity cascade;

-- 2. Admin accounts and the audit log
truncate table public.admin_users, public.admin_audit restart identity cascade;

-- 3. Retry queue and its archive (jobs hold numbers encrypted with the old key)
truncate table pgmq.q_sos_notify, pgmq.a_sos_notify;

-- 4. Check: every count 0, and the functions still there
select
  (select count(*) from public.users)             as users,
  (select count(*) from public.sos_history)       as sos_history,
  (select count(*) from public.admin_users)       as admin_users,
  (select count(*) from pgmq.q_sos_notify)        as queue,
  (select count(*) from information_schema.routines
     where routine_schema = 'public'
       and routine_name in ('sos_queue_health', 'dashboard_stats', 'run_retention')) as functions_kept;

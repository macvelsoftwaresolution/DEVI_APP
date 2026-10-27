-- DEVI – fresh start (27 Oct 2026): DELETES ALL DATA, then prepares the phone-number encryption (E1)
--
-- Only for the testing phase: every row in users, guardians and sos_history is deleted for good.
-- Run in Supabase Dashboard → SQL Editor.
--
-- Order:
--   1. Put the new secrets in the server .env (see backend/.env.example) — do NOT restart yet
--   2. Run this file
--   3. git pull + pm2 restart devi-backend --update-env
--   4. Empty the Cloudinary folder devi_emergency_evidence
--   5. Everyone signs up again in the app

-- 1. Delete all data (guardians and SOS history go with their users)
truncate table public.sos_history, public.guardians, public.users;

-- 2. users.mobile_number is now stored encrypted (random IV, so it can no longer be unique);
--    lookups use mobile_hash instead
alter table public.users drop constraint if exists users_mobile_number_key;
alter table public.users add column if not exists mobile_hash text;
alter table public.users alter column mobile_hash set not null;
alter table public.users add constraint users_mobile_hash_key unique (mobile_hash);

-- 3. Check: all three counts 0, and mobile_hash listed
select
  (select count(*) from public.users)       as users,
  (select count(*) from public.guardians)   as guardians,
  (select count(*) from public.sos_history) as sos_history,
  (select string_agg(column_name, ', ') from information_schema.columns
     where table_schema = 'public' and table_name = 'users') as user_columns;

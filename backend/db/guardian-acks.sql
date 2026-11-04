-- DEVI – guardians who pressed 1 on the SOS call (backend/src/routes/ivr.routes.js)
--
-- One row per guardian per alert: pressing 1 twice, or on a retried call, keeps the first time.
-- phone is encrypted; phone_hash is its lookup hash, only used to spot that repeat.
--
-- Run once in Supabase Dashboard → SQL Editor, BEFORE deploying the backend that uses it.
-- Until it is run the call still works, but nothing is saved and it does not say "recorded".
-- Safe to run more than once.

create table if not exists public.sos_guardian_acks (
  id               uuid primary key default gen_random_uuid(),
  alert_id         uuid not null references public.sos_history (id) on delete cascade,
  phone            text not null,
  phone_hash       text not null,
  provider         text,
  acknowledged_at  timestamptz not null default now(),
  unique (alert_id, phone_hash)
);

-- Backend only, like the other tables (db/rls.sql)
alter table public.sos_guardian_acks enable row level security;
revoke all on table public.sos_guardian_acks from anon, authenticated;

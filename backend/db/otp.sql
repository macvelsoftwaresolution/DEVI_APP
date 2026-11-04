-- DEVI – WhatsApp login codes (backend/src/services/otp.service.js)
--
-- One row per phone number, found by its lookup hash. The code itself is never stored, only a keyed
-- hash of it. The row stays after a code is used: the hourly send limit counts from it.
--
-- Run once in Supabase Dashboard → SQL Editor, BEFORE deploying the backend that uses it.
-- Until it is run nobody can sign in or sign up. Safe to run more than once.

create table if not exists public.otp_codes (
  phone_hash    text primary key,
  code_hash     text,
  expires_at    timestamptz,
  attempts      integer not null default 0,
  sent_at       timestamptz not null,
  window_start  timestamptz not null,
  send_count    integer not null default 1
);

-- Backend only, like the other tables (db/rls.sql)
alter table public.otp_codes enable row level security;
revoke all on table public.otp_codes from anon, authenticated;

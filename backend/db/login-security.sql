-- DEVI – sign-out that works, and one admin account per operator with 2FA
--
-- users.token_version: every app login token carries the version it was signed with. Raising it
--   signs that user out on every phone, including a leaked token, and /auth/refresh can no longer
--   renew it. (POST /api/auth/logout-all, or the dashboard user page.)
--
-- admin_users: one dashboard account per operator, made with `npm run admin:user -- create <name>`.
--   Each needs its password and a 6-digit code from an authenticator app (TOTP). totp_secret is
--   encrypted (field admin_users.totp_secret, bound to the id). disabled or a raised token_version
--   ends that operator's sessions within a minute.
--   The shared .env admin (ADMIN_USERNAME) keeps working until ADMIN_ENV_LOGIN=off.
--
-- Run once in Supabase Dashboard → SQL Editor. Safe to run more than once.
-- Until it is run, logins work as before: tokens cannot be revoked and only the .env admin exists.

alter table public.users add column if not exists token_version integer not null default 0;

create table if not exists public.admin_users (
  id             uuid primary key default gen_random_uuid(),
  username       text not null unique,
  password_hash  text not null,
  totp_secret    text not null,
  disabled       boolean not null default false,
  token_version  integer not null default 0,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

-- Backend only, like the other tables (db/rls.sql)
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

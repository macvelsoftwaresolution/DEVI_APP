-- DEVI – dashboard operator accounts + audit log (R4)
-- Run once in Supabase Dashboard → SQL Editor. Safe to run more than once.
-- Then create the first account on the server: npm run admin:create -- <username> supervisor

create table if not exists public.admins (
  id               uuid primary key default gen_random_uuid(),
  username         text not null unique,
  password_hash    text not null,                 -- scrypt, see src/utils/password.js
  role             text not null default 'operator' check (role in ('operator', 'supervisor')),
  totp_secret      text,                          -- AES-256-GCM encrypted authenticator secret
  totp_enabled     boolean not null default false,
  totp_last_step   bigint not null default 0,     -- last code used, so a code works only once
  failed_attempts  integer not null default 0,
  locked_until     timestamptz,
  is_active        boolean not null default true,
  last_login_at    timestamptz,
  created_at       timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.admin_audit (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.admins (id) on delete set null,
  username    text,                               -- kept even if the account is deleted
  action      text not null,                      -- login_success, login_failed, resolve, add_note, ...
  alert_id    text,
  ip          text,
  created_at  timestamptz not null default timezone('utc'::text, now())
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);

-- Backend only, like the other tables
alter table public.admins      enable row level security;
alter table public.admin_audit enable row level security;
revoke all on table public.admins, public.admin_audit from anon, authenticated;

-- Check: both tables listed with rowsecurity = true
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('admins', 'admin_audit');

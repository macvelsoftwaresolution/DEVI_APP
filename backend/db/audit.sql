-- DEVI – who did what on the admin side (section 10: audit log)
--
-- One row per admin action that reads or changes personal data: sign in (and failed sign in),
-- opening an SOS, its location or evidence, opening a user, searching, exporting, resolving,
-- adding a note, signing a user out. Written by src/services/audit.service.js.
--
-- Holds ids and the kind of action only: never a phone number, name, place or search text.
-- Rows are only ever added: the backend has no code that changes or deletes them.
--
-- Read it in Supabase (SQL Editor), for example:
--   select at, admin, action, target_type, target_id, ip from admin_audit order by at desc limit 100;
--
-- Run once in Supabase Dashboard → SQL Editor. Safe to run more than once.
-- Until it is run nothing is recorded in the database (the server log still has each line).

create table if not exists public.admin_audit (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  admin        text not null,
  admin_id     uuid,
  action       text not null,
  target_type  text,
  target_id    text,
  ip           text,
  detail       jsonb
);

create index if not exists admin_audit_at_idx on public.admin_audit (at desc);
create index if not exists admin_audit_target_idx on public.admin_audit (target_type, target_id);

-- Backend only, like the other tables (db/rls.sql)
alter table public.admin_audit enable row level security;
revoke all on table public.admin_audit from anon, authenticated;

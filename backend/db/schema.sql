-- DEVI – Supabase (PostgreSQL) schema
-- Run in Supabase Dashboard → SQL Editor to recreate the tables on a new project.
-- Columns match the live database (information_schema export).
-- Sensitive text fields (names, phone numbers, addresses, notes) are stored
-- AES-256-GCM encrypted by the backend — see src/utils/encryption.js.

create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  mobile_number  text not null,          -- encrypted (phone number or guest ID)
  mobile_hash    text not null unique,   -- keyed HMAC of mobile_number, used for lookups
  full_name      text,
  address_1      text,
  address_2      text,
  profile_photo  text,
  is_guest       boolean default false,
  created_at     timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.guardians (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  name           text not null,
  mobile_number  text not null,
  created_at     timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.sos_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  location_address  text not null,
  latitude          double precision,     -- older rows only; new alerts keep GPS in coords (E5)
  longitude         double precision,
  coords            text,                 -- encrypted "lat,lng" (db/sos-coords.sql)
  audio_url         text,
  is_test_mode      boolean default false,
  status            text default 'active'::text,
  created_at        timestamptz not null default timezone('utc'::text, now()),
  evidence_url      text,
  idempotency_key   uuid unique,
  accuracy          numeric,
  operator_notes    text,
  resolved_at       timestamptz,            -- when the alert was closed (db/resolved-by.sql)
  resolved_by       text                    -- 'user' (she marked herself safe) or 'admin'
);

-- Recommended indexes (not part of the information_schema export)
create index if not exists guardians_user_id_idx    on public.guardians (user_id);
create index if not exists sos_history_user_id_idx  on public.sos_history (user_id);
create index if not exists sos_history_created_idx  on public.sos_history (created_at desc);

-- Row Level Security: only the backend (secret key) may touch these tables — see db/rls.sql
alter table public.users       enable row level security;
alter table public.guardians   enable row level security;
alter table public.sos_history enable row level security;
revoke all on table public.users, public.guardians, public.sos_history from anon, authenticated;

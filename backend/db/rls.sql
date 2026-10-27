-- DEVI – lock the tables to the backend only (Row Level Security)
--
-- Only the Node.js backend talks to Supabase; the app and the dashboard go through the API.
-- With RLS on and NO policies, the public (publishable/anon) key can read or change nothing,
-- while the backend's secret key (service_role) bypasses RLS and keeps working.
--
-- ORDER MATTERS — do these first, or every SOS will fail:
--   1. Put the SECRET key in the server .env as SUPABASE_KEY and restart the backend.
--   2. Check the app/dashboard still work (trigger a test SOS, open the dashboard).
--   3. Then run this file in Supabase Dashboard → SQL Editor.
--
-- Safe to run more than once.

alter table public.users       enable row level security;
alter table public.guardians   enable row level security;
alter table public.sos_history enable row level security;

-- Belt and braces: the public roles also lose table privileges, so a policy added by mistake later
-- still cannot expose data to them.
revoke all on table public.users, public.guardians, public.sos_history from anon, authenticated;

-- Check: all three rows should show rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('users', 'guardians', 'sos_history');

-- Rollback (only if something breaks and you need SOS working immediately):
--   alter table public.users       disable row level security;
--   alter table public.guardians   disable row level security;
--   alter table public.sos_history disable row level security;
--   grant all on table public.users, public.guardians, public.sos_history to anon, authenticated;

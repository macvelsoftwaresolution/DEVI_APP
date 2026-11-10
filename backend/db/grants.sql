-- DEVI – the backend's database role may use every DEVI table (service_role)
--
-- The backend signs in with the secret key, which is the service_role. It bypasses RLS, but it
-- still needs table privileges. Older Supabase projects granted them on every new table by
-- themselves; newer ones may not (for example when "Automatically expose new tables" is off), and
-- then the backend gets "permission denied for table ...".
--
-- The public roles (anon, authenticated) get nothing: they are revoked in each table's own file.
--
-- Run in Supabase Dashboard → SQL Editor after the other files, and again after adding a table.
-- Safe to run more than once.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tables made later by the same owner get the same privileges
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- The retry queue (db/sos-queue.sql)
grant usage on schema pgmq_public to service_role;
grant execute on all functions in schema pgmq_public to service_role;

-- Check: every DEVI table should list service_role
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as service_role_can
from information_schema.role_table_grants
where grantee = 'service_role' and table_schema = 'public'
group by table_name
order by table_name;

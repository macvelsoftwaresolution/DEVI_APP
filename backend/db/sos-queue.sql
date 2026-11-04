-- SOS WhatsApp + IVR retry queue (backend/src/services/sosNotify.service.js).
-- Needs Supabase Dashboard → Integrations → Queues installed, with "Expose Queues via PostgREST" on.
-- Run once in Supabase Dashboard → SQL Editor, BEFORE deploying the backend that uses it.
-- Safe to run again.

select pgmq.create('sos_notify')
where not exists (select 1 from pgmq.list_queues() where queue_name = 'sos_notify');

-- Only the backend (secret key = service_role) may touch queues. The app and dashboard never do:
-- jobs carry (encrypted) guardian numbers, and a stranger reading or deleting them could stop retries.
revoke all on all functions in schema pgmq_public from anon, authenticated;
revoke usage on schema pgmq_public from anon, authenticated;
alter table pgmq.q_sos_notify enable row level security;
alter table pgmq.a_sos_notify enable row level security;

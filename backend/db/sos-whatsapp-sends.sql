-- Which SOS WhatsApp went to which recipient, so the dashboard can show delivered, read or
-- failed per guardian (whatsapp_statuses has the status by message id, never the number).
--
-- phone_hash is the keyed blind index of the number (src/utils/encryption.js), so the table
-- holds no phone number. Rows go with their SOS (on delete cascade), so account deletion
-- removes them too.
--
-- Run once in the Supabase SQL Editor (production and development). Safe to run again.
-- Until it is run, SOS sends work as before and the dashboard shows no WhatsApp status.

create table if not exists public.sos_whatsapp_sends (
  message_id  text primary key,
  alert_id    uuid not null references public.sos_history (id) on delete cascade,
  phone_hash  text not null,
  attempt     integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists sos_whatsapp_sends_alert_idx on public.sos_whatsapp_sends (alert_id);

alter table public.sos_whatsapp_sends enable row level security;
revoke all on table public.sos_whatsapp_sends from anon, authenticated;
grant select, insert, update, delete on table public.sos_whatsapp_sends to service_role;

-- DEVI – WhatsApp delivery statuses from Meta's webhook (L4)
--
-- Meta accepting a message is not the guardian getting it. Meta reports what happened next on the
-- webhook: sent, delivered, read or failed. Each status is stored here by message id, so a server
-- that restarted can still see that a message failed and send it again
-- (src/services/whatsappStatus.service.js, src/services/sosNotify.service.js).
--
-- No phone number or text is stored: only Meta's message id, the status and Meta's error code.
-- One row per message and status, so a repeated webhook event changes nothing.
--
-- Run once in Supabase Dashboard → SQL Editor. Safe to run more than once.
-- Until it is run, SOS works as before: a failed status is still acted on at once while the server
-- that sent the message is running, but not after a restart.

create table if not exists public.whatsapp_statuses (
  id          bigserial primary key,
  message_id  text not null,
  status      text not null,
  error_code  integer,
  created_at  timestamptz not null default now(),
  unique (message_id, status)
);

-- For clearing old rows later (retention)
create index if not exists whatsapp_statuses_created_at_idx on public.whatsapp_statuses (created_at);

-- Backend only, like the other tables (db/rls.sql)
alter table public.whatsapp_statuses enable row level security;
revoke all on table public.whatsapp_statuses from anon, authenticated;

import { supabase } from '../config/supabase.js';

/**
 * WhatsApp delivery statuses from Meta's webhook (L4, db/whatsapp-status.sql).
 * Meta sends sent, delivered, read or failed per message, out of order and sometimes twice.
 * Only the message id, the status and Meta's error code are kept: never the phone number.
 */

const TABLE = 'whatsapp_statuses';
// Higher wins: once delivered, a late "sent" or even "failed" does not undo it
const RANK = { sent: 1, failed: 2, delivered: 3, read: 4 };

// Every message status in a webhook body: [{ messageId, status, errorCode }]
export const parseStatusEvents = (body) => {
  const events = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const s of change?.value?.statuses || []) {
        const status = String(s?.status || '').toLowerCase();
        if (!s?.id || !RANK[status]) continue;
        const code = Number(s.errors?.[0]?.code);
        events.push({ messageId: String(s.id), status, errorCode: Number.isFinite(code) ? code : null });
      }
    }
  }
  return events;
};

// The status that counts from a list of rows, or null for none
export const bestStatus = (rows) => {
  let best = null;
  for (const r of rows || []) {
    if (RANK[r.status] && (!best || RANK[r.status] > RANK[best.status])) {
      best = { status: r.status, errorCode: r.error_code ?? null };
    }
  }
  return best;
};

let missingTableLogged = false;

export const WhatsAppStatus = {
  async save(events) {
    if (!events.length) return;
    try {
      const rows = events.map((e) => ({ message_id: e.messageId, status: e.status, error_code: e.errorCode }));
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'message_id,status', ignoreDuplicates: true });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
    } catch (e) {
      if (e.code === '42P01' || e.code === 'PGRST205') {
        if (!missingTableLogged) console.error('🚨 [L4] Table whatsapp_statuses missing: a failed WhatsApp is not retried after a restart. Run db/whatsapp-status.sql.');
        missingTableLogged = true;
        return;
      }
      console.warn('⚠️ [L4] WhatsApp statuses not saved:', e.message);
    }
  },

  // { status, errorCode } that counts for this message, null when none arrived.
  // Throws when it cannot be read.
  async latest(messageId) {
    const { data, error } = await supabase.from(TABLE).select('status, error_code').eq('message_id', messageId);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return bestStatus(data);
  },
};

export default WhatsAppStatus;

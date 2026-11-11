import { supabase } from '../config/supabase.js';
import { blindIndex, blindIndexes } from '../utils/encryption.js';
import { normalizePhone } from '../utils/phone.js';
import { bestStatus } from './whatsappStatus.service.js';

/**
 * Which SOS WhatsApp went to which recipient (db/sos-whatsapp-sends.sql), for the dashboard.
 * The number is kept only as its blind index. Meta's statuses come from whatsapp_statuses.
 *
 * On 11 Nov every SOS WhatsApp failed with 131049 and the dashboard still said "sent": it was
 * found in the server log. With this the SOS page shows it per guardian.
 */

const TABLE = 'sos_whatsapp_sends';
const MISSING = new Set(['42P01', 'PGRST205']);
let missingLogged = false;

const hashOf = (phone) => blindIndex(normalizePhone(phone) || String(phone));

// What a Meta error code means, in words an operator can act on
const REASONS = {
  131049: 'Held back by Meta: the SOS template is in the Marketing category',
  131026: 'Number not on WhatsApp',
  131047: 'Outside the 24-hour window (only the location pin)',
  131056: 'Too many messages to this number, too fast',
  131050: 'The guardian stopped marketing messages from this business',
  130472: 'Number is in a Meta experiment',
  131000: 'Meta error',
};
export const failureReason = (code) => (code == null ? null : REASONS[code] || `Meta error ${code}`);

/**
 * One line per recipient from send rows and status rows.
 * sends: [{ message_id, phone_hash, attempt }], statuses: [{ message_id, status, error_code }]
 * Returns Map phone_hash -> { status, attempts, errorCode, reason } where status is the best
 * over every attempt ('accepted' when Meta sent no status yet), and errorCode the last failure.
 */
export const summarize = (sends, statuses) => {
  const byMessage = new Map();
  for (const s of statuses || []) {
    if (!byMessage.has(s.message_id)) byMessage.set(s.message_id, []);
    byMessage.get(s.message_id).push(s);
  }
  const out = new Map();
  const sorted = [...(sends || [])].sort((a, b) => (a.attempt || 0) - (b.attempt || 0));
  for (const send of sorted) {
    const line = out.get(send.phone_hash) || { status: 'accepted', attempts: 0, errorCode: null };
    line.attempts += 1;
    const best = bestStatus(byMessage.get(send.message_id));
    if (best) {
      if (best.status === 'failed') line.errorCode = best.errorCode;
      const rank = { accepted: 0, sent: 1, failed: 2, delivered: 3, read: 4 };
      if (rank[best.status] > rank[line.status]) line.status = best.status;
    }
    out.set(send.phone_hash, line);
  }
  for (const line of out.values()) line.reason = line.status === 'failed' ? failureReason(line.errorCode) : null;
  return out;
};

// The summary line of this number, matching under the current and the old index keys
export const lineFor = (summary, phone) => {
  for (const h of blindIndexes(normalizePhone(phone) || String(phone))) {
    if (summary.has(h)) return summary.get(h);
  }
  return null;
};

export const createWhatsAppSends = ({ db = supabase } = {}) => ({
  // Never throws: a dashboard record must never hold back or fail an SOS
  async record({ alertId, phone, messageId, attempt = 0 }) {
    if (!alertId || !phone || !messageId) return;
    try {
      const { error } = await db.from(TABLE).upsert(
        { message_id: messageId, alert_id: alertId, phone_hash: hashOf(phone), attempt },
        { onConflict: 'message_id', ignoreDuplicates: true },
      );
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
    } catch (e) {
      if (MISSING.has(e.code)) {
        if (!missingLogged) console.warn('⚠️ [WHATSAPP SENDS] Table sos_whatsapp_sends missing: the dashboard shows no WhatsApp status. Run db/sos-whatsapp-sends.sql.');
        missingLogged = true;
        return;
      }
      // An SOS taken while the database was down is not saved yet (foreign key): nothing to show
      console.warn(`⚠️ [WHATSAPP SENDS] Send of alert ${alertId} not recorded: ${e.message}`);
    }
  },

  // Map phone_hash -> line for one alert, empty when nothing can be read
  async forAlert(alertId) {
    try {
      const { data: sends, error } = await db.from(TABLE).select('message_id, phone_hash, attempt').eq('alert_id', alertId);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      if (!sends?.length) return new Map();
      const { data: statuses, error: sError } = await db
        .from('whatsapp_statuses')
        .select('message_id, status, error_code')
        .in('message_id', sends.map((s) => s.message_id));
      if (sError) throw Object.assign(new Error(sError.message), { code: sError.code });
      return summarize(sends, statuses);
    } catch (e) {
      if (!MISSING.has(e.code)) console.warn(`⚠️ [WHATSAPP SENDS] Status of alert ${alertId} not loaded: ${e.message}`);
      return new Map();
    }
  },
});

export const WhatsAppSends = createWhatsAppSends();

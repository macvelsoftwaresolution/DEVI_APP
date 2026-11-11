import { supabase } from '../config/supabase.js';
import cloudinary from '../config/cloudinary.js';
import { parseEvidenceRef } from '../utils/evidence.js';
import { liveTrackSessions } from './live-sessions.js';

/**
 * Account deletion (Play Store "delete account" rule, DPDP).
 *
 * Deleting the users row also deletes, through ON DELETE CASCADE: guardians, sos_history and
 * sos_guardian_acks. Evidence files on Cloudinary are removed first, because the database row is
 * the only thing that points at them.
 *
 * An account is not deleted while one of its alerts may still be sending. The retry worker stops
 * an alert's jobs when it reads RESOLVED. A deleted alert reads as unknown, which the worker
 * treats like "database down" and keeps sending. So:
 *   - an alert not resolved, started within SEND_WINDOW_MS (retries last about 2 hours), blocks;
 *   - a resolved alert blocks for SETTLE_MS after it was resolved (the longest retry gap is
 *     10 minutes plus 20%, and call/WhatsApp watch jobs about 5 minutes).
 * Older alerts that were never resolved no longer send, so they do not block.
 */

export const SEND_WINDOW_MS = 135 * 60 * 1000;
export const SETTLE_MS = 15 * 60 * 1000;

export const blockingAlert = (alerts, now = Date.now()) =>
  (alerts || []).find((a) => {
    const created = Date.parse(a.created_at) || 0;
    if (now - created > SEND_WINDOW_MS) return false;
    if (String(a.status || 'ACTIVE').toUpperCase() !== 'RESOLVED') return true;
    const resolvedAt = Date.parse(a.resolved_at);
    return !resolvedAt || now - resolvedAt < SETTLE_MS;
  }) || null;

const destroyEvidence = (ref) =>
  cloudinary.uploader.destroy(ref.publicId, { resource_type: ref.resourceType, type: ref.type, invalidate: true });

export const createAccountDeletion = ({ db = supabase, destroy = destroyEvidence, sessions = liveTrackSessions, now = Date.now } = {}) => ({
  /**
   * Deletes the account with this users.id and everything that belongs to it.
   * Returns { ok: true } or { ok: false, reason: 'NOT_FOUND' | 'SOS_IN_PROGRESS' | 'EVIDENCE' }.
   * Throws when the database cannot be read or written.
   */
  async deleteAccount(userId) {
    const { data: user, error: uError } = await db.from('users').select('id').eq('id', userId).maybeSingle();
    if (uError) throw Object.assign(new Error(uError.message), { code: uError.code });
    if (!user) return { ok: false, reason: 'NOT_FOUND' };

    const { data: alerts, error: aError } = await db
      .from('sos_history')
      .select('id, status, created_at, resolved_at, evidence_url, audio_url')
      .eq('user_id', userId);
    if (aError) throw Object.assign(new Error(aError.message), { code: aError.code });

    if (blockingAlert(alerts, now())) return { ok: false, reason: 'SOS_IN_PROGRESS' };

    // Evidence first: once the rows are gone nothing points at these files any more
    for (const alert of alerts || []) {
      for (const stored of new Set([alert.evidence_url, alert.audio_url].filter(Boolean))) {
        const ref = parseEvidenceRef(stored);
        if (!ref) continue;
        try {
          const out = await destroy(ref);
          if (out?.result && !['ok', 'not found'].includes(out.result)) throw new Error(out.result);
        } catch (e) {
          console.error(`🚨 [ACCOUNT DELETE] Evidence of alert ${alert.id} not removed (${e.message}): account kept, user asked to try again`);
          return { ok: false, reason: 'EVIDENCE' };
        }
      }
    }

    const { error: dError } = await db.from('users').delete().eq('id', userId);
    if (dError) throw Object.assign(new Error(dError.message), { code: dError.code });

    for (const alert of alerts || []) sessions.delete(alert.id);
    console.log(`🗑️ [ACCOUNT DELETED] User ${userId}, ${alerts?.length || 0} alert(s)`);
    return { ok: true };
  },
});

export const accountDeletion = createAccountDeletion();

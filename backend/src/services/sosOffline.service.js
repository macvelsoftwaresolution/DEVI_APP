import crypto from 'crypto';
import { sosJournal } from './sosJournal.js';
import { sosDispatch, RESUME_MAX_AGE_MS } from './sosDispatch.service.js';
import { SosService } from './sos.service.js';
import { liveTrackSessions } from './live-sessions.js';
import { pager } from './pager.service.js';
import { toLatLng, hasFix } from '../utils/coords.js';

/**
 * An SOS when the database is down (L2). Before this, a failed save meant no WhatsApp and no call.
 *
 * accept(): the SOS is sent at once from the request (the plan the route built), kept in memory so
 * the app's retry is answered as a duplicate, and written to the journal on this server's disk
 * (sosJournal.js), with the result of each send. The on-call person is paged. Without the database
 * there is no retry queue, so a send that fails now waits for the database.
 *
 * replay(): every REPLAY_EVERY_MS, and at start, each journaled alert is saved to the database
 * under the id its messages already used. Sends that did not get through are sent again, now with
 * their retry jobs. An alert closed meanwhile ("I am safe") is saved closed and not sent again.
 * An alert older than RESUME_MAX_AGE_MS is saved but not sent again: its retry window is over.
 * A journaled alert younger than REPLAY_AFTER_MS is left alone: its first sends may still run.
 *
 * A crash during a replay leaves the alert saved with its plan and not marked sent, so the L3
 * resumer sends it again: twice, never zero times.
 */

const REPLAY_EVERY_MS = 30_000;
export const REPLAY_AFTER_MS = 60_000;
// Same window as SosService.findExistingSos: the same phone within 15 minutes is the same SOS
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
const NO_LOCATION_TEXT = 'Location not yet available';

const displayTime = (iso) => {
  const d = new Date(iso);
  const hours = d.getHours();
  return `Today, ${hours % 12 || 12}:${d.getMinutes().toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
};

export const createSosOffline = ({
  journal = sosJournal,
  dispatch = sosDispatch,
  store = SosService,
  sessions = liveTrackSessions,
  page = (p) => pager.page(p),
  maxAgeMs = RESUME_MAX_AGE_MS,
  now = Date.now,
} = {}) => {
  let timer = null;
  let pass = null;

  // Saves one journaled alert and sends what did not get through. Throws while the database fails.
  const replayOne = async ({ record: r, sent }) => {
    const memory = sessions.get(r.alertId);
    let saved;
    try {
      saved = await store.createSosAlert({
        alertId: r.alertId,
        createdAt: r.createdAt,
        userPhone: r.userPhone,
        location: r.location,
        latitude: r.latitude,
        longitude: r.longitude,
        accuracy: r.accuracy,
        idempotencyKey: r.idempotencyKey,
        notifyPlan: r.plan,
      });
    } catch (e) {
      if (e?.code === '23505') return 'already-saved';
      throw e;
    }
    if (saved.duplicate) return 'already-saved';

    if (memory?.status === 'RESOLVED') {
      await store.resolveSosAlert(r.alertId, memory.resolvedBy || 'user');
      await store.markDispatched(r.alertId);
      return 'resolved';
    }
    if (now() - Date.parse(r.createdAt) > maxAgeMs) {
      console.error(`🚨 [SOS JOURNAL] Alert ${r.alertId} saved after the database outage, too old to send again`);
      await store.markDispatched(r.alertId);
      return 'too-old';
    }

    await dispatch.dispatchAlert(saved, r.plan, { skip: (kind, phone) => sent.has(`${kind}:${phone}`) });
    return 'sent';
  };

  return {
    /**
     * Sends an SOS the database could not save. Returns { session, results } like a normal send.
     * onSession(session): called before the sends, for the dashboard.
     */
    async accept({ userPhone, idempotencyKey, latitude, longitude, accuracy, location, plan, cause, onSession }) {
      // The app resends while the failing database keeps the first request waiting. Each resend
      // passed the duplicate check (it reads the database) and became a second SOS to the same
      // guardians. The first one to get here is in memory: the rest are its duplicates. No await
      // between this check and sessions.set below, so two requests cannot both pass it.
      const existing = sessions.findActive({ idempotencyKey, userPhone }, DUPLICATE_WINDOW_MS);
      if (existing) return { session: existing, duplicate: true, results: [] };

      const alertId = crypto.randomUUID();
      const createdAt = new Date(now()).toISOString();
      const coords = toLatLng(latitude, longitude);
      const place = hasFix(coords.latitude, coords.longitude)
        ? `GPS ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
        : (location && !/https?:/i.test(location) ? location : NO_LOCATION_TEXT);

      console.error(`🚨 [SOS WITHOUT DATABASE] Alert ${alertId}: saving failed (${cause}). Sending from the request and writing to the journal.`);
      page({ key: 'database:down', reason: `database failed while saving an SOS (${cause}). SOS are sent but not saved until it is back` });

      const session = {
        id: alertId,
        userPhone: userPhone || '',
        idempotencyKey: idempotencyKey || null,
        timestamp: createdAt,
        displayTime: displayTime(createdAt),
        location: place,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.latitude !== null && accuracy != null ? parseFloat(accuracy) : null,
        status: 'ACTIVE',
        lastUpdated: createdAt,
        evidenceUrl: null,
        degraded: true,
      };
      // In memory first: the app's retry with the same key is a duplicate, not a second SOS
      sessions.set(alertId, session);
      onSession?.(session);

      let onSent;
      try {
        await journal.append({
          type: 'alert', alertId, createdAt, userPhone, idempotencyKey,
          latitude: coords.latitude, longitude: coords.longitude, accuracy, location: place, plan,
        });
        onSent = (kind, phone, out) =>
          journal.append({ type: 'sent', alertId, kind, phone, success: !!out?.success })
            .catch((e) => console.error(`🚨 [SOS JOURNAL] Result of ${kind} for alert ${alertId} not written, it may be sent again:`, e.message));
      } catch (e) {
        console.error(`🚨 [SOS JOURNAL] Alert ${alertId} NOT written (${e.message}): sent now, but never saved or retried`);
      }

      const results = await dispatch.dispatchAlert(session, plan, { markWhenQueued: false, onSent });
      return { session, results };
    },

    // One pass over the journal. Returns how many alerts were saved.
    async replay() {
      const records = await journal.readAll();
      if (!records.length) return 0;

      const alerts = new Map();
      for (const r of records) {
        if (r.type === 'alert') alerts.set(r.alertId, { record: r, sent: new Set(), done: false });
      }
      for (const r of records) {
        const a = alerts.get(r.alertId);
        if (!a) continue;
        if (r.type === 'sent' && r.success) a.sent.add(`${r.kind}:${r.phone}`);
        if (r.type === 'replayed') a.done = true;
      }

      let saved = 0;
      for (const [alertId, a] of alerts) {
        if (a.done || now() - Date.parse(a.record.createdAt) < REPLAY_AFTER_MS) continue;
        try {
          const result = await replayOne(a);
          await journal.append({ type: 'replayed', alertId });
          a.done = true;
          saved += 1;
          console.log(`✅ [SOS JOURNAL] Alert ${alertId} saved after the database outage (${result})`);
        } catch (e) {
          console.warn(`⚠️ [SOS JOURNAL] Alert ${alertId} not saved yet, the database still fails: ${e.message}`);
          break;
        }
      }

      // Rewritten only when something is finished, or when lines belong to no alert record
      const pending = [...alerts].filter(([, a]) => !a.done).map(([id]) => id);
      const orphans = records.some((r) => !alerts.has(r.alertId));
      if (saved || orphans || pending.length < alerts.size) await journal.keepOnly(pending);
      return saved;
    },

    // For the health check: alerts in the journal not yet saved to the database
    async pendingCount() {
      const records = await journal.readAll();
      const done = new Set(records.filter((r) => r.type === 'replayed').map((r) => r.alertId));
      return records.filter((r) => r.type === 'alert' && !done.has(r.alertId)).length;
    },

    start() {
      const run = () => {
        if (pass) return;
        pass = this.replay()
          .catch((e) => console.error('🚨 [SOS JOURNAL] Replay failed, next pass continues:', e))
          .finally(() => { pass = null; });
      };
      run(); // alerts journaled before a restart
      timer = setInterval(run, REPLAY_EVERY_MS);
      timer.unref();
      return timer;
    },

    async stop() {
      clearInterval(timer);
      await pass;
    },
  };
};

export const sosOffline = createSosOffline();
export default sosOffline;

import { pickSosRecipients, sendBlockReason } from '../utils/sosRecipients.js';
import { maskPhone } from '../utils/logMask.js';
import { sosNotify } from './sosNotify.service.js';
import { pager } from './pager.service.js';
import { SosService } from './sos.service.js';

/**
 * Sends an SOS to its recipients, and finishes the sending of any SOS that was cut off (L3).
 *
 * The problem: the alert is saved, then each send queues its retry job. A crash, restart or error
 * between the two left an alert that nobody sent, and the app's retry was answered "duplicate"
 * and sent nothing either.
 *
 * Now the send plan (who, and which sends the limits stopped) is saved in the same insert as the
 * alert (SosService.createSosAlert), with dispatch_started_at. Once every send has its retry job
 * queued, the alert is marked dispatched_at. An ACTIVE alert still unmarked DISPATCH_LEASE_MS after
 * it was taken on was cut off: the resumer (every RESUME_EVERY_MS, and on the app's duplicate
 * retry) takes it on again and sends the plan. Taking it on is a conditional update, so only one
 * server sends it.
 *
 * A crash after some sends were queued sends those again: twice, never zero times.
 * Alerts older than RESUME_MAX_AGE_MS are not resumed: by then the retry window is over too.
 */

export const DISPATCH_LEASE_MS = 30_000;
export const RESUME_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const RESUME_EVERY_MS = 15_000;

/**
 * Who this SOS goes to and which sends are stopped by the limits (R6). Uses up recipient limits,
 * so it runs once per SOS: a resumed alert sends this same plan.
 * Without a guardian the control room number gets it, or nobody when ADMIN_WHATSAPP is not set.
 */
export const buildNotifyPlan = ({ account, requestContacts, victimName, overIpLimit = false, controlRoomPhone }) => {
  const picked = pickSosRecipients({ account, requestContacts });
  const controlRoomOnly = picked.length === 0;
  const list = controlRoomOnly
    ? [{ phone: (controlRoomPhone ?? process.env.ADMIN_WHATSAPP ?? '').replace(/\D/g, ''), role: 'control_room' }]
    : picked.map((r) => ({ phone: r.phone, verified: r.verified, role: 'guardian' }));

  const recipients = list.map((r) => {
    if (!r.phone) return { phone: '', role: r.role, blocked: 'CONTROL_ROOM_NOT_CONFIGURED' };
    const blocked = r.role === 'guardian'
      ? sendBlockReason(r, undefined, { overIpLimit })
      : (overIpLimit ? 'IP_LIMIT' : null);
    return { phone: r.phone, role: r.role, verified: !!r.verified, blocked };
  });

  return {
    victimName,
    sendName: controlRoomOnly ? `${victimName} (Instant SOS)` : victimName,
    controlRoomOnly,
    recipients,
  };
};

export const createSosDispatch = ({
  notify = sosNotify,
  page = (p) => pager.page(p),
  store = SosService,
  leaseMs = DISPATCH_LEASE_MS,
  maxAgeMs = RESUME_MAX_AGE_MS,
} = {}) => {
  let timer = null;
  let pass = null;

  /**
   * Sends WhatsApp and a call to each recipient in the plan. Waits for the WhatsApp answers, so the
   * phone learns who was not reached; calls are not waited for.
   * markWhenQueued: mark the alert dispatched once every retry job is queued.
   * onSent(kind, phone, out): each send's first result, calls included (sosJournal.js)
   * skip(kind, phone): true for a send that must not go out again (a replay after an outage)
   * Returns one { phone, role, sent, reason } per recipient.
   */
  const dispatchAlert = async (alert, plan, { markWhenQueued = true, onSent, skip } = {}) => {
    const queued = [];
    const whenQueued = () => {
      let done;
      queued.push(new Promise((resolve) => { done = resolve; }));
      return done;
    };
    const location = { latitude: alert.latitude, longitude: alert.longitude, location: alert.location };

    const results = await Promise.all(
      plan.recipients.map(async (r) => {
        if (r.blocked === 'CONTROL_ROOM_NOT_CONFIGURED') {
          console.error(`🚨 [CONTROL ROOM NOT CONFIGURED] Alert ${alert.id}: no guardian and ADMIN_WHATSAPP is not set. Only the dashboard and the on-call person are told.`);
          // Nobody else is told, so the on-call person gets the SOS itself (not awaited)
          page({
            key: `alert:${alert.id}`,
            reason: 'no guardian and no control room number (ADMIN_WHATSAPP)',
            alert: { alertId: alert.id, victimName: plan.victimName, location },
          });
          return { phone: '', role: r.role, sent: false, reason: r.blocked };
        }
        if (r.blocked) {
          console.warn(`⚠️ [SOS ${r.blocked}] Alert ${alert.id}: not sent to ${maskPhone(r.phone)}`);
          return { phone: r.phone, role: r.role, sent: false, reason: r.blocked };
        }
        if (r.role === 'control_room') {
          console.log(`📲 [INSTANT SOS WHATSAPP DISPATCH] Alert ${alert.id}: alerting the control room (+${maskPhone(r.phone)})`);
        }

        // Sent now; a failed WhatsApp or call is retried by the queue worker (sosNotify.service.js)
        const job = { alertId: alert.id, phone: r.phone, victimName: plan.sendName || plan.victimName, location };
        const send = (kind) => {
          if (skip?.(kind, r.phone)) return Promise.resolve({ success: true, skipped: true });
          const run = notify.dispatch(kind, job, { onQueued: whenQueued() });
          if (onSent) run.then((out) => onSent(kind, r.phone, out), () => {});
          return run;
        };
        send('ivr');
        const out = await send('whatsapp');
        return { phone: r.phone, role: r.role, sent: !!out?.success, reason: out?.success ? null : (out?.reason || 'UNKNOWN') };
      })
    );

    // Not awaited: the calls' jobs can be queued after the reply to the phone
    if (markWhenQueued) Promise.all(queued).then(() => store.markDispatched(alert.id));
    return results;
  };

  const resumeOne = async ({ alert, plan }) => {
    const sendable = plan.recipients.filter((r) => !r.blocked).length;
    console.warn(`🔁 [SOS RESUMED] Alert ${alert.id}: its sending was cut off (crash, restart or error). Sending to ${sendable} recipient(s) now.`);
    await dispatchAlert(alert, plan);
  };

  return {
    dispatchAlert,

    // One pass: every alert whose sending was cut off is sent. Returns how many.
    async resumeStale() {
      const list = await store.claimStaleDispatches({ leaseMs, maxAgeMs });
      for (const one of list) {
        try {
          await resumeOne(one);
        } catch (e) {
          console.error(`🚨 [SOS RESUME] Alert ${one.alert?.id} failed, the next pass tries again:`, e);
        }
      }
      return list.length;
    },

    // The app sent this SOS again: if its sending was cut off, finish it now. Never throws.
    async resume(alertId) {
      try {
        const one = await store.claimDispatch(alertId, leaseMs);
        if (!one) return false;
        await resumeOne(one);
        return true;
      } catch (e) {
        console.error(`🚨 [SOS RESUME] Alert ${alertId} failed, the next pass tries again:`, e);
        return false;
      }
    },

    start() {
      timer = setInterval(() => {
        if (pass) return;
        pass = this.resumeStale()
          .catch((e) => console.error('🚨 [SOS RESUME] Pass failed, next pass continues:', e))
          .finally(() => { pass = null; });
      }, RESUME_EVERY_MS);
      timer.unref();
      return timer;
    },

    // For a shutdown: no new passes, then waits for the pass still running
    async stop() {
      clearInterval(timer);
      await pass;
    },
  };
};

export const sosDispatch = createSosDispatch();
export default sosDispatch;

import { QueueService } from './queue.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { ivrService } from './ivr.service.js';
import { SosService } from './sos.service.js';
import { Encryption } from '../utils/encryption.js';
import { maskPhone } from '../utils/logMask.js';

/**
 * SOS WhatsApp alerts and IVR calls with retry (Supabase Queues, db/sos-queue.sql).
 *
 * Each send is queued as a job hidden for RETRY_AFTER_SECONDS and sent at once in parallel:
 * - sent (or failed for good, e.g. number not on WhatsApp) → job deleted
 * - failed for a reason that can pass (timeout, rate limit, provider down), or the server died
 *   mid-send → the job shows up after RETRY_AFTER_SECONDS and the worker sends it again,
 *   up to MAX_ATTEMPTS times, then archives it and logs that the alert never got through
 * The SOS is never slower for it, and the worker skips alerts already marked safe.
 * A send whose job was deleted too late can go out twice: better than not at all.
 *
 * The phone number, name and location in a job are encrypted like the database columns.
 */

export const SOS_NOTIFY_QUEUE = 'sos_notify';
export const RETRY_AFTER_SECONDS = 60;
export const MAX_ATTEMPTS = 5;
const POLL_MS = 15_000;
const BATCH = 10;
const FIELD = 'pgmq.sos_notify';

// Failures of this one number that no retry can fix. An expired token, a template problem or missing
// provider settings stop every alert until someone fixes them, so those jobs stay and keep retrying.
const PERMANENT_WHATSAPP = new Set(['NOT_ON_WHATSAPP', 'PHONE_EMPTY']);
const PERMANENT_IVR = new Set(['Invalid phone number']);

const defaultSenders = {
  whatsapp: (job) =>
    WhatsAppService.sendEmergencyAlert(job.phone, job.victimName, job.location)
      .catch((e) => ({ success: false, reason: 'NETWORK', error: e.message })),
  ivr: (job) =>
    ivrService.triggerEmergencyCall({
      recipientPhone: job.phone,
      victimName: job.victimName,
      locationText: job.location?.location || '',
      sosId: job.alertId,
    }).catch((e) => ({ success: false, error: e.message })),
};

const isPermanent = (kind, out) =>
  kind === 'whatsapp' ? PERMANENT_WHATSAPP.has(out?.reason) : PERMANENT_IVR.has(out?.error);

const alertStatus = (alertId) => SosService.getSavedAlertStatus(alertId);

export const createSosNotify = ({ queue = QueueService, senders = defaultSenders, getAlertStatus = alertStatus } = {}) => {
  let missingQueueLogged = false;

  const enqueue = async (kind, job) => {
    try {
      const data = Encryption.encrypt(JSON.stringify(job), FIELD, job.alertId);
      return await queue.send(SOS_NOTIFY_QUEUE, { kind, alertId: job.alertId, data }, RETRY_AFTER_SECONDS);
    } catch (e) {
      console.error(`⚠️ [SOS QUEUE] ${kind} for alert ${job.alertId} not queued, so no retry if this send fails:`, e.message);
      return null;
    }
  };

  const drop = (id, how = 'delete') =>
    queue[how](SOS_NOTIFY_QUEUE, id).catch((e) => console.warn(`⚠️ [SOS QUEUE] ${how} job ${id} failed:`, e.message));

  return {
    /**
     * Sends one WhatsApp alert or IVR call now, with a queued retry behind it.
     * kind: 'whatsapp' | 'ivr'; job: { alertId, phone, victimName, location: { latitude, longitude, location } }
     * Returns the first attempt's result.
     */
    async dispatch(kind, job) {
      const [jobId, out] = await Promise.all([enqueue(kind, job), senders[kind](job)]);
      if (jobId != null && (out?.success || isPermanent(kind, out))) await drop(jobId);
      return out;
    },

    // One worker pass: retries the jobs whose first send did not get through
    async processBatch() {
      let jobs;
      try {
        jobs = await queue.read(SOS_NOTIFY_QUEUE, RETRY_AFTER_SECONDS, BATCH);
      } catch (e) {
        if (e.code === '42P01') {
          if (!missingQueueLogged) console.error('🚨 [SOS QUEUE] Queue "sos_notify" does not exist: run db/sos-queue.sql. Failed SOS alerts are NOT retried.');
          missingQueueLogged = true;
        } else {
          console.warn('⚠️ [SOS QUEUE] Read failed:', e.message);
        }
        return 0;
      }
      missingQueueLogged = false;

      for (const { msg_id: id, read_ct: attempt, message } of jobs) {
        const kind = message?.kind;
        const alertId = message?.alertId;
        const plain = Encryption.decrypt(message?.data, FIELD, alertId);
        if (!plain || !senders[kind]) {
          console.error(`🚨 [SOS QUEUE] Job ${id} for alert ${alertId} is unreadable, archived`);
          await drop(id, 'archive');
          continue;
        }
        const job = JSON.parse(plain);

        if (attempt > MAX_ATTEMPTS) {
          console.error(`🚨 [SOS QUEUE GAVE UP] ${kind} for alert ${alertId} to ${maskPhone(job.phone)} failed ${MAX_ATTEMPTS} retries, archived`);
          await drop(id, 'archive');
          continue;
        }
        if ((await getAlertStatus(alertId)) === 'RESOLVED') {
          await drop(id);
          continue;
        }

        const out = await senders[kind](job);
        if (out?.success) {
          console.log(`✅ [SOS QUEUE] ${kind} for alert ${alertId} to ${maskPhone(job.phone)} got through on retry ${attempt}`);
          await drop(id);
        } else if (isPermanent(kind, out)) {
          console.warn(`⚠️ [SOS QUEUE] ${kind} for alert ${alertId} to ${maskPhone(job.phone)} failed for good (${out?.reason || out?.error}), archived`);
          await drop(id, 'archive');
        } else {
          console.warn(`⚠️ [SOS QUEUE] ${kind} for alert ${alertId} to ${maskPhone(job.phone)} retry ${attempt}/${MAX_ATTEMPTS} failed (${out?.reason || out?.error}), next in ${RETRY_AFTER_SECONDS}s`);
        }
      }
      return jobs.length;
    },

    startWorker() {
      let busy = false;
      const timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          await this.processBatch();
        } finally {
          busy = false;
        }
      }, POLL_MS);
      timer.unref();
      console.log(`🔁 [SOS QUEUE] Retry worker started (every ${POLL_MS / 1000}s, up to ${MAX_ATTEMPTS} retries)`);
      return timer;
    },
  };
};

export const sosNotify = createSosNotify();
export default sosNotify;

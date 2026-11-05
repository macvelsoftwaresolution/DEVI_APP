import { QueueService } from './queue.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { ivrService } from './ivr.service.js';
import { SosService } from './sos.service.js';
import { Encryption } from '../utils/encryption.js';
import { maskPhone } from '../utils/logMask.js';

/**
 * SOS WhatsApp alerts and IVR calls with retry (Supabase Queues, db/sos-queue.sql).
 *
 * Each send is queued as a job hidden for about RETRY_AFTER_SECONDS and sent at once in parallel:
 * - sent (or failed for good, e.g. number not on WhatsApp) → job deleted
 * - failed for a reason that can pass (timeout, rate limit, provider down), or the server died
 *   mid-send → the job shows up and the worker sends it again, waiting longer each time
 *   (RETRY_GAPS_SECONDS, about 2 hours in all, so a long provider outage does not use up the
 *   retries), up to MAX_ATTEMPTS times, then archives it and logs that the alert never got through
 * Gaps vary by 20%, so a recovering provider does not get every retry at the same moment.
 * The SOS is never slower for it, and the worker skips alerts already marked safe.
 * A send whose job was deleted too late can go out twice: better than not at all.
 *
 * pgmq_public cannot change a queued job's delay, so a retry is a new delayed job. It is added
 * before the old one is deleted: a crash between the two sends twice, never zero times.
 *
 * The phone number, name and location in a job are encrypted like the database columns.
 */

export const SOS_NOTIFY_QUEUE = 'sos_notify';
export const RETRY_AFTER_SECONDS = 60;
// Wait after retry 1, 2, 3, then the last gap for every later retry
export const RETRY_GAPS_SECONDS = [60, 120, 300, 600];
export const MAX_ATTEMPTS = 15;
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

export const retryGapSeconds = (attempt) => RETRY_GAPS_SECONDS.at(Math.min(attempt, RETRY_GAPS_SECONDS.length) - 1);

const alertStatus = (alertId) => SosService.getSavedAlertStatus(alertId);

export const createSosNotify = ({ queue = QueueService, senders = defaultSenders, getAlertStatus = alertStatus, random = Math.random } = {}) => {
  let missingQueueLogged = false;
  let workerTimer = null;
  let workerPass = null;
  const sending = new Set(); // dispatches still running, so a shutdown can wait for them

  // Within 20% either way
  const varied = (seconds) => Math.round(seconds * (0.8 + random() * 0.4));

  const enqueue = async (kind, job) => {
    try {
      const data = Encryption.encrypt(JSON.stringify(job), FIELD, job.alertId);
      return await queue.send(SOS_NOTIFY_QUEUE, { kind, alertId: job.alertId, data }, varied(RETRY_AFTER_SECONDS));
    } catch (e) {
      console.error(`⚠️ [SOS QUEUE] ${kind} for alert ${job.alertId} not queued, so no retry if this send fails:`, e.message);
      return null;
    }
  };

  const drop = (id, how = 'delete') =>
    queue[how](SOS_NOTIFY_QUEUE, id).catch((e) => console.warn(`⚠️ [SOS QUEUE] ${how} job ${id} failed:`, e.message));

  // If this fails the old job is left alone and comes back on its own after the read's hide time
  const retryLater = async (id, message, attempt) => {
    const gap = varied(retryGapSeconds(attempt));
    try {
      await queue.send(SOS_NOTIFY_QUEUE, { ...message, attempt: attempt + 1 }, gap);
    } catch (e) {
      console.warn(`⚠️ [SOS QUEUE] Next retry of job ${id} not queued, it comes back by itself:`, e.message);
      return RETRY_AFTER_SECONDS;
    }
    await drop(id);
    return gap;
  };

  const retryJob = async ({ msg_id: id, read_ct: timesRead, message }) => {
    // A first retry has no count yet. Queued jobs from older code go by their read count.
    const attempt = message?.attempt ?? timesRead;
    const kind = message?.kind;
    const alertId = message?.alertId;
    try {
      const plain = Encryption.decrypt(message?.data, FIELD, alertId);
      if (!plain || !senders[kind]) {
        console.error(`🚨 [SOS QUEUE] Job ${id} for alert ${alertId} is unreadable, archived`);
        await drop(id, 'archive');
        return;
      }
      const job = JSON.parse(plain);

      if (attempt > MAX_ATTEMPTS) {
        console.error(`🚨 [SOS QUEUE GAVE UP] ${kind} for alert ${alertId} to ${maskPhone(job.phone)} failed ${MAX_ATTEMPTS} retries, archived`);
        await drop(id, 'archive');
        return;
      }
      if ((await getAlertStatus(alertId)) === 'RESOLVED') {
        await drop(id);
        return;
      }

      const out = await senders[kind](job);
      if (out?.success) {
        console.log(`✅ [SOS QUEUE] ${kind} for alert ${alertId} to ${maskPhone(job.phone)} got through on retry ${attempt}`);
        await drop(id);
      } else if (isPermanent(kind, out)) {
        console.warn(`⚠️ [SOS QUEUE] ${kind} for alert ${alertId} to ${maskPhone(job.phone)} failed for good (${out?.reason || out?.error}), archived`);
        await drop(id, 'archive');
      } else {
        const gap = await retryLater(id, message, attempt);
        console.warn(`⚠️ [SOS QUEUE] ${kind} for alert ${alertId} to ${maskPhone(job.phone)} retry ${attempt}/${MAX_ATTEMPTS} failed (${out?.reason || out?.error}), next in ${gap}s`);
      }
    } catch (e) {
      // One bad job must not stop the others or the server. It comes back after the read's hide
      // time, and a job that keeps failing here is archived by its read count.
      console.error(`🚨 [SOS QUEUE] Job ${id} for alert ${alertId} failed unexpectedly:`, e);
      if (timesRead > MAX_ATTEMPTS) await drop(id, 'archive');
    }
  };

  return {
    /**
     * Sends one WhatsApp alert or IVR call now, with a queued retry behind it.
     * kind: 'whatsapp' | 'ivr'; job: { alertId, phone, victimName, location: { latitude, longitude, location } }
     * Returns the first attempt's result.
     */
    dispatch(kind, job) {
      const run = (async () => {
        const [jobId, out] = await Promise.all([enqueue(kind, job), senders[kind](job)]);
        if (jobId != null && (out?.success || isPermanent(kind, out))) await drop(jobId);
        return out;
      })();
      sending.add(run);
      const done = () => sending.delete(run);
      run.then(done, done);
      return run;
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

      for (const entry of jobs) await retryJob(entry);
      return jobs.length;
    },

    startWorker() {
      workerTimer = setInterval(() => {
        if (workerPass) return;
        workerPass = this.processBatch()
          .catch((e) => console.error('🚨 [SOS QUEUE] Worker pass failed, next pass continues:', e))
          .finally(() => { workerPass = null; });
      }, POLL_MS);
      workerTimer.unref();
      console.log(`🔁 [SOS QUEUE] Retry worker started (every ${POLL_MS / 1000}s, up to ${MAX_ATTEMPTS} retries)`);
      return workerTimer;
    },

    // For a shutdown: no new worker passes, then waits for the pass and the sends still running
    async stop() {
      clearInterval(workerTimer);
      await Promise.allSettled([workerPass, ...sending]);
    },
  };
};

export const sosNotify = createSosNotify();
export default sosNotify;

import { supabase } from '../config/supabase.js';

/**
 * Deletes data that is no longer needed, once a day (S5, db/retention.sql).
 *
 * Days each kind is kept, from .env (0 = forever):
 *   RETENTION_QUEUE_ARCHIVE_DAYS   ended retry jobs             default 30
 *   RETENTION_WHATSAPP_STATUS_DAYS WhatsApp delivery statuses   default 30
 *   RETENTION_OTP_DAYS             sign-in code rows            default 7
 *   RETENTION_SEND_PLAN_DAYS       SOS send plans (cleared)     default 7
 *   RETENTION_SOS_DAYS             SOS history itself           default 0: a legal decision
 *
 * Each call deletes a batch per kind; it calls again until a call deletes nothing, at most
 * MAX_ROUNDS times a day, so a big first clean-up is spread over a few days.
 */

const RUN_EVERY_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_MS = 10 * 60 * 1000;
const MAX_ROUNDS = 50;
const BATCH = 5000;

const days = (env, name, fallback) => {
  const raw = env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

export const retentionDays = (env = process.env) => ({
  p_queue_days: days(env, 'RETENTION_QUEUE_ARCHIVE_DAYS', 30),
  p_whatsapp_days: days(env, 'RETENTION_WHATSAPP_STATUS_DAYS', 30),
  p_otp_days: days(env, 'RETENTION_OTP_DAYS', 7),
  // Never under 1 day: the plan is what resumes an SOS cut off in the last 2 hours (L3)
  p_plan_days: Math.max(days(env, 'RETENTION_SEND_PLAN_DAYS', 7), 1),
  p_sos_days: days(env, 'RETENTION_SOS_DAYS', 0),
});

const KINDS = ['queueArchive', 'whatsappStatuses', 'otpCodes', 'sendPlans', 'sos'];

export const createRetention = ({ db = supabase, env = process.env, now = Date.now } = {}) => {
  let timer = null;
  let firstTimer = null;
  let running = null;
  let last = null; // { at, ok, totals | error }

  const service = {
    // One day's clean-up. Returns { ok, totals, rounds } or { ok: false, error }.
    async run() {
      const args = { ...retentionDays(env), p_batch: BATCH };
      const totals = Object.fromEntries(KINDS.map((k) => [k, 0]));
      let rounds = 0;
      try {
        for (; rounds < MAX_ROUNDS; rounds += 1) {
          const { data, error } = await db.rpc('run_retention', args);
          if (error) throw Object.assign(new Error(error.message), { code: error.code });
          const deleted = KINDS.reduce((sum, k) => sum + (Number(data?.[k]) || 0), 0);
          KINDS.forEach((k) => { totals[k] += Number(data?.[k]) || 0; });
          if (!deleted) break;
        }
        last = { at: now(), ok: true, totals };
        const sum = KINDS.reduce((s, k) => s + totals[k], 0);
        if (sum) console.log(`🧹 [RETENTION] Removed: ${KINDS.map((k) => `${k} ${totals[k]}`).join(', ')}`);
        return { ok: true, totals, rounds: rounds + 1 };
      } catch (e) {
        const missing = ['PGRST202', '42883'].includes(e.code);
        last = { at: now(), ok: false, missing, error: e.message };
        console[missing ? 'warn' : 'error'](`${missing ? '⚠️' : '🚨'} [RETENTION] ${missing ? 'run_retention missing: nothing is deleted. Run db/retention.sql.' : `Failed: ${e.message}`}`);
        return { ok: false, error: e.message };
      }
    },

    // For the health check
    status() {
      return { last, days: retentionDays(env) };
    },

    start() {
      const pass = () => {
        if (running) return;
        running = service.run().finally(() => { running = null; });
      };
      firstTimer = setTimeout(pass, FIRST_RUN_MS);
      firstTimer.unref();
      timer = setInterval(pass, RUN_EVERY_MS);
      timer.unref();
    },

    async stop() {
      clearTimeout(firstTimer);
      clearInterval(timer);
      await running;
    },
  };
  return service;
};

export const retention = createRetention();
export default retention;

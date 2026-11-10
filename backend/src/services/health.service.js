import { supabase } from '../config/supabase.js';
import { sosNotify } from './sosNotify.service.js';
import { sosOffline } from './sosOffline.service.js';
import { pager } from './pager.service.js';
import { retention } from './retention.service.js';

/**
 * Deep health check (REL1) and the monitor that pages on it (REL2).
 *
 * Each check answers ok, warn or fail, with a short detail and never a secret:
 *   database  sos_history can be read
 *   queue     the retry queue's backlog (db/sos-health.sql): jobs overdue mean the worker is stuck
 *   worker    the retry worker has run a pass recently
 *   journal   SOS taken while the database was down and not saved yet (L2)
 *   whatsapp  the access token works (Meta Graph API)
 *   plivo     the prepaid balance
 *   twilio    the account is active, not a trial, and has balance
 *   oncall    someone is paged (ONCALL_PHONE)
 *
 * The monitor runs every MONITOR_EVERY_MS and pages the on-call person for each failing check.
 * The pager sends one page per check per 15 minutes. A warning is only shown, never paged.
 */

const CHECK_TIMEOUT_MS = 5000;
const MONITOR_EVERY_MS = 5 * 60 * 1000;
const MONITOR_FIRST_MS = 60 * 1000;
// A worker pass every 15 seconds: two minutes without one means it is stuck
const WORKER_STALE_MS = 2 * 60 * 1000;
const QUEUE_OVERDUE_FAIL = 25;
const QUEUE_OLDEST_FAIL_SECONDS = 5 * 60;

const ok = (detail) => ({ status: 'ok', detail });
const warn = (detail) => ({ status: 'warn', detail });
const fail = (detail) => ({ status: 'fail', detail });

const minBalance = (env, name, fallback) => {
  if (env[name] == null || String(env[name]).trim() === '') return fallback;
  const n = Number(env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const getJson = async (fetchImpl, url, headers) => {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
};

const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

export const defaultChecks = ({ db = supabase, notify = sosNotify, offline = sosOffline, retain = retention, env = process.env, fetchImpl = fetch, startedAt = Date.now(), now = Date.now } = {}) => ({
  async database() {
    const { error } = await db.from('sos_history').select('id').limit(1);
    return error ? fail(`cannot read sos_history (${error.code || error.message})`) : ok('reachable');
  },

  async queue() {
    const { data, error } = await db.rpc('sos_queue_health');
    if (error) {
      if (['PGRST202', '42883'].includes(error.code)) return warn('unknown: run db/sos-health.sql');
      if (error.code === '42P01') return fail('queue sos_notify missing: run db/sos-queue.sql');
      return fail(`cannot read the queue (${error.code || error.message})`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const depth = Number(row?.depth || 0);
    const overdue = Number(row?.overdue || 0);
    const oldest = Number(row?.oldest_overdue_seconds || 0);
    const detail = `${depth} jobs, ${overdue} overdue, oldest due ${oldest}s ago`;
    if (overdue >= QUEUE_OVERDUE_FAIL || (overdue > 0 && oldest >= QUEUE_OLDEST_FAIL_SECONDS)) return fail(`retries backing up: ${detail}`);
    return ok(detail);
  },

  async worker() {
    const s = notify.status();
    if (!s.workerStarted) return fail('retry worker not started');
    if (s.lastPassAt == null) {
      return now() - startedAt > WORKER_STALE_MS ? fail('retry worker has not finished a pass') : ok('starting');
    }
    const ago = Math.round((now() - s.lastPassAt) / 1000);
    if (now() - s.lastPassAt > WORKER_STALE_MS) return fail(`retry worker stuck: last pass ${ago}s ago`);
    return ok(`last pass ${ago}s ago, watching ${s.watchedCalls} calls and ${s.watchedMessages} WhatsApps`);
  },

  async journal() {
    const pending = await offline.pendingCount();
    return pending ? warn(`${pending} SOS taken while the database was down, not saved yet`) : ok('empty');
  },

  async whatsapp() {
    const id = env.WHATSAPP_PHONE_NUMBER_ID;
    const token = env.WHATSAPP_ACCESS_TOKEN;
    if (!id || !token) return fail('WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set');
    const r = await getJson(fetchImpl, `https://graph.facebook.com/v21.0/${encodeURIComponent(id)}?fields=id`, { Authorization: `Bearer ${token}` });
    if (r.ok) return ok('token works');
    const code = r.body?.error?.code;
    if (code === 190 || r.status === 401) return fail('access token expired or invalid: every SOS WhatsApp fails');
    return fail(`Meta answered ${r.status}${code ? ` (code ${code})` : ''}`);
  },

  async plivo() {
    const id = env.PLIVO_AUTH_ID;
    const token = env.PLIVO_AUTH_TOKEN;
    if (!id || !token || id.includes('your_')) return warn('not configured: +91 calls go through Twilio only');
    const r = await getJson(fetchImpl, `https://api.plivo.com/v1/Account/${encodeURIComponent(id)}/`, { Authorization: basic(id, token) });
    if (!r.ok) return fail(`Plivo answered ${r.status}`);
    const balance = Number(r.body?.cash_credits);
    const min = minBalance(env, 'PLIVO_MIN_BALANCE', 5);
    if (!Number.isFinite(balance)) return warn('balance unknown');
    if (balance < min) return fail(`balance ${balance.toFixed(2)} is below ${min}: +91 calls stop when it runs out`);
    return ok(`balance ${balance.toFixed(2)}`);
  },

  async twilio() {
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;
    if (!sid || !token || sid.includes('PASTE_')) return warn('not configured: calls outside +91 go through Plivo only');
    const auth = { Authorization: basic(sid, token) };
    const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}`;
    const [account, money] = await Promise.all([getJson(fetchImpl, `${base}.json`, auth), getJson(fetchImpl, `${base}/Balance.json`, auth)]);
    if (!account.ok) return fail(`Twilio answered ${account.status}`);
    if (account.body?.status && account.body.status !== 'active') return fail(`account ${account.body.status}`);
    const balance = Number(money.body?.balance);
    const min = minBalance(env, 'TWILIO_MIN_BALANCE', 5);
    if (money.ok && Number.isFinite(balance) && balance < min) return fail(`balance ${balance.toFixed(2)} is below ${min}`);
    const shown = money.ok && Number.isFinite(balance) ? `balance ${balance.toFixed(2)}` : 'balance unknown';
    if (String(account.body?.type).toLowerCase() === 'trial') return warn(`trial account: calls reach verified numbers only (${shown})`);
    return ok(shown);
  },

  // A placeholder or a typo here means every page fails, so it fails too
  async oncall() {
    const phone = String(env.ONCALL_PHONE || '').trim();
    if (!phone) return warn('ONCALL_PHONE not set: failures page nobody');
    if (!/^\+?[1-9]\d{9,14}$/.test(phone.replace(/[\s-]/g, ''))) return fail('ONCALL_PHONE is not a phone number (use +91 and 10 digits, no spaces or < >): every page fails');
    return ok('set');
  },

  // A failing clean-up never stops an SOS, so it only warns
  async retention() {
    const { last, days } = retain.status();
    const sos = days.p_sos_days ? `SOS kept ${days.p_sos_days} days` : 'SOS kept forever';
    if (!last) return ok(`not run yet since start (${sos})`);
    if (!last.ok) return warn(last.missing ? 'run_retention missing: run db/retention.sql' : `last run failed: ${last.error}`);
    if (now() - last.at > 26 * 60 * 60 * 1000) return warn('has not run for over a day');
    return ok(`last run ${Math.round((now() - last.at) / 60000)} min ago (${sos})`);
  },
});

export const createHealth = ({ checks = defaultChecks(), page = (p) => pager.page(p) } = {}) => {
  let timer = null;
  let firstTimer = null;
  let running = null;

  const runOne = async (name, check) => {
    let timeout;
    try {
      const result = await Promise.race([
        check(),
        new Promise((resolve) => { timeout = setTimeout(() => resolve(fail(`no answer within ${CHECK_TIMEOUT_MS / 1000}s`)), CHECK_TIMEOUT_MS); }),
      ]);
      return { name, ...result };
    } catch (e) {
      return { name, ...fail(e.name === 'TimeoutError' ? `no answer within ${CHECK_TIMEOUT_MS / 1000}s` : e.message) };
    } finally {
      clearTimeout(timeout);
    }
  };

  const service = {
    // { status: 'ok'|'warn'|'fail', checks: [{ name, status, detail }], at }
    async run() {
      const results = await Promise.all(Object.entries(checks).map(([name, check]) => runOne(name, check)));
      const status = results.some((r) => r.status === 'fail') ? 'fail' : results.some((r) => r.status === 'warn') ? 'warn' : 'ok';
      return { status, checks: results, at: new Date().toISOString() };
    },

    // One monitor pass: pages each failing check. Returns the report.
    async monitor() {
      const report = await service.run();
      for (const c of report.checks.filter((r) => r.status === 'fail')) {
        console.error(`🚨 [HEALTH] ${c.name}: ${c.detail}`);
        page({ key: `health:${c.name}`, reason: `health check ${c.name} failing: ${c.detail}` });
      }
      return report;
    },

    start() {
      const pass = () => {
        if (running) return;
        running = service.monitor()
          .catch((e) => console.error('🚨 [HEALTH] Monitor pass failed:', e))
          .finally(() => { running = null; });
      };
      firstTimer = setTimeout(pass, MONITOR_FIRST_MS);
      firstTimer.unref();
      timer = setInterval(pass, MONITOR_EVERY_MS);
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

export const health = createHealth();
export default health;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultChecks, createHealth } from '../src/services/health.service.js';
import { mayReadDeepHealth } from '../src/routes/health.routes.js';

// REL1, REL2: a deep health check, and pages when something that stops SOS fails.

const T0 = Date.parse('2026-11-10T10:00:00Z');

// A fake answer per URL fragment; anything else is a 404
const fakeFetch = (routes) => {
  const seen = [];
  const fn = async (url, opts) => {
    seen.push({ url, headers: opts?.headers || {} });
    const hit = Object.entries(routes).find(([frag]) => url.includes(frag));
    const [status, body] = hit ? hit[1] : [404, {}];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  fn.seen = seen;
  return fn;
};

const fakeDb = ({ readError = null, queue = { data: [{ depth: 3, overdue: 0, oldest_overdue_seconds: 0 }], error: null } } = {}) => ({
  from: () => ({ select: () => ({ limit: async () => ({ data: [], error: readError }) }) }),
  rpc: async () => queue,
});

const checksWith = ({ env = {}, db = fakeDb(), notifyStatus, pending = 0, fetchImpl = fakeFetch({}), now = T0 } = {}) => defaultChecks({
  db,
  notify: { status: () => notifyStatus || { workerStarted: true, lastPassAt: T0 - 10_000, watchedCalls: 1, watchedMessages: 2 } },
  offline: { pendingCount: async () => pending },
  env,
  fetchImpl,
  startedAt: T0 - 60 * 60 * 1000,
  now: () => now,
});

test('database: readable is ok, an error fails', async () => {
  assert.equal((await checksWith().database()).status, 'ok');
  assert.equal((await checksWith({ db: fakeDb({ readError: { code: 'PGRST301', message: 'x' } }) }).database()).status, 'fail');
});

test('queue: a backlog of overdue retries fails, a small fresh one is ok', async () => {
  const q = (row) => fakeDb({ queue: { data: [row], error: null } });
  assert.equal((await checksWith({ db: q({ depth: 4, overdue: 2, oldest_overdue_seconds: 70 }) }).queue()).status, 'ok');
  assert.equal((await checksWith({ db: q({ depth: 40, overdue: 25, oldest_overdue_seconds: 90 }) }).queue()).status, 'fail');
  assert.equal((await checksWith({ db: q({ depth: 2, overdue: 1, oldest_overdue_seconds: 400 }) }).queue()).status, 'fail');
});

test('queue: before db/sos-health.sql it warns, a missing queue fails', async () => {
  const err = (code) => fakeDb({ queue: { data: null, error: { code, message: 'x' } } });
  assert.match((await checksWith({ db: err('PGRST202') }).queue()).detail, /sos-health\.sql/);
  assert.equal((await checksWith({ db: err('PGRST202') }).queue()).status, 'warn');
  assert.equal((await checksWith({ db: err('42P01') }).queue()).status, 'fail');
});

test('worker: recent pass ok, stuck or never started fails', async () => {
  assert.equal((await checksWith().worker()).status, 'ok');
  assert.equal((await checksWith({ notifyStatus: { workerStarted: true, lastPassAt: T0 - 3 * 60_000 } }).worker()).status, 'fail');
  assert.equal((await checksWith({ notifyStatus: { workerStarted: false, lastPassAt: null } }).worker()).status, 'fail');
});

test('worker: just started with no pass yet is ok', async () => {
  const c = defaultChecks({
    db: fakeDb(), offline: { pendingCount: async () => 0 }, env: {}, fetchImpl: fakeFetch({}),
    notify: { status: () => ({ workerStarted: true, lastPassAt: null }) },
    startedAt: T0 - 20_000, now: () => T0,
  });
  assert.equal((await c.worker()).status, 'ok');
});

test('journal: SOS waiting for the database is a warning', async () => {
  assert.equal((await checksWith({ pending: 2 }).journal()).status, 'warn');
  assert.equal((await checksWith().journal()).status, 'ok');
});

const WA = { WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_ACCESS_TOKEN: 'secret-token' };

test('whatsapp: a working token is ok, and the token goes only in the header', async () => {
  const fetchImpl = fakeFetch({ 'graph.facebook.com': [200, { id: '123' }] });
  const r = await checksWith({ env: WA, fetchImpl }).whatsapp();
  assert.equal(r.status, 'ok');
  assert.equal(fetchImpl.seen[0].headers.Authorization, 'Bearer secret-token');
  assert.equal(fetchImpl.seen[0].url.includes('secret-token'), false);
  assert.equal(JSON.stringify(r).includes('secret-token'), false);
});

test('whatsapp: an expired token or missing settings fails', async () => {
  const expired = fakeFetch({ 'graph.facebook.com': [401, { error: { code: 190, message: 'expired' } }] });
  assert.match((await checksWith({ env: WA, fetchImpl: expired }).whatsapp()).detail, /expired/);
  assert.equal((await checksWith({ env: {} }).whatsapp()).status, 'fail');
});

const PLIVO = { PLIVO_AUTH_ID: 'MA123', PLIVO_AUTH_TOKEN: 't' };

test('plivo: balance under the minimum fails, enough is ok, not configured warns', async () => {
  const low = fakeFetch({ 'api.plivo.com': [200, { cash_credits: '2.10000' }] });
  const fine = fakeFetch({ 'api.plivo.com': [200, { cash_credits: '40.00000' }] });
  assert.equal((await checksWith({ env: PLIVO, fetchImpl: low }).plivo()).status, 'fail');
  assert.equal((await checksWith({ env: PLIVO, fetchImpl: fine }).plivo()).status, 'ok');
  assert.equal((await checksWith({ env: {} }).plivo()).status, 'warn');
});

const TWILIO = { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 't' };
const twilio = (account, balance) => fakeFetch({ 'Balance.json': [200, { balance, currency: 'USD' }], 'AC123.json': [200, account] });

test('twilio: a trial warns, a suspended account or low balance fails, a paid one is ok', async () => {
  assert.equal((await checksWith({ env: TWILIO, fetchImpl: twilio({ status: 'active', type: 'Trial' }, '14.00') }).twilio()).status, 'warn');
  assert.equal((await checksWith({ env: TWILIO, fetchImpl: twilio({ status: 'suspended', type: 'Full' }, '14.00') }).twilio()).status, 'fail');
  assert.equal((await checksWith({ env: TWILIO, fetchImpl: twilio({ status: 'active', type: 'Full' }, '1.00') }).twilio()).status, 'fail');
  assert.equal((await checksWith({ env: TWILIO, fetchImpl: twilio({ status: 'active', type: 'Full' }, '20.00') }).twilio()).status, 'ok');
});

test('oncall: not set warns', async () => {
  assert.equal((await checksWith().oncall()).status, 'warn');
  assert.equal((await checksWith({ env: { ONCALL_PHONE: '+919000000001' } }).oncall()).status, 'ok');
});

// --- The report and the monitor ---

test('the report is fail if any check fails, warn if any warns, and a throwing check fails', async () => {
  const h = createHealth({
    checks: {
      a: async () => ({ status: 'ok', detail: '' }),
      b: async () => ({ status: 'warn', detail: '' }),
      c: async () => { throw new Error('boom'); },
    },
    page: () => {},
  });
  const report = await h.run();
  assert.equal(report.status, 'fail');
  assert.deepEqual(report.checks.map((c) => c.status), ['ok', 'warn', 'fail']);
  assert.equal(report.checks[2].detail, 'boom');

  const onlyWarn = createHealth({ checks: { b: async () => ({ status: 'warn', detail: '' }) }, page: () => {} });
  assert.equal((await onlyWarn.run()).status, 'warn');
});

test('the monitor pages each failing check, and never a warning', async () => {
  const pages = [];
  const h = createHealth({
    checks: {
      plivo: async () => ({ status: 'fail', detail: 'balance 1.00 is below 5' }),
      twilio: async () => ({ status: 'warn', detail: 'trial' }),
      database: async () => ({ status: 'ok', detail: '' }),
    },
    page: (p) => pages.push(p),
  });
  await h.monitor();
  assert.deepEqual(pages.map((p) => p.key), ['health:plivo']);
  assert.match(pages[0].reason, /balance 1\.00/);
});

// --- Who may read it ---

const req = (headers) => ({ get: (name) => headers[name.toLowerCase()] });

test('the deep check needs the health key or an admin login', () => {
  assert.equal(mayReadDeepHealth(req({ 'x-health-key': 'k1' }), 'k1'), true);
  assert.equal(mayReadDeepHealth(req({ 'x-health-key': 'wrong' }), 'k1'), false);
  assert.equal(mayReadDeepHealth(req({}), 'k1'), false);
  assert.equal(mayReadDeepHealth(req({ authorization: 'Bearer not-a-token' }), 'k1'), false);
  // No key set: a missing header must not match an empty key
  assert.equal(mayReadDeepHealth(req({}), ''), false);
  assert.equal(mayReadDeepHealth(req({}), undefined), false);
});

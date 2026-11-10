import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRetention, retentionDays } from '../src/services/retention.service.js';
import { defaultChecks } from '../src/services/health.service.js';

// S5: old data is deleted once a day, in batches, by db/retention.sql.

test('defaults: 30 days of queue archive and statuses, 7 of codes and send plans, SOS forever', () => {
  assert.deepEqual(retentionDays({}), { p_queue_days: 30, p_whatsapp_days: 30, p_otp_days: 7, p_plan_days: 7, p_sos_days: 0 });
});

test('.env overrides the days; junk keeps the default; 0 keeps forever', () => {
  const d = retentionDays({ RETENTION_QUEUE_ARCHIVE_DAYS: '90', RETENTION_OTP_DAYS: '0', RETENTION_WHATSAPP_STATUS_DAYS: 'abc', RETENTION_SOS_DAYS: '365' });
  assert.equal(d.p_queue_days, 90);
  assert.equal(d.p_otp_days, 0);
  assert.equal(d.p_whatsapp_days, 30);
  assert.equal(d.p_sos_days, 365);
  assert.equal(retentionDays({ RETENTION_SOS_DAYS: '-5' }).p_sos_days, 0);
});

test('send plans are kept at least a day, since they resume a cut-off SOS', () => {
  assert.equal(retentionDays({ RETENTION_SEND_PLAN_DAYS: '0' }).p_plan_days, 1);
});

const fakeDb = (answers) => {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      const next = answers.length ? answers.shift() : { data: { queueArchive: 0, whatsappStatuses: 0, otpCodes: 0, sendPlans: 0, sos: 0 }, error: null };
      return next;
    },
  };
};

const batch = (n) => ({ data: { queueArchive: n, whatsappStatuses: 1, otpCodes: 0, sendPlans: 2, sos: 0 }, error: null });

test('it calls again until a call deletes nothing, and adds up what went', async () => {
  const db = fakeDb([batch(5000), batch(10)]);
  const r = await createRetention({ db, env: {} }).run();
  assert.equal(r.ok, true);
  assert.equal(db.calls.length, 3);
  assert.equal(db.calls[0].name, 'run_retention');
  assert.equal(db.calls[0].args.p_batch, 5000);
  assert.equal(db.calls[0].args.p_sos_days, 0);
  assert.deepEqual(r.totals, { queueArchive: 5010, whatsappStatuses: 2, otpCodes: 0, sendPlans: 4, sos: 0 });
});

test('a huge first clean-up stops after 50 rounds and goes on tomorrow', async () => {
  const db = fakeDb(Array.from({ length: 100 }, () => batch(5000)));
  await createRetention({ db, env: {} }).run();
  assert.equal(db.calls.length, 50);
});

test('before db/retention.sql it deletes nothing and says so', async () => {
  const db = fakeDb([{ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }]);
  const r = createRetention({ db, env: {} });
  assert.equal((await r.run()).ok, false);
  assert.equal(r.status().last.missing, true);
});

const healthOf = async (retain, now = Date.now()) => defaultChecks({
  db: {}, notify: { status: () => ({}) }, offline: {}, env: {}, fetchImpl: async () => ({}), retain, now: () => now,
}).retention();

test('health: retention warns when it is missing, failing or late, never fails', async () => {
  const at = Date.parse('2026-11-10T10:00:00Z');
  const status = (last, sosDays = 0) => ({ status: () => ({ last, days: { p_sos_days: sosDays } }) });
  assert.equal((await healthOf(status(null))).status, 'ok');
  assert.equal((await healthOf(status({ at, ok: false, missing: true }))).status, 'warn');
  assert.equal((await healthOf(status({ at, ok: false, error: 'x' }))).status, 'warn');
  assert.equal((await healthOf(status({ at, ok: true }), at + 27 * 60 * 60 * 1000)).status, 'warn');
  const fresh = await healthOf(status({ at, ok: true }, 365), at + 60_000);
  assert.equal(fresh.status, 'ok');
  assert.match(fresh.detail, /SOS kept 365 days/);
});

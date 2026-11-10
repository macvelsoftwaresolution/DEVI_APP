import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../src/config/supabase.js';
import { SosService } from '../src/services/sos.service.js';
import { liveTrackSessions } from '../src/services/live-sessions.js';
import { buildNotifyPlan, createSosDispatch, DISPATCH_LEASE_MS } from '../src/services/sosDispatch.service.js';
import { Encryption } from '../src/utils/encryption.js';

// L3: an alert saved but never sent (crash, restart or error before its sends were queued) is
// sent by the resumer, once.

const realFrom = supabase.from;
afterEach(() => {
  supabase.from = realFrom;
  liveTrackSessions.clear();
});

const GUARDIAN = '+919876543210';
const account = { guardians: [{ phone: GUARDIAN }] };
const KEY = '22222222-2222-4222-8222-222222222222';
const tick = () => new Promise((resolve) => setImmediate(resolve));

// sos_history in memory, with the filters SosService uses
const fakeDb = ({ insertError } = {}) => {
  const rows = [];
  let inserts = 0;
  const from = (table) => {
    assert.equal(table, 'sos_history');
    const q = { mode: null, values: null, filters: [], n: null };
    const run = async (single) => {
      if (q.mode === 'insert') {
        inserts += 1;
        const err = insertError?.(q.values, inserts);
        if (err) return { data: null, error: err };
        const row = { ...q.values, created_at: new Date().toISOString() };
        rows.push(row);
        return { data: { ...row }, error: null };
      }
      let hit = rows.filter((r) => q.filters.every((f) => f(r)));
      if (q.n) hit = hit.slice(0, q.n);
      if (q.mode === 'update') hit.forEach((r) => Object.assign(r, q.values));
      return { data: single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null };
    };
    const api = {
      insert: ([payload]) => { q.mode = 'insert'; q.values = payload; return api; },
      update: (values) => { q.mode = 'update'; q.values = values; return api; },
      select: () => { q.mode ??= 'select'; return api; },
      eq: (c, v) => { q.filters.push((r) => r[c] === v); return api; },
      is: (c, v) => { q.filters.push((r) => (r[c] ?? null) === v); return api; },
      not: (c, _op, v) => { q.filters.push((r) => (r[c] ?? null) !== v); return api; },
      lt: (c, v) => { q.filters.push((r) => r[c] != null && Date.parse(r[c]) < Date.parse(v)); return api; },
      gt: (c, v) => { q.filters.push((r) => r[c] != null && Date.parse(r[c]) > Date.parse(v)); return api; },
      order: () => api,
      limit: (n) => { q.n = n; return api; },
      single: () => run(true),
      maybeSingle: () => run(true),
      then: (resolve, reject) => run(false).then(resolve, reject),
    };
    return api;
  };
  supabase.from = from;
  return { rows, inserts: () => inserts };
};

// sosNotify stand-in: records sends, queues each job at once unless held
const fakeNotify = ({ holdIvrQueue = false } = {}) => {
  const sends = [];
  let releaseIvr;
  const ivrHeld = new Promise((resolve) => { releaseIvr = resolve; });
  return {
    sends,
    releaseIvr: () => releaseIvr(),
    dispatch(kind, job, { onQueued } = {}) {
      sends.push({ kind, phone: job.phone, alertId: job.alertId });
      if (kind === 'ivr' && holdIvrQueue) ivrHeld.then(() => onQueued?.(1));
      else onQueued?.(1);
      return Promise.resolve({ success: true });
    },
  };
};

const saveAlert = (plan) =>
  SosService.createSosAlert({ location: 'GPS', latitude: 13.08, longitude: 80.27, idempotencyKey: KEY, notifyPlan: plan });

const cutOff = (row) => { row.dispatch_started_at = new Date(Date.now() - DISPATCH_LEASE_MS - 1000).toISOString(); };

// --- The plan ---

test('the plan lists the account guardians, verified and not blocked', () => {
  const plan = buildNotifyPlan({ account, requestContacts: [], victimName: 'Priya' });
  assert.equal(plan.controlRoomOnly, false);
  assert.deepEqual(plan.recipients, [{ phone: GUARDIAN, role: 'guardian', verified: true, blocked: null }]);
  assert.equal(plan.sendName, 'Priya');
});

test('without a guardian the plan goes to the control room, or nobody when none is set', () => {
  const withRoom = buildNotifyPlan({ account: null, requestContacts: [], victimName: 'Guest', controlRoomPhone: '+91 90000 00009' });
  assert.equal(withRoom.recipients[0].phone, '919000000009');
  assert.equal(withRoom.recipients[0].role, 'control_room');
  assert.equal(withRoom.sendName, 'Guest (Instant SOS)');

  const none = buildNotifyPlan({ account: null, requestContacts: [], victimName: 'Guest', controlRoomPhone: '' });
  assert.equal(none.recipients[0].blocked, 'CONTROL_ROOM_NOT_CONFIGURED');
});

test('over the IP limit, unverified numbers are blocked in the plan and saved guardians are not', () => {
  const plan = buildNotifyPlan({ account, requestContacts: [GUARDIAN, '+919123456789'], victimName: 'P', overIpLimit: true });
  const byPhone = Object.fromEntries(plan.recipients.map((r) => [r.phone, r.blocked]));
  assert.equal(byPhone[GUARDIAN], null);
  assert.equal(byPhone['+919123456789'], 'IP_LIMIT');
});

// --- Saving the plan with the alert ---

test('the plan is saved encrypted in the same insert as the alert', async () => {
  const db = fakeDb();
  const plan = buildNotifyPlan({ account, requestContacts: [], victimName: 'Priya' });
  const alert = await saveAlert(plan);

  const row = db.rows[0];
  assert.equal(db.inserts(), 1);
  assert.equal(alert.planSaved, true);
  assert.ok(Encryption.isCurrent(row.notify_plan));
  assert.equal(row.notify_plan.includes(GUARDIAN), false);
  assert.ok(row.dispatch_started_at);
  assert.equal(row.dispatched_at, undefined);
});

test('before db/sos-dispatch.sql is run the alert is still saved, with its idempotency key', async () => {
  const db = fakeDb({
    insertError: (payload) => (payload.notify_plan
      ? { code: 'PGRST204', message: "Could not find the 'notify_plan' column of 'sos_history' in the schema cache" }
      : null),
  });
  const alert = await saveAlert(buildNotifyPlan({ account, requestContacts: [], victimName: 'P' }));

  assert.equal(db.inserts(), 2);
  assert.equal(alert.planSaved, false);
  assert.equal(db.rows[0].idempotency_key, KEY);
  assert.equal(db.rows[0].notify_plan, undefined);
});

// --- Sending, and marking it sent ---

test('a normal SOS: sent once, marked sent once every job is queued, never resumed', async () => {
  const db = fakeDb();
  const notify = fakeNotify();
  const dispatch = createSosDispatch({ notify, page: () => {} });
  const plan = buildNotifyPlan({ account, requestContacts: [], victimName: 'Priya' });
  const alert = await saveAlert(plan);

  const results = await dispatch.dispatchAlert(alert, plan, { markWhenQueued: alert.planSaved });
  await tick();

  assert.deepEqual(results, [{ phone: GUARDIAN, role: 'guardian', sent: true, reason: null }]);
  assert.deepEqual(notify.sends.map((s) => s.kind), ['ivr', 'whatsapp']);
  assert.ok(db.rows[0].dispatched_at);

  cutOff(db.rows[0]);
  assert.equal(await dispatch.resumeStale(), 0);
  assert.equal(notify.sends.length, 2);
});

test('the alert is marked sent only after the call job is queued too', async () => {
  const db = fakeDb();
  const notify = fakeNotify({ holdIvrQueue: true });
  const dispatch = createSosDispatch({ notify, page: () => {} });
  const plan = buildNotifyPlan({ account, requestContacts: [], victimName: 'Priya' });
  const alert = await saveAlert(plan);

  await dispatch.dispatchAlert(alert, plan);
  await tick();
  assert.equal(db.rows[0].dispatched_at, undefined);

  notify.releaseIvr();
  await tick();
  await tick();
  assert.ok(db.rows[0].dispatched_at);
});

// --- The crash ---

test('crash after saving: the resumer sends the saved plan, once', async () => {
  const db = fakeDb();
  const plan = buildNotifyPlan({ account, requestContacts: [], victimName: 'Priya' });
  const alert = await saveAlert(plan);
  // The request died here: nothing sent, nothing queued
  cutOff(db.rows[0]);

  const notify = fakeNotify();
  const restarted = createSosDispatch({ notify, page: () => {} });
  assert.equal(await restarted.resumeStale(), 1);
  await tick();

  assert.deepEqual(notify.sends, [
    { kind: 'ivr', phone: GUARDIAN, alertId: alert.id },
    { kind: 'whatsapp', phone: GUARDIAN, alertId: alert.id },
  ]);
  assert.ok(db.rows[0].dispatched_at);
  assert.equal(await restarted.resumeStale(), 0);
  assert.equal(notify.sends.length, 2);
});

test('the resumed send uses the location saved with the alert', async () => {
  const db = fakeDb();
  const plan = buildNotifyPlan({ account, requestContacts: [], victimName: 'Priya' });
  await saveAlert(plan);
  cutOff(db.rows[0]);

  let job;
  const notify = { dispatch: (kind, j, { onQueued } = {}) => { job = j; onQueued?.(1); return Promise.resolve({ success: true }); } };
  await createSosDispatch({ notify, page: () => {} }).resumeStale();
  assert.equal(job.location.latitude, 13.08);
  assert.equal(job.location.longitude, 80.27);
  assert.equal(job.victimName, 'Priya');
});

test('a send still within its 30 seconds is left to the request sending it', async () => {
  fakeDb();
  await saveAlert(buildNotifyPlan({ account, requestContacts: [], victimName: 'P' }));
  const notify = fakeNotify();
  assert.equal(await createSosDispatch({ notify, page: () => {} }).resumeStale(), 0);
  assert.equal(notify.sends.length, 0);
});

test('an alert resolved before it was resumed is not sent', async () => {
  const db = fakeDb();
  await saveAlert(buildNotifyPlan({ account, requestContacts: [], victimName: 'P' }));
  cutOff(db.rows[0]);
  db.rows[0].status = 'RESOLVED';
  const notify = fakeNotify();
  assert.equal(await createSosDispatch({ notify, page: () => {} }).resumeStale(), 0);
});

test('two servers resuming at once: only one sends', async () => {
  const db = fakeDb();
  const alert = await saveAlert(buildNotifyPlan({ account, requestContacts: [], victimName: 'P' }));
  cutOff(db.rows[0]);
  const a = fakeNotify();
  const b = fakeNotify();
  const claimedA = await SosService.claimDispatch(alert.id, DISPATCH_LEASE_MS);
  const claimedB = await SosService.claimDispatch(alert.id, DISPATCH_LEASE_MS);
  assert.ok(claimedA);
  assert.equal(claimedB, null);
  assert.equal(a.sends.length + b.sends.length, 0);
});

test('the app sending the SOS again finishes a cut-off alert at once', async () => {
  const db = fakeDb();
  const alert = await saveAlert(buildNotifyPlan({ account, requestContacts: [], victimName: 'P' }));
  cutOff(db.rows[0]);
  const notify = fakeNotify();
  assert.equal(await createSosDispatch({ notify, page: () => {} }).resume(alert.id), true);
  assert.equal(notify.sends.length, 2);
});

test('an unreadable plan is marked sent, so it is not tried forever', async () => {
  const db = fakeDb();
  await saveAlert(buildNotifyPlan({ account, requestContacts: [], victimName: 'P' }));
  cutOff(db.rows[0]);
  db.rows[0].notify_plan = 'not-a-plan';
  const notify = fakeNotify();
  assert.equal(await createSosDispatch({ notify, page: () => {} }).resumeStale(), 0);
  assert.ok(db.rows[0].dispatched_at);
});

test('no guardian and no control room: the on-call person is paged and the alert is marked sent', async () => {
  const db = fakeDb();
  const pages = [];
  const notify = fakeNotify();
  const dispatch = createSosDispatch({ notify, page: (p) => pages.push(p) });
  const plan = buildNotifyPlan({ account: null, requestContacts: [], victimName: 'Guest', controlRoomPhone: '' });
  const alert = await saveAlert(plan);

  const results = await dispatch.dispatchAlert(alert, plan);
  await tick();
  assert.equal(results[0].reason, 'CONTROL_ROOM_NOT_CONFIGURED');
  assert.equal(pages[0].key, `alert:${alert.id}`);
  assert.equal(notify.sends.length, 0);
  assert.ok(db.rows[0].dispatched_at);
});

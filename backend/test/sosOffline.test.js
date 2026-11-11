import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

// L2: an SOS while the database is down is sent anyway, journaled on disk, and saved later.

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devi-journal-'));
// Before the services load: the journal they share writes here, not into the project
process.env.SOS_JOURNAL_DIR = path.join(tmp, 'shared');

const { createJournal } = await import('../src/services/sosJournal.js');
const { createSosOffline, REPLAY_AFTER_MS } = await import('../src/services/sosOffline.service.js');
const { LiveSessions } = await import('../src/services/live-sessions.js');
const { buildNotifyPlan } = await import('../src/services/sosDispatch.service.js');

after(() => fs.rm(tmp, { recursive: true, force: true }));

const GUARDIAN = '+919876543210';
const plan = buildNotifyPlan({ account: { guardians: [{ phone: GUARDIAN }] }, requestContacts: [], victimName: 'Priya' });
let dirs = 0;
const newJournal = () => createJournal({ dir: path.join(tmp, `j${++dirs}`) });

// --- The journal file ---

test('journal records come back in order, and the file holds no phone number in plain text', async () => {
  const journal = newJournal();
  await journal.append({ type: 'alert', alertId: 'a1', plan });
  await journal.append({ type: 'sent', alertId: 'a1', kind: 'whatsapp', phone: GUARDIAN, success: true });

  const records = await journal.readAll();
  assert.deepEqual(records.map((r) => r.type), ['alert', 'sent']);
  assert.equal(records[1].phone, GUARDIAN);
  assert.equal((await fs.readFile(journal.file, 'utf8')).includes('9876543210'), false);
});

test('no journal file reads as empty', async () => {
  assert.deepEqual(await newJournal().readAll(), []);
});

test('an unreadable line is skipped, the rest is kept', async () => {
  const journal = newJournal();
  await journal.append({ type: 'alert', alertId: 'a1' });
  await fs.appendFile(journal.file, 'garbage\n{"a":"a2","d":"plain text"}\n');
  await journal.append({ type: 'alert', alertId: 'a3' });
  assert.deepEqual((await journal.readAll()).map((r) => r.alertId), ['a1', 'a3']);
});

test('keepOnly drops finished alerts and never loses an append made meanwhile', async () => {
  const journal = newJournal();
  await journal.append({ type: 'alert', alertId: 'done' });
  await journal.append({ type: 'alert', alertId: 'open' });
  const rewrite = journal.keepOnly(['open', 'new']);
  const late = journal.append({ type: 'alert', alertId: 'new' });
  await Promise.all([rewrite, late]);
  assert.deepEqual((await journal.readAll()).map((r) => r.alertId), ['open', 'new']);
});

// --- Taking an SOS without the database ---

const fakeDispatch = () => {
  const calls = [];
  return {
    calls,
    async dispatchAlert(alert, p, opts = {}) {
      const sends = [];
      for (const r of p.recipients.filter((x) => !x.blocked)) {
        for (const kind of ['ivr', 'whatsapp']) {
          if (opts.skip?.(kind, r.phone)) continue;
          sends.push({ kind, phone: r.phone });
          await opts.onSent?.(kind, r.phone, { success: kind === 'whatsapp' });
        }
      }
      calls.push({ alert, opts, sends });
      return [{ phone: GUARDIAN, role: 'guardian', sent: true, reason: null }];
    },
  };
};

const offline = ({ journal = newJournal(), store = {}, now = Date.now } = {}) => {
  const dispatch = fakeDispatch();
  const sessions = new LiveSessions();
  const pages = [];
  const service = createSosOffline({ journal, dispatch, store, sessions, page: (p) => pages.push(p), now });
  return { service, dispatch, sessions, pages, journal };
};

const accept = (service, extra = {}) =>
  service.accept({ userPhone: 'GUEST_x', idempotencyKey: 'k1', latitude: 13.08, longitude: 80.27, accuracy: 9, location: 'https://maps.google.com/?q=13,80', plan, cause: 'fetch failed', ...extra });

test('without the database the SOS is sent at once, kept in memory and journaled', async () => {
  const o = offline();
  let announced = null;
  const { session, results } = await accept(o.service, { onSession: (s) => { announced = s.id; } });

  assert.equal(announced, session.id);
  assert.equal(results[0].sent, true);
  assert.deepEqual(o.dispatch.calls[0].sends.map((s) => s.kind), ['ivr', 'whatsapp']);
  assert.equal(o.dispatch.calls[0].opts.markWhenQueued, false);
  assert.equal(session.location, 'GPS 13.08000, 80.27000');
  // The app's retry with the same key is a duplicate
  assert.equal(o.sessions.findActive({ idempotencyKey: 'k1' }, 15 * 60 * 1000).id, session.id);

  const records = await o.journal.readAll();
  assert.deepEqual(records.map((r) => r.type), ['alert', 'sent', 'sent']);
  assert.equal(records[0].alertId, session.id);
  assert.deepEqual(records[0].plan, plan);
  assert.equal(o.pages[0].key, 'database:down');
});

test('resends of the same SOS during the outage are duplicates, sent and journaled once', async () => {
  const o = offline();
  // Live: one press, the app resent twice while the failing database kept the first waiting
  const first = await accept(o.service);
  const again = await accept(o.service);
  const samePhoneNewKey = await accept(o.service, { idempotencyKey: 'k2' });

  assert.equal(again.duplicate, true);
  assert.equal(again.session.id, first.session.id);
  assert.equal(samePhoneNewKey.duplicate, true, 'same phone within 15 minutes is the same SOS');
  assert.equal(o.dispatch.calls.length, 1, 'guardians get one WhatsApp and one call, not three');
  const alerts = (await o.journal.readAll()).filter((r) => r.type === 'alert');
  assert.equal(alerts.length, 1);
});

test('if the journal cannot be written either, the SOS is still sent', async () => {
  const journal = { append: async () => { throw new Error('disk full'); } };
  const o = offline({ journal });
  const { results } = await accept(o.service);
  assert.equal(results[0].sent, true);
  assert.equal(o.dispatch.calls.length, 1);
});

// --- Saving it when the database is back ---

const fakeStore = ({ failing = false, duplicateCode = false } = {}) => {
  const saved = [];
  const resolved = [];
  const marked = [];
  return {
    saved, resolved, marked,
    async createSosAlert(args) {
      if (failing) throw Object.assign(new Error('fetch failed'), { code: undefined });
      if (duplicateCode) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      saved.push(args);
      return { id: args.alertId, latitude: args.latitude, longitude: args.longitude, location: args.location, planSaved: true };
    },
    async resolveSosAlert(id, by) { resolved.push({ id, by }); },
    async markDispatched(id) { marked.push(id); },
  };
};

// An alert accepted while the database was down, replayed `laterMs` after
const acceptThenReplay = async ({ store, laterMs = REPLAY_AFTER_MS + 1000, before: beforeReplay } = {}) => {
  let t = Date.parse('2026-11-10T10:00:00Z');
  const journal = newJournal();
  const o = offline({ journal, store, now: () => t });
  const { session } = await accept(o.service);
  t += laterMs;
  beforeReplay?.(o, session);
  o.dispatch.calls.length = 0;
  const count = await o.service.replay();
  return { o, session, count, journal };
};

test('replay saves the alert under the same id and time, and resends only what did not get through', async () => {
  const store = fakeStore();
  const { o, session, count, journal } = await acceptThenReplay({ store });

  assert.equal(count, 1);
  assert.equal(store.saved[0].alertId, session.id);
  assert.equal(store.saved[0].createdAt, session.timestamp);
  assert.equal(store.saved[0].idempotencyKey, 'k1');
  assert.deepEqual(store.saved[0].notifyPlan, plan);
  // The WhatsApp got through during the outage, the call did not
  assert.deepEqual(o.dispatch.calls[0].sends, [{ kind: 'ivr', phone: GUARDIAN }]);
  assert.deepEqual(await journal.readAll(), []);
});

test('a second replay pass sends nothing more', async () => {
  const store = fakeStore();
  const { o } = await acceptThenReplay({ store });
  assert.equal(await o.service.replay(), 0);
  assert.equal(store.saved.length, 1);
});

test('while the database still fails, replay keeps the journal and sends nothing', async () => {
  const store = fakeStore({ failing: true });
  const { o, count, journal } = await acceptThenReplay({ store });
  assert.equal(count, 0);
  assert.equal(o.dispatch.calls.length, 0);
  assert.equal((await journal.readAll()).length, 3);
});

test('an alert the database already has (an earlier replay) is not sent again', async () => {
  const store = fakeStore({ duplicateCode: true });
  const { o, count, journal } = await acceptThenReplay({ store });
  assert.equal(count, 1);
  assert.equal(o.dispatch.calls.length, 0);
  assert.deepEqual(await journal.readAll(), []);
});

test('an alert closed during the outage is saved closed and not sent again', async () => {
  const store = fakeStore();
  const { o, session } = await acceptThenReplay({
    store,
    before: (o2, s) => { s.status = 'RESOLVED'; s.resolvedBy = 'user'; },
  });
  assert.deepEqual(store.resolved, [{ id: session.id, by: 'user' }]);
  assert.deepEqual(store.marked, [session.id]);
  assert.equal(o.dispatch.calls.length, 0);
});

test('an alert older than the retry window is saved but not sent again', async () => {
  const store = fakeStore();
  const { o, session } = await acceptThenReplay({ store, laterMs: 3 * 60 * 60 * 1000 });
  assert.equal(store.saved.length, 1);
  assert.deepEqual(store.marked, [session.id]);
  assert.equal(o.dispatch.calls.length, 0);
});

test('an alert younger than a minute is left alone: its first sends may still be running', async () => {
  const store = fakeStore();
  const { count } = await acceptThenReplay({ store, laterMs: 5000 });
  assert.equal(count, 0);
  assert.equal(store.saved.length, 0);
});

// --- The SOS route with the database down ---

let supabase, realFrom, realSchema, WhatsAppService, ivrService, realWa, realCall, realPage;
const sent = [];

before(async () => {
  ({ supabase } = await import('../src/config/supabase.js'));
  ({ WhatsAppService } = await import('../src/services/whatsapp.service.js'));
  ({ ivrService } = await import('../src/services/ivr.service.js'));
  realFrom = supabase.from;
  realSchema = supabase.schema;
  realWa = WhatsAppService.sendEmergencyAlert;
  realCall = ivrService.triggerEmergencyCall;
  realPage = ivrService.triggerPageCall;
  // No real message or call may leave a test, whatever the local .env holds
  WhatsAppService.sendEmergencyAlert = async (phone) => { sent.push(['whatsapp', phone]); return { success: true, messageId: 'm' }; };
  ivrService.triggerEmergencyCall = async ({ recipientPhone }) => { sent.push(['ivr', recipientPhone]); return { success: true, provider: 'plivo', callId: 'c' }; };
  ivrService.triggerPageCall = async ({ phone }) => { sent.push(['page', phone]); return { success: true }; };
});

after(() => {
  supabase.from = realFrom;
  supabase.schema = realSchema;
  WhatsAppService.sendEmergencyAlert = realWa;
  ivrService.triggerEmergencyCall = realCall;
  ivrService.triggerPageCall = realPage;
});

afterEach(() => { sent.length = 0; });

// Every database call fails, as in a Supabase outage
const databaseDown = () => {
  const failing = () => {
    const result = { data: null, error: { message: 'fetch failed' } };
    const chain = new Proxy(() => {}, {
      get: (_t, prop) => (prop === 'then' ? (resolve) => resolve(result) : chain),
      apply: () => chain,
    });
    return chain;
  };
  supabase.from = failing;
  supabase.schema = () => ({ rpc: async () => ({ data: null, error: { message: 'fetch failed' } }) });
};

test('route: with the database down the SOS is sent, answered 201 degraded, and a retry is a duplicate', async () => {
  databaseDown();
  const { default: sosRoutes } = await import('../src/routes/sos.routes.js');
  const { sosJournal } = await import('../src/services/sosJournal.js');
  const app = express();
  app.use(express.json());
  app.use('/sos', sosRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/sos/trigger`;
  const body = JSON.stringify({ latitude: 13.08, longitude: 80.27, idempotency_key: '33333333-3333-4333-8333-333333333333', emergencyContacts: [GUARDIAN], userName: 'Priya' });

  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.degraded, true);
    assert.equal(json.data.whatsapp.sent, 1);
    assert.ok(json.data.controlToken);
    assert.ok(sent.some(([kind, phone]) => kind === 'whatsapp' && phone === GUARDIAN));
    assert.ok(sent.some(([kind, phone]) => kind === 'ivr' && phone === GUARDIAN));

    const journaled = await sosJournal.readAll();
    assert.equal(journaled[0].type, 'alert');
    assert.equal(journaled[0].alertId, json.data.id);

    const again = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const againJson = await again.json();
    assert.equal(again.status, 200);
    assert.equal(againJson.duplicate, true);
    assert.equal(againJson.data.id, json.data.id);
  } finally {
    server.close();
  }
});

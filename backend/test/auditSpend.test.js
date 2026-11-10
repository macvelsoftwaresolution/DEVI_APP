import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DailyCap, parseDailyCap, sendBlockReason, RecipientLimiter } from '../src/utils/sosRecipients.js';
import { createAudit } from '../src/services/audit.service.js';
import { createSosDispatch } from '../src/services/sosDispatch.service.js';
import { defaultChecks } from '../src/services/health.service.js';
import { listAudit } from '../src/routes/dashboard.routes.js';

// Section 10: a daily cap on paid SOS to unverified numbers, and an admin audit log.

const T = Date.parse('2026-11-10T06:00:00Z'); // 11:30 IST

// --- Spend cap ---

test('cap setting: per country, * for the rest, junk ignored', () => {
  const caps = parseDailyCap('IN:1000, *:100, AE:abc, US:0');
  assert.equal(caps.get('IN'), 1000);
  assert.equal(caps.get('*'), 100);
  assert.equal(caps.has('AE'), false);
  assert.equal(caps.get('US'), 0);
});

test('unverified sends stop at the country cap, and start again the next IST day', () => {
  const cap = new DailyCap({ caps: parseDailyCap('IN:2') });
  assert.equal(cap.tryTake('+919000000001', T), true);
  assert.equal(cap.tryTake('+919000000002', T), true);
  assert.equal(cap.tryTake('+919000000003', T), false);
  // 23:00 IST the same day: still capped. 00:30 IST the next day: open again.
  assert.equal(cap.tryTake('+919000000004', Date.parse('2026-11-10T17:30:00Z')), false);
  assert.equal(cap.tryTake('+919000000004', Date.parse('2026-11-10T19:00:00Z')), true);
});

test('each country has its own count; * covers the others; 0 means no cap', () => {
  const cap = new DailyCap({ caps: parseDailyCap('IN:1,*:1,AE:0') });
  assert.equal(cap.tryTake('+919000000001', T), true);
  assert.equal(cap.tryTake('+919000000002', T), false);
  assert.equal(cap.tryTake('+447700900123', T), true); // GB under *
  assert.equal(cap.tryTake('+447700900124', T), false);
  for (let i = 0; i < 5; i += 1) assert.equal(cap.tryTake(`+97150123456${i}`, T), true);
});

test('saved guardians are never capped, only unverified numbers', () => {
  const cap = new DailyCap({ caps: parseDailyCap('IN:1') });
  const limiter = new RecipientLimiter({ limit: 100 });
  assert.equal(sendBlockReason({ phone: '+919000000001', verified: false }, limiter, { cap }), null);
  assert.equal(sendBlockReason({ phone: '+919000000002', verified: false }, limiter, { cap }), 'DAILY_CAP');
  assert.equal(sendBlockReason({ phone: '+919000000003', verified: true }, limiter, { cap }), null);
  assert.equal(sendBlockReason({ phone: '+919000000003', verified: true }, limiter, { cap }), null);
});

test('reaching the cap pages, per country, and the send is reported as not sent', async () => {
  const pages = [];
  const dispatch = createSosDispatch({ notify: { dispatch: () => Promise.resolve({ success: true }) }, page: (p) => pages.push(p), store: { markDispatched: async () => {} } });
  const plan = { victimName: 'Guest', recipients: [{ phone: '+919000000009', role: 'guardian', blocked: 'DAILY_CAP' }] };
  const results = await dispatch.dispatchAlert({ id: 'a1', latitude: null, longitude: null, location: '' }, plan, { markWhenQueued: false });
  assert.deepEqual(results, [{ phone: '+919000000009', role: 'guardian', sent: false, reason: 'DAILY_CAP' }]);
  assert.equal(pages[0].key, 'spend-cap:IN');
});

test('health: usage near the cap warns', async () => {
  const cap = new DailyCap({ caps: parseDailyCap('IN:10') });
  const check = () => defaultChecks({ db: {}, notify: { status: () => ({}) }, offline: {}, env: {}, fetchImpl: async () => ({}), cap, now: () => T }).spend();
  assert.equal((await check()).status, 'ok');
  for (let i = 0; i < 7; i += 1) cap.tryTake(`+91900000000${i}`, T);
  assert.equal((await check()).status, 'ok');
  cap.tryTake('+919000000007', T);
  const near = await check();
  assert.equal(near.status, 'warn');
  assert.match(near.detail, /IN 8\/10/);
});

// --- Audit log ---

const fakeDb = (error = null) => {
  const rows = [];
  return { rows, from: () => ({ insert: async (row) => { rows.push(row); return { error }; } }) };
};
const quiet = { log: () => {}, warn: () => {} };

test('an audit event keeps the operator, action, target and IP, with ids only', async () => {
  const db = fakeDb();
  const lines = [];
  const a = createAudit({ db, log: { log: (l) => lines.push(l), warn: () => {} } });
  assert.equal(await a.record({ admin: { username: 'ravi', sub: '6f1c4c1e-0000-4000-8000-000000000000' }, action: 'view_incident', targetType: 'sos', targetId: 'abc', ip: '1.2.3.4' }), true);
  assert.deepEqual(db.rows[0], { admin: 'ravi', admin_id: '6f1c4c1e-0000-4000-8000-000000000000', action: 'view_incident', target_type: 'sos', target_id: 'abc', ip: '1.2.3.4', detail: null });
  assert.match(lines[0], /\[AUDIT\] ravi view_incident sos:abc from 1\.2\.3\.4/);
});

test('the shared admin and a plain name are recorded without an id', async () => {
  const db = fakeDb();
  await createAudit({ db, log: quiet }).record({ admin: 'admin', action: 'login' });
  assert.equal(db.rows[0].admin, 'admin');
  assert.equal(db.rows[0].admin_id, null);
});

test('a failed audit write never throws; before db/audit.sql it says so once', async () => {
  const warnings = [];
  const db = fakeDb({ code: '42P01', message: 'relation does not exist' });
  const a = createAudit({ db, log: { log: () => {}, warn: (w) => warnings.push(w) } });
  assert.equal(await a.record({ admin: 'x', action: 'login' }), false);
  await a.record({ admin: 'x', action: 'login' });
  assert.equal(warnings.length, 1);
  const broken = createAudit({ db: { from: () => { throw new Error('down'); } }, log: quiet });
  assert.equal(await broken.record({ admin: 'x', action: 'login' }), false);
});

test('list pages: only searches and exports are recorded, never the search text', () => {
  assert.equal(listAudit({}, 'incidents'), null);
  assert.equal(listAudit({ limit: '20' }, 'incidents'), null);
  assert.deepEqual(listAudit({ search: '98765' }, 'incidents'), { action: 'search_incidents', detail: { searched: true } });
  assert.deepEqual(listAudit({ limit: '5000' }, 'users'), { action: 'export_users', detail: { export: true, limit: 5000 } });
  assert.equal(JSON.stringify(listAudit({ search: '98765' }, 'incidents')).includes('98765'), false);
});

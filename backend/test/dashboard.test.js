import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { supabase } from '../src/config/supabase.js';
import { DashboardService, SEARCH_SCAN_ROWS, istRange } from '../src/services/dashboard.service.js';
import { encryptField as enc } from '../src/utils/encryption.js';
import { liveTrackSessions } from '../src/services/live-sessions.js';

// P3, S4: the dashboard pages in the database and decrypts only what it shows.

const realFrom = supabase.from;
const realRpc = supabase.rpc;
afterEach(() => {
  supabase.from = realFrom;
  supabase.rpc = realRpc;
  liveTrackSessions.clear();
});

// "a.is.null,b.not.in.(X,Y)" -> row predicate (the forms the dashboard uses)
const orFilter = (expr) => {
  const terms = expr.match(/[^,(]+(\([^)]*\))?/g).map((t) => t.replace(/^,/, ''));
  const preds = terms.map((t) => {
    const [col, ...rest] = t.split('.');
    const op = rest.join('.');
    if (op === 'is.null') return (r) => r[col] == null;
    if (op.startsWith('eq.')) return (r) => String(r[col]) === op.slice(3);
    if (op.startsWith('not.in.(')) {
      const vals = op.slice(8, -1).split(',');
      return (r) => r[col] != null && !vals.includes(String(r[col]));
    }
    throw new Error(`unsupported or term ${t}`);
  });
  return (r) => preds.some((p) => p(r));
};

// Supabase stand-in over in-memory tables. log records every query's table and .in() ids.
const fakeDb = (tables, { rpc } = {}) => {
  const log = [];
  supabase.from = (table) => {
    const q = { filters: [], order: null, range: null, limit: null, count: false, head: false, ins: [] };
    const run = async (single) => {
      log.push({ table, ins: q.ins });
      if (!tables[table]) return { data: null, error: { code: '42P01', message: `no ${table}` } };
      let rows = tables[table].filter((r) => q.filters.every((f) => f(r)));
      if (q.order) rows = [...rows].sort((a, b) => (a[q.order] < b[q.order] ? 1 : a[q.order] > b[q.order] ? -1 : 0));
      const count = rows.length;
      if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
      if (q.limit != null) rows = rows.slice(0, q.limit);
      if (q.head) return { data: null, count, error: null };
      return { data: single ? rows[0] || null : rows.map((r) => ({ ...r })), count: q.count ? count : null, error: null };
    };
    const api = {
      select: (_cols, opts) => { q.count = !!opts?.count; q.head = !!opts?.head; return api; },
      eq: (c, v) => { q.filters.push((r) => r[c] === v); return api; },
      in: (c, vals) => { q.ins.push(...vals); q.filters.push((r) => vals.includes(r[c])); return api; },
      or: (expr) => { q.filters.push(orFilter(expr)); return api; },
      gte: (c, v) => { q.filters.push((r) => Date.parse(r[c]) >= Date.parse(v)); return api; },
      lte: (c, v) => { q.filters.push((r) => Date.parse(r[c]) <= Date.parse(v)); return api; },
      order: (c) => { q.order = c; return api; },
      range: (a, b) => { q.range = [a, b]; return api; },
      limit: (n) => { q.limit = n; return api; },
      maybeSingle: () => run(true),
      then: (resolve, reject) => run(false).then(resolve, reject),
    };
    return api;
  };
  supabase.rpc = async (name, args) => (rpc ? rpc(name, args) : { data: null, error: { code: 'PGRST202', message: 'no function' } });
  return log;
};

const uuid = () => crypto.randomUUID();
const at = (i) => new Date(Date.parse('2026-11-10T06:00:00Z') - i * 60_000).toISOString();

const makeUser = (name, { guest = false, phone = '+919000000000' } = {}) => {
  const id = uuid();
  return { id, full_name: enc(name, 'users.full_name', id), mobile_number: enc(phone, 'users.mobile_number', id), is_guest: guest, created_at: at(0) };
};

const makeAlert = (user, i, { status = 'ACTIVE', place = `Place ${i}` } = {}) => {
  const id = uuid();
  return { id, user_id: user.id, status, created_at: at(i), location_address: enc(place, 'sos_history.location_address', id) };
};

const world = (n = 45) => {
  const priya = makeUser('Priya', { phone: '+919876543210' });
  const guest = makeUser('', { guest: true, phone: 'GUEST_abc' });
  const alerts = Array.from({ length: n }, (_, i) => makeAlert(i % 2 ? guest : priya, i, { status: i % 3 === 0 ? 'RESOLVED' : 'ACTIVE' }));
  return { priya, guest, alerts, tables: { sos_history: alerts, users: [priya, guest], guardians: [], sos_guardian_acks: [] } };
};

// --- SOS list ---

test('a page of SOS: counted and paged by the database, newest first', async () => {
  const w = world(45);
  fakeDb(w.tables);
  const r = await DashboardService.listIncidents({ page: 2, limit: 20 });
  assert.equal(r.total, 45);
  assert.equal(r.pages, 3);
  assert.equal(r.page, 2);
  assert.equal(r.items.length, 20);
  assert.equal(r.items[0].id, w.alerts[20].id);
  assert.equal(r.items[0].location, 'Place 20');
});

test('only the users on the page are read and decrypted', async () => {
  const w = world(45);
  const many = Array.from({ length: 50 }, (_, i) => makeUser(`U${i}`));
  w.tables.users.push(...many);
  const log = fakeDb(w.tables);
  await DashboardService.listIncidents({ page: 1, limit: 20 });
  const userReads = log.filter((l) => l.table === 'users');
  assert.equal(userReads.length, 1);
  assert.deepEqual(new Set(userReads[0].ins), new Set([w.priya.id, w.guest.id]));
});

test('more than 20,000 SOS: the total is right, nothing is cut off (S4)', async () => {
  const user = makeUser('A');
  const alerts = Array.from({ length: 25_000 }, (_, i) => ({ id: uuid(), user_id: user.id, status: 'ACTIVE', created_at: at(i) }));
  fakeDb({ sos_history: alerts, users: [user] });
  const r = await DashboardService.listIncidents({ page: 1250, limit: 20 });
  assert.equal(r.total, 25_000);
  assert.equal(r.pages, 1250);
  assert.equal(r.items.at(-1).id, alerts.at(-1).id);
});

test('status filter: ACTIVE takes old open statuses, RESOLVED only resolved', async () => {
  const u = makeUser('A');
  const alerts = [
    makeAlert(u, 0, { status: 'ACTIVE' }), makeAlert(u, 1, { status: 'DISPATCHED' }), makeAlert(u, 2, { status: null }),
    makeAlert(u, 3, { status: 'active' }), makeAlert(u, 4, { status: 'RESOLVED' }),
  ];
  fakeDb({ sos_history: alerts, users: [u] });
  assert.equal((await DashboardService.listIncidents({ status: 'ACTIVE' })).total, 4);
  assert.equal((await DashboardService.listIncidents({ status: 'RESOLVED' })).total, 1);
  assert.equal((await DashboardService.listIncidents({ status: 'ALL' })).total, 5);
});

test('date filter uses IST days', async () => {
  const u = makeUser('A');
  const early = { ...makeAlert(u, 0), created_at: '2026-11-09T19:00:00Z' }; // 10 Nov 00:30 IST
  const late = { ...makeAlert(u, 0), created_at: '2026-11-09T18:00:00Z' }; // 9 Nov 23:30 IST
  fakeDb({ sos_history: [early, late], users: [u] });
  const r = await DashboardService.listIncidents({ from: '2026-11-10', to: '2026-11-10' });
  assert.deepEqual(r.items.map((i) => i.id), [early.id]);
  assert.deepEqual(istRange('2026-11-10', '2026-11-10'), { gte: '2026-11-10T00:00:00+05:30', lte: '2026-11-10T23:59:59.999+05:30' });
});

test('a page past the end shows the last page', async () => {
  fakeDb(world(45).tables);
  const r = await DashboardService.listIncidents({ page: 9, limit: 20 });
  assert.equal(r.page, 3);
  assert.equal(r.items.length, 5);
});

test('the CSV export still gets up to 5000 rows in one request', async () => {
  fakeDb(world(45).tables);
  const r = await DashboardService.listIncidents({ page: 1, limit: 5000 });
  assert.equal(r.items.length, 45);
  assert.equal(r.limit, 5000);
});

test('search finds by name, phone, place or id in decrypted rows', async () => {
  const w = world(45);
  fakeDb(w.tables);
  const byName = await DashboardService.listIncidents({ search: 'priya' });
  assert.equal(byName.total, 23);
  assert.equal(byName.searchLimited, false);
  assert.equal((await DashboardService.listIncidents({ search: '9876543210' })).total, 23);
  assert.equal((await DashboardService.listIncidents({ search: 'place 17' })).total, 1);
  assert.equal((await DashboardService.listIncidents({ search: w.alerts[5].id.slice(0, 8) })).items[0].id, w.alerts[5].id);
});

test('a whole alert id is looked up directly', async () => {
  const w = world(45);
  const log = fakeDb(w.tables);
  const r = await DashboardService.listIncidents({ search: w.alerts[30].id });
  assert.deepEqual(r.items.map((i) => i.id), [w.alerts[30].id]);
  assert.equal(log.filter((l) => l.table === 'sos_history').length, 1);
});

test('search over more rows than it scans says so', async () => {
  const u = makeUser('A');
  const alerts = Array.from({ length: SEARCH_SCAN_ROWS + 10 }, (_, i) => ({ id: uuid(), user_id: u.id, status: 'ACTIVE', created_at: at(i) }));
  fakeDb({ sos_history: alerts, users: [u] });
  const r = await DashboardService.listIncidents({ search: 'zzz' });
  assert.equal(r.total, 0);
  assert.equal(r.searchLimited, true);
});

test('search gives way to other requests between batches', async () => {
  const u = makeUser('A');
  const alerts = Array.from({ length: 3000 }, (_, i) => ({ id: uuid(), user_id: u.id, status: 'ACTIVE', created_at: at(i) }));
  fakeDb({ sos_history: alerts, users: [u] });
  let ranBetween = false;
  const search = DashboardService.listIncidents({ search: 'zzz' });
  setImmediate(() => { ranBetween = true; });
  await search;
  assert.equal(ranBetween, true);
});

// --- One SOS ---

test('one SOS with its guardians and who pressed 1', async () => {
  const w = world(3);
  const g1 = { id: uuid(), user_id: w.priya.id, name: enc('Ravi', 'guardians.name', w.priya.id), mobile_number: enc('+919000000001', 'guardians.mobile_number', w.priya.id), created_at: at(0) };
  const ackId = uuid();
  const otherId = uuid();
  const alert = w.alerts[0];
  w.tables.guardians = [g1];
  w.tables.sos_guardian_acks = [
    { id: ackId, alert_id: alert.id, phone: enc('+919000000001', 'sos_guardian_acks.phone', ackId), acknowledged_at: at(0) },
    { id: otherId, alert_id: alert.id, phone: enc('+919000000099', 'sos_guardian_acks.phone', otherId), acknowledged_at: at(0) },
  ];
  fakeDb(w.tables);
  const inc = await DashboardService.getIncident(alert.id);
  assert.equal(inc.user.name, 'Priya');
  assert.equal(inc.guardians[0].name, 'Ravi');
  assert.ok(inc.guardians[0].ackTime);
  assert.deepEqual(inc.otherAcks.map((a) => a.phone), ['+919000000099']);
});

test('an unknown or malformed SOS id is not found', async () => {
  fakeDb(world(3).tables);
  assert.equal(await DashboardService.getIncident(uuid()), null);
  assert.equal(await DashboardService.getIncident('1 or 1=1'), null);
});

test('before db/guardian-acks.sql the SOS page still loads', async () => {
  const w = world(1);
  delete w.tables.sos_guardian_acks;
  fakeDb(w.tables);
  const inc = await DashboardService.getIncident(w.alerts[0].id);
  assert.deepEqual(inc.otherAcks, []);
});

test('the live session status and WhatsApp result are shown', async () => {
  const w = world(1);
  fakeDb(w.tables);
  liveTrackSessions.set(w.alerts[0].id, { id: w.alerts[0].id, status: 'ACTIVE', whatsapp: { sent: 1 } });
  const [item] = (await DashboardService.listIncidents({})).items;
  assert.deepEqual(item.whatsapp, { sent: 1 });
});

// --- Stats ---

test('stats come from dashboard_stats, plus the 6 newest SOS', async () => {
  const w = world(10);
  const numbers = { sos: { total: 10, today: 2, active: 6, resolved: 4 }, users: { total: 2, registered: 1, guests: 1, newToday: 0 }, guardians: { total: 0 }, daily: [] };
  let asked;
  fakeDb(w.tables, { rpc: (name, args) => { asked = { name, args }; return { data: numbers, error: null }; } });
  const s = await DashboardService.getStats({ days: 30 });
  assert.deepEqual(asked, { name: 'dashboard_stats', args: { p_days: 30 } });
  assert.deepEqual(s.sos, numbers.sos);
  assert.equal(s.recent.length, 6);
  assert.equal(s.recent[0].id, w.alerts[0].id);
});

test('without db/dashboard.sql the stats are counted with separate queries', async () => {
  const w = world(9); // 3 resolved (i = 0, 3, 6)
  w.tables.guardians = [{ id: uuid(), user_id: w.priya.id }];
  fakeDb(w.tables);
  const s = await DashboardService.getStats({ days: 7 });
  assert.deepEqual(s.sos, { total: 9, today: s.sos.today, active: 6, resolved: 3 });
  assert.deepEqual(s.users, { total: 2, registered: 1, guests: 1, newToday: s.users.newToday });
  assert.equal(s.guardians.total, 1);
  assert.equal(s.daily.length, 7);
  assert.equal(s.recent.length, 6);
});

// --- Users ---

test('a page of users with their guardian and SOS counts', async () => {
  const w = world(5); // priya: alerts 0, 2, 4; guest: 1, 3
  w.tables.guardians = [{ id: uuid(), user_id: w.priya.id }, { id: uuid(), user_id: w.priya.id }];
  fakeDb(w.tables);
  const r = await DashboardService.listUsers({});
  const priya = r.items.find((u) => u.id === w.priya.id);
  assert.equal(r.total, 2);
  assert.equal(priya.name, 'Priya');
  assert.equal(priya.guardiansCount, 2);
  assert.equal(priya.sosCount, 3);
  assert.ok(priya.lastSos);
});

test('users: type filter and search', async () => {
  const w = world(2);
  fakeDb(w.tables);
  assert.deepEqual((await DashboardService.listUsers({ type: 'GUEST' })).items.map((u) => u.id), [w.guest.id]);
  assert.deepEqual((await DashboardService.listUsers({ type: 'REGISTERED' })).items.map((u) => u.id), [w.priya.id]);
  assert.deepEqual((await DashboardService.listUsers({ search: '98765' })).items.map((u) => u.id), [w.priya.id]);
});

test('one user with guardians and SOS history', async () => {
  const w = world(5);
  fakeDb(w.tables);
  const u = await DashboardService.getUser(w.priya.id);
  assert.equal(u.name, 'Priya');
  assert.equal(u.sos.length, 3);
  assert.equal(await DashboardService.getUser('nope'), null);
});

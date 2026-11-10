import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveSessions } from '../src/services/live-sessions.js';

const MIN = 60 * 1000;
const WINDOW = 15 * MIN;

const clock = (start = Date.parse('2026-11-10T10:00:00Z')) => {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
};

const session = (id, extra = {}) => ({
  id,
  status: 'ACTIVE',
  userPhone: '+919876543210',
  idempotencyKey: `key-${id}`,
  timestamp: new Date(Date.parse('2026-11-10T10:00:00Z')).toISOString(),
  ...extra,
});

test('finds an active SOS by idempotency key', () => {
  const s = new LiveSessions();
  s.set('a1', session('a1'));
  assert.equal(s.findActive({ idempotencyKey: 'key-a1' }, WINDOW).id, 'a1');
  assert.equal(s.findActive({ idempotencyKey: 'other' }, WINDOW), null);
});

test('finds an active SOS of the same phone only within the window', () => {
  const c = clock();
  const s = new LiveSessions({ now: c.now });
  s.set('a1', session('a1'));
  c.advance(14 * MIN);
  assert.equal(s.findActive({ userPhone: '+919876543210' }, WINDOW).id, 'a1');
  c.advance(2 * MIN);
  assert.equal(s.findActive({ userPhone: '+919876543210' }, WINDOW), null);
});

test('a resolved SOS is not found, so a new press sends again', () => {
  const s = new LiveSessions();
  const a = session('a1');
  s.set('a1', a);
  a.status = 'RESOLVED';
  assert.equal(s.findActive({ idempotencyKey: 'key-a1', userPhone: a.userPhone }, WINDOW), null);
});

test('no key and no phone finds nothing', () => {
  const s = new LiveSessions();
  s.set('a1', session('a1'));
  assert.equal(s.findActive({}, WINDOW), null);
});

test('setting a session again moves it to its new phone in the index', () => {
  const s = new LiveSessions({ now: clock().now });
  const a = session('a1', { userPhone: 'GUEST_abc' });
  s.set('a1', a);
  a.userPhone = '+919000000001';
  s.set('a1', a);
  assert.equal(s.findActive({ userPhone: '+919000000001' }, WINDOW).id, 'a1');
  assert.equal(s.findActive({ userPhone: 'GUEST_abc' }, WINDOW), null);
});

test('a session changed in place without set() is not found under its old phone', () => {
  const s = new LiveSessions();
  const a = session('a1', { userPhone: 'GUEST_abc' });
  s.set('a1', a);
  a.userPhone = '+919000000001';
  assert.equal(s.findActive({ userPhone: 'GUEST_abc' }, WINDOW), null);
});

test('sessions untouched for the TTL are dropped on the next prune', () => {
  const c = clock();
  const s = new LiveSessions({ now: c.now, ttlMs: 24 * 60 * MIN });
  s.set('old', session('old', { lastUpdated: new Date(c.now()).toISOString() }));
  c.advance(25 * 60 * MIN);
  s.set('new', session('new', { lastUpdated: new Date(c.now()).toISOString() }));
  assert.equal(s.has('old'), false);
  assert.equal(s.has('new'), true);
  assert.equal(s.findActive({ idempotencyKey: 'key-old' }, WINDOW), null);
});

test('a recent lastUpdated keeps an old session', () => {
  const c = clock();
  const s = new LiveSessions({ now: c.now, ttlMs: 24 * 60 * MIN });
  const a = session('a1');
  s.set('a1', a);
  c.advance(23 * 60 * MIN);
  a.lastUpdated = new Date(c.now()).toISOString();
  c.advance(2 * 60 * MIN);
  s.prune();
  assert.equal(s.has('a1'), true);
});

test('over the limit, the oldest sessions are dropped first', () => {
  const s = new LiveSessions({ maxSessions: 3 });
  for (const id of ['a', 'b', 'c', 'd']) s.set(id, session(id));
  assert.deepEqual([...s.keys()], ['b', 'c', 'd']);
  assert.equal(s.findActive({ idempotencyKey: 'key-a' }, WINDOW), null);
});

test('delete and clear also empty the index', () => {
  const s = new LiveSessions();
  s.set('a1', session('a1'));
  s.delete('a1');
  assert.equal(s.findActive({ idempotencyKey: 'key-a1' }, WINDOW), null);
  s.set('a2', session('a2'));
  s.clear();
  assert.equal(s.size, 0);
  assert.equal(s.findActive({ idempotencyKey: 'key-a2' }, WINDOW), null);
});

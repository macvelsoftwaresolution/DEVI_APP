import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountDeletion, blockingAlert, SEND_WINDOW_MS, SETTLE_MS } from '../src/services/accountDeletion.service.js';
import { LiveSessions } from '../src/services/live-sessions.js';

const NOW = Date.parse('2026-11-11T10:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;

// Stand-in for the users and sos_history calls the service makes
const fakeDb = ({ user = { id: 'u1' }, alerts = [], deleteError = null } = {}) => {
  const calls = [];
  return {
    calls,
    from: (table) => ({
      select: () => ({
        eq: (col, val) => {
          if (table === 'users') return { maybeSingle: async () => ({ data: user, error: null }) };
          calls.push(['alerts', val]);
          return Promise.resolve({ data: alerts, error: null });
        },
      }),
      delete: () => ({ eq: async (col, val) => { calls.push(['delete', table, val]); return { error: deleteError }; } }),
    }),
  };
};

const make = (db, extra = {}) => {
  const destroyed = [];
  const sessions = new LiveSessions();
  const service = createAccountDeletion({
    db,
    sessions,
    now: () => NOW,
    destroy: async (ref) => { destroyed.push(ref.publicId); return { result: 'ok' }; },
    ...extra,
  });
  return { service, destroyed, sessions };
};

test('blockingAlert: an alert still sending blocks, an old or settled one does not', () => {
  assert.ok(blockingAlert([{ status: 'ACTIVE', created_at: ago(5 * MIN) }], NOW));
  assert.ok(blockingAlert([{ status: null, created_at: ago(30 * MIN) }], NOW), 'no status counts as active');
  assert.ok(blockingAlert([{ status: 'RESOLVED', created_at: ago(20 * MIN), resolved_at: ago(SETTLE_MS - MIN) }], NOW));
  assert.ok(blockingAlert([{ status: 'RESOLVED', created_at: ago(20 * MIN), resolved_at: null }], NOW), 'resolved without a time waits');

  assert.equal(blockingAlert([{ status: 'RESOLVED', created_at: ago(60 * MIN), resolved_at: ago(SETTLE_MS + MIN) }], NOW), null);
  assert.equal(blockingAlert([{ status: 'ACTIVE', created_at: ago(SEND_WINDOW_MS + MIN) }], NOW), null, 'retries are over');
  assert.equal(blockingAlert([], NOW), null);
});

test('deletes the user row (guardians and alerts cascade), evidence first, and drops live sessions', async () => {
  const db = fakeDb({
    alerts: [
      { id: 'a1', status: 'RESOLVED', created_at: ago(3 * 24 * 60 * MIN), resolved_at: ago(3 * 24 * 60 * MIN), evidence_url: 'cld:authenticated/video/devi_emergency_evidence/one.mp4' },
      { id: 'a2', status: 'ACTIVE', created_at: ago(5 * 24 * 60 * MIN), evidence_url: null, audio_url: null },
    ],
  });
  const { service, destroyed, sessions } = make(db);
  sessions.set('a1', { status: 'RESOLVED', userPhone: '+919876543210' });

  assert.deepEqual(await service.deleteAccount('u1'), { ok: true });
  assert.deepEqual(destroyed, ['devi_emergency_evidence/one']);
  assert.deepEqual(db.calls.at(-1), ['delete', 'users', 'u1']);
  assert.equal(sessions.has('a1'), false);
});

test('an SOS still sending keeps the account', async () => {
  const db = fakeDb({ alerts: [{ id: 'a1', status: 'ACTIVE', created_at: ago(10 * MIN) }] });
  const { service } = make(db);
  assert.deepEqual(await service.deleteAccount('u1'), { ok: false, reason: 'SOS_IN_PROGRESS' });
  assert.ok(!db.calls.some(([op]) => op === 'delete'));
});

test('evidence that cannot be removed keeps the account', async () => {
  const db = fakeDb({ alerts: [{ id: 'a1', status: 'RESOLVED', created_at: ago(3 * 24 * 60 * MIN), resolved_at: ago(3 * 24 * 60 * MIN), evidence_url: 'cld:authenticated/video/devi_emergency_evidence/one.mp4' }] });
  const { service } = make(db, { destroy: async () => { throw new Error('cloudinary down'); } });
  assert.deepEqual(await service.deleteAccount('u1'), { ok: false, reason: 'EVIDENCE' });
  assert.ok(!db.calls.some(([op]) => op === 'delete'));
});

test('an unknown account is NOT_FOUND, a database error throws', async () => {
  assert.deepEqual(await make(fakeDb({ user: null })).service.deleteAccount('u1'), { ok: false, reason: 'NOT_FOUND' });
  await assert.rejects(make(fakeDb({ deleteError: { message: 'boom', code: '500' } })).service.deleteAccount('u1'), /boom/);
});

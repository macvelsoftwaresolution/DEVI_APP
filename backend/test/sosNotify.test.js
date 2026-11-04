import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSosNotify, MAX_ATTEMPTS } from '../src/services/sosNotify.service.js';

// In-memory stand-in for Supabase Queues: jobs hidden until read, read_ct counts reads
const fakeQueue = () => {
  const jobs = new Map();
  let next = 1;
  return {
    jobs,
    archived: [],
    async send(_q, message) {
      jobs.set(next, { msg_id: next, read_ct: 0, message });
      return next++;
    },
    async read() {
      return [...jobs.values()].map((j) => ({ ...j, read_ct: ++j.read_ct }));
    },
    async delete(_q, id) {
      return jobs.delete(id);
    },
    async archive(_q, id) {
      this.archived.push(id);
      return jobs.delete(id);
    },
  };
};

const job = { alertId: 'a1', phone: '9876543210', victimName: 'Priya', location: { latitude: 13, longitude: 80, location: 'Chennai' } };

test('sent at once: job removed, nothing left to retry', async () => {
  const queue = fakeQueue();
  const notify = createSosNotify({ queue, senders: { whatsapp: async () => ({ success: true }) } });
  const out = await notify.dispatch('whatsapp', job);
  assert.equal(out.success, true);
  assert.equal(queue.jobs.size, 0);
});

test('job in the queue is encrypted: no phone, name or place in plain text', async () => {
  const queue = fakeQueue();
  const notify = createSosNotify({ queue, senders: { whatsapp: async () => ({ success: false, reason: 'TIMEOUT' }) } });
  await notify.dispatch('whatsapp', job);
  const stored = JSON.stringify([...queue.jobs.values()][0].message);
  assert.ok(!stored.includes('9876543210') && !stored.includes('Priya') && !stored.includes('Chennai'));
});

test('failure that can pass is retried by the worker and removed once it gets through', async () => {
  const queue = fakeQueue();
  const results = [{ success: false, reason: 'TIMEOUT' }, { success: true }];
  const sent = [];
  const notify = createSosNotify({
    queue,
    senders: { whatsapp: async (j) => { sent.push(j); return results.shift(); } },
    getAlertStatus: async () => 'ACTIVE',
  });
  await notify.dispatch('whatsapp', job);
  assert.equal(queue.jobs.size, 1);
  await notify.processBatch();
  assert.equal(queue.jobs.size, 0);
  assert.deepEqual(sent[1], job);
});

test('permanent failure (not on WhatsApp) is not retried', async () => {
  const queue = fakeQueue();
  const notify = createSosNotify({ queue, senders: { whatsapp: async () => ({ success: false, reason: 'NOT_ON_WHATSAPP' }) } });
  await notify.dispatch('whatsapp', job);
  assert.equal(queue.jobs.size, 0);
});

test('alert marked safe: pending retry dropped without sending', async () => {
  const queue = fakeQueue();
  let calls = 0;
  const notify = createSosNotify({
    queue,
    senders: { ivr: async () => { calls++; return { success: false, error: 'provider down' }; } },
    getAlertStatus: async () => 'RESOLVED',
  });
  await notify.dispatch('ivr', job);
  await notify.processBatch();
  assert.equal(calls, 1);
  assert.equal(queue.jobs.size, 0);
});

test(`gives up after ${MAX_ATTEMPTS} retries and archives the job`, async () => {
  const queue = fakeQueue();
  let calls = 0;
  const notify = createSosNotify({
    queue,
    senders: { ivr: async () => { calls++; return { success: false, error: 'provider down' }; } },
    getAlertStatus: async () => 'ACTIVE',
  });
  await notify.dispatch('ivr', job);
  for (let i = 0; i <= MAX_ATTEMPTS; i++) await notify.processBatch();
  assert.equal(calls, 1 + MAX_ATTEMPTS);
  assert.equal(queue.jobs.size, 0);
  assert.equal(queue.archived.length, 1);
});

test('queue down: the alert is still sent once', async () => {
  const queue = { ...fakeQueue(), send: async () => { throw new Error('queue down'); } };
  const notify = createSosNotify({ queue, senders: { whatsapp: async () => ({ success: true }) } });
  const out = await notify.dispatch('whatsapp', job);
  assert.equal(out.success, true);
});

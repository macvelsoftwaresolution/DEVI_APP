import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSosNotify, MAX_ATTEMPTS, RETRY_GAPS_SECONDS, retryGapSeconds } from '../src/services/sosNotify.service.js';

// In-memory stand-in for Supabase Queues: jobs hidden until read, read_ct counts reads
const fakeQueue = () => {
  const jobs = new Map();
  let next = 1;
  return {
    jobs,
    archived: [],
    sentDelays: [],
    async send(_q, message, delay) {
      this.sentDelays.push(delay);
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

test('each failed retry waits longer, up to the last gap', () => {
  assert.equal(retryGapSeconds(1), 60);
  assert.equal(retryGapSeconds(2), 120);
  assert.equal(retryGapSeconds(3), 300);
  assert.equal(retryGapSeconds(4), 600);
  assert.equal(retryGapSeconds(MAX_ATTEMPTS), 600);
});

test('all retries cover about 2 hours, long enough to outlast a provider outage', () => {
  let seconds = RETRY_GAPS_SECONDS.at(0);
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) seconds += retryGapSeconds(attempt);
  assert.ok(seconds >= 110 * 60 && seconds <= 130 * 60, `${seconds}s`);
});

test('a failed retry queues a later job with its count, then removes the old one', async () => {
  const queue = fakeQueue();
  const notify = createSosNotify({
    queue,
    random: () => 0.5, // no variation
    senders: { ivr: async () => ({ success: false, error: 'provider down' }) },
    getAlertStatus: async () => 'ACTIVE',
  });
  await notify.dispatch('ivr', job);
  await notify.processBatch();
  await notify.processBatch();

  assert.deepEqual(queue.sentDelays, [60, 60, 120]);
  assert.equal(queue.jobs.size, 1);
  assert.equal([...queue.jobs.values()][0].message.attempt, 3);
});

test('retry gaps vary so retries do not all land at once', async () => {
  const delayWith = async (random) => {
    const queue = fakeQueue();
    const notify = createSosNotify({ queue, random, senders: { ivr: async () => ({ success: false, error: 'down' }) } });
    await notify.dispatch('ivr', job);
    return queue.sentDelays.at(0);
  };
  assert.equal(await delayWith(() => 0), 48);
  assert.equal(await delayWith(() => 0.99), 72);
});

test('next retry cannot be queued: the old job stays, so nothing is lost', async () => {
  const queue = fakeQueue();
  const notify = createSosNotify({
    queue,
    senders: { ivr: async () => ({ success: false, error: 'provider down' }) },
    getAlertStatus: async () => 'ACTIVE',
  });
  await notify.dispatch('ivr', job);
  queue.send = async () => { throw new Error('queue down'); };
  await notify.processBatch();
  assert.equal(queue.jobs.size, 1);
  assert.equal(queue.archived.length, 0);
});

test('a job queued by older code, with no count, continues from its read count', async () => {
  const queue = fakeQueue();
  const notify = createSosNotify({
    queue,
    senders: { ivr: async () => ({ success: false, error: 'provider down' }) },
    getAlertStatus: async () => 'ACTIVE',
  });
  await notify.dispatch('ivr', job);
  [...queue.jobs.values()][0].read_ct = 5;
  await notify.processBatch();
  assert.equal([...queue.jobs.values()][0].message.attempt, 7);
});

test('queue down: the alert is still sent once', async () => {
  const queue = { ...fakeQueue(), send: async () => { throw new Error('queue down'); } };
  const notify = createSosNotify({ queue, senders: { whatsapp: async () => ({ success: true }) } });
  const out = await notify.dispatch('whatsapp', job);
  assert.equal(out.success, true);
});

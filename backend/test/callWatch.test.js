import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSosNotify, CALL_WATCH_SECONDS, MAX_REDIALS } from '../src/services/sosNotify.service.js';
import { Encryption } from '../src/utils/encryption.js';

// L5: a call must still be retried when its status webhook never reaches this server, for example
// after a restart forgot the call.

const job = { alertId: 'a1', phone: '+919876543210', victimName: 'Priya', location: {} };

// A queue in memory. Every send, delete and archive is logged in order.
const fakeQueue = ({ failSends = false } = {}) => {
  const jobs = new Map();
  const log = [];
  let next = 1;
  return {
    jobs,
    log,
    failSends,
    async send(_q, message, delay) {
      if (this.failSends) throw new Error('queue down');
      const id = next++;
      jobs.set(id, { msg_id: id, read_ct: 0, message, delay });
      log.push(['send', id]);
      return id;
    },
    async read() {
      return [...jobs.values()].map((j) => ({ ...j, read_ct: j.read_ct + 1 }));
    },
    async delete(_q, id) { jobs.delete(id); log.push(['delete', id]); },
    async archive(_q, id) { jobs.delete(id); log.push(['archive', id]); },
  };
};

const plain = (entry) => JSON.parse(Encryption.decrypt(entry.message.data, 'pgmq.sos_notify', 'a1'));
const watchJobs = (queue) => [...queue.jobs.values()].filter((j) => j.message.watch);
const callJobs = (queue) => [...queue.jobs.values()].filter((j) => !j.message.watch);

const make = (queue, { status = 'ACTIVE', acked = false, ivr } = {}) =>
  createSosNotify({
    queue,
    random: () => 0.5,
    senders: { ivr: ivr || (async () => ({ success: true, provider: 'plivo', callId: 'call-1' })) },
    getAlertStatus: async () => status,
    hasAck: async () => acked,
  });

test('an accepted call leaves a watch job, saved before the call job is deleted', async () => {
  const queue = fakeQueue();
  await make(queue).dispatch('ivr', job);

  const [watch] = watchJobs(queue);
  assert.equal(queue.jobs.size, 1);
  assert.equal(watch.delay, CALL_WATCH_SECONDS);
  assert.equal(watch.message.attempt, 0);
  assert.equal(plain(watch).callId, 'call-1');
  assert.deepEqual(queue.log, [['send', 1], ['send', 2], ['delete', 1]]);
});

test('the status webhook deletes the watch job', async () => {
  const queue = fakeQueue();
  const notify = make(queue, { acked: true });
  await notify.dispatch('ivr', job);

  assert.equal(await notify.callEnded({ callId: 'call-1', status: 'completed', answered: true }), 'acknowledged');
  assert.equal(queue.jobs.size, 0);
});

test('a failed call: the retry is queued before the watch job is deleted', async () => {
  const queue = fakeQueue();
  const notify = make(queue);
  await notify.dispatch('ivr', job);
  queue.log.length = 0;

  assert.equal(await notify.callEnded({ callId: 'call-1', status: 'failed', answered: false }), 'retry');
  assert.equal(watchJobs(queue).length, 0);
  assert.equal(callJobs(queue).length, 1);
  assert.deepEqual(queue.log, [['send', 3], ['delete', 2]]);
});

test('after a restart, an unanswered call with no press 1 is redialled by its watch job', async () => {
  const queue = fakeQueue();
  await make(queue).dispatch('ivr', job);

  const restarted = make(queue);
  assert.equal(await restarted.callEnded({ callId: 'call-1', status: 'no-answer', answered: false }), 'unknown');
  await restarted.processBatch();

  assert.equal(watchJobs(queue).length, 0);
  const [retry] = callJobs(queue);
  assert.equal(retry.message.attempt, 1);
  assert.equal(plain(retry).redials, 1);
  assert.equal(plain(retry).callId, undefined);
});

test('a watch job for a guardian who pressed 1 is deleted with no redial', async () => {
  const queue = fakeQueue();
  await make(queue).dispatch('ivr', job);

  await make(queue, { acked: true }).processBatch();
  assert.equal(queue.jobs.size, 0);
});

test('when the press 1 record cannot be read, the guardian is redialled', async () => {
  const queue = fakeQueue();
  await make(queue).dispatch('ivr', job);

  await make(queue, { acked: null }).processBatch();
  assert.equal(callJobs(queue).length, 1);
});

test('a watch job for an alert already resolved is deleted with no redial', async () => {
  const queue = fakeQueue();
  await make(queue).dispatch('ivr', job);

  await make(queue, { status: 'RESOLVED' }).processBatch();
  assert.equal(queue.jobs.size, 0);
});

test(`a watch job counts as a redial, so it stops after ${MAX_REDIALS}`, async () => {
  const queue = fakeQueue();
  await make(queue).dispatch('ivr', { ...job, redials: MAX_REDIALS });

  await make(queue).processBatch();
  assert.equal(queue.jobs.size, 0);
});

test('if the redial cannot be queued, the watch job stays and comes back', async () => {
  const queue = fakeQueue();
  await make(queue).dispatch('ivr', job);

  queue.failSends = true;
  await make(queue).processBatch();
  assert.equal(watchJobs(queue).length, 1);
});

test('a call that got through on a retry is watched too', async () => {
  const queue = fakeQueue();
  let tries = 0;
  const ivr = async () => (++tries === 1 ? { success: false, error: 'provider down' } : { success: true, provider: 'twilio', callId: 'call-2' });
  const notify = make(queue, { ivr });
  await notify.dispatch('ivr', job);
  assert.equal(callJobs(queue).length, 1);

  await notify.processBatch();
  const [watch] = watchJobs(queue);
  assert.equal(queue.jobs.size, 1);
  assert.equal(plain(watch).callId, 'call-2');
  assert.equal(watch.message.attempt, 1);
});

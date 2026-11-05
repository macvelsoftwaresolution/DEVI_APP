import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShutdown } from '../src/utils/shutdown.js';
import { createSosNotify, MAX_ATTEMPTS } from '../src/services/sosNotify.service.js';
import { Encryption } from '../src/utils/encryption.js';

const fakeParts = (overrides = {}) => {
  const order = [];
  return {
    order,
    server: { close: (done) => { order.push('server'); done(); } },
    socket: { close: () => order.push('socket') },
    notify: { stop: async () => { order.push('notify'); } },
    exit: (code) => order.push(`exit ${code}`),
    ...overrides,
  };
};

test('shutdown closes connections, waits for sends, then exits cleanly', async () => {
  const parts = fakeParts();
  await createShutdown(parts)('SIGINT');
  assert.deepEqual(parts.order, ['socket', 'server', 'notify', 'exit 0']);
});

test('a second signal does not run shutdown twice', async () => {
  const parts = fakeParts();
  const shutdown = createShutdown(parts);
  await Promise.all([shutdown('SIGINT'), shutdown('SIGTERM')]);
  assert.equal(parts.order.filter((step) => step.startsWith('exit')).length, 1);
});

test('a send that never finishes cannot hold the shutdown past its wait', async () => {
  const parts = fakeParts({ notify: { stop: () => new Promise(() => {}) } });
  createShutdown({ ...parts, waitMs: 10 })('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(parts.order, ['socket', 'server', 'exit 1']);
});

test('stop waits for a send still running', async () => {
  let finish;
  const notify = createSosNotify({
    queue: { send: async () => 1, delete: async () => {} },
    senders: { ivr: () => new Promise((resolve) => { finish = resolve; }) },
  });
  notify.dispatch('ivr', { alertId: 'a1', phone: '+919876543210' });

  let stopped = false;
  const stopping = notify.stop().then(() => { stopped = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopped, false);

  finish({ success: true });
  await stopping;
  assert.equal(stopped, true);
});

const queuedJob = (id, readCount = 1) => ({
  msg_id: id,
  read_ct: readCount,
  message: {
    kind: 'ivr',
    alertId: 'a1',
    data: Encryption.encrypt(JSON.stringify({ alertId: 'a1', phone: '+919876543210' }), 'pgmq.sos_notify', 'a1'),
  },
});

test('one job failing unexpectedly does not stop the others or the pass', async () => {
  const deleted = [];
  let reads = 0;
  const notify = createSosNotify({
    queue: {
      read: async () => [queuedJob(1), queuedJob(2)],
      delete: async (_q, id) => deleted.push(id),
    },
    senders: { ivr: async () => ({ success: true }) },
    getAlertStatus: async () => {
      reads += 1;
      if (reads === 1) throw new Error('boom');
      return 'ACTIVE';
    },
  });

  await notify.processBatch();
  assert.deepEqual(deleted, [2]); // job 1 stays and comes back
});

test('a job that always fails unexpectedly is archived in the end, not read forever', async () => {
  const archived = [];
  const notify = createSosNotify({
    queue: {
      read: async () => [queuedJob(1, MAX_ATTEMPTS + 1)],
      archive: async (_q, id) => archived.push(id),
    },
    senders: { ivr: async () => ({ success: true }) },
    getAlertStatus: async () => { throw new Error('boom'); },
  });

  // attempt comes from the read count, so this one gives up before the status check
  await notify.processBatch();
  assert.deepEqual(archived, [1]);
});

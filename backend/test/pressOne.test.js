import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSosNotify, MAX_REDIALS } from '../src/services/sosNotify.service.js';
import { Encryption } from '../src/utils/encryption.js';

// Press 1 stops calls to that guardian only. Every other guardian keeps being called, and a call
// picked up without press 1 counts as not confirmed.

const ravi = { alertId: 'a1', phone: '+919000000001', victimName: 'Priya', location: {} };
const meena = { alertId: 'a1', phone: '+919000000002', victimName: 'Priya', location: {} };

// A queue in memory, plus which guardians pressed 1 (by phone)
const world = () => {
  const jobs = new Map();
  const pressed = new Set();
  let next = 1;
  let call = 0;
  const queue = {
    async send(_q, message, delay) { const id = next++; jobs.set(id, { msg_id: id, read_ct: 0, message, delay }); return id; },
    async read() { return [...jobs.values()].map((j) => ({ ...j, read_ct: j.read_ct + 1 })); },
    async delete(_q, id) { jobs.delete(id); },
    async archive(_q, id) { jobs.delete(id); },
  };
  const placed = [];
  const notify = createSosNotify({
    queue,
    random: () => 0.5,
    senders: { ivr: async (job) => { placed.push(job.phone); call += 1; return { success: true, provider: 'plivo', callId: `call-${call}` }; } },
    getAlertStatus: async () => 'ACTIVE',
    hasAck: async (_alertId, phone) => pressed.has(phone),
    page: () => {},
  });
  const plain = (j) => JSON.parse(Encryption.decrypt(j.message.data, 'pgmq.sos_notify', 'a1'));
  const callRetries = () => [...jobs.values()].filter((j) => !j.message.watch).map(plain);
  return { notify, jobs, pressed, placed, callRetries };
};

test('both guardians pick up, only one presses 1: only the other is called again', async () => {
  const w = world();
  await w.notify.dispatch('ivr', ravi); // call-1
  await w.notify.dispatch('ivr', meena); // call-2
  w.pressed.add(ravi.phone);

  assert.equal(await w.notify.callEnded({ callId: 'call-1', status: 'completed', answered: true }), 'acknowledged');
  assert.equal(await w.notify.callEnded({ callId: 'call-2', status: 'completed', answered: true }), 'retry');

  const retries = w.callRetries();
  assert.deepEqual(retries.map((j) => j.phone), [meena.phone]);
  assert.equal(retries[0].redials, 1);
  assert.equal(w.jobs.size, 1); // both watch jobs are gone, one retry left
});

test('one presses 1, the other does not pick up: only the other is called again', async () => {
  const w = world();
  await w.notify.dispatch('ivr', ravi);
  await w.notify.dispatch('ivr', meena);
  w.pressed.add(ravi.phone);

  await w.notify.callEnded({ callId: 'call-1', status: 'completed', answered: true });
  assert.equal(await w.notify.callEnded({ callId: 'call-2', status: 'no-answer', answered: false }), 'retry');
  assert.deepEqual(w.callRetries().map((j) => j.phone), [meena.phone]);
});

test('a guardian who presses 1 is not called by a retry queued earlier', async () => {
  const w = world();
  const data = Encryption.encrypt(JSON.stringify(ravi), 'pgmq.sos_notify', 'a1');
  await w.notify.processBatch(); // nothing yet
  w.jobs.set(50, { msg_id: 50, read_ct: 0, message: { kind: 'ivr', alertId: 'a1', data, attempt: 1 } });
  w.pressed.add(ravi.phone);

  await w.notify.processBatch();
  assert.equal(w.placed.length, 0);
  assert.equal(w.jobs.size, 0);
});

test('a retry for a guardian who has not pressed 1 still calls', async () => {
  const w = world();
  const data = Encryption.encrypt(JSON.stringify(meena), 'pgmq.sos_notify', 'a1');
  w.jobs.set(50, { msg_id: 50, read_ct: 0, message: { kind: 'ivr', alertId: 'a1', data, attempt: 1 } });
  w.pressed.add(ravi.phone);

  await w.notify.processBatch();
  assert.deepEqual(w.placed, [meena.phone]);
});

test(`picked up without press 1 counts as a redial, so it stops after ${MAX_REDIALS}`, async () => {
  const w = world();
  await w.notify.dispatch('ivr', { ...meena, redials: MAX_REDIALS });
  assert.equal(await w.notify.callEnded({ callId: 'call-1', status: 'completed', answered: true }), 'gave-up');
});

test('when the press 1 record cannot be read, an answered call is called again', async () => {
  const w = world();
  const notify = createSosNotify({
    queue: { send: async () => 1, delete: async () => {} },
    random: () => 0.5,
    senders: { ivr: async () => ({ success: true, provider: 'plivo', callId: 'c' }) },
    getAlertStatus: async () => 'ACTIVE',
    hasAck: async () => null,
    page: () => {},
  });
  await notify.dispatch('ivr', ravi);
  assert.equal(await notify.callEnded({ callId: 'c', status: 'completed', answered: true }), 'retry');
  assert.equal(w.placed.length, 0);
});

test('press 1 does not stop WhatsApp retries to that guardian, which carry the map link', async () => {
  const w = world();
  let sends = 0;
  const data = Encryption.encrypt(JSON.stringify(ravi), 'pgmq.sos_notify', 'a1');
  const notify = createSosNotify({
    queue: {
      read: async () => [{ msg_id: 7, read_ct: 1, message: { kind: 'whatsapp', alertId: 'a1', data, attempt: 1 } }],
      delete: async () => {},
    },
    senders: { whatsapp: async () => { sends += 1; return { success: true }; } },
    getAlertStatus: async () => 'ACTIVE',
    hasAck: async () => true,
    page: () => {},
  });
  await notify.processBatch();
  assert.equal(sends, 1);
  assert.equal(w.placed.length, 0);
});

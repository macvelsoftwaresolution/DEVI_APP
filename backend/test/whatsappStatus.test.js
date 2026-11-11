import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatusEvents, bestStatus } from '../src/services/whatsappStatus.service.js';
import { createSosNotify, MESSAGE_WATCH_SECONDS, MAX_ATTEMPTS } from '../src/services/sosNotify.service.js';
import { Encryption } from '../src/utils/encryption.js';

// L4: Meta accepting a WhatsApp is not the guardian getting it.

// The shape of Meta's status webhook (Cloud API "messages" field, statuses array)
const webhook = (...statuses) => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550000000', phone_number_id: 'PHONE_ID' },
        statuses,
      },
    }],
  }],
});

const status = (id, s, code) => ({
  id,
  status: s,
  timestamp: '1731230000',
  recipient_id: '919876543210',
  ...(code && { errors: [{ code, title: 'Message failed to send', error_data: { details: '...' } }] }),
});

test('webhook statuses are read with their error code, and no phone number', () => {
  const events = parseStatusEvents(webhook(status('wamid.1', 'delivered'), status('wamid.2', 'failed', 131000)));
  assert.deepEqual(events, [
    { messageId: 'wamid.1', status: 'delivered', errorCode: null },
    { messageId: 'wamid.2', status: 'failed', errorCode: 131000 },
  ]);
});

test('unknown statuses and bodies without statuses are ignored', () => {
  assert.deepEqual(parseStatusEvents(webhook(status('w', 'deleted'))), []);
  assert.deepEqual(parseStatusEvents({ entry: [{ changes: [{ value: { messages: [{}] } }] }] }), []);
  assert.deepEqual(parseStatusEvents(undefined), []);
});

test('statuses from several entries are all read', () => {
  const body = { entry: [webhook(status('a', 'sent')).entry[0], webhook(status('b', 'read')).entry[0]] };
  assert.deepEqual(parseStatusEvents(body).map((e) => e.messageId), ['a', 'b']);
});

test('the status that counts: read over delivered over failed over sent', () => {
  assert.equal(bestStatus([{ status: 'sent' }, { status: 'failed', error_code: 131000 }]).status, 'failed');
  assert.equal(bestStatus([{ status: 'failed' }, { status: 'delivered' }]).status, 'delivered');
  assert.equal(bestStatus([{ status: 'delivered' }, { status: 'read' }, { status: 'sent' }]).status, 'read');
  assert.equal(bestStatus([]), null);
  assert.equal(bestStatus([{ status: 'failed', error_code: 131026 }]).errorCode, 131026);
});

// --- What the delivery code does with them ---

const job = { alertId: 'a1', phone: '+919876543210', victimName: 'Priya', location: {} };

const fakeQueue = ({ failSends = false } = {}) => {
  const jobs = new Map();
  const log = [];
  let next = 1;
  return {
    jobs, log, failSends,
    async send(_q, message, delay) {
      if (this.failSends) throw new Error('queue down');
      const id = next++;
      jobs.set(id, { msg_id: id, read_ct: 0, message, delay });
      log.push(['send', id]);
      return id;
    },
    async read() { return [...jobs.values()].map((j) => ({ ...j, read_ct: j.read_ct + 1 })); },
    async delete(_q, id) { jobs.delete(id); log.push(['delete', id]); },
    async archive(_q, id) { jobs.delete(id); log.push(['archive', id]); },
  };
};

const plain = (entry) => JSON.parse(Encryption.decrypt(entry.message.data, 'pgmq.sos_notify', 'a1'));
const watches = (q) => [...q.jobs.values()].filter((j) => j.message.watch);
const retries = (q) => [...q.jobs.values()].filter((j) => !j.message.watch);

const make = (queue, { saved = null, savedThrows = false, alertStatus = 'ACTIVE', whatsapp } = {}) => {
  const pages = [];
  const notify = createSosNotify({
    queue,
    random: () => 0.5,
    senders: { whatsapp: whatsapp || (async () => ({ success: true, messageId: 'wamid.1' })) },
    getAlertStatus: async () => alertStatus,
    hasAck: async () => false,
    getMessageStatus: async () => { if (savedThrows) throw new Error('db down'); return saved; },
    page: (p) => pages.push(p),
  });
  return { notify, pages };
};

test('an accepted WhatsApp leaves a watch job, saved before its send job is deleted', async () => {
  const q = fakeQueue();
  await make(q).notify.dispatch('whatsapp', job);

  const [watch] = watches(q);
  assert.equal(q.jobs.size, 1);
  assert.equal(watch.delay, MESSAGE_WATCH_SECONDS);
  assert.equal(watch.message.kind, 'whatsapp');
  assert.equal(plain(watch).messageId, 'wamid.1');
  assert.deepEqual(q.log, [['send', 1], ['send', 2], ['delete', 1]]);
});

test('delivered or read ends it: the watch job is deleted, nothing is sent again', async () => {
  for (const s of ['delivered', 'read']) {
    const q = fakeQueue();
    const { notify } = make(q);
    await notify.dispatch('whatsapp', job);
    assert.equal(await notify.messageStatus({ messageId: 'wamid.1', status: s, errorCode: null }), s);
    assert.equal(q.jobs.size, 0, s);
  }
});

test('sent only: the watch job stays, waiting for delivered or failed', async () => {
  const q = fakeQueue();
  const { notify } = make(q);
  await notify.dispatch('whatsapp', job);
  assert.equal(await notify.messageStatus({ messageId: 'wamid.1', status: 'sent', errorCode: null }), 'sent');
  assert.equal(watches(q).length, 1);
});

test('accepted then failed: sent again, queued before the watch job is deleted', async () => {
  const q = fakeQueue();
  const { notify } = make(q);
  await notify.dispatch('whatsapp', job);
  q.log.length = 0;

  assert.equal(await notify.messageStatus({ messageId: 'wamid.1', status: 'failed', errorCode: 131000 }), 'retry');
  const [retry] = retries(q);
  assert.equal(watches(q).length, 0);
  assert.equal(retry.message.kind, 'whatsapp');
  assert.equal(retry.message.attempt, 1);
  assert.equal(plain(retry).messageId, undefined);
  assert.deepEqual(q.log, [['send', 3], ['delete', 2]]);
});

test('failed because the number is not on WhatsApp: not sent again', async () => {
  const q = fakeQueue();
  const { notify } = make(q);
  await notify.dispatch('whatsapp', job);
  assert.equal(await notify.messageStatus({ messageId: 'wamid.1', status: 'failed', errorCode: 131026 }), 'permanent');
  assert.equal(q.jobs.size, 0);
});

test('held back by Meta (131049, Marketing template): not sent again for 24 hours, pages, the call carries it', async () => {
  const q = fakeQueue();
  const { notify, pages } = make(q);
  await notify.dispatch('whatsapp', job);
  // Live, 11 Nov: devi_safety is a Marketing template, and every SOS WhatsApp failed with 131049
  assert.equal(await notify.messageStatus({ messageId: 'wamid.1', status: 'failed', errorCode: 131049 }), 'permanent');
  assert.equal(q.jobs.size, 0);
  assert.deepEqual(pages.map((p) => p.key), ['whatsapp:MARKETING_LIMIT']);
});

test('failed on a template problem: pages the on-call person and is sent again', async () => {
  const q = fakeQueue();
  const { notify, pages } = make(q);
  await notify.dispatch('whatsapp', job);
  assert.equal(await notify.messageStatus({ messageId: 'wamid.1', status: 'failed', errorCode: 132001 }), 'retry');
  assert.deepEqual(pages.map((p) => p.key), ['whatsapp:TEMPLATE_PROBLEM']);
});

test('failed after she is safe: not sent again', async () => {
  const q = fakeQueue();
  const { notify } = make(q, { alertStatus: 'RESOLVED' });
  await notify.dispatch('whatsapp', job);
  assert.equal(await notify.messageStatus({ messageId: 'wamid.1', status: 'failed', errorCode: 131000 }), 'resolved');
  assert.equal(q.jobs.size, 0);
});

test(`failed on the last of ${MAX_ATTEMPTS} attempts: gives up and pages with the alert`, async () => {
  const q = fakeQueue();
  const { notify, pages } = make(q);
  const data = Encryption.encrypt(JSON.stringify(job), 'pgmq.sos_notify', 'a1');
  q.jobs.set(90, { msg_id: 90, read_ct: 0, message: { kind: 'whatsapp', alertId: 'a1', data, attempt: MAX_ATTEMPTS } });
  await notify.processBatch(); // sent again on the last attempt, accepted, watched
  assert.equal(await notify.messageStatus({ messageId: 'wamid.1', status: 'failed', errorCode: 131000 }), 'gave-up');
  assert.equal(pages[0].key, 'alert:a1');
});

test('a status for a message we did not send now does nothing', async () => {
  const q = fakeQueue();
  const { notify } = make(q);
  assert.equal(await notify.messageStatus({ messageId: 'wamid.otp', status: 'failed', errorCode: 131000 }), 'unknown');
  assert.equal(q.jobs.size, 0);
});

// --- After a restart: the watch job reads the saved status ---

const afterRestart = async (opts) => {
  const q = fakeQueue();
  await make(q).notify.dispatch('whatsapp', job);
  const restarted = make(q, opts);
  await restarted.notify.processBatch();
  return { q, pages: restarted.pages };
};

test('after a restart, a saved failed status sends it again', async () => {
  const { q } = await afterRestart({ saved: { status: 'failed', errorCode: 131000 } });
  assert.equal(watches(q).length, 0);
  assert.equal(retries(q).length, 1);
  assert.equal(retries(q)[0].message.attempt, 1);
});

test('after a restart, a saved delivered status ends it', async () => {
  const { q } = await afterRestart({ saved: { status: 'delivered', errorCode: null } });
  assert.equal(q.jobs.size, 0);
});

test('only "sent" after the watch time: the phone is offline, left to the call, not sent again', async () => {
  const { q, pages } = await afterRestart({ saved: { status: 'sent', errorCode: null } });
  assert.equal(q.jobs.size, 0);
  assert.equal(pages.length, 0);
});

test('no status at all: the webhook is not reaching us, which pages, and nothing is sent again', async () => {
  const { q, pages } = await afterRestart({ saved: null });
  assert.equal(q.jobs.size, 0);
  assert.deepEqual(pages.map((p) => p.key), ['whatsapp:no-status']);
});

test('the saved status cannot be read: nothing is sent again', async () => {
  const { q } = await afterRestart({ savedThrows: true });
  assert.equal(q.jobs.size, 0);
});

test('a failed status whose retry cannot be queued keeps the watch job', async () => {
  const q = fakeQueue();
  await make(q).notify.dispatch('whatsapp', job);
  q.failSends = true;
  await make(q, { saved: { status: 'failed', errorCode: 131000 } }).notify.processBatch();
  assert.equal(watches(q).length, 1);
});

test('a WhatsApp accepted on a retry is watched too', async () => {
  const q = fakeQueue();
  let tries = 0;
  const whatsapp = async () => (++tries === 1 ? { success: false, reason: 'TIMEOUT' } : { success: true, messageId: 'wamid.2' });
  const { notify } = make(q, { whatsapp });
  await notify.dispatch('whatsapp', job);
  await notify.processBatch();
  const [watch] = watches(q);
  assert.equal(q.jobs.size, 1);
  assert.equal(plain(watch).messageId, 'wamid.2');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPager, PAGE_REPEAT_MS } from '../src/services/pager.service.js';
import { createSosNotify, MAX_ATTEMPTS, MAX_REDIALS } from '../src/services/sosNotify.service.js';
import { Encryption } from '../src/utils/encryption.js';

const alert = { alertId: 'a1', victimName: 'Priya', location: { latitude: 13.08, longitude: 80.27, location: 'Chennai' } };

const makePager = ({ phone = '+919000000001', status = 'ACTIVE', acked = false, call, whatsapp } = {}) => {
  let t = Date.parse('2026-11-10T10:00:00Z');
  const sent = { calls: [], messages: [] };
  const pager = createPager({
    oncallPhone: () => phone,
    getAlertStatus: async () => status,
    anyAck: async () => acked,
    now: () => t,
    call: call || (async (p) => { sent.calls.push(p); return { success: true }; }),
    whatsapp: whatsapp || (async (p, name, location) => { sent.messages.push({ p, name, location }); return { success: true }; }),
  });
  return { pager, sent, advance: (ms) => { t += ms; } };
};

test('an alert page calls and forwards the SOS on WhatsApp to the on-call phone', async () => {
  const { pager, sent } = makePager();
  assert.equal(await pager.page({ key: 'alert:a1', reason: 'whatsapp failed', alert }), 'paged');
  assert.deepEqual(sent.calls, ['+919000000001']);
  assert.equal(sent.messages[0].p, '+919000000001');
  assert.match(sent.messages[0].name, /^Priya \(DEVI page: whatsapp failed\)$/);
  assert.equal(sent.messages[0].location.latitude, 13.08);
});

test('a system page names the problem', async () => {
  const { pager, sent } = makePager();
  await pager.page({ key: 'whatsapp:TOKEN_EXPIRED', reason: 'token expired' });
  assert.equal(sent.messages[0].name, 'DEVI system: token expired');
});

test('the same key is paged once per repeat window', async () => {
  const { pager, sent, advance } = makePager();
  await pager.page({ key: 'k', reason: 'r' });
  advance(PAGE_REPEAT_MS - 1000);
  assert.equal(await pager.page({ key: 'k', reason: 'r' }), 'repeat');
  advance(2000);
  assert.equal(await pager.page({ key: 'k', reason: 'r' }), 'paged');
  assert.equal(sent.calls.length, 2);
});

test('different keys are paged separately', async () => {
  const { pager, sent } = makePager();
  await pager.page({ key: 'a', reason: 'r' });
  await pager.page({ key: 'b', reason: 'r' });
  assert.equal(sent.calls.length, 2);
});

test('no page when the alert is resolved or a guardian pressed 1', async () => {
  for (const opts of [{ status: 'RESOLVED' }, { acked: true }]) {
    const { pager, sent } = makePager(opts);
    assert.equal(await pager.page({ key: 'alert:a1', reason: 'r', alert }), 'handled');
    assert.equal(sent.calls.length, 0);
  }
});

test('without ONCALL_PHONE nothing is sent', async () => {
  const { pager, sent } = makePager({ phone: '' });
  assert.equal(await pager.page({ key: 'k', reason: 'r' }), 'not-configured');
  assert.equal(sent.calls.length + sent.messages.length, 0);
});

test('one channel failing still counts as paged', async () => {
  const { pager } = makePager({ whatsapp: async () => ({ success: false, reason: 'TOKEN_EXPIRED' }) });
  assert.equal(await pager.page({ key: 'k', reason: 'r' }), 'paged');
});

test('when both channels fail, the next failure pages again at once', async () => {
  let up = false;
  const { pager } = makePager({
    call: async () => ({ success: up }),
    whatsapp: async () => { throw new Error('network'); },
  });
  assert.equal(await pager.page({ key: 'k', reason: 'r' }), 'failed');
  up = true;
  assert.equal(await pager.page({ key: 'k', reason: 'r' }), 'paged');
});

test('a page never throws', async () => {
  const { pager } = makePager({ status: 'ACTIVE' });
  const broken = createPager({ oncallPhone: () => { throw new Error('boom'); } });
  assert.equal(await broken.page({ key: 'k', reason: 'r' }), 'failed');
  assert.equal(await pager.page({ key: 'k', reason: 'r' }), 'paged');
});

// What the delivery code pages

const job = { alertId: 'a1', phone: '+919876543210', victimName: 'Priya', location: {} };

const notifyWith = ({ senders, queue } = {}) => {
  const pages = [];
  const notify = createSosNotify({
    queue: queue || { send: async () => 1, delete: async () => {}, archive: async () => {} },
    senders,
    random: () => 0.5,
    getAlertStatus: async () => 'ACTIVE',
    hasAck: async () => false,
    page: (p) => { pages.push(p); },
  });
  return { notify, pages };
};

test('an expired WhatsApp token pages a system failure', async () => {
  const { notify, pages } = notifyWith({ senders: { whatsapp: async () => ({ success: false, reason: 'TOKEN_EXPIRED' }) } });
  await notify.dispatch('whatsapp', job);
  assert.deepEqual(pages.map((p) => p.key), ['whatsapp:TOKEN_EXPIRED']);
});

test('a temporary WhatsApp failure or a number not on WhatsApp pages nobody yet', async () => {
  for (const reason of ['TIMEOUT', 'RATE_LIMITED', 'NOT_ON_WHATSAPP']) {
    const { notify, pages } = notifyWith({ senders: { whatsapp: async () => ({ success: false, reason }) } });
    await notify.dispatch('whatsapp', job);
    assert.equal(pages.length, 0, reason);
  }
});

test('a call no provider placed pages a system failure', async () => {
  const { notify, pages } = notifyWith({ senders: { ivr: async () => ({ success: false, error: 'No telephony provider configured in .env' }) } });
  await notify.dispatch('ivr', job);
  assert.deepEqual(pages.map((p) => p.key), ['ivr:failed']);
});

test('giving up after every retry pages with the alert', async () => {
  const data = Encryption.encrypt(JSON.stringify(job), 'pgmq.sos_notify', 'a1');
  const queue = {
    read: async () => [{ msg_id: 9, read_ct: 1, message: { kind: 'whatsapp', alertId: 'a1', data, attempt: MAX_ATTEMPTS + 1 } }],
    archive: async () => {},
  };
  const { notify, pages } = notifyWith({ queue, senders: { whatsapp: async () => ({ success: true }) } });
  await notify.processBatch();
  assert.equal(pages[0].key, 'alert:a1');
  assert.equal(pages[0].alert.victimName, 'Priya');
});

test(`a call not answered after ${MAX_REDIALS} redials pages with the alert`, async () => {
  const { notify, pages } = notifyWith({ senders: { ivr: async () => ({ success: true, provider: 'plivo', callId: 'c1' }) } });
  await notify.dispatch('ivr', { ...job, redials: MAX_REDIALS });
  assert.equal(await notify.callEnded({ callId: 'c1', status: 'no-answer', answered: false }), 'gave-up');
  assert.equal(pages[0].key, 'alert:a1');
});

test('a page call URL carries no alert details', async () => {
  const { ivrService } = await import('../src/services/ivr.service.js');
  assert.match(ivrService.answerUrl('plivo', { page: true }), /\/api\/ivr\/plivo\/page$/);
  assert.match(ivrService.answerUrl('twilio', { page: true }), /\/api\/ivr\/twilio\/page$/);
  assert.match(ivrService.answerUrl('plivo', { victimName: 'P', locationText: '', sosId: 's', ack: 'a' }), /\/answer\?victim=P/);
});

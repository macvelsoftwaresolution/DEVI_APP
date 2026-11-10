import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSosNotify, MAX_REDIALS } from '../src/services/sosNotify.service.js';
import { callEndFromPlivo, callEndFromTwilio } from '../src/routes/ivr.routes.js';
import { ivrService } from '../src/services/ivr.service.js';
import { Encryption } from '../src/utils/encryption.js';

const job = { alertId: 'a1', phone: '+919876543210', victimName: 'Priya', location: {} };

// Fields as Plivo sent them for the failed call on 5 Nov 2026
const plivoCarrierFailure = {
  Event: 'Hangup',
  HangupCause: 'NORMAL_TEMPORARY_FAILURE',
  HangupCauseName: 'Request Timeout',
  HangupCauseCode: '3070',
  Duration: '0',
  AnswerTime: '',
  HangupSource: 'Carrier',
  CallUUID: 'call-1',
  CallStatus: 'failed',
  To: '919042024830',
  RequestUUID: 'call-1',
};

const setup = ({ status = 'ACTIVE', sendReturns = 1, acked = true } = {}) => {
  const sent = [];
  const notify = createSosNotify({
    queue: {
      send: async (_q, message, delay) => { sent.push({ message, delay }); return sendReturns; },
      delete: async () => {},
    },
    random: () => 0.5,
    senders: { ivr: async () => ({ success: true, provider: 'plivo', callId: 'call-1' }) },
    getAlertStatus: async () => status,
    hasAck: async () => acked,
  });
  return { notify, sent };
};

const queuedJob = (entry) => JSON.parse(Encryption.decrypt(entry.message.data, 'pgmq.sos_notify', 'a1'));

test('Plivo fields: a carrier failure is failed and not answered, with its cause', () => {
  const end = callEndFromPlivo(plivoCarrierFailure);
  assert.equal(end.callId, 'call-1');
  assert.equal(end.status, 'failed');
  assert.equal(end.answered, false);
  assert.equal(end.cause, 'Request Timeout');
});

test('Plivo fields: an answered call is answered, and duration comes from Duration', () => {
  const end = callEndFromPlivo({ CallUUID: 'c', CallStatus: 'completed', Duration: '27', AnswerTime: '2026-11-05 07:48:00' });
  assert.equal(end.answered, true);
  assert.equal(end.duration, '27');
});

test('Twilio fields: only completed counts as answered', () => {
  assert.equal(callEndFromTwilio({ CallSid: 'c', CallStatus: 'completed' }).answered, true);
  assert.equal(callEndFromTwilio({ CallSid: 'c', CallStatus: 'no-answer' }).answered, false);
});

test('a call the carrier failed goes back to the queue and avoids that provider', async () => {
  const { notify, sent } = setup();
  await notify.dispatch('ivr', job);
  sent.length = 0;

  assert.equal(await notify.callEnded({ callId: 'call-1', status: 'failed', answered: false }), 'retry');

  assert.equal(sent.length, 1);
  assert.equal(sent.at(0).message.attempt, 1);
  assert.equal(sent.at(0).delay, 60);
  assert.equal(queuedJob(sent.at(0)).avoidProvider, 'plivo');
});

test('an answered call with press 1 is finished', async () => {
  const { notify, sent } = setup();
  await notify.dispatch('ivr', job);
  sent.length = 0;
  assert.equal(await notify.callEnded({ callId: 'call-1', status: 'completed', answered: true }), 'acknowledged');
  assert.equal(sent.length, 0);
});

test('a status for a call we did not place does nothing', async () => {
  const { notify, sent } = setup();
  assert.equal(await notify.callEnded({ callId: 'made-up', status: 'failed', answered: false }), 'unknown');
  assert.equal(sent.length, 0);
});

test('a repeated status event does not queue a second retry', async () => {
  const { notify, sent } = setup();
  await notify.dispatch('ivr', job);
  sent.length = 0;
  await notify.callEnded({ callId: 'call-1', status: 'failed', answered: false });
  assert.equal(await notify.callEnded({ callId: 'call-1', status: 'failed', answered: false }), 'unknown');
  assert.equal(sent.length, 1);
});

test('user already safe: no retry for a failed call', async () => {
  const { notify, sent } = setup({ status: 'RESOLVED' });
  await notify.dispatch('ivr', job);
  sent.length = 0;
  assert.equal(await notify.callEnded({ callId: 'call-1', status: 'failed', answered: false }), 'resolved');
  assert.equal(sent.length, 0);
});

test(`busy or unanswered is redialled ${MAX_REDIALS} times, then stops`, async () => {
  const { notify } = setup();
  await notify.dispatch('ivr', { ...job, redials: MAX_REDIALS - 1 });
  assert.equal(await notify.callEnded({ callId: 'call-1', status: 'no-answer', answered: false }), 'retry');

  await notify.dispatch('ivr', { ...job, redials: MAX_REDIALS });
  assert.equal(await notify.callEnded({ callId: 'call-1', status: 'busy', answered: false }), 'gave-up');
});

test('a busy guardian is redialled on the same provider', async () => {
  const { notify, sent } = setup();
  await notify.dispatch('ivr', job);
  sent.length = 0;
  await notify.callEnded({ callId: 'call-1', status: 'busy', answered: false });
  assert.equal(queuedJob(sent.at(0)).avoidProvider, undefined);
  assert.equal(queuedJob(sent.at(0)).redials, 1);
});

test('a retry after a failed Plivo call tries Twilio first, Plivo stays as backup', () => {
  assert.deepEqual(ivrService.providerOrder('+919876543210'), ['plivo', 'twilio']);
  assert.deepEqual(ivrService.providerOrder('+919876543210', 'plivo'), ['twilio', 'plivo']);
  assert.deepEqual(ivrService.providerOrder('+971501234567', 'twilio'), ['plivo', 'twilio']);
  assert.deepEqual(ivrService.providerOrder('+971501234567', 'plivo'), ['twilio', 'plivo']);
});

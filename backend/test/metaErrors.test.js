import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMetaError, sosTemplate } from '../src/services/whatsapp.service.js';
import { createSosNotify } from '../src/services/sosNotify.service.js';

// Meta's documented error shape: type is "OAuthException" for errors that have nothing to do with the token
const metaError = (code) => ({ message: `(#${code}) error`, type: 'OAuthException', code, fbtrace_id: 'x' });

test('Meta error type does not decide the reason, the code does', () => {
  assert.equal(classifyMetaError(metaError(190)), 'TOKEN_EXPIRED');
  assert.equal(classifyMetaError(metaError(131026)), 'NOT_ON_WHATSAPP');
  assert.equal(classifyMetaError(metaError(131049)), 'MARKETING_LIMIT');
  assert.equal(classifyMetaError(metaError(132001)), 'TEMPLATE_PROBLEM');
  for (const code of [4, 80007, 130429, 131048, 131056, 131064, 133016]) {
    assert.equal(classifyMetaError(metaError(code)), 'RATE_LIMITED', `code ${code}`);
  }
  for (const code of [2, 131000, 131016, 133004]) {
    assert.equal(classifyMetaError(metaError(code)), 'META_ERROR', `code ${code}`);
  }
});

const job = { alertId: 'a1', phone: '+919876543210', victimName: 'Priya', location: {} };

const firstSendFailsWith = async (out, kind = 'whatsapp') => {
  const deleted = [];
  const notify = createSosNotify({
    queue: { send: async () => 7, delete: async (_q, id) => deleted.push(id) },
    senders: { [kind]: async () => out },
  });
  await notify.dispatch(kind, job);
  return deleted;
};

test('only a failure of this one number drops the retry job', async () => {
  for (const reason of ['RATE_LIMITED', 'META_ERROR', 'TIMEOUT', 'NETWORK', 'TOKEN_EXPIRED', 'TEMPLATE_PROBLEM', 'CREDENTIALS_MISSING']) {
    assert.deepEqual(await firstSendFailsWith({ success: false, reason }), [], reason);
  }
  for (const reason of ['NOT_ON_WHATSAPP', 'PHONE_EMPTY']) {
    assert.deepEqual(await firstSendFailsWith({ success: false, reason }), [7], reason);
  }
});

test('a call with no provider configured keeps its retry job', async () => {
  assert.deepEqual(await firstSendFailsWith({ success: false, error: 'No telephony provider configured in .env' }, 'ivr'), []);
  assert.deepEqual(await firstSendFailsWith({ success: false, error: 'Invalid phone number' }, 'ivr'), [7]);
});

test('the SOS template comes from .env, devi_safety in en_US by default', () => {
  assert.deepEqual(sosTemplate({}), { name: 'devi_safety', language: 'en_US' });
  assert.deepEqual(sosTemplate({ WHATSAPP_SOS_TEMPLATE: ' devi_sos_alert ', WHATSAPP_SOS_TEMPLATE_LANG: 'en' }), { name: 'devi_sos_alert', language: 'en' });
});

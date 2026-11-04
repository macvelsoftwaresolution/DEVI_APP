import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOtpService,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_HOUR,
  RESEND_WAIT_MS,
} from '../src/services/otp.service.js';
import { WhatsAppService } from '../src/services/whatsapp.service.js';

const PHONE = '+919876543210';

// In-memory stand-in for the otp_codes table; `sent` holds the codes the "WhatsApp" received
const setup = (sendResult = { success: true }) => {
  const rows = new Map();
  const sent = [];
  const clock = { time: Date.parse('2026-11-05T10:00:00Z') };
  const otp = createOtpService({
    store: {
      get: async (key) => rows.get(key) || null,
      save: async (row) => { rows.set(row.phone_hash, row); },
    },
    send: async (_phone, code) => { sent.push(code); return sendResult; },
    now: () => clock.time,
  });
  return { otp, rows, sent, clock };
};

test('the right code works once, and is never stored', async () => {
  const { otp, rows, sent } = setup();
  assert.equal((await otp.sendCode(PHONE)).success, true);
  assert.match(sent[0], /^\d{6}$/);
  assert.ok(!JSON.stringify([...rows.values()]).includes(sent[0]));
  assert.ok(!JSON.stringify([...rows.values()]).includes('9876543210'));

  assert.equal(await otp.verifyCode(PHONE, sent[0]), true);
  assert.equal(await otp.verifyCode(PHONE, sent[0]), false);
});

test('a code does not work for another number', async () => {
  const { otp, sent } = setup();
  await otp.sendCode(PHONE);
  assert.equal(await otp.verifyCode('+919876543211', sent[0]), false);
});

test('a wrong or badly formed code fails', async () => {
  const { otp } = setup();
  await otp.sendCode(PHONE);
  assert.equal(await otp.verifyCode(PHONE, '000000'), false);
  assert.equal(await otp.verifyCode(PHONE, '123'), false);
  assert.equal(await otp.verifyCode(PHONE, undefined), false);
  assert.equal(await otp.verifyCode(PHONE, { $ne: 1 }), false);
});

test('an expired code fails', async () => {
  const { otp, sent, clock } = setup();
  await otp.sendCode(PHONE);
  clock.time += CODE_TTL_MS + 1;
  assert.equal(await otp.verifyCode(PHONE, sent[0]), false);
});

test(`${MAX_ATTEMPTS} wrong tries kill the code, even the right one fails after`, async () => {
  const { otp, sent } = setup();
  await otp.sendCode(PHONE);
  const wrong = sent[0] === '111111' ? '222222' : '111111';
  for (let i = 0; i < MAX_ATTEMPTS; i++) assert.equal(await otp.verifyCode(PHONE, wrong), false);
  assert.equal(await otp.verifyCode(PHONE, sent[0]), false);
});

test('one code a minute', async () => {
  const { otp, sent, clock } = setup();
  await otp.sendCode(PHONE);
  const again = await otp.sendCode(PHONE);
  assert.equal(again.reason, 'WAIT');
  assert.equal(again.retryAfter, 60);
  assert.equal(sent.length, 1);
  clock.time += RESEND_WAIT_MS;
  assert.equal((await otp.sendCode(PHONE)).success, true);
});

test(`${MAX_SENDS_PER_HOUR} codes an hour, then the limit resets`, async () => {
  const { otp, sent, clock } = setup();
  for (let i = 0; i < MAX_SENDS_PER_HOUR; i++) {
    assert.equal((await otp.sendCode(PHONE)).success, true);
    clock.time += RESEND_WAIT_MS;
  }
  assert.equal((await otp.sendCode(PHONE)).reason, 'LIMIT');
  assert.equal(sent.length, MAX_SENDS_PER_HOUR);
  clock.time += 60 * 60 * 1000;
  assert.equal((await otp.sendCode(PHONE)).success, true);
});

test('using a code does not reset the hourly limit', async () => {
  const { otp, sent, clock } = setup();
  for (let i = 0; i < MAX_SENDS_PER_HOUR; i++) {
    await otp.sendCode(PHONE);
    await otp.verifyCode(PHONE, sent[i]);
    clock.time += RESEND_WAIT_MS;
  }
  assert.equal((await otp.sendCode(PHONE)).reason, 'LIMIT');
});

test('a failed send saves nothing and passes the reason on', async () => {
  const { otp, rows } = setup({ success: false, reason: 'NOT_ON_WHATSAPP' });
  assert.equal((await otp.sendCode(PHONE)).reason, 'NOT_ON_WHATSAPP');
  assert.equal(rows.size, 0);
});

test('WhatsApp gets the template with the code in the body and the copy button', async (t) => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'test-id';
  process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || 'test-token';
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) };
  });

  const out = await WhatsAppService.sendOtp(PHONE, '123456');
  assert.equal(out.success, true);
  assert.equal(payload.to, '919876543210');
  assert.equal(payload.template.name, 'devi_agent_pin');
  assert.equal(payload.template.language.code, 'en_US');
  assert.deepEqual(payload.template.components, [
    { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] },
  ]);
});

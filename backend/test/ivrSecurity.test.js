import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import twilio from 'twilio';
import ivrRoutes from '../src/routes/ivr.routes.js';
import { ivrService, callToken, readCallToken, publicBaseUrl, CALL_TOKEN_TTL_MS } from '../src/services/ivr.service.js';
import { isValidTwilioRequest, isValidPlivoRequest } from '../src/middlewares/ivrSignature.js';
import { SosService } from '../src/services/sos.service.js';

// SE3: IVR webhooks are signed by the provider, and call URLs carry no name, place or number.

const ALERT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PHONE = '+919876543210';
const details = { victimName: 'Priya', locationText: 'Anna Nagar, Chennai', phone: PHONE };

// --- The call token ---

test('the call token reads back for its own alert only, and holds nothing in plain text', () => {
  const t = callToken(details, ALERT);
  assert.deepEqual(readCallToken(t, ALERT), details);
  assert.equal(readCallToken(t, OTHER), null);
  for (const plain of ['Priya', 'Anna', '9876543210']) assert.equal(t.includes(plain), false, plain);
});

test('an expired, forged or plain token gives nothing', () => {
  const now = Date.parse('2026-11-10T10:00:00Z');
  const t = callToken(details, ALERT, now);
  assert.ok(readCallToken(t, ALERT, now + CALL_TOKEN_TTL_MS - 1000));
  assert.equal(readCallToken(t, ALERT, now + CALL_TOKEN_TTL_MS + 1000), null);
  assert.equal(readCallToken('Priya', ALERT), null);
  assert.equal(readCallToken(`${t.slice(0, -4)}AAAA`, ALERT), null);
  assert.equal(readCallToken(undefined, ALERT), null);
});

test('the URL a real SOS call is placed with has no name, place or number', async () => {
  const realClient = ivrService.plivoClient;
  const realTwilio = ivrService.twilioClient;
  const realCaller = process.env.PLIVO_CALLER_ID;
  let placedUrl;
  ivrService.plivoClient = { calls: { create: async (_from, _to, url) => { placedUrl = url; return { requestUuid: 'u1' }; } } };
  ivrService.twilioClient = null;
  process.env.PLIVO_CALLER_ID = '+918000000000';
  try {
    const out = await ivrService.triggerEmergencyCall({ recipientPhone: PHONE, victimName: 'Priya', locationText: '12/3, 2nd Street, Anna Nagar, Chennai, Tamil Nadu 600040, India', sosId: ALERT });
    assert.equal(out.success, true);
    for (const plain of ['Priya', 'Anna', 'Chennai', '9876543210', 'victim=', 'loc=']) assert.equal(placedUrl.includes(plain), false, plain);
    const t = new URL(placedUrl).searchParams.get('t');
    assert.deepEqual(readCallToken(t, ALERT), { victimName: 'Priya', locationText: 'Anna Nagar, Chennai', phone: PHONE });
  } finally {
    ivrService.plivoClient = realClient;
    ivrService.twilioClient = realTwilio;
    if (realCaller === undefined) delete process.env.PLIVO_CALLER_ID; else process.env.PLIVO_CALLER_ID = realCaller;
  }
});

// --- The routes ---

let server;
let base;
let acks = [];
const realRecord = SosService.recordGuardianAck;
const realMode = process.env.IVR_SIGNATURE_MODE;

before(async () => {
  SosService.recordGuardianAck = async (ack) => { acks.push(ack); return true; };
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/ivr', ivrRoutes);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/ivr`;
});

after(() => {
  SosService.recordGuardianAck = realRecord;
  server.close();
});

afterEach(() => {
  acks = [];
  if (realMode === undefined) delete process.env.IVR_SIGNATURE_MODE; else process.env.IVR_SIGNATURE_MODE = realMode;
});

const query = (t = callToken(details, ALERT)) => `sosId=${ALERT}&t=${encodeURIComponent(t)}`;
const pressOne = (provider, q) => fetch(`${base}/${provider}/gather?${q}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'Digits=1',
}).then((r) => r.text());

for (const provider of ['plivo', 'twilio']) {
  test(`${provider}: the answer speaks the name and place from the token, and passes the token to press 1`, async () => {
    process.env.IVR_SIGNATURE_MODE = 'off';
    const xml = await (await fetch(`${base}/${provider}/answer?${query()}`)).text();
    assert.match(xml, /Priya has triggered/);
    assert.match(xml, /near Anna Nagar, Chennai/);
    assert.match(xml, /gather\?sosId=[^"]+&amp;t=/);
    assert.equal(xml.includes('9876543210'), false);
  });

  test(`${provider}: press 1 with the call token saves the guardian from the token`, async () => {
    process.env.IVR_SIGNATURE_MODE = 'off';
    const xml = await pressOne(provider, query());
    assert.deepEqual(acks.map((a) => [a.alertId, a.phone]), [[ALERT, PHONE]]);
    assert.match(xml, /has been recorded/);
  });

  test(`${provider}: a token for another alert says nothing personal and saves nothing`, async () => {
    process.env.IVR_SIGNATURE_MODE = 'off';
    const wrong = callToken(details, OTHER);
    const xml = await (await fetch(`${base}/${provider}/answer?${query(wrong)}`)).text();
    assert.equal(xml.includes('Priya'), false);
    await pressOne(provider, query(wrong));
    assert.equal(acks.length, 0);
  });

  test(`${provider}: enforce mode refuses an unsigned webhook`, async () => {
    process.env.IVR_SIGNATURE_MODE = 'enforce';
    const res = await fetch(`${base}/${provider}/answer?${query()}`);
    assert.equal(res.status, 403);
    const status = await fetch(`${base}/${provider}/status`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'CallStatus=failed' });
    assert.equal(status.status, 403);
  });

  test(`${provider}: log mode lets an unsigned webhook through`, async () => {
    process.env.IVR_SIGNATURE_MODE = 'log';
    assert.equal((await fetch(`${base}/${provider}/answer?${query()}`)).status, 200);
  });
}

// --- The signatures ---

const fakeReq = ({ method = 'POST', originalUrl, headers = {}, body = {} }) => ({
  method, originalUrl, body, get: (name) => headers[name.toLowerCase()],
});

test('twilio: a correct signature passes; another token, URL or body fails', () => {
  const path = '/api/ivr/twilio/status';
  const body = { CallSid: 'CA1', CallStatus: 'no-answer', To: '+15550001111' };
  const sig = twilio.getExpectedTwilioSignature('tw-token', publicBaseUrl() + path, body);
  const req = (over = {}) => fakeReq({ originalUrl: path, headers: { 'x-twilio-signature': sig }, body, ...over });

  assert.equal(isValidTwilioRequest(req(), 'tw-token'), true);
  assert.equal(isValidTwilioRequest(req(), 'other-token'), false);
  assert.equal(isValidTwilioRequest(req({ originalUrl: '/api/ivr/twilio/gather' }), 'tw-token'), false);
  assert.equal(isValidTwilioRequest(req({ body: { ...body, CallStatus: 'completed' } }), 'tw-token'), false);
  assert.equal(isValidTwilioRequest(req({ headers: {} }), 'tw-token'), false);
  assert.equal(isValidTwilioRequest(req(), ''), false);
});

// Plivo's V3 rule for a GET: the URL with its query sorted, then "." and the nonce, HMAC-SHA256
const plivoGetSignature = (token, url, nonce) => {
  const u = new URL(url);
  const sorted = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  const signed = `${u.origin}${u.pathname}${sorted ? `?${sorted}` : ''}.${nonce}`;
  return crypto.createHmac('sha256', token).update(signed).digest('base64');
};

test('plivo: a correct V3 signature passes; another token, URL, nonce or a missing header fails', () => {
  const path = '/api/ivr/plivo/answer?sosId=abc&t=tok123';
  const sig = plivoGetSignature('pl-token', publicBaseUrl() + path, 'n1');
  const req = (over = {}) => fakeReq({ method: 'GET', originalUrl: path, headers: { 'x-plivo-signature-v3': sig, 'x-plivo-signature-v3-nonce': 'n1' }, ...over });

  assert.equal(isValidPlivoRequest(req(), 'pl-token'), true);
  assert.equal(isValidPlivoRequest(req(), 'other-token'), false);
  assert.equal(isValidPlivoRequest(req({ originalUrl: '/api/ivr/plivo/answer?sosId=abc&t=changed' }), 'pl-token'), false);
  assert.equal(isValidPlivoRequest(req({ headers: { 'x-plivo-signature-v3': sig, 'x-plivo-signature-v3-nonce': 'n2' } }), 'pl-token'), false);
  assert.equal(isValidPlivoRequest(req({ headers: { 'x-plivo-signature-v3': sig } }), 'pl-token'), false);
});

test('plivo: one of several comma-separated signatures matching is enough', () => {
  const path = '/api/ivr/plivo/answer?sosId=abc';
  const sig = plivoGetSignature('pl-token', publicBaseUrl() + path, 'n1');
  const req = fakeReq({ method: 'GET', originalUrl: path, headers: { 'x-plivo-signature-v3': `old-sig,${sig}`, 'x-plivo-signature-v3-nonce': 'n1' } });
  assert.equal(isValidPlivoRequest(req, 'pl-token'), true);
});

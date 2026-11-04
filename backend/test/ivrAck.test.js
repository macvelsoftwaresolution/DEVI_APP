import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import ivrRoutes from '../src/routes/ivr.routes.js';
import { ackToken, readAckToken } from '../src/services/ivr.service.js';
import { SosService } from '../src/services/sos.service.js';

const ALERT = '11111111-1111-4111-8111-111111111111';
const OTHER_ALERT = '22222222-2222-4222-8222-222222222222';
const PHONE = '+919876543210';

let server;
let base;
let saved;
let saveResult;
const realRecord = SosService.recordGuardianAck;

before(async () => {
  SosService.recordGuardianAck = async (ack) => { saved.push(ack); return saveResult; };
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use('/ivr', ivrRoutes);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/ivr`;
});

after(() => {
  SosService.recordGuardianAck = realRecord;
  server.close();
});

const press = async (provider, digit, query) => {
  saved = [];
  const res = await fetch(`${base}/${provider}/gather?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `Digits=${digit}`,
  });
  return res.text();
};

const validQuery = () => `sosId=${ALERT}&ack=${encodeURIComponent(ackToken(PHONE, ALERT))}`;

test('ack token reads back only for its own alert', () => {
  const token = ackToken(PHONE, ALERT);
  assert.equal(readAckToken(token, ALERT), PHONE);
  assert.equal(readAckToken(token, OTHER_ALERT), null);
  assert.ok(!token.includes('9876543210'));
});

test('forged ack tokens are refused', () => {
  const token = ackToken(PHONE, ALERT);
  assert.equal(readAckToken(PHONE, ALERT), null);
  assert.equal(readAckToken('', ALERT), null);
  assert.equal(readAckToken(undefined, ALERT), null);
  assert.equal(readAckToken(['a', 'b'], ALERT), null);
  assert.equal(readAckToken(token, ''), null);
  assert.equal(readAckToken(`${token.slice(0, -2)}xx`, ALERT), null);
});

for (const provider of ['plivo', 'twilio']) {
  test(`${provider}: press 1 with a valid token is saved and says recorded`, async () => {
    saveResult = true;
    const xml = await press(provider, 1, validQuery());
    assert.deepEqual(saved, [{ alertId: ALERT, phone: PHONE, provider }]);
    assert.match(xml, /has been recorded/);
  });

  test(`${provider}: press 1 without a valid token saves nothing and never says recorded`, async () => {
    saveResult = true;
    const xml = await press(provider, 1, `sosId=${ALERT}&ack=${encodeURIComponent(PHONE)}`);
    assert.equal(saved.length, 0);
    assert.doesNotMatch(xml, /recorded/);
    assert.match(xml, /check your WhatsApp/);
  });

  test(`${provider}: database failure does not claim it was recorded`, async () => {
    saveResult = false;
    const xml = await press(provider, 1, validQuery());
    assert.equal(saved.length, 1);
    assert.doesNotMatch(xml, /recorded/);
  });

  test(`${provider}: another key saves nothing`, async () => {
    saveResult = true;
    await press(provider, 5, validQuery());
    assert.equal(saved.length, 0);
  });

  test(`${provider}: answer XML carries the token to the gather URL and is honest`, async () => {
    const xml = await (await fetch(`${base}/${provider}/answer?victim=Priya&${validQuery()}`)).text();
    const action = xml.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&');
    const url = new URL(action);
    assert.equal(url.searchParams.get('sosId'), ALERT);
    assert.equal(readAckToken(url.searchParams.get('ack'), ALERT), PHONE);
    assert.match(xml, /Alert remains active/);
    assert.doesNotMatch(xml, /Stay safe|Connecting assistance/);
  });
}

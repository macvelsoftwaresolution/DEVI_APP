import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIndianMobile,
  pickSosRecipients,
  sanitizeVictimName,
  RecipientLimiter,
  MAX_GUARDIANS,
} from '../src/utils/sosRecipients.js';

test('parseIndianMobile accepts Indian mobile formats only', () => {
  assert.equal(parseIndianMobile('9876543210'), '9876543210');
  assert.equal(parseIndianMobile('+91 98765 43210'), '9876543210');
  assert.equal(parseIndianMobile('09876543210'), '9876543210');
  assert.equal(parseIndianMobile('112'), null);
  assert.equal(parseIndianMobile('5876543210'), null);
  assert.equal(parseIndianMobile('Amma (9876543210)'), '9876543210');
  assert.equal(parseIndianMobile(undefined), null);
});

const account = { guardians: [{ phone: '9000000001' }, { phone: '9000000002' }] };

test('logged-in user: saved guardians are verified, new numbers are not', () => {
  const r = pickSosRecipients({ account, requestContacts: ['9000000001', '9000000099'] });
  assert.deepEqual(r, [
    { phone: '9000000001', verified: true },
    { phone: '9000000099', verified: false },
  ]);
});

test('logged-in user: a guardian removed in the app is not alerted', () => {
  const r = pickSosRecipients({ account, requestContacts: ['9000000001'] });
  assert.deepEqual(r.map((x) => x.phone), ['9000000001']);
});

test('logged-in user: empty app list falls back to saved guardians', () => {
  const r = pickSosRecipients({ account, requestContacts: ['112'] });
  assert.deepEqual(r, [
    { phone: '9000000001', verified: true },
    { phone: '9000000002', verified: true },
  ]);
});

test('guest: every number is unverified, duplicates removed, at most 3', () => {
  const many = ['9000000010', '9000000010', '9000000011', '9000000012', '9000000013', '9000000014', '9000000015', '9000000016'];
  const r = pickSosRecipients({ account: null, requestContacts: many });
  assert.equal(r.length, MAX_GUARDIANS);
  assert.ok(r.every((x) => x.verified === false));
  assert.equal(new Set(r.map((x) => x.phone)).size, r.length);
});

test('guest without guardians gets no recipients (control room path)', () => {
  assert.deepEqual(pickSosRecipients({ account: null, requestContacts: ['112'] }), []);
  assert.deepEqual(pickSosRecipients({ account: null, requestContacts: undefined }), []);
});

test('sanitizeVictimName removes links and limits length', () => {
  assert.equal(sanitizeVictimName('Priya'), 'Priya');
  assert.equal(sanitizeVictimName('ப்ரியா'), 'ப்ரியா');
  assert.equal(sanitizeVictimName('Click www.fake-site.com to help'), 'Click to help');
  assert.equal(sanitizeVictimName('Help https://evil.example/x now'), 'Help now');
  assert.equal(sanitizeVictimName('pay at scam.in'), 'pay at');
  assert.equal(sanitizeVictimName('<b>Priya</b>'), 'bPriyab');
  assert.equal(sanitizeVictimName('A'.repeat(200)).length, 40);
  assert.equal(sanitizeVictimName(''), 'DEVI User');
  assert.equal(sanitizeVictimName('www.x.com'), 'DEVI User');
});

test('RecipientLimiter allows 3 alerts per number per hour', () => {
  const limiter = new RecipientLimiter({ limit: 3, windowMs: 60 * 60 * 1000 });
  const t0 = Date.parse('2026-10-27T10:00:00Z');
  const min = 60 * 1000;
  assert.equal(limiter.tryConsume('9000000001', t0), true);
  assert.equal(limiter.tryConsume('9000000001', t0 + 5 * min), true);
  assert.equal(limiter.tryConsume('9000000001', t0 + 20 * min), true);
  assert.equal(limiter.tryConsume('9000000001', t0 + 30 * min), false);
  // Other numbers are counted separately
  assert.equal(limiter.tryConsume('9000000002', t0 + 30 * min), true);
  // 10:00 alert has left the window at 11:01
  assert.equal(limiter.tryConsume('9000000001', t0 + 61 * min), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyMetaSignature } from '../src/middlewares/auth.middleware.js';
import { encryptCoords, readCoords } from '../src/utils/coords.js';

const SECRET = 'meta-app-secret-for-tests';
const sign = (body, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

test('R9: webhook body signed with the App Secret is accepted', () => {
  const body = Buffer.from('{"entry":[{"changes":[]}]}');
  assert.equal(verifyMetaSignature(body, sign(body), SECRET), true);
  assert.equal(verifyMetaSignature(body, sign(body).toUpperCase().replace('SHA256=', 'sha256='), SECRET), true);
});

test('R9: wrong secret, changed body or missing header is refused', () => {
  const body = Buffer.from('{"entry":[]}');
  assert.equal(verifyMetaSignature(body, sign(body, 'other-secret'), SECRET), false);
  assert.equal(verifyMetaSignature(Buffer.from('{"entry":[1]}'), sign(body), SECRET), false);
  assert.equal(verifyMetaSignature(body, undefined, SECRET), false);
  assert.equal(verifyMetaSignature(body, 'sha1=abc', SECRET), false);
  assert.equal(verifyMetaSignature(undefined, sign(body), SECRET), false);
  assert.equal(verifyMetaSignature(body, sign(body), null), false);
});

test('E5: SOS GPS is stored encrypted and read back', () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const coords = encryptCoords(9.46661, 77.78343, id);
  assert.ok(coords.startsWith('enc:v3:'));
  assert.ok(!coords.includes('9.46661'));
  assert.deepEqual(readCoords({ id, coords, latitude: null, longitude: null }), { latitude: 9.46661, longitude: 77.78343 });
});

test('E5: no fix stores nothing; coords copied to another alert do not read', () => {
  assert.equal(encryptCoords(null, null, 'a1'), null);
  assert.equal(encryptCoords(0, 0, 'a1'), null);
  const coords = encryptCoords(9.4, 77.7, 'a1');
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(readCoords({ id: 'a2', coords }), { latitude: null, longitude: null });
  } finally {
    console.warn = original;
  }
});

test('E5: older rows with plain columns still read', () => {
  assert.deepEqual(readCoords({ id: 'a1', coords: null, latitude: 9.4, longitude: 77.7 }), { latitude: 9.4, longitude: 77.7 });
  assert.deepEqual(readCoords({ id: 'a1', latitude: 0, longitude: 0 }), { latitude: null, longitude: null });
  assert.deepEqual(readCoords(null), { latitude: null, longitude: null });
});

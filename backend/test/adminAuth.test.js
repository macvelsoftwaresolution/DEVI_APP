import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, DUMMY_HASH, generatePassword } from '../src/utils/password.js';
import { base32Encode, base32Decode, totpCode, verifyTotp, currentStep, otpauthUrl, generateTotpSecret } from '../src/utils/totp.js';
import {
  signAdmin2faChallenge,
  verifyAdmin2faChallenge,
  signAdminToken,
  decodeAdminToken,
} from '../src/middlewares/auth.middleware.js';

test('password hash: right password passes, wrong fails, hashes are salted', async () => {
  const hash = await hashPassword('Neela-Kadal-47!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPassword('Neela-Kadal-47!', hash), true);
  assert.equal(await verifyPassword('neela-kadal-47!', hash), false);
  assert.notEqual(await hashPassword('Neela-Kadal-47!'), hash);
  assert.equal(await verifyPassword('anything', DUMMY_HASH), false);
  assert.equal(await verifyPassword('x', 'not-a-hash'), false);
  assert.ok(generatePassword().length >= 20);
});

test('TOTP matches the RFC 6238 test vectors (SHA-1, 6 digits)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
  assert.equal(totpCode(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totpCode(secret, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totpCode(secret, Math.floor(1234567890 / 30)), '005924');
});

test('verifyTotp: accepts the current code and ±1 step, never the same step twice', () => {
  const secret = generateTotpSecret();
  const now = Date.parse('2026-10-27T10:00:00Z');
  const step = currentStep(now);
  assert.equal(verifyTotp(secret, totpCode(secret, step), { now }), step);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 1), { now }), step - 1);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 3), { now }), null);
  // Replay: a code already used (step <= last used) is refused
  assert.equal(verifyTotp(secret, totpCode(secret, step), { now, lastUsedStep: step }), null);
  assert.equal(verifyTotp(secret, 'abcdef', { now }), null);
  assert.equal(verifyTotp(secret, '12345', { now }), null);
});

test('otpauth URL carries the secret and account name', () => {
  const url = otpauthUrl('ABCDEFGH', 'priya');
  assert.ok(url.startsWith('otpauth://totp/DEVI%20Response%20Center%3Apriya?secret=ABCDEFGH'));
});

test('2FA challenge is not a dashboard token, and a dashboard token is not a challenge', () => {
  const challenge = signAdmin2faChallenge('admin-1');
  assert.equal(verifyAdmin2faChallenge(challenge), 'admin-1');
  assert.equal(decodeAdminToken(challenge), null);

  const token = signAdminToken({ id: 'admin-1', username: 'ops1', role: 'operator' });
  assert.equal(verifyAdmin2faChallenge(token), null);
  assert.equal(decodeAdminToken(token).adminId, 'admin-1');
  assert.equal(verifyAdmin2faChallenge('junk'), null);
});

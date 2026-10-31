import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isPasswordHash, passwordProblems } from '../src/utils/password.js';

test('hash verifies the right password only', async () => {
  const hash = await hashPassword('Correct-Horse-91');
  assert.ok(isPasswordHash(hash));
  assert.ok(!hash.includes('Correct-Horse-91'));
  assert.equal(await verifyPassword('Correct-Horse-91', hash), true);
  assert.equal(await verifyPassword('correct-horse-91', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('same password gives a different hash each time (random salt)', async () => {
  assert.notEqual(await hashPassword('Correct-Horse-91'), await hashPassword('Correct-Horse-91'));
});

test('invalid stored values never verify', async () => {
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', 'plain-text-password'), false);
  assert.equal(await verifyPassword('x', 'scrypt:16384:8:1:abc'), false);
  assert.equal(isPasswordHash('scrypt:abc:8:1:salt:hash'), false);
});

test('weak passwords are rejected', () => {
  assert.ok(passwordProblems('short1!').length > 0);
  assert.ok(passwordProblems('MyAdminPass2026').length > 0);
  assert.ok(passwordProblems('ravi-control-77', 'ravi').length > 0);
  assert.ok(passwordProblems('aaaaaaaaaaaaaaaa').length > 0);
  assert.deepEqual(passwordProblems('Tiger-Lamp-Orbit-58', 'opsdesk'), []);
});

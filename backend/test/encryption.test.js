import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Encryption, encryptField, decryptField } from '../src/utils/encryption.js';

test('encrypt -> decrypt returns the original value', () => {
  const cipher = Encryption.encrypt('9876543210');
  assert.ok(cipher.startsWith('enc:v1:'));
  assert.equal(Encryption.decrypt(cipher), '9876543210');
});

test('same value encrypts differently each time (random IV)', () => {
  assert.notEqual(Encryption.encrypt('Chennai'), Encryption.encrypt('Chennai'));
});

test('legacy plain text is returned unchanged', () => {
  assert.equal(Encryption.decrypt('Sivakasi, Tamil Nadu'), 'Sivakasi, Tamil Nadu');
});

test('tampered ciphertext is rejected', () => {
  const parts = Encryption.encrypt('secret').split(':');
  parts[4] = parts[4].startsWith('A') ? `B${parts[4].slice(1)}` : `A${parts[4].slice(1)}`;
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(Encryption.decrypt(parts.join(':')), '');
  } finally {
    console.warn = original;
  }
});

test('empty and missing values are left as they are', () => {
  assert.equal(encryptField(''), '');
  assert.equal(encryptField(null), null);
  assert.equal(encryptField(undefined), undefined);
});

test('already encrypted values are not encrypted twice', () => {
  const once = encryptField('Guardian');
  assert.equal(encryptField(once), once);
  assert.equal(decryptField(once), 'Guardian');
});

test('blindIndex: same input same hash, never the plain value', async () => {
  const { blindIndex } = await import('../src/utils/encryption.js');
  assert.equal(blindIndex('9876543210'), blindIndex(' 9876543210 '));
  assert.notEqual(blindIndex('9876543210'), blindIndex('9876543211'));
  assert.ok(!blindIndex('9876543210').includes('9876543210'));
  assert.match(blindIndex('GUEST_AB12'), /^[0-9a-f]{64}$/);
});

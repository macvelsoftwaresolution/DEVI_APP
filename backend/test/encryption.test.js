import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { Encryption, encryptField, decryptField, rowKeyFor } from '../src/utils/encryption.js';
import { ENCRYPTION_KEY } from '../src/config/security.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

// Runs fn with console.warn silenced (failed decrypts log a warning on purpose)
const quiet = (fn) => {
  const original = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = original;
  }
};

// An enc:v1 value as older server versions wrote it (no column / row binding)
const encryptV1 = (text) => {
  const key = Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(ENCRYPTION_KEY, 'utf8'), Buffer.alloc(0), 'devi-db-field-v1', 32)
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
};

test('encrypt -> decrypt returns the original value', () => {
  const cipher = Encryption.encrypt('9876543210', 'users.mobile_number', USER_A);
  assert.ok(cipher.startsWith('enc:v2:'));
  assert.equal(Encryption.decrypt(cipher, 'users.mobile_number', USER_A), '9876543210');
});

test('same value encrypts differently each time (random IV)', () => {
  assert.notEqual(
    Encryption.encrypt('Chennai', 'users.address_1', USER_A),
    Encryption.encrypt('Chennai', 'users.address_1', USER_A)
  );
});

test('legacy plain text is returned unchanged', () => {
  assert.equal(Encryption.decrypt('Sivakasi, Tamil Nadu', 'users.address_1', USER_A), 'Sivakasi, Tamil Nadu');
});

test('tampered ciphertext is rejected', () => {
  const parts = Encryption.encrypt('secret', 'users.full_name', USER_A).split(':');
  parts[4] = parts[4].startsWith('A') ? `B${parts[4].slice(1)}` : `A${parts[4].slice(1)}`;
  assert.equal(quiet(() => Encryption.decrypt(parts.join(':'), 'users.full_name', USER_A)), '');
});

test('E6: a value copied to another user row does not decrypt', () => {
  const phone = Encryption.encrypt('9876543210', 'guardians.mobile_number', USER_A);
  assert.equal(quiet(() => Encryption.decrypt(phone, 'guardians.mobile_number', USER_B)), '');
});

test('E6: a value copied to another column does not decrypt', () => {
  const phone = Encryption.encrypt('9876543210', 'users.mobile_number', USER_A);
  assert.equal(quiet(() => Encryption.decrypt(phone, 'users.full_name', USER_A)), '');
});

test('E6: encrypting without a column and row id is refused', () => {
  assert.throws(() => Encryption.encrypt('x'), /column and row id/);
  assert.throws(() => Encryption.encrypt('x', 'users.full_name', ''), /column and row id/);
});

test('older enc:v1 values are still read until migrated', () => {
  const old = encryptV1('Amma');
  assert.equal(Encryption.isEncrypted(old), true);
  assert.equal(Encryption.isCurrent(old), false);
  assert.equal(Encryption.decrypt(old, 'guardians.name', USER_A), 'Amma');
});

test('ENCRYPTION_ALLOW_V1=false refuses enc:v1 values', () => {
  const old = encryptV1('Amma');
  const script = `
    const { Encryption } = await import('./src/utils/encryption.js');
    console.warn = () => {};
    process.stdout.write(JSON.stringify(Encryption.decrypt(${JSON.stringify(old)}, 'guardians.name', 'x')));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, ENCRYPTION_ALLOW_V1: 'false', ENCRYPTION_KEY },
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString();
  assert.equal(out.trim().split('\n').pop(), '""');
});

test('rowKeyFor: guardians bind to their user, other tables to their own id', () => {
  assert.equal(rowKeyFor('guardians', { id: 'g1', user_id: USER_A }), USER_A);
  assert.equal(rowKeyFor('users', { id: USER_A }), USER_A);
  assert.equal(rowKeyFor('sos_history', { id: 'a1', user_id: USER_A }), 'a1');
});

test('empty and missing values are left as they are', () => {
  assert.equal(encryptField('', 'users.full_name', USER_A), '');
  assert.equal(encryptField(null, 'users.full_name', USER_A), null);
  assert.equal(encryptField(undefined, 'users.full_name', USER_A), undefined);
});

test('already encrypted values are not encrypted twice', () => {
  const once = encryptField('Guardian', 'guardians.name', USER_A);
  assert.equal(encryptField(once, 'guardians.name', USER_A), once);
  assert.equal(decryptField(once, 'guardians.name', USER_A), 'Guardian');
});

test('blindIndex: same input same hash, never the plain value', async () => {
  const { blindIndex } = await import('../src/utils/encryption.js');
  assert.equal(blindIndex('9876543210'), blindIndex(' 9876543210 '));
  assert.notEqual(blindIndex('9876543210'), blindIndex('9876543211'));
  assert.ok(!blindIndex('9876543210').includes('9876543210'));
  assert.match(blindIndex('GUEST_AB12'), /^[0-9a-f]{64}$/);
});

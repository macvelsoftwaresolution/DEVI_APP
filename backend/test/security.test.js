import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, IS_PRODUCTION, supabaseKeyKind, secretProblems } from '../src/config/security.js';

test('CORS allows the dashboard domain and mobile apps (no Origin)', () => {
  assert.equal(isAllowedOrigin('https://devi.macvelsoftware.com'), true);
  assert.equal(isAllowedOrigin(undefined), true);
});

test('CORS blocks unknown websites', () => {
  assert.equal(isAllowedOrigin('https://evil.example.com'), false);
  assert.equal(isAllowedOrigin('http://devi.macvelsoftware.com'), false);
});

test('localhost is allowed only outside production', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173'), !IS_PRODUCTION);
});

test('supabaseKeyKind tells the secret key from public keys', () => {
  const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;
  assert.equal(supabaseKeyKind('sb_secret_abc'), 'secret');
  assert.equal(supabaseKeyKind(jwt('service_role')), 'secret');
  assert.equal(supabaseKeyKind('sb_publishable_abc'), 'public');
  assert.equal(supabaseKeyKind(jwt('anon')), 'public');
  assert.equal(supabaseKeyKind(''), 'unknown');
  assert.equal(supabaseKeyKind('junk'), 'unknown');
});

test('secretProblems: every secret long and different', () => {
  const long = (c) => c.repeat(40);
  const good = {
    JWT_SECRET: long('a'), ADMIN_JWT_SECRET: long('b'), SOS_LINK_SECRET: long('c'),
    ADMIN_SECRET_KEY: long('d'), ENCRYPTION_KEY: long('e'),
  };
  assert.deepEqual(secretProblems(good), []);
  assert.deepEqual(secretProblems({ ...good, SOS_LINK_SECRET: long('a') }), ['JWT_SECRET and SOS_LINK_SECRET have the same value']);
  assert.deepEqual(secretProblems({ ...good, ADMIN_JWT_SECRET: 'short' }), ['ADMIN_JWT_SECRET is shorter than 32 characters']);
});

test('R14: only random 128-bit guest IDs are accepted', async () => {
  const { isValidGuestId } = await import('../src/routes/user.routes.js');
  assert.equal(isValidGuestId('GUEST_3F9AB0C2D4E5F60718293A4B5C6D7E8F'), true);
  assert.equal(isValidGuestId('GUEST_MVQCFVUF'), false); // old time-based ID
  assert.equal(isValidGuestId('GUEST_3f9ab0c2d4e5f60718293a4b5c6d7e8f'), false);
  assert.equal(isValidGuestId(''), false);
  assert.equal(isValidGuestId(undefined), false);
});

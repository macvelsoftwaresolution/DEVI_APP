import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, IS_PRODUCTION } from '../src/config/security.js';

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

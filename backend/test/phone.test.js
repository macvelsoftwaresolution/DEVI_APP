import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, canonicalPhone, allowedCountries, guestCountries, isGuestCountryNumber } from '../src/utils/phone.js';

afterEach(() => {
  delete process.env.ALLOWED_COUNTRIES;
  delete process.env.GUEST_SOS_COUNTRIES;
});

test('every Indian format becomes E.164', () => {
  for (const raw of ['9876543210', '+919876543210', '+91 98765 43210', '09876543210', '919876543210', 'Amma (9876543210)']) {
    assert.equal(normalizePhone(raw), '+919876543210', raw);
  }
});

test('not a mobile number', () => {
  for (const raw of ['112', '5876543210', '12345', '', undefined, null, 'Amma']) {
    assert.equal(normalizePhone(raw), null, String(raw));
  }
});

test('India only by default: other countries are refused', () => {
  assert.deepEqual(allowedCountries(), ['IN']);
  assert.equal(normalizePhone('+971501234567'), null);
  assert.equal(normalizePhone('+6581234567'), null);
});

test('a country opens only through ALLOWED_COUNTRIES', () => {
  process.env.ALLOWED_COUNTRIES = 'in, ae';
  assert.equal(normalizePhone('+971501234567'), '+971501234567');
  assert.equal(normalizePhone('+919876543210'), '+919876543210');
  assert.equal(normalizePhone('+6581234567'), null);
});

test('ALL opens every country', () => {
  process.env.ALLOWED_COUNTRIES = 'ALL';
  assert.equal(normalizePhone('+6581234567'), '+6581234567');
  assert.equal(normalizePhone('112'), null);
});

test('ALL countries open does not open Instant SOS abroad', () => {
  process.env.ALLOWED_COUNTRIES = 'ALL';
  assert.deepEqual(guestCountries(), ['IN']);
  assert.equal(isGuestCountryNumber('+919876543210'), true);
  assert.equal(isGuestCountryNumber('9876543210'), true);
  assert.equal(isGuestCountryNumber('+971501234567'), false);
  assert.equal(isGuestCountryNumber('GUEST_0123456789ABCDEF0123456789ABCDEF'), false);
});

test('canonicalPhone keeps guest IDs and finds numbers of closed countries', () => {
  assert.equal(canonicalPhone('9876543210'), '+919876543210');
  assert.equal(canonicalPhone('+971501234567'), '+971501234567');
  assert.equal(canonicalPhone('GUEST_0123456789ABCDEF0123456789ABCDEF'), 'GUEST_0123456789ABCDEF0123456789ABCDEF');
  assert.equal(canonicalPhone('INSTANT_SOS'), 'INSTANT_SOS');
});

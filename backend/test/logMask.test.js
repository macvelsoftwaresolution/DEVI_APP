import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskPhone, maskUrl } from '../src/utils/logMask.js';

test('maskPhone keeps only the last 4 digits', () => {
  assert.equal(maskPhone('9876543210'), '******3210');
  assert.equal(maskPhone('+919876543210'), '********3210');
  assert.equal(maskPhone(''), '');
  assert.equal(maskPhone(undefined), '');
  assert.equal(maskPhone('12'), '***');
});

test('maskPhone leaves guest IDs as they are', () => {
  assert.equal(maskPhone('GUEST_MVQCFVUF'), 'GUEST_MVQCFVUF');
});

test('maskUrl hides tracking and control keys', () => {
  assert.equal(
    maskUrl('/api/sos/live/210f4d36-03df-4ffd-8245-6c0706687d91?k=W1aAG_ACu8c6MucVV8qvy8'),
    '/api/sos/live/210f4d36-03df-4ffd-8245-6c0706687d91?k=***'
  );
  assert.equal(maskUrl('/api/sos/evidence/abc?x=1&k=secret&y=2'), '/api/sos/evidence/abc?x=1&k=***&y=2');
  assert.equal(maskUrl('/webhook?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=1'),
    '/webhook?hub.mode=subscribe&hub.verify_token=***&hub.challenge=1');
});

test('maskUrl hides phone numbers in paths', () => {
  assert.equal(maskUrl('/api/user/profile/9876543210'), '/api/user/profile/******3210');
  assert.equal(maskUrl('/api/sos/history/9876543210'), '/api/sos/history/******3210');
});

test('maskUrl leaves ordinary URLs alone', () => {
  assert.equal(maskUrl('/api/dashboard/incidents'), '/api/dashboard/incidents');
  // UUID digit runs are shorter than a phone number
  assert.equal(maskUrl('/api/sos/live/676a1d49-8b11-4b38-86a1-74898030fdaa'), '/api/sos/live/676a1d49-8b11-4b38-86a1-74898030fdaa');
});

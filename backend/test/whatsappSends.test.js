import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, lineFor, failureReason, createWhatsAppSends } from '../src/services/whatsappSends.service.js';
import { blindIndex } from '../src/utils/encryption.js';

// Per-guardian WhatsApp status on the SOS page, from send rows (blind index, no number) and Meta's statuses.

const AMMA = '+919876543210';
const APPA = '+919876543211';

test('one line per guardian: the best status over every attempt, the last failure reason', () => {
  const sends = [
    { message_id: 'm1', phone_hash: blindIndex(AMMA), attempt: 0 },
    { message_id: 'm2', phone_hash: blindIndex(AMMA), attempt: 1 },
    { message_id: 'm3', phone_hash: blindIndex(APPA), attempt: 0 },
  ];
  const statuses = [
    { message_id: 'm1', status: 'sent' },
    { message_id: 'm1', status: 'failed', error_code: 131049 },
    { message_id: 'm2', status: 'delivered' },
    { message_id: 'm3', status: 'failed', error_code: 131049 },
  ];
  const summary = summarize(sends, statuses);
  assert.deepEqual(lineFor(summary, AMMA), { status: 'delivered', attempts: 2, errorCode: 131049, reason: null });
  // Live, 11 Nov: what the dashboard should have shown
  assert.deepEqual(lineFor(summary, '9876543211'), {
    status: 'failed', attempts: 1, errorCode: 131049, reason: 'Held back by Meta: the SOS template is in the Marketing category',
  });
});

test('accepted by Meta with no status yet reads as accepted; a number never sent to has no line', () => {
  const summary = summarize([{ message_id: 'm1', phone_hash: blindIndex(AMMA), attempt: 0 }], []);
  assert.equal(lineFor(summary, AMMA).status, 'accepted');
  assert.equal(lineFor(summary, APPA), null);
});

test('unknown error codes still say which code', () => {
  assert.equal(failureReason(131026), 'Number not on WhatsApp');
  assert.equal(failureReason(999), 'Meta error 999');
  assert.equal(failureReason(null), null);
});

test('recording keeps only the blind index and never throws, even when the table is missing', async () => {
  const rows = [];
  const ok = createWhatsAppSends({ db: { from: () => ({ upsert: async (row) => { rows.push(row); return { error: null }; } }) } });
  await ok.record({ alertId: 'a1', phone: AMMA, messageId: 'm1', attempt: 2 });
  assert.deepEqual(rows, [{ message_id: 'm1', alert_id: 'a1', phone_hash: blindIndex(AMMA), attempt: 2 }]);
  assert.equal(JSON.stringify(rows).includes('9876543210'), false);

  const missing = createWhatsAppSends({ db: { from: () => ({ upsert: async () => ({ error: { code: '42P01', message: 'missing' } }) }) } });
  await missing.record({ alertId: 'a1', phone: AMMA, messageId: 'm1' });
  const down = createWhatsAppSends({ db: { from: () => ({ upsert: async () => { throw new Error('fetch failed'); } }) } });
  await down.record({ alertId: 'a1', phone: AMMA, messageId: 'm1' });
});

test('statuses that cannot be read give an empty summary, not an error page', async () => {
  const down = createWhatsAppSends({ db: { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { code: 'XX', message: 'down' } }) }) }) } });
  assert.equal((await down.forAlert('a1')).size, 0);
});

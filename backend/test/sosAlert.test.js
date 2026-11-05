import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../src/config/supabase.js';
import { SosService } from '../src/services/sos.service.js';
import { GeocodeService } from '../src/services/geocode.service.js';
import { liveTrackSessions } from '../src/services/live-sessions.js';
import { Encryption } from '../src/utils/encryption.js';

const realFrom = supabase.from;
const realGeocode = GeocodeService.reverseGeocode;
const KEY = '11111111-1111-4111-8111-111111111111';
const GPS = { location: 'https://maps.google.com/?q=13,80', latitude: 13.08, longitude: 80.27 };

afterEach(() => {
  supabase.from = realFrom;
  GeocodeService.reverseGeocode = realGeocode;
  liveTrackSessions.clear();
});

// Stand-in for the sos_history calls these tests reach
const fakeTable = ({ onInsert, row = null, updates = [] } = {}) => {
  supabase.from = () => ({
    insert: ([payload]) => ({ select: () => ({ single: async () => onInsert(payload) }) }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
    update: (values) => ({ eq: async () => { updates.push(values); return { error: null }; } }),
  });
};

const saved = (payload) => ({ data: { ...payload, created_at: new Date().toISOString() }, error: null });

test('a slow geocoder cannot hold back saving the alert', async () => {
  const order = [];
  GeocodeService.reverseGeocode = async () => { order.push('geocode'); return 'Anna Nagar'; };
  fakeTable({ onInsert: (payload) => { order.push('insert'); return saved(payload); } });

  const alert = await SosService.createSosAlert({ ...GPS, idempotencyKey: KEY });

  assert.deepEqual(order, ['insert']);
  assert.equal(alert.location, 'GPS 13.08000, 80.27000');
});

test('a quick place name is ready for the first send and is saved encrypted', async () => {
  const updates = [];
  GeocodeService.reverseGeocode = async () => 'Anna Nagar, Chennai';
  fakeTable({ onInsert: saved, updates });
  const alert = await SosService.createSosAlert({ ...GPS, idempotencyKey: KEY });

  await SosService.fillPlaceName(alert);

  assert.equal(alert.location, 'Anna Nagar, Chennai');
  assert.equal(alert.needsPlaceName, undefined);
  assert.equal(updates.length, 1);
  assert.ok(Encryption.isCurrent(updates[0].location_address));
});

test('a hanging geocoder delays the send only by the wait, and a late answer is still saved', async () => {
  const updates = [];
  let answer;
  GeocodeService.reverseGeocode = () => new Promise((resolve) => { answer = resolve; });
  fakeTable({ onInsert: saved, updates });
  const alert = await SosService.createSosAlert({ ...GPS, idempotencyKey: KEY });

  await SosService.fillPlaceName(alert, 10);
  assert.equal(alert.location, 'GPS 13.08000, 80.27000');

  answer('Anna Nagar');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(alert.location, 'Anna Nagar');
  assert.equal(updates.length, 1);
});

test('a failing geocoder leaves the GPS text and never fails the SOS', async () => {
  GeocodeService.reverseGeocode = async () => { throw new Error('down'); };
  fakeTable({ onInsert: saved });
  const alert = await SosService.createSosAlert({ ...GPS, idempotencyKey: KEY });

  await SosService.fillPlaceName(alert);
  assert.equal(alert.location, 'GPS 13.08000, 80.27000');
});

test('no GPS fix: saved without any place lookup', async () => {
  let looked = false;
  GeocodeService.reverseGeocode = async () => { looked = true; return 'x'; };
  fakeTable({ onInsert: saved });
  const alert = await SosService.createSosAlert({ location: '', latitude: null, longitude: null, idempotencyKey: KEY });

  await SosService.fillPlaceName(alert);
  assert.equal(looked, false);
  assert.equal(alert.location, 'Location not yet available');
});

test('a retry racing the original gets the first alert, no second alert is inserted', async () => {
  let inserts = 0;
  const first = {
    id: '22222222-2222-4222-8222-222222222222',
    idempotency_key: KEY,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    location_address: null,
  };
  fakeTable({
    row: first,
    onInsert: () => {
      inserts += 1;
      return {
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint "sos_history_idempotency_key_key"' },
      };
    },
  });

  const alert = await SosService.createSosAlert({ ...GPS, idempotencyKey: KEY });

  assert.equal(inserts, 1);
  assert.equal(alert.duplicate, true);
  assert.equal(alert.id, first.id);
});

test('retry decisions use the saved status, not memory', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  liveTrackSessions.set(id, { id, status: 'RESOLVED' });
  fakeTable({ row: { status: 'ACTIVE' } });
  assert.equal(await SosService.getSavedAlertStatus(id), 'ACTIVE');
});

test('a database error while reading the status reads as unknown, so retries continue', async () => {
  supabase.from = () => { throw new Error('db down'); };
  assert.equal(await SosService.getSavedAlertStatus('a1'), null);
});

test('the geocode cache has a limit', () => {
  GeocodeService.geocodeCache.clear();
  for (let i = 0; i < 10001; i += 1) GeocodeService.remember(`k${i}`, 'p');
  assert.equal(GeocodeService.geocodeCache.size, 10000);
  assert.equal(GeocodeService.geocodeCache.has('k0'), false);
  GeocodeService.geocodeCache.clear();
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeEqual,
  signUserToken,
  signAdminToken,
  decodeAdminToken,
  verifyAdmin,
  verifyToken,
  signSosControlToken,
  verifySosControlToken,
  canResolveSos,
  requireSosControlHeaders,
  sosResolver,
  isTrackingLinkExpired,
  TRACKING_LINK_GRACE_MS,
  provenSosAlertIds,
  MAX_CLAIM_ALERTS,
} from '../src/middlewares/auth.middleware.js';
import jwt from 'jsonwebtoken';
import { ADMIN_SECRET_KEY, ADMIN_JWT_SECRET } from '../src/config/security.js';

// Minimal Express req/res doubles
const mockReq = (headers = {}) => ({ headers, get: (name) => headers[name.toLowerCase()] });
const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const runMiddleware = (middleware, req) => {
  const res = mockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
};

test('safeEqual compares strings in constant time', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual(undefined, ''), true);
});

test('SOS control token only works for its own alert', () => {
  const token = signSosControlToken('alert-1');
  assert.equal(verifySosControlToken('alert-1', token), true);
  assert.equal(verifySosControlToken('alert-2', token), false);
  assert.equal(verifySosControlToken('alert-1', 'wrong'), false);
  assert.equal(verifySosControlToken('alert-1', undefined), false);
});

test('admin token decodes as admin, user token does not', () => {
  assert.equal(decodeAdminToken(signAdminToken('admin'))?.role, 'admin');
  assert.equal(decodeAdminToken(signUserToken({ id: 1, name: 'A' }, '9876543210')), null);
  assert.equal(decodeAdminToken('not-a-token'), null);
  assert.equal(decodeAdminToken(undefined), null);
});

test('admin token from before a password change is refused', () => {
  // Same secret, but signed without (or with an old) password version
  const oldToken = jwt.sign({ role: 'admin', username: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '1h' });
  const otherVersion = jwt.sign({ role: 'admin', username: 'admin', pv: 'old-version' }, ADMIN_JWT_SECRET, { expiresIn: '1h' });
  assert.equal(decodeAdminToken(oldToken), null);
  assert.equal(decodeAdminToken(otherVersion), null);
});

test('verifyAdmin accepts admin token or x-admin-key, rejects others', () => {
  assert.equal(runMiddleware(verifyAdmin, mockReq({ authorization: `Bearer ${signAdminToken('admin')}` })).nextCalled, true);
  assert.equal(runMiddleware(verifyAdmin, mockReq({ 'x-admin-key': ADMIN_SECRET_KEY })).nextCalled, true);

  const userToken = signUserToken({ id: 1 }, '9876543210');
  const asUser = runMiddleware(verifyAdmin, mockReq({ authorization: `Bearer ${userToken}` }));
  assert.equal(asUser.nextCalled, false);
  assert.equal(asUser.res.statusCode, 401);

  assert.equal(runMiddleware(verifyAdmin, mockReq({ 'x-admin-key': 'wrong' })).nextCalled, false);
  assert.equal(runMiddleware(verifyAdmin, mockReq()).nextCalled, false);
});

test('verifyToken attaches the user and rejects missing or bad tokens', () => {
  const req = mockReq({ authorization: `Bearer ${signUserToken({ id: 7, name: 'Priya' }, '9876543210')}` });
  const ok = runMiddleware(verifyToken, req);
  assert.equal(ok.nextCalled, true);
  assert.equal(req.user.phone, '9876543210');

  assert.equal(runMiddleware(verifyToken, mockReq()).res.statusCode, 401);
  assert.equal(runMiddleware(verifyToken, mockReq({ authorization: 'Bearer junk' })).res.statusCode, 403);
});

test('canResolveSos: only the creating device, an admin or the logged-in owner can resolve', () => {
  const alertId = '42';
  // Knowing the alert ID (or anything else) without a credential is not enough
  assert.equal(canResolveSos({ alertId }), false);
  assert.equal(canResolveSos({ alertId, controlToken: 'guess' }), false);
  assert.equal(canResolveSos({ alertId, controlToken: signSosControlToken('43') }), false);

  assert.equal(canResolveSos({ alertId, controlToken: signSosControlToken(alertId) }), true);
  assert.equal(canResolveSos({ alertId, adminToken: signAdminToken('admin') }), true);

  const owner = { id: 'u-1', isGuest: false };
  assert.equal(canResolveSos({ alertId, user: owner, ownerId: 'u-1' }), true);
  assert.equal(canResolveSos({ alertId, user: owner, ownerId: 'u-2' }), false);
  assert.equal(canResolveSos({ alertId, user: owner, ownerId: null }), false);
  assert.equal(canResolveSos({ alertId, user: { id: 'u-1', isGuest: true }, ownerId: 'u-1' }), false);
});

test('sosResolver: SAFE only when she closes it herself, an admin close is "admin"', () => {
  const alertId = '42';
  const owner = { id: 'u-1', isGuest: false };
  assert.equal(sosResolver({ alertId, controlToken: signSosControlToken(alertId) }), 'user');
  assert.equal(sosResolver({ alertId, user: owner, ownerId: 'u-1' }), 'user');
  assert.equal(sosResolver({ alertId, adminToken: signAdminToken('admin') }), 'admin');
  // The device closing it counts as her, even when an admin token is also sent
  assert.equal(
    sosResolver({ alertId, controlToken: signSosControlToken(alertId), adminToken: signAdminToken('admin') }),
    'user'
  );
  assert.equal(sosResolver({ alertId, controlToken: 'guess' }), null);
});

test('isTrackingLinkExpired: guardian links expire 24h after resolve, never while active', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const hoursAgo = (h) => new Date(now - h * 60 * 60 * 1000).toISOString();

  assert.equal(isTrackingLinkExpired(null, now), false);
  assert.equal(isTrackingLinkExpired({ status: 'ACTIVE', timestamp: hoursAgo(100) }, now), false);
  assert.equal(isTrackingLinkExpired({ status: 'active', timestamp: hoursAgo(100) }, now), false);

  assert.equal(isTrackingLinkExpired({ status: 'RESOLVED', resolvedTime: hoursAgo(23) }, now), false);
  assert.equal(isTrackingLinkExpired({ status: 'RESOLVED', resolvedTime: hoursAgo(25) }, now), true);
  // No resolve time known: falls back to the alert time
  assert.equal(isTrackingLinkExpired({ status: 'RESOLVED', timestamp: hoursAgo(25) }, now), true);
  // Resolved with no usable time at all: treat as expired
  assert.equal(isTrackingLinkExpired({ status: 'RESOLVED' }, now), true);
  assert.equal(TRACKING_LINK_GRACE_MS, 24 * 60 * 60 * 1000);
});

test('R8: admin and user tokens are signed with different secrets', () => {
  const adminToken = signAdminToken('admin');
  const userToken = signUserToken({ id: 1 }, '9876543210');
  // An admin token is not a user login, and a user token is not an admin login
  assert.equal(runMiddleware(verifyToken, mockReq({ authorization: `Bearer ${adminToken}` })).res.statusCode, 403);
  assert.equal(decodeAdminToken(userToken), null);
  assert.ok(decodeAdminToken(adminToken));
});

test('R15: upload is refused from the headers alone, before any file is read', () => {
  const alertId = 'alert-15';
  const ok = mockReq({ 'x-alert-id': alertId, 'x-sos-token': signSosControlToken(alertId) });
  const passed = runMiddleware(requireSosControlHeaders, ok);
  assert.equal(passed.nextCalled, true);
  assert.equal(ok.sosAlertId, alertId);

  // Missing alert ID, missing token, or a token for another alert: 403 and next() never runs
  for (const headers of [
    { 'x-sos-token': signSosControlToken(alertId) },
    { 'x-alert-id': alertId },
    { 'x-alert-id': alertId, 'x-sos-token': signSosControlToken('other') },
    {},
  ]) {
    const r = runMiddleware(requireSosControlHeaders, mockReq(headers));
    assert.equal(r.nextCalled, false);
    assert.equal(r.res.statusCode, 403);
  }
});

test('Guest alert claim: only alerts with their own control token are accepted', () => {
  const alerts = [
    { alertId: '101', controlToken: signSosControlToken('101') },
    { alertId: '102', controlToken: signSosControlToken('999') }, // token for another alert
    { alertId: '103' }, // no token
    { alertId: 104, controlToken: signSosControlToken('104') }, // numeric ID
    { alertId: '101', controlToken: signSosControlToken('101') }, // duplicate
  ];
  assert.deepEqual(provenSosAlertIds(alerts), ['101', '104']);
  assert.deepEqual(provenSosAlertIds(undefined), []);
  assert.deepEqual(provenSosAlertIds('101'), []);

  const many = Array.from({ length: MAX_CLAIM_ALERTS + 10 }, (_, i) => ({
    alertId: String(i),
    controlToken: signSosControlToken(String(i)),
  }));
  assert.equal(provenSosAlertIds(many).length, MAX_CLAIM_ALERTS);
});

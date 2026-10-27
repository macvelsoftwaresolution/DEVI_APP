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
} from '../src/middlewares/auth.middleware.js';
import { ADMIN_SECRET_KEY } from '../src/config/security.js';

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

test('R8: admin and user tokens are signed with different secrets', () => {
  const adminToken = signAdminToken('admin');
  const userToken = signUserToken({ id: 1 }, '9876543210');
  // An admin token is not a user login, and a user token is not an admin login
  assert.equal(runMiddleware(verifyToken, mockReq({ authorization: `Bearer ${adminToken}` })).res.statusCode, 403);
  assert.equal(decodeAdminToken(userToken), null);
  assert.ok(decodeAdminToken(adminToken));
});

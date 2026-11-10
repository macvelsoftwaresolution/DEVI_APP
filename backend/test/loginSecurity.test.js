import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { base32Encode, base32Decode, totpCode, totpCounter, verifyTotp, generateTotpSecret, otpauthUrl } from '../src/utils/totp.js';
import { createSessions, sessions } from '../src/services/sessions.service.js';
import { signUserToken, verifyToken, optionalToken, signAdminToken, decodeAdminToken } from '../src/middlewares/auth.middleware.js';
import adminRoutes, { takeTotpStep } from '../src/routes/admin.routes.js';
import { hashPassword } from '../src/utils/password.js';

// Token revoke for app users, and one admin account per operator with 2FA.

// --- TOTP ---

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890". Its 8-digit codes end in our 6 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('TOTP matches the RFC 6238 test vectors', () => {
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totpCode(RFC_SECRET, totpCounter(59 * 1000)), '287082');
  assert.equal(totpCode(RFC_SECRET, totpCounter(1111111109 * 1000)), '081804');
  assert.equal(totpCode(RFC_SECRET, totpCounter(1234567890 * 1000)), '005924');
  assert.equal(totpCode(RFC_SECRET, totpCounter(2000000000 * 1000)), '279037');
});

test('base32 round trips any bytes, and new secrets are 160 bits', () => {
  for (let i = 0; i < 50; i += 1) {
    const buf = crypto.randomBytes(1 + (i % 40));
    assert.equal(base32Decode(base32Encode(buf)).toString('hex'), buf.toString('hex'));
  }
  assert.equal(base32Decode(generateTotpSecret()).length, 20);
  assert.equal(base32Decode('gezd gnbv-gy3t').toString('hex'), base32Decode('GEZDGNBVGY3T').toString('hex'));
  assert.throws(() => base32Decode('GEZ1'));
});

test('a code is accepted one step either side for clock drift, not further', () => {
  const now = 1_800_000_000_000;
  const step = totpCounter(now);
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now), step);
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now), step - 1);
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now), step + 1);
  assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now), null);
  assert.equal(verifyTotp(RFC_SECRET, '12345', now), null);
  assert.equal(verifyTotp(RFC_SECRET, 'abcdef', now), null);
  assert.equal(verifyTotp(RFC_SECRET, undefined, now), null);
});

test('a code works once per account', () => {
  const id = crypto.randomUUID();
  assert.equal(takeTotpStep(id, 100), true);
  assert.equal(takeTotpStep(id, 100), false);
  assert.equal(takeTotpStep(id, 99), false);
  assert.equal(takeTotpStep(id, 101), true);
  assert.equal(takeTotpStep(id, null), false);
});

test('the setup link names the account and carries the secret', () => {
  assert.equal(otpauthUrl('ravi', 'ABC'), 'otpauth://totp/DEVI%20Admin%3Aravi?secret=ABC&issuer=DEVI%20Admin&algorithm=SHA1&digits=6&period=30');
});

// --- User token versions ---

const fakeDb = (tables) => ({
  from: (table) => {
    const q = { filters: [], values: null };
    const run = async (single) => {
      if (tables[table] instanceof Error) return { data: null, error: tables[table] };
      const rows = tables[table].filter((r) => q.filters.every((f) => f(r)));
      if (q.values) rows.forEach((r) => Object.assign(r, q.values));
      return { data: single ? rows[0] || null : rows, error: null };
    };
    const api = {
      select: () => api,
      update: (values) => { q.values = values; return api; },
      eq: (c, v) => { q.filters.push((r) => r[c] === v); return api; },
      maybeSingle: () => run(true),
      then: (resolve, reject) => run(false).then(resolve, reject),
    };
    return api;
  },
});

test('the user token version is read, cached, and raised by revoke', async () => {
  const users = [{ id: 'u1', token_version: 2 }];
  let t = 0;
  const s = createSessions({ db: fakeDb({ users }), now: () => t });
  assert.equal(await s.userTokenVersion('u1'), 2);
  users[0].token_version = 9; // another server revoked
  assert.equal(await s.userTokenVersion('u1'), 2); // cached
  t += 61_000;
  assert.equal(await s.userTokenVersion('u1'), 9);
  assert.equal(await s.revokeUser('u1'), 10);
  assert.equal(await s.userTokenVersion('u1'), 10); // at once on this server
  assert.equal(await s.revokeUser('nobody'), null);
});

test('before db/login-security.sql every token is version 0; a database failure is unknown', async () => {
  const missing = Object.assign(new Error('column users.token_version does not exist'), { code: '42703' });
  assert.equal(await createSessions({ db: fakeDb({ users: missing }) }).userTokenVersion('u1'), 0);
  const down = Object.assign(new Error('fetch failed'), { code: undefined });
  assert.equal(await createSessions({ db: fakeDb({ users: down }) }).userTokenVersion('u1'), null);
});

// --- The middleware ---

const realVersion = sessions.userTokenVersion;
afterEach(() => { sessions.userTokenVersion = realVersion; });

const reqWith = (token) => ({ headers: { authorization: `Bearer ${token}` } });
const resDouble = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

test('a token from before a sign-out is refused', async () => {
  sessions.userTokenVersion = async () => 1;
  const res = resDouble();
  let next = false;
  await verifyToken(reqWith(signUserToken({ id: 'u1' }, '+919876543210', 0)), res, () => { next = true; });
  assert.equal(next, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'SIGNED_OUT');

  const fresh = reqWith(signUserToken({ id: 'u1' }, '+919876543210', 1));
  await verifyToken(fresh, resDouble(), () => { next = true; });
  assert.equal(next, true);
});

test('old tokens without a version count as version 0', async () => {
  sessions.userTokenVersion = async () => 0;
  let next = false;
  const legacy = (await import('jsonwebtoken')).default.sign({ id: 'u1', phone: '+919876543210' }, (await import('../src/config/security.js')).JWT_SECRET);
  await verifyToken(reqWith(legacy), resDouble(), () => { next = true; });
  assert.equal(next, true);
});

test('when the version cannot be read, the token is accepted (an SOS must not wait on this)', async () => {
  sessions.userTokenVersion = async () => null;
  let next = false;
  await verifyToken(reqWith(signUserToken({ id: 'u1' }, '+919876543210', 0)), resDouble(), () => { next = true; });
  assert.equal(next, true);
});

test('a signed-out token on the SOS route goes through as a guest, never refused', async () => {
  sessions.userTokenVersion = async () => 3;
  const req = reqWith(signUserToken({ id: 'u1' }, '+919876543210', 0));
  let next = false;
  await optionalToken(req, resDouble(), () => { next = true; });
  assert.equal(next, true);
  assert.equal(req.user, undefined);
});

// --- Admin tokens ---

test('an operator token ends when the account is disabled or signed out everywhere', async () => {
  const admins = [{ id: 'a1', disabled: false, token_version: 0 }];
  const s = createSessions({ db: fakeDb({ admin_users: admins }) });
  assert.equal(s.adminTokenValid('a1', 0), null); // not loaded yet: the signature decides
  await s.refreshAdmins();
  assert.equal(s.adminTokenValid('a1', 0), true);
  assert.equal(s.adminTokenValid('gone', 0), false);
  admins[0].token_version = 1;
  await s.refreshAdmins();
  assert.equal(s.adminTokenValid('a1', 0), false);
  assert.equal(s.adminTokenValid('a1', 1), true);
  admins[0].disabled = true;
  await s.refreshAdmins();
  assert.equal(s.adminTokenValid('a1', 1), false);
});

test('decodeAdminToken asks the account list for operator tokens', () => {
  const real = sessions.adminTokenValid;
  try {
    const token = signAdminToken('ravi', { id: 'a1', token_version: 2 });
    sessions.adminTokenValid = (id, tv) => id === 'a1' && tv === 2;
    assert.equal(decodeAdminToken(token).username, 'ravi');
    sessions.adminTokenValid = () => false;
    assert.equal(decodeAdminToken(token), null);
  } finally {
    sessions.adminTokenValid = real;
  }
});

test('ADMIN_ENV_LOGIN=off ends the shared .env admin and its open sessions', () => {
  const token = signAdminToken('admin');
  const before = process.env.ADMIN_ENV_LOGIN;
  try {
    assert.ok(decodeAdminToken(token));
    process.env.ADMIN_ENV_LOGIN = 'off';
    assert.equal(decodeAdminToken(token), null);
  } finally {
    if (before === undefined) delete process.env.ADMIN_ENV_LOGIN; else process.env.ADMIN_ENV_LOGIN = before;
  }
});

// --- Admin login with 2FA ---

let server;
let base;
const realFind = sessions.findAdmin;
const realLoggedIn = sessions.adminLoggedIn;
const SECRET = generateTotpSecret();
let account;

before(async () => {
  account = { id: crypto.randomUUID(), username: 'ravi', password_hash: await hashPassword('correct horse battery'), totpSecret: SECRET, disabled: false, token_version: 0 };
  sessions.findAdmin = async (name) => (name.toLowerCase() === 'ravi' ? account : null);
  sessions.adminLoggedIn = async () => {};
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});

after(() => {
  sessions.findAdmin = realFind;
  sessions.adminLoggedIn = realLoggedIn;
  server.close();
});

const login = async (body) => {
  const res = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('operator login: password first, then the code is asked for', async () => {
  const r = await login({ username: 'ravi', password: 'correct horse battery' });
  assert.equal(r.status, 401);
  assert.equal(r.body.needCode, true);
  assert.equal(r.body.token, undefined);
});

test('operator login: the right code gives an operator token, and the same code fails a second time', async () => {
  account.id = crypto.randomUUID(); // fresh replay memory
  const code = totpCode(SECRET, totpCounter());
  const ok = await login({ username: 'Ravi', password: 'correct horse battery', code });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.twoFactor, true);
  const payload = JSON.parse(Buffer.from(ok.body.token.split('.')[1], 'base64url').toString());
  assert.equal(payload.sub, account.id);
  assert.equal(payload.av, 0);
  assert.equal(payload.pv, undefined);

  const again = await login({ username: 'ravi', password: 'correct horse battery', code });
  assert.equal(again.status, 401);
  assert.equal(again.body.needCode, true);
});

test('operator login: a wrong password never reveals that a code would be next', async () => {
  const r = await login({ username: 'ravi', password: 'wrong password here', code: '123456' });
  assert.equal(r.status, 401);
  assert.equal(r.body.needCode, undefined);
});

test('operator login: a wrong code or a disabled account is refused', async () => {
  const wrong = await login({ username: 'ravi', password: 'correct horse battery', code: '000000' });
  assert.equal(wrong.status, 401);
  account.disabled = true;
  try {
    const off = await login({ username: 'ravi', password: 'correct horse battery', code: totpCode(SECRET, totpCounter()) });
    assert.equal(off.status, 401);
    assert.equal(off.body.needCode, undefined);
  } finally {
    account.disabled = false;
  }
});

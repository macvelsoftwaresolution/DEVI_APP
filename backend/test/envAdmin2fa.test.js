import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { hashPassword } from '../src/utils/password.js';
import { generateTotpSecret, totpCode, totpCounter } from '../src/utils/totp.js';

// The .env admin (ADMIN_USERNAME + ADMIN_PASSWORD_HASH) with 2FA (ADMIN_TOTP_SECRET).

const SECRET = generateTotpSecret();
const PASSWORD = 'my own long password 42';

let server;
let base;
let decodeAdminToken;
const events = [];

before(async () => {
  // Before the config loads: this file's own .env admin
  process.env.ADMIN_USERNAME = 'opslead';
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(PASSWORD);
  process.env.ADMIN_TOTP_SECRET = SECRET;
  const { default: adminRoutes } = await import('../src/routes/admin.routes.js');
  const { sessions } = await import('../src/services/sessions.service.js');
  const { audit } = await import('../src/services/audit.service.js');
  ({ decodeAdminToken } = await import('../src/middlewares/auth.middleware.js'));
  sessions.findAdmin = async () => null; // no operator accounts
  audit.record = async (e) => { events.push(e); return true; };

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});

after(() => server.close());

const login = async (body) => {
  const res = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('the right password alone is not enough: the code is asked for', async () => {
  const r = await login({ username: 'opslead', password: PASSWORD });
  assert.equal(r.status, 401);
  assert.equal(r.body.needCode, true);
  assert.equal(r.body.token, undefined);
});

test('a wrong password never reaches the code step', async () => {
  const r = await login({ username: 'opslead', password: 'not my password at all', code: totpCode(SECRET, totpCounter()) });
  assert.equal(r.status, 401);
  assert.equal(r.body.needCode, undefined);
});

test('password and code sign in; the token says 2FA; the same code fails again', async () => {
  const code = totpCode(SECRET, totpCounter());
  const ok = await login({ username: 'opslead', password: PASSWORD, code });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.twoFactor, true);
  const decoded = decodeAdminToken(ok.body.token);
  assert.equal(decoded.username, 'opslead');
  assert.equal(decoded.mfa, true);

  const again = await login({ username: 'opslead', password: PASSWORD, code });
  assert.equal(again.status, 401);
  assert.equal(again.body.needCode, true);
});

test('verify reports the .env admin with 2FA', async () => {
  const code = totpCode(SECRET, totpCounter() + 1);
  const { body } = await login({ username: 'opslead', password: PASSWORD, code });
  const res = await fetch(`${base}/verify`, { headers: { Authorization: `Bearer ${body.token}` } });
  const v = await res.json();
  assert.equal(v.twoFactor, true);
  assert.equal(v.account, 'env');
});

test('a wrong code is refused and recorded', async () => {
  events.length = 0;
  const r = await login({ username: 'opslead', password: PASSWORD, code: '000000' });
  assert.equal(r.status, 401);
  assert.deepEqual(events.map((e) => [e.action, e.detail?.reason]), [['login_failed', 'code']]);
});

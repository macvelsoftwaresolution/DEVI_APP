import { Router } from 'express';
import { ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_DEV_PASSWORD, ADMIN_TOKEN_EXPIRY, ADMIN_TOTP_SECRET } from '../config/security.js';
import { verifyPassword } from '../utils/password.js';
import { verifyTotp } from '../utils/totp.js';
import { safeEqual, signAdminToken, verifyAdmin, envAdminLoginEnabled } from '../middlewares/auth.middleware.js';
import { adminLoginLimiter } from '../middlewares/rateLimiter.js';
import { sessions } from '../services/sessions.service.js';
import { audit } from '../services/audit.service.js';

// Sign-in attempts in the audit log. A failed one keeps the name typed, cut short, so a guessing
// run shows up; it is never a password.
const loginAudit = (req, username, action, detail = null) =>
  audit.record({ admin: String(username || '').trim().slice(0, 40) || 'unknown', action, ip: req.ip, detail });

const router = Router();

const refuse = (res) => res.status(401).json({ success: false, message: 'Invalid username or password' });

// Each 30-second code works once per account, so a code seen over a shoulder cannot be reused
const usedSteps = new Map(); // admin id -> last accepted time step
export const takeTotpStep = (adminId, step) => {
  if (step == null || (usedSteps.get(adminId) ?? -1) >= step) return false;
  usedSteps.set(adminId, step);
  return true;
};

/**
 * POST /api/admin/login - Admin dashboard sign in.
 * Operator accounts (admin_users, npm run admin:user): username, password and the 6-digit code
 * from the authenticator app. Without a code the answer is 401 with needCode, so the page asks.
 * The shared .env admin (ADMIN_USERNAME + ADMIN_PASSWORD_HASH): no code, until ADMIN_ENV_LOGIN=off.
 */
router.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const { username, password, code } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    // Hashing is slow on purpose: refuse oversized input before it reaches scrypt
    if (String(password).length > 200 || String(username).length > 100) return refuse(res);

    const name = String(username).trim();
    const account = await sessions.findAdmin(name);

    if (account) {
      const passOk = await verifyPassword(String(password), account.password_hash);
      if (!passOk || account.disabled) {
        console.warn(`⚠️ [ADMIN LOGIN FAILED] ${account.username} from IP: ${req.ip}${account.disabled ? ' (disabled)' : ''}`);
        loginAudit(req, account.username, 'login_failed', { reason: account.disabled ? 'disabled' : 'password' });
        return refuse(res);
      }
      if (!code) {
        return res.status(401).json({ success: false, needCode: true, message: 'Enter the 6-digit code from your authenticator app' });
      }
      if (!takeTotpStep(account.id, verifyTotp(account.totpSecret, code))) {
        console.warn(`⚠️ [ADMIN LOGIN FAILED] ${account.username} from IP: ${req.ip} (wrong code)`);
        loginAudit(req, account.username, 'login_failed', { reason: 'code' });
        return res.status(401).json({ success: false, needCode: true, message: 'Wrong or expired code. Please try again.' });
      }
      await sessions.adminLoggedIn(account.id).catch(() => {});
      console.log(`✅ [ADMIN LOGIN] ${account.username} (2FA) from IP: ${req.ip}`);
      audit.record({ admin: { username: account.username, sub: account.id }, action: 'login', ip: req.ip, detail: { twoFactor: true } });
      return res.json({ success: true, token: signAdminToken(account.username, account), expiresIn: ADMIN_TOKEN_EXPIRY, username: account.username, twoFactor: true });
    }

    // Check both fields every time so response time does not reveal which one was wrong
    const userOk = safeEqual(name, ADMIN_USERNAME);
    const passOk = ADMIN_PASSWORD_HASH
      ? await verifyPassword(String(password), ADMIN_PASSWORD_HASH)
      : !!ADMIN_DEV_PASSWORD && safeEqual(String(password), ADMIN_DEV_PASSWORD);
    if (!userOk || !passOk || !envAdminLoginEnabled()) {
      console.warn(`⚠️ [ADMIN LOGIN FAILED] IP: ${req.ip}${userOk && passOk ? ' (.env admin is off: ADMIN_ENV_LOGIN=off)' : ''}`);
      loginAudit(req, name, 'login_failed', { reason: userOk && passOk ? 'shared_login_off' : 'password' });
      return refuse(res);
    }

    // 2FA for the .env admin (ADMIN_TOTP_SECRET): asked for only after a right password
    if (ADMIN_TOTP_SECRET) {
      if (!code) {
        return res.status(401).json({ success: false, needCode: true, message: 'Enter the 6-digit code from your authenticator app' });
      }
      if (!takeTotpStep('env-admin', verifyTotp(ADMIN_TOTP_SECRET, code))) {
        console.warn(`⚠️ [ADMIN LOGIN FAILED] ${ADMIN_USERNAME} from IP: ${req.ip} (wrong code)`);
        loginAudit(req, ADMIN_USERNAME, 'login_failed', { reason: 'code' });
        return res.status(401).json({ success: false, needCode: true, message: 'Wrong or expired code. Please try again.' });
      }
      console.log(`✅ [ADMIN LOGIN] ${ADMIN_USERNAME} (.env admin, 2FA) from IP: ${req.ip}`);
    } else {
      console.warn(`⚠️ [ADMIN LOGIN] ${ADMIN_USERNAME} (.env admin, no 2FA) from IP: ${req.ip}. Add 2FA with npm run admin:2fa.`);
    }
    const mfa = !!ADMIN_TOTP_SECRET;
    audit.record({ admin: ADMIN_USERNAME, action: 'login', ip: req.ip, detail: { twoFactor: mfa } });
    res.json({ success: true, token: signAdminToken(ADMIN_USERNAME, null, { mfa }), expiresIn: ADMIN_TOKEN_EXPIRY, username: ADMIN_USERNAME, twoFactor: mfa });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/verify - Check that the stored admin token is still valid
router.get('/verify', verifyAdmin, (req, res) => {
  res.json({
    success: true,
    username: req.admin.username,
    twoFactor: !!(req.admin.sub || req.admin.mfa),
    account: req.admin.sub ? 'operator' : 'env',
  });
});

// POST /api/admin/logout-all - Ends every session of this operator account, on every browser
router.post('/logout-all', verifyAdmin, async (req, res, next) => {
  try {
    if (!req.admin.sub) {
      return res.status(400).json({ success: false, message: 'The .env admin signs out everywhere by changing its password (npm run admin:hash) or its 2FA key (npm run admin:2fa).' });
    }
    await sessions.revokeAdmin(req.admin.sub);
    console.log(`🔒 [ADMIN SIGNED OUT EVERYWHERE] ${req.admin.username}`);
    audit.record({ admin: req.admin, action: 'logout_all', ip: req.ip });
    res.json({ success: true, message: 'Signed out on every browser.' });
  } catch (err) {
    next(err);
  }
});

export default router;

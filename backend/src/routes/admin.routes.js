import { Router } from 'express';
import { ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_DEV_PASSWORD, ADMIN_TOKEN_EXPIRY } from '../config/security.js';
import { verifyPassword } from '../utils/password.js';
import { verifyTotp } from '../utils/totp.js';
import { safeEqual, signAdminToken, verifyAdmin, envAdminLoginEnabled } from '../middlewares/auth.middleware.js';
import { adminLoginLimiter } from '../middlewares/rateLimiter.js';
import { sessions } from '../services/sessions.service.js';

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
        return refuse(res);
      }
      if (!code) {
        return res.status(401).json({ success: false, needCode: true, message: 'Enter the 6-digit code from your authenticator app' });
      }
      if (!takeTotpStep(account.id, verifyTotp(account.totpSecret, code))) {
        console.warn(`⚠️ [ADMIN LOGIN FAILED] ${account.username} from IP: ${req.ip} (wrong code)`);
        return res.status(401).json({ success: false, needCode: true, message: 'Wrong or expired code. Please try again.' });
      }
      await sessions.adminLoggedIn(account.id).catch(() => {});
      console.log(`✅ [ADMIN LOGIN] ${account.username} (2FA) from IP: ${req.ip}`);
      return res.json({ success: true, token: signAdminToken(account.username, account), expiresIn: ADMIN_TOKEN_EXPIRY, username: account.username, twoFactor: true });
    }

    // Check both fields every time so response time does not reveal which one was wrong
    const userOk = safeEqual(name, ADMIN_USERNAME);
    const passOk = ADMIN_PASSWORD_HASH
      ? await verifyPassword(String(password), ADMIN_PASSWORD_HASH)
      : !!ADMIN_DEV_PASSWORD && safeEqual(String(password), ADMIN_DEV_PASSWORD);
    if (!userOk || !passOk || !envAdminLoginEnabled()) {
      console.warn(`⚠️ [ADMIN LOGIN FAILED] IP: ${req.ip}${userOk && passOk ? ' (.env admin is off: ADMIN_ENV_LOGIN=off)' : ''}`);
      return refuse(res);
    }

    console.warn(`⚠️ [ADMIN LOGIN] ${ADMIN_USERNAME} (shared .env admin, no 2FA) from IP: ${req.ip}. Create operator accounts with npm run admin:user and set ADMIN_ENV_LOGIN=off.`);
    res.json({ success: true, token: signAdminToken(ADMIN_USERNAME), expiresIn: ADMIN_TOKEN_EXPIRY, username: ADMIN_USERNAME, twoFactor: false });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/verify - Check that the stored admin token is still valid
router.get('/verify', verifyAdmin, (req, res) => {
  res.json({ success: true, username: req.admin.username, twoFactor: !!req.admin.sub });
});

// POST /api/admin/logout-all - Ends every session of this operator account, on every browser
router.post('/logout-all', verifyAdmin, async (req, res, next) => {
  try {
    if (!req.admin.sub) {
      return res.status(400).json({ success: false, message: 'The shared .env admin signs out everywhere by changing its password (npm run admin:hash).' });
    }
    await sessions.revokeAdmin(req.admin.sub);
    console.log(`🔒 [ADMIN SIGNED OUT EVERYWHERE] ${req.admin.username}`);
    res.json({ success: true, message: 'Signed out on every browser.' });
  } catch (err) {
    next(err);
  }
});

export default router;

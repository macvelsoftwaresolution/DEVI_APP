import { Router } from 'express';
import { ADMIN_TOKEN_EXPIRY } from '../config/security.js';
import {
  signAdminToken,
  signAdmin2faChallenge,
  verifyAdmin2faChallenge,
  verifyAdmin,
} from '../middlewares/auth.middleware.js';
import { requireActiveAdmin } from '../middlewares/adminSession.js';
import { adminLoginLimiter } from '../middlewares/rateLimiter.js';
import { AdminService, LOCK_MINUTES } from '../services/admin.service.js';
import { verifyPassword, DUMMY_HASH } from '../utils/password.js';
import { generateTotpSecret, verifyTotp, otpauthUrl } from '../utils/totp.js';

const router = Router();

// Same answer for unknown user, wrong password and disabled account, so usernames cannot be probed
const invalidLogin = (res) =>
  res.status(401).json({ success: false, message: 'Invalid username or password' });

// POST /api/admin/login - Step 1: username + password (accounts in the admins table, R4)
// Answers with the next step: 'totp' (enter the 6-digit code) or 'setup' (first login: add the
// account to an authenticator app). Never a dashboard token: that needs the code too.
router.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const admin = await AdminService.findByUsername(username);
    // Hash check runs even for unknown usernames, so response time does not reveal which ones exist
    const passwordOk = await verifyPassword(String(password), admin?.passwordHash || DUMMY_HASH);

    if (!admin || !admin.isActive) {
      await AdminService.audit({ username: String(username).slice(0, 64), action: 'login_failed', ip: req.ip });
      return invalidLogin(res);
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      await AdminService.audit({ admin, action: 'login_locked', ip: req.ip });
      return res.status(423).json({
        success: false,
        message: `Too many wrong passwords. This account is locked for ${LOCK_MINUTES} minutes.`,
      });
    }

    if (!passwordOk) {
      const locked = await AdminService.recordFailedLogin(admin);
      await AdminService.audit({ admin, action: locked ? 'login_failed_locked' : 'login_failed', ip: req.ip });
      console.warn(`⚠️ [ADMIN LOGIN FAILED] ${admin.username} from IP: ${req.ip}${locked ? ' (account locked)' : ''}`);
      return invalidLogin(res);
    }

    await AdminService.recordPasswordOk(admin);
    const challenge = signAdmin2faChallenge(admin.id);

    if (admin.totpEnabled && admin.totpSecret) {
      return res.json({ success: true, step: 'totp', challenge });
    }

    // First login (or 2FA reset): a fresh secret, active only after the first correct code
    const secret = generateTotpSecret();
    await AdminService.savePendingTotp(admin, secret);
    return res.json({
      success: true,
      step: 'setup',
      challenge,
      secret,
      otpauthUrl: otpauthUrl(secret, admin.username),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/login/verify - Step 2: the 6-digit authenticator code → dashboard token
router.post('/login/verify', adminLoginLimiter, async (req, res, next) => {
  try {
    const { challenge, code } = req.body || {};
    const adminId = verifyAdmin2faChallenge(challenge);
    if (!adminId) {
      return res.status(401).json({ success: false, message: 'Sign-in expired. Enter your password again.' });
    }

    const admin = await AdminService.findById(adminId);
    if (!admin || !admin.isActive || !admin.totpSecret) {
      return res.status(401).json({ success: false, message: 'Sign-in expired. Enter your password again.' });
    }

    const step = verifyTotp(admin.totpSecret, code, { lastUsedStep: admin.totpLastStep });
    if (step === null) {
      const locked = await AdminService.recordFailedLogin(admin);
      await AdminService.audit({ admin, action: locked ? 'totp_failed_locked' : 'totp_failed', ip: req.ip });
      return res.status(401).json({ success: false, message: 'Wrong or expired code. Check your authenticator app.' });
    }

    const firstSetup = !admin.totpEnabled;
    await AdminService.recordTotpLogin(admin, step);
    await AdminService.audit({ admin, action: firstSetup ? 'totp_enrolled' : 'login_success', ip: req.ip });
    console.log(`✅ [ADMIN LOGIN] ${admin.username} from IP: ${req.ip}`);

    res.json({
      success: true,
      token: signAdminToken(admin),
      expiresIn: ADMIN_TOKEN_EXPIRY,
      username: admin.username,
      role: admin.role,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/verify - Check that the stored admin token is still valid (and the account active)
router.get('/verify', verifyAdmin, requireActiveAdmin, (req, res) => {
  res.json({ success: true, username: req.admin.username, role: req.admin.adminRole || null });
});

export default router;

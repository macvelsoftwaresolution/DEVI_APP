import { Router } from 'express';
import { ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_DEV_PASSWORD, ADMIN_TOKEN_EXPIRY } from '../config/security.js';
import { verifyPassword } from '../utils/password.js';
import { safeEqual, signAdminToken, verifyAdmin } from '../middlewares/auth.middleware.js';
import { adminLoginLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// POST /api/admin/login - Admin dashboard sign in (username + ADMIN_PASSWORD_HASH from .env)
router.post('/login', adminLoginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required',
    });
  }

  // Hashing is slow on purpose: refuse oversized input before it reaches scrypt
  if (String(password).length > 200 || String(username).length > 100) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  // Check both fields every time so response time does not reveal which one was wrong
  const userOk = safeEqual(String(username).trim(), ADMIN_USERNAME);
  const passOk = ADMIN_PASSWORD_HASH
    ? await verifyPassword(String(password), ADMIN_PASSWORD_HASH)
    : !!ADMIN_DEV_PASSWORD && safeEqual(String(password), ADMIN_DEV_PASSWORD);
  if (!userOk || !passOk) {
    console.warn(`⚠️ [ADMIN LOGIN FAILED] IP: ${req.ip}`);
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password',
    });
  }

  console.log(`✅ [ADMIN LOGIN] ${ADMIN_USERNAME} from IP: ${req.ip}`);
  res.json({
    success: true,
    token: signAdminToken(ADMIN_USERNAME),
    expiresIn: ADMIN_TOKEN_EXPIRY,
    username: ADMIN_USERNAME,
  });
});

// GET /api/admin/verify - Check that the stored admin token is still valid
router.get('/verify', verifyAdmin, (req, res) => {
  res.json({ success: true, username: req.admin.username });
});

export default router;

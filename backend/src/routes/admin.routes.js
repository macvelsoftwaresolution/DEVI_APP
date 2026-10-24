import { Router } from 'express';
import { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_TOKEN_EXPIRY } from '../config/security.js';
import { safeEqual, signAdminToken, verifyAdmin } from '../middlewares/auth.middleware.js';
import { adminLoginLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// POST /api/admin/login - Admin dashboard sign in (username + password from .env)
router.post('/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required',
    });
  }

  // Check both fields every time so response time does not reveal which one was wrong
  const userOk = safeEqual(String(username).trim(), ADMIN_USERNAME);
  const passOk = safeEqual(String(password), ADMIN_PASSWORD);
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

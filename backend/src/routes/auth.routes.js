import { Router } from 'express';
import { UserService } from '../services/user.service.js';
import { verifyToken, signUserToken } from '../middlewares/auth.middleware.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required',
      });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid mobile number for a supported country',
      });
    }

    // Check if user exists in the database
    const user = await UserService.findUserByPhone(cleanPhone);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'This mobile number is not registered. Please sign up first.',
      });
    }

    // Generate real, cryptographically signed JWT token (valid for 30 days)
    const token = signUserToken(user, cleanPhone);

    res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      data: {
        user,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verify - Verify active JWT session token
router.get('/verify', verifyToken, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Token is valid and active',
    user: req.user,
  });
});

export default router;

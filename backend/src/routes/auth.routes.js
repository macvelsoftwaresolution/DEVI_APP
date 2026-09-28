import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { DataService } from '../services/data.service.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'devi_secret_key_change_in_production';

// Mobile validation helper
const isValidMobile = (phone) => /^[6-9]\d{9}$/.test(phone);

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

    const cleanPhone = phone.trim();
    if (!isValidMobile(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number. Must be exactly 10 digits starting with 6, 7, 8, or 9',
      });
    }

    // Check if user exists in the database
    const user = await DataService.findUserByPhone(cleanPhone);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'This mobile number is not registered. Please sign up first.',
      });
    }

    // Generate real, cryptographically signed JWT token (valid for 30 days)
    const token = jwt.sign(
      {
        id: user.id,
        phone: cleanPhone,
        name: user.name || '',
        isGuest: !!user.isGuest,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

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

import { Router } from 'express';
import { DataService } from '../services/data.service.js';

const router = Router();

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

    res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      data: {
        user,
        token: `token_${cleanPhone}_${Date.now()}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

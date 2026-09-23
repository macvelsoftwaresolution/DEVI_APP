import { Router } from 'express';
import { DataService } from '../services/data.service.js';

const router = Router();

const isValidMobile = (phone) => /^[6-9]\d{9}$/.test(phone);

// GET /api/user/profile/:phone
router.get('/profile/:phone', async (req, res, next) => {
  try {
    const { phone } = req.params;
    if (!phone || !isValidMobile(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number parameter',
      });
    }

    const user = await DataService.findUserByPhone(phone.trim());
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found in database',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/user/profile
router.put('/profile', async (req, res, next) => {
  try {
    const { phone, name, address1, address2, guardians } = req.body;
    if (!phone || typeof phone !== 'string' || !isValidMobile(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A valid 10-digit mobile number (starting with 6-9) is required',
      });
    }

    const cleanPhone = phone.trim();

    // Name validation
    if (name !== undefined && typeof name === 'string' && name.trim().length > 0 && name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full legal name must be at least 2 characters',
      });
    }

    // Guardians validation
    if (guardians !== undefined) {
      if (!Array.isArray(guardians)) {
        return res.status(400).json({
          success: false,
          message: 'Guardians must be an array of contacts',
        });
      }

      const seen = new Set();
      for (let i = 0; i < guardians.length; i++) {
        const g = guardians[i];
        if (!g.phone || !isValidMobile(g.phone.trim())) {
          return res.status(400).json({
            success: false,
            message: `Guardian #${i + 1} has an invalid mobile number. Must be 10 digits starting with 6-9`,
          });
        }
        if (g.phone.trim() === cleanPhone) {
          return res.status(400).json({
            success: false,
            message: `Guardian #${i + 1} cannot have the same mobile number as the registered user`,
          });
        }
        if (seen.has(g.phone.trim())) {
          return res.status(400).json({
            success: false,
            message: `Guardian mobile number ${g.phone.trim()} is duplicated`,
          });
        }
        seen.add(g.phone.trim());
      }
    }

    const updatedUser = await DataService.updateUserProfile(cleanPhone, {
      name: name !== undefined ? name.trim() : undefined,
      address1: address1 !== undefined ? address1.trim() : undefined,
      address2: address2 !== undefined ? address2.trim() : undefined,
      guardians,
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully in database',
      data: updatedUser,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

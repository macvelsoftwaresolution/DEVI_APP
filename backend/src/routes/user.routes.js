import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { UserService } from '../services/user.service.js';
import { MAX_GUARDIANS } from '../utils/sosRecipients.js';
import { guestSyncLimiter } from '../middlewares/rateLimiter.js';
import { optionalToken, verifyToken, signUserToken } from '../middlewares/auth.middleware.js';

const router = Router();

const isValidMobile = (phone) => /^[6-9]\d{9}$/.test(phone);
// Random 128-bit guest ID (the app's UUID v4, hex). Old time-based IDs could be guessed (R14).
export const isValidGuestId = (id) => typeof id === 'string' && /^GUEST_[0-9A-F]{32}$/.test(id);

// GET /api/user/profile/:phone
router.get('/profile/:phone', verifyToken, async (req, res, next) => {
  try {
    const { phone } = req.params;
    if (!phone || !isValidMobile(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number parameter',
      });
    }

    // Users can only query their own profile
    if (req.user.phone !== phone.trim()) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: You cannot view another user profile',
      });
    }

    const user = await UserService.findUserByPhone(phone.trim());
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
router.put('/profile', optionalToken, async (req, res, next) => {
  try {
    const { phone, name, address1, address2, guardians } = req.body;
    if (!phone || typeof phone !== 'string' || !isValidMobile(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A valid 10-digit mobile number (starting with 6-9) is required',
      });
    }

    const cleanPhone = phone.trim();

    // If authenticated, ensure user can only modify their own profile
    if (req.user && req.user.phone && req.user.phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: You cannot update another user profile',
      });
    }

    // Without a token, only first-time sign up is allowed (existing profiles need login)
    const isNewSignup = !req.user;
    if (isNewSignup) {
      const existing = await UserService.findUserByPhone(cleanPhone);
      if (existing && !existing.isGuest) {
        return res.status(401).json({
          success: false,
          message: 'This mobile number is already registered. Please sign in.',
        });
      }
    }

    // Name validation
    if (name !== undefined && typeof name === 'string' && name.trim().length > 0 && name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters',
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
      if (guardians.length > MAX_GUARDIANS) {
        return res.status(400).json({
          success: false,
          message: `You can add up to ${MAX_GUARDIANS} guardians only`,
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

    const updatedUser = await UserService.updateUserProfile(cleanPhone, {
      name: name !== undefined ? name.trim() : undefined,
      address1: address1 !== undefined ? address1.trim() : undefined,
      address2: address2 !== undefined ? address2.trim() : undefined,
      guardians,
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully in database',
      data: updatedUser,
      // New sign ups get a session token so they stay logged in
      ...(isNewSignup && { token: signUserToken(updatedUser, cleanPhone) }),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/user/guest - Tracks anonymous guest users with is_guest = true
router.post('/guest', guestSyncLimiter, async (req, res, next) => {
  try {
    const { guestId, guardians } = req.body;
    if (guestId !== undefined && !isValidGuestId(guestId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid guest ID. Please update the app.',
      });
    }
    const idToUse = guestId || `GUEST_${randomUUID().replace(/-/g, '').toUpperCase()}`;

    // Guests are not verified: anything past the guardian limit is dropped
    const guestGuardians = Array.isArray(guardians) ? guardians.slice(0, MAX_GUARDIANS) : guardians;
    const guestUser = await UserService.createOrGetGuestUser(idToUse, guestGuardians);

    // Guardians' names and numbers are never sent back (R14)
    res.status(200).json({
      success: true,
      message: 'Guest user tracked in database',
      data: { guestId: idToUse, isGuest: true, guardianCount: guestUser?.guardians?.length ?? 0 },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

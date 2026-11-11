import { Router } from 'express';
import { UserService } from '../services/user.service.js';
import { OtpService } from '../services/otp.service.js';
import { verifyToken, issueUserToken } from '../middlewares/auth.middleware.js';
import { otpLimiter } from '../middlewares/rateLimiter.js';
import { normalizePhone } from '../utils/phone.js';
import { sessions } from '../services/sessions.service.js';
import { accountDeletion } from '../services/accountDeletion.service.js';

const router = Router();

const OTP_SEND_ERRORS = {
  WAIT: [429, 'Please wait a minute before asking for another code.'],
  LIMIT: [429, 'Too many codes for this number. Please try again in an hour.'],
  LIMIT_FOREIGN: [429, 'Sign up from this country is busy today. Please try again tomorrow.'],
  NOT_ON_WHATSAPP: [400, 'This number is not on WhatsApp. The code is sent on WhatsApp.'],
};

// POST /api/auth/otp/send - WhatsApp code for sign in (purpose "login") or sign up ("signup")
router.post('/otp/send', otpLimiter, async (req, res, next) => {
  try {
    const { phone, purpose } = req.body;
    const cleanPhone = typeof phone === 'string' ? normalizePhone(phone) : null;
    if (!cleanPhone) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid mobile number for a supported country',
      });
    }

    // Checked first: a code that cannot be used is a paid message for nothing
    const user = await UserService.findUserByPhone(cleanPhone);
    const registered = !!user && !user.isGuest;
    if (purpose === 'signup' && registered) {
      return res.status(409).json({
        success: false,
        message: 'This mobile number is already registered. Please sign in.',
      });
    }
    if (purpose !== 'signup' && !registered) {
      return res.status(404).json({
        success: false,
        message: 'This mobile number is not registered. Please sign up first.',
      });
    }

    const out = await OtpService.sendCode(cleanPhone, { newNumber: purpose === 'signup' });
    if (!out.success) {
      const [status, message] = OTP_SEND_ERRORS[out.reason] || [503, 'Could not send the code. Please try again.'];
      return res.status(status).json({ success: false, message, reason: out.reason, retryAfter: out.retryAfter });
    }

    res.status(200).json({ success: true, message: 'Code sent on WhatsApp' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', otpLimiter, async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
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

    // Same answer for a wrong code and an unknown number's code
    if (!(await OtpService.verifyCode(cleanPhone, otp))) {
      return res.status(401).json({
        success: false,
        message: 'Wrong or expired code. Please try again.',
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
    const token = await issueUserToken(user, cleanPhone);

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

// POST /api/auth/refresh - A fresh 30-day token for a valid one, so an app in use is never logged out.
// Logging out would leave a logged-in user with no guardians for SOS until they enter a new code.
router.post('/refresh', verifyToken, async (req, res, next) => {
  try {
    const user = await UserService.findUserByPhone(req.user.phone);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Please sign in again.' });
    }
    res.status(200).json({ success: true, data: { token: await issueUserToken(user, req.user.phone) } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout-all - Signs this user out on every phone, this one included. For a lost
// phone or a leaked token: every token made before this stops working, and cannot be refreshed.
router.post('/logout-all', verifyToken, async (req, res, next) => {
  try {
    const version = await sessions.revokeUser(req.user.id);
    if (version == null) return res.status(404).json({ success: false, message: 'Account not found.' });
    console.log(`🔒 [SIGNED OUT EVERYWHERE] User ${req.user.id}`);
    res.status(200).json({ success: true, message: 'Signed out on every device.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/account/delete - Deletes the account with its guardians, SOS history and evidence.
// Used by the app and by the public web page (Play Store asks for both), so it takes a fresh
// WhatsApp code (POST /otp/send, purpose "login") rather than a token: a stolen token alone
// cannot delete an account. The code is checked before anything else is said about the account.
router.post('/account/delete', otpLimiter, async (req, res, next) => {
  try {
    const { phone, otp } = req.body || {};
    const cleanPhone = typeof phone === 'string' ? normalizePhone(phone) : null;
    if (!cleanPhone) {
      return res.status(400).json({ success: false, message: 'Enter a valid mobile number for a supported country' });
    }

    if (!(await OtpService.verifyCode(cleanPhone, otp))) {
      return res.status(401).json({ success: false, message: 'Wrong or expired code. Please try again.' });
    }

    const user = await UserService.findUserByPhone(cleanPhone);
    if (!user || user.isGuest) {
      return res.status(404).json({ success: false, message: 'No DEVI account uses this number.' });
    }

    const out = await accountDeletion.deleteAccount(user.id);
    if (out.ok) {
      return res.status(200).json({ success: true, message: 'Your account and its data have been deleted.' });
    }
    const [status, message] = {
      NOT_FOUND: [404, 'No DEVI account uses this number.'],
      SOS_IN_PROGRESS: [409, 'An SOS alert is still being sent to your guardians. Mark yourself safe, then try again in 15 minutes.'],
      EVIDENCE: [503, 'Could not delete your account right now. Please try again later.'],
    }[out.reason];
    res.status(status).json({ success: false, reason: out.reason, message });
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

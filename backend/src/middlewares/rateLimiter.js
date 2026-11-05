import rateLimit from 'express-rate-limit';

// Standard error response helper
const rateLimitHandler = (message) => (req, res) => {
  res.status(429).json({
    success: false,
    message,
    retryAfter: res.getHeader('Retry-After') || 'a few moments',
  });
};

/**
 * Global rate limiter: Applies to all /api routes
 * 5000 requests per 15 minutes per IP (supports high-frequency dashboard/radar tracking)
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many requests from this IP. Please try again after a few moments.'),
});

/**
 * Auth rate limiter: Prevents brute force login attempts
 * Max 15 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many login attempts. Please wait 15 minutes before trying again.'),
});

/**
 * Admin login rate limiter: Prevents password guessing on the dashboard
 * Max 10 attempts per 15 minutes per IP
 */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many admin login attempts. Please wait 15 minutes before trying again.'),
});

/**
 * OTP rate limiter: each code is a paid WhatsApp message, and otp.service.js limits each number.
 * This stops one IP walking through many numbers. Mobile networks share IPs, so it stays generous.
 * Max 30 send or verify calls per 15 minutes per IP
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many attempts. Please wait a few minutes.'),
});

/**
 * Guest sync rate limiter: /user/guest needs no login, so it must not be usable to create
 * guest records or rewrite guest guardians in bulk.
 * The app calls it at start-up and when a guest edits guardians: 30 per 15 minutes per IP is plenty.
 */
export const guestSyncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many guest requests. Please wait a few minutes.'),
});

/**
 * Evidence upload rate limiter (R15): each SOS uploads one video, retried at most 3 times
 * 10 per 10 minutes per IP is plenty for real use and caps memory use per client
 */
export const evidenceUploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many evidence uploads. Please wait a few minutes.'),
});

/**
 * SOS trigger limiter: never refuses an SOS. Mobile networks put many people behind one IP, so an
 * emergency affecting a whole area could look like spam from one address.
 * Over 30 trigger calls a minute from one IP the alert is still saved and reaches the dashboard, and
 * guardians saved on a logged-in account are still sent to. Only unverified numbers wait, because
 * those are what a script would use to spend the balance. The route reports the reason to the app.
 * globalLimiter stays in front of this as the hard stop.
 */
export const sosTriggerLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    req.sosOverIpLimit = true;
    next();
  },
});

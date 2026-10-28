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
 * SOS Trigger rate limiter: Prevents spamming emergency alerts
 * Max 10 trigger calls per minute per IP
 */
export const sosTriggerLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Emergency alert rate limit exceeded. Please wait a minute.'),
});

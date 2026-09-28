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
 * 300 requests per 15 minutes per IP
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('Too many requests from this IP. Please try again after 15 minutes.'),
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

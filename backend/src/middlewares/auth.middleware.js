import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'devi_secret_key_change_in_production';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'devi_admin_secret_2026';

/**
 * Middleware: Verify user JWT token for protected API routes
 */
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Missing or invalid Authorization header.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.',
    });
  }
};

/**
 * Middleware: Optional token verification (attaches user if token exists, but doesn't block)
 */
export const optionalToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch {
      // Proceed as unauthenticated guest without error
    }
  }

  next();
};

/**
 * Middleware: Verify Admin Secret Key for Operator / Emergency Management routes
 */
export const verifyAdminKey = (req, res, next) => {
  // Public Duty Portal, Agent Invite acceptance, Agent Location Streaming, & Duty Settings do NOT require admin secret
  if (
    req.path.startsWith('/duty') ||
    req.path.includes('/location') ||
    req.path.includes('/accept-assignment') ||
    req.path.includes('/status') ||
    req.path.startsWith('/settings/duty')
  ) {
    return next();
  }

  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;

  // In local development, if no key is configured or provided, allow with warning
  if (process.env.NODE_ENV === 'development' && !adminKey) {
    return next();
  }

  if (!adminKey || adminKey !== ADMIN_SECRET_KEY) {
    return res.status(403).json({
      success: false,
      message: 'Unauthorized. Valid Admin credentials required.',
    });
  }

  next();
};

/**
 * Middleware: Verify Field Responder JWT Token for On-Duty & GPS streaming APIs
 */
export const verifyResponderAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.split(' ')[1]
    : (req.headers['x-responder-token'] || req.query.token);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Field responder authentication required.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'responder' && decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Responder role required.',
      });
    }
    req.responder = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session token. Please log in again.',
    });
  }
};

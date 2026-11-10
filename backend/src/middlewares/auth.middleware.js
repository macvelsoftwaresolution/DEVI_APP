import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, ADMIN_JWT_SECRET, SOS_LINK_SECRET, ADMIN_SECRET_KEY, ADMIN_TOKEN_EXPIRY, ADMIN_PASSWORD_VERSION } from '../config/security.js';
import { canonicalPhone } from '../utils/phone.js';
import { sessions } from '../services/sessions.service.js';

// Tokens signed before numbers moved to E.164 carry 10 digits and stay valid for 30 days
const decodeUserToken = (token) => {
  const decoded = jwt.verify(token, JWT_SECRET);
  return decoded.phone ? { ...decoded, phone: canonicalPhone(decoded.phone) } : decoded;
};

/**
 * Signs a 30-day JWT for an app user (used by login & first-time sign up).
 * tv: the user's token version (sessions.service.js); raising it signs this token out.
 */
export const signUserToken = (user, phone, tv = 0) =>
  jwt.sign(
    {
      id: user.id,
      phone,
      name: user.name || '',
      isGuest: !!user.isGuest,
      tv,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

// A token at the user's current version (login, sign up, refresh)
export const issueUserToken = async (user, phone) =>
  signUserToken(user, phone, (await sessions.userTokenVersion(user.id)) ?? 0);

// False only when the user was signed out after this token was made. Unknown (database down)
// counts as still good. Tokens from before versions carry none, which is version 0.
const tokenStillValid = async (decoded) => {
  const current = await sessions.userTokenVersion(decoded.id);
  return current == null || (Number(decoded.tv) || 0) === current;
};

/**
 * Middleware: Verify user JWT token for protected API routes
 */
export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Missing or invalid Authorization header.',
    });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = decodeUserToken(token);
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.',
    });
  }
  if (!(await tokenStillValid(decoded))) {
    return res.status(403).json({
      success: false,
      code: 'SIGNED_OUT',
      message: 'This device was signed out. Please log in again.',
    });
  }
  req.user = decoded;
  next();
};

/**
 * Middleware: Optional token verification (attaches user if token exists, but doesn't block).
 * A signed-out token is treated as no token: the request (an SOS) still goes through as a guest.
 */
export const optionalToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = decodeUserToken(token);
      if (await tokenStillValid(decoded)) req.user = decoded;
    } catch {
      // Proceed as unauthenticated guest without error
    }
  }

  next();
};

/**
 * Constant-time string comparison (prevents timing attacks on secrets)
 */
export const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Meta webhook signature (R9): header `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`
 * made with the App Secret. True only for an exact match.
 */
export const verifyMetaSignature = (rawBody, header, appSecret) => {
  if (!rawBody || !appSecret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(header.slice('sha256='.length).toLowerCase(), expected);
};

/**
 * Per-alert control token: only the device that created the SOS receives it.
 * Stateless HMAC of the alert ID, so it survives server restarts without DB storage.
 */
export const signSosControlToken = (alertId) =>
  crypto.createHmac('sha256', SOS_LINK_SECRET).update(`sos-control:${alertId}`).digest('base64url');

export const verifySosControlToken = (alertId, token) =>
  !!alertId && !!token && safeEqual(token, signSosControlToken(alertId));

// Most alerts one sign in may move from the guest session to the account
export const MAX_CLAIM_ALERTS = 50;

/**
 * Alert IDs the caller proves it created: each needs its control token, which only the creating
 * device has. Used when a guest signs in to move their Instant SOS alerts to the account.
 */
export const provenSosAlertIds = (alerts) => {
  if (!Array.isArray(alerts)) return [];
  const ids = new Set();
  for (const a of alerts.slice(0, MAX_CLAIM_ALERTS)) {
    const alertId = String(a?.alertId ?? '').trim();
    if (verifySosControlToken(alertId, a?.controlToken)) ids.add(alertId);
  }
  return [...ids];
};

/**
 * Middleware for uploads (R15): checks the alert's control token from the headers BEFORE the
 * request body is read, so a request without it is refused before any file reaches memory.
 * Needs X-Alert-Id + X-SOS-Token; sets req.sosAlertId for the route.
 */
export const requireSosControlHeaders = (req, res, next) => {
  const alertId = String(req.get('x-alert-id') || '').trim();
  if (!verifySosControlToken(alertId, req.get('x-sos-token'))) {
    return res.status(403).json({
      success: false,
      message: 'This device is not allowed to update this SOS alert.',
    });
  }
  req.sosAlertId = alertId;
  next();
};

/**
 * Who may resolve (close) an SOS alert: the creating device (control token), a signed-in admin,
 * or the logged-in owner of the alert (the app loses its in-memory control token on restart).
 * Knowing the alert ID or the guardian view key is never enough.
 */
export const canResolveSos = (args) => !!sosResolver(args);

/**
 * Who is closing the alert: 'user' (the creating device or the logged-in owner, i.e. she marked
 * herself safe), 'admin' (dashboard login only) or null (not allowed).
 * Guardian links show SAFE only for 'user'.
 */
export const sosResolver = ({ alertId, controlToken, adminToken, user, ownerId }) => {
  if (verifySosControlToken(String(alertId), controlToken)) return 'user';
  if (!!user?.id && !user.isGuest && !!ownerId && String(user.id) === String(ownerId)) return 'user';
  if (decodeAdminToken(adminToken)) return 'admin';
  return null;
};

/**
 * Per-alert view key (`k` in the guardian tracking link). Alert IDs are sequential numbers,
 * so the key is what stops strangers from opening other people's evidence by guessing IDs.
 * Different prefix from the control token: viewing never grants control.
 */
export const signSosViewToken = (alertId) =>
  crypto.createHmac('sha256', SOS_LINK_SECRET).update(`sos-view:${alertId}`).digest('base64url').slice(0, 22);

export const verifySosViewToken = (alertId, token) =>
  !!alertId && !!token && safeEqual(token, signSosViewToken(alertId));

// Guardian links stop showing the SOS location this long after the alert is resolved
export const TRACKING_LINK_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * True when a guardian link (view key) may no longer show this alert's location:
 * the alert is resolved and the grace period has passed. Active alerts never expire.
 * Without a known resolve time the alert's last update is used, so old alerts expire sooner, not later.
 */
export const isTrackingLinkExpired = (session, now = Date.now()) => {
  if (!session || String(session.status || '').toUpperCase() !== 'RESOLVED') return false;
  const endedAt = Date.parse(session.resolvedTime || session.lastUpdated || session.timestamp || '');
  if (Number.isNaN(endedAt)) return true;
  return now - endedAt > TRACKING_LINK_GRACE_MS;
};

// The shared .env admin (ADMIN_USERNAME) signs in without 2FA. ADMIN_ENV_LOGIN=off turns it off,
// and its open sessions with it, once every operator has an account (npm run admin:user).
export const envAdminLoginEnabled = () => String(process.env.ADMIN_ENV_LOGIN || 'on').trim().toLowerCase() !== 'off';

/**
 * Signs a short-lived JWT for the admin dashboard.
 * Operator account (admin_users): `sub` is its id and `av` its token version, so disabling the
 * account or "sign out everywhere" ends the token.
 * Shared .env admin: `pv` ties it to the current admin password, so a password change ends it.
 */
export const signAdminToken = (username, account = null, { mfa = false } = {}) =>
  jwt.sign(
    account
      ? { role: 'admin', username, sub: account.id, av: Number(account.token_version) || 0 }
      : { role: 'admin', username, pv: ADMIN_PASSWORD_VERSION, ...(mfa && { mfa: true }) },
    ADMIN_JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_EXPIRY }
  );

/**
 * Returns the decoded admin payload if the token is a valid admin JWT, otherwise null
 */
export const decodeAdminToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') return null;
    if (decoded.sub) return sessions.adminTokenValid(decoded.sub, decoded.av) === false ? null : decoded;
    return decoded.pv === ADMIN_PASSWORD_VERSION && envAdminLoginEnabled() ? decoded : null;
  } catch {
    return null;
  }
};

/**
 * Middleware: Admin-only routes (dashboard login token, or x-admin-key for server scripts)
 */
export const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const admin = decodeAdminToken(token);
  if (admin) {
    req.admin = admin;
    return next();
  }

  const adminKey = req.headers['x-admin-key'];
  if (adminKey && safeEqual(adminKey, ADMIN_SECRET_KEY)) {
    req.admin = { role: 'admin', username: 'api-key' };
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Admin login required. Please sign in again.',
  });
};

import twilio from 'twilio';
import plivo from 'plivo';
import { publicBaseUrl } from '../services/ivr.service.js';

/**
 * IVR webhooks must come from Plivo or Twilio (SE3). Both sign each request with our auth token:
 * Twilio in X-Twilio-Signature, Plivo in X-Plivo-Signature-V3 with X-Plivo-Signature-V3-Nonce.
 *
 * Signatures cover the exact URL the provider called, which is the one we gave it: PUBLIC_API_URL
 * plus the path and query. A wrong PUBLIC_API_URL therefore fails every check.
 *
 * IVR_SIGNATURE_MODE:
 *   log      (default) a bad signature is logged and the request still goes through
 *   enforce  a bad signature is refused with 403
 *   off      no check
 * Start with log: a mistake here would silence every SOS call. Switch to enforce once the logs
 * show real calls passing (no "[IVR SIGNATURE]" warnings).
 */

const mode = () => String(process.env.IVR_SIGNATURE_MODE || 'log').toLowerCase();

// Params the provider signed: the form body of a POST, nothing for a GET (the query is in the URL)
const signedParams = (req) => (req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {});

export const isValidTwilioRequest = (req, authToken = process.env.TWILIO_AUTH_TOKEN) => {
  const signature = req.get('x-twilio-signature');
  if (!authToken || !signature) return false;
  try {
    return twilio.validateRequest(authToken, signature, publicBaseUrl() + req.originalUrl, signedParams(req));
  } catch (_) {
    return false;
  }
};

export const isValidPlivoRequest = (req, authToken = process.env.PLIVO_AUTH_TOKEN) => {
  const signature = req.get('x-plivo-signature-v3');
  const nonce = req.get('x-plivo-signature-v3-nonce');
  if (!authToken || !signature || !nonce) return false;
  try {
    return !!plivo.validateV3Signature(req.method, publicBaseUrl() + req.originalUrl, nonce, authToken, signature, signedParams(req));
  } catch (_) {
    return false;
  }
};

let passLogged = false;

// Middleware for one provider's IVR routes
export const verifyIvrSignature = (provider) => (req, res, next) => {
  const m = mode();
  if (m === 'off') return next();
  const valid = provider === 'twilio' ? isValidTwilioRequest(req) : isValidPlivoRequest(req);
  if (valid) {
    if (!passLogged) console.log(`✅ [IVR SIGNATURE] ${provider} webhook signature verified (mode ${m})`);
    passLogged = true;
    return next();
  }
  const path = req.path;
  if (m === 'enforce') {
    console.warn(`❌ [IVR SIGNATURE] ${provider} ${req.method} ${path} refused: bad or missing signature, from IP ${req.ip}`);
    return res.status(403).send('Forbidden');
  }
  console.warn(`⚠️ [IVR SIGNATURE] ${provider} ${req.method} ${path}: bad or missing signature, allowed because IVR_SIGNATURE_MODE=log. Check PUBLIC_API_URL before switching to enforce.`);
  return next();
};

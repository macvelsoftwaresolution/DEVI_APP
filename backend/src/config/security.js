import crypto from 'crypto';
import dotenv from 'dotenv';
import { isPasswordHash } from '../utils/password.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Secrets that must come from .env in production (dev falls back to local defaults)
// One secret per purpose, so a leak or a rotation of one never touches the others (R8):
//   JWT_SECRET       app user login tokens
//   ADMIN_JWT_SECRET dashboard login tokens
//   SOS_LINK_SECRET  per-alert control tokens and guardian link keys (?k=)
//   ENCRYPTION_KEY   database field encryption and the phone-number lookup index
const REQUIRED_SECRETS = ['JWT_SECRET', 'ADMIN_JWT_SECRET', 'SOS_LINK_SECRET', 'ADMIN_SECRET_KEY', 'ENCRYPTION_KEY', 'ADMIN_PASSWORD_HASH'];

const missing = REQUIRED_SECRETS.filter((key) => !process.env[key] || !process.env[key].trim());
if (isProduction && missing.length > 0) {
  console.error(`❌ [SECURITY] Missing required secrets in production: ${missing.join(', ')}. Refusing to start.`);
  process.exit(1);
}
if (!isProduction && missing.length > 0) {
  console.warn(`⚠️ [SECURITY] Using insecure development defaults for: ${missing.join(', ')}`);
}

// The old app-side AES seed is public (it was in the app source), so it must never protect stored data
const PUBLIC_LEGACY_KEY = 'devi_aes_256_military_grade_secret_key_2026';
const encryptionKey = (process.env.ENCRYPTION_KEY || '').trim();
if (isProduction && (encryptionKey === PUBLIC_LEGACY_KEY || encryptionKey.length < 32)) {
  console.error(
    '❌ [SECURITY] ENCRYPTION_KEY must be a new random secret of at least 32 characters ' +
    '(the old app key is public). Generate one with: openssl rand -base64 48'
  );
  process.exit(1);
}

// Not fatal (guardian alerts still work), but SOS from users without guardians reaches no phone
if (!(process.env.ADMIN_WHATSAPP || '').replace(/\D/g, '')) {
  console.warn('⚠️ [CONFIG] ADMIN_WHATSAPP is not set: SOS from users without guardians will alert the dashboard only, not the control room phone.');
}

export const IS_PRODUCTION = isProduction;

// Browser origins allowed to call the API (mobile apps send no Origin and are always allowed)
// Extra origins can be added with CORS_ORIGINS=https://a.com,https://b.com
export const ALLOWED_ORIGINS = [
  'https://devi.macvelsoftware.com',
  'https://devi-api.macvelsoftware.com',
  ...(process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
];

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Local dev servers (Flutter web, Vite) run on random localhost ports
  return !isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
};

export const JWT_SECRET = process.env.JWT_SECRET || 'devi_secret_key_change_in_production';
export const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'devi_dev_admin_jwt_secret_not_for_production';
export const SOS_LINK_SECRET = process.env.SOS_LINK_SECRET || 'devi_dev_sos_link_secret_not_for_production';
export const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'devi_admin_secret_2026';
// Server-only key for database field encryption (AES-256-GCM)
export const ENCRYPTION_KEY = encryptionKey || 'devi_local_dev_field_encryption_key_not_for_production';

// Meta webhook handshake token. Production has no default: if unset, webhook verification is refused
// (the server still starts, so SOS keeps working)
const whatsappVerifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
if (isProduction && !whatsappVerifyToken) {
  console.warn('⚠️ [SECURITY] WHATSAPP_VERIFY_TOKEN not set: WhatsApp webhook verification is disabled.');
}
export const WHATSAPP_VERIFY_TOKEN = whatsappVerifyToken || (isProduction ? null : 'devi_whatsapp_dev_verify_token');

/**
 * Tells a Supabase server key from a public one: 'secret' (sb_secret_… or legacy service_role JWT),
 * 'public' (sb_publishable_… or legacy anon JWT) or 'unknown'.
 * The tables have Row Level Security on with no policies, so only a secret key can read or write them.
 */
export const supabaseKeyKind = (key) => {
  const k = (key || '').trim();
  if (k.startsWith('sb_secret_')) return 'secret';
  if (k.startsWith('sb_publishable_')) return 'public';
  try {
    const role = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString('utf8')).role;
    if (role === 'service_role') return 'secret';
    if (role === 'anon') return 'public';
  } catch {
    // Not a JWT
  }
  return 'unknown';
};

// Admin dashboard login: username + scrypt hash of the password (R4 / E10).
// Create the hash with `npm run admin:hash`; the plain password is never stored on the server.
export const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();
const adminPasswordHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
if (adminPasswordHash && !isPasswordHash(adminPasswordHash)) {
  console.error('❌ [SECURITY] ADMIN_PASSWORD_HASH is not a valid hash. Create one with: npm run admin:hash. Refusing to start.');
  process.exit(1);
}
if (isProduction && (process.env.ADMIN_PASSWORD || '').trim()) {
  console.warn('⚠️ [SECURITY] ADMIN_PASSWORD (plain text) is ignored in production. Remove it from .env; only ADMIN_PASSWORD_HASH is used.');
}
if (isProduction && ADMIN_USERNAME.toLowerCase() === 'admin') {
  console.warn('⚠️ [SECURITY] ADMIN_USERNAME is "admin": pick a less guessable username.');
}
export const ADMIN_PASSWORD_HASH = adminPasswordHash || null;
// Development only, when no hash is set: plain ADMIN_PASSWORD or a local default
export const ADMIN_DEV_PASSWORD = !isProduction && !adminPasswordHash
  ? process.env.ADMIN_PASSWORD || 'devi_admin_dev_password'
  : null;
// Changes whenever the password changes: admin tokens carry it, so a new password logs every old session out
export const ADMIN_PASSWORD_VERSION = crypto
  .createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'devi_dev_admin_jwt_secret_not_for_production')
  .update(`admin-pw:${ADMIN_USERNAME}:${adminPasswordHash || ADMIN_DEV_PASSWORD}`)
  .digest('base64url')
  .slice(0, 16);
export const ADMIN_TOKEN_EXPIRY = '12h';

// A weak field-encryption key must never write to a real database, in any mode.
// On 26 Oct 2026 dev machines with the old public key / the dev default wrote 12 values to production.
// A secret Supabase key means real data (with RLS on, nothing else can read or write it).
export const WEAK_ENCRYPTION_KEYS = [PUBLIC_LEGACY_KEY, 'devi_local_dev_field_encryption_key_not_for_production'];
if (
  supabaseKeyKind(process.env.SUPABASE_KEY) === 'secret' &&
  (encryptionKey.length < 32 || WEAK_ENCRYPTION_KEYS.includes(encryptionKey))
) {
  console.error(
    '❌ [SECURITY] SUPABASE_KEY points at a real database but ENCRYPTION_KEY is missing or weak. ' +
    'Use the SAME ENCRYPTION_KEY as the live server, or data becomes unreadable. Refusing to start.'
  );
  process.exit(1);
}

// Production: every secret long and different from the others (one value in two places would
// tie them together again)
const SEPARATE_SECRETS = ['JWT_SECRET', 'ADMIN_JWT_SECRET', 'SOS_LINK_SECRET', 'ADMIN_SECRET_KEY', 'ENCRYPTION_KEY'];
export const secretProblems = (env) => {
  const values = SEPARATE_SECRETS.map((key) => [key, (env[key] || '').trim()]);
  const problems = values.filter(([, v]) => v.length < 32).map(([key]) => `${key} is shorter than 32 characters`);
  values.forEach(([key, v], i) => {
    const twin = values.slice(i + 1).find(([, other]) => v && other === v);
    if (twin) problems.push(`${key} and ${twin[0]} have the same value`);
  });
  return problems;
};
if (isProduction) {
  const problems = secretProblems(process.env);
  if (problems.length > 0) {
    console.error(`❌ [SECURITY] ${problems.join('; ')}. Generate each one separately (openssl rand -base64 48). Refusing to start.`);
    process.exit(1);
  }
}

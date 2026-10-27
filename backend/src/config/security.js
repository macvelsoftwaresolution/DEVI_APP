import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Secrets that must come from .env in production (dev falls back to local defaults)
const REQUIRED_SECRETS = ['JWT_SECRET', 'ADMIN_SECRET_KEY', 'ENCRYPTION_KEY', 'ADMIN_PASSWORD'];

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

// Admin dashboard login credentials
export const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'devi_admin_dev_password';
export const ADMIN_TOKEN_EXPIRY = '12h';

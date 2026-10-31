import crypto from 'crypto';
import { ENCRYPTION_KEY, ENCRYPTION_ALLOW_V1 } from '../config/security.js';

/**
 * Server-side field encryption for sensitive database columns (AES-256-GCM).
 *
 * - The key lives only in backend/.env (ENCRYPTION_KEY). Apps and the dashboard never see it.
 * - GCM gives confidentiality + integrity: a tampered value fails to decrypt instead of returning garbage.
 * - Stored format: `enc:v2:<iv>:<authTag>:<ciphertext>` (base64url parts).
 * - v2 binds each value to its place (E6): the table + column and the owning row go in as GCM
 *   additional data (AAD), so a value copied into another column or another user's row fails to
 *   decrypt instead of showing up there. See rowKeyFor for which row owns each table's values.
 * - `enc:v1:` values (no AAD, older rows) are still read until they are migrated
 *   (npm run migrate:aad); set ENCRYPTION_ALLOW_V1=false afterwards to refuse them.
 * - Values without a prefix are treated as legacy plain text, so very old rows keep working.
 */

const PREFIX_V1 = 'enc:v1:';
const PREFIX = 'enc:v2:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

// Derive a 256-bit key from the .env secret (HKDF so the raw secret is never used directly)
const KEY = Buffer.from(
  crypto.hkdfSync('sha256', Buffer.from(ENCRYPTION_KEY, 'utf8'), Buffer.alloc(0), 'devi-db-field-v1', 32)
);

// Every encrypted column, and the row id its values are bound to
export const ENCRYPTED_COLUMNS = {
  users: ['mobile_number', 'full_name', 'address_1', 'address_2'],
  guardians: ['name', 'mobile_number'],
  sos_history: ['location_address', 'operator_notes'],
};

// Guardians are bound to their user (rows are deleted and re-inserted on every save);
// users and SOS alerts to their own id
export const rowKeyFor = (table, row) => (table === 'guardians' ? row.user_id : row.id);

const aadFor = (field, rowId) => {
  if (!field || rowId === null || rowId === undefined || rowId === '') {
    throw new Error(`Field encryption needs a column and row id (got ${field}, ${rowId})`);
  }
  return Buffer.from(`devi:${field}:${rowId}`, 'utf8');
};

const split = (value, prefix) => value.slice(prefix.length).split(':').map((p) => Buffer.from(p, 'base64url'));

export const Encryption = {
  isEncrypted(value) {
    return typeof value === 'string' && (value.startsWith(PREFIX) || value.startsWith(PREFIX_V1));
  },

  isCurrent(value) {
    return typeof value === 'string' && value.startsWith(PREFIX);
  },

  /**
   * Encrypts a string for storage in `field` ("table.column") of the row `rowId`.
   * Empty values and already-encrypted values are returned as is.
   */
  encrypt(value, field, rowId) {
    if (value === null || value === undefined || value === '') return value;
    const text = String(value);
    if (this.isEncrypted(text)) return text;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    cipher.setAAD(aadFor(field, rowId));
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  },

  /**
   * Decrypts a stored value read from `field` of the row `rowId`. Legacy plain text is returned unchanged.
   * If decryption fails (wrong key, tampered value, or a value moved from another column / row)
   * an empty string is returned and a warning is logged.
   */
  decrypt(value, field, rowId) {
    if (!this.isEncrypted(value)) return value;
    try {
      const isV1 = value.startsWith(PREFIX_V1);
      if (isV1 && !ENCRYPTION_ALLOW_V1) throw new Error('enc:v1 values are refused (ENCRYPTION_ALLOW_V1=false)');
      const [iv, tag, data] = split(value, isV1 ? PREFIX_V1 : PREFIX);
      const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
      if (!isV1) decipher.setAAD(aadFor(field, rowId));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (err) {
      console.warn(`⚠️ [FIELD DECRYPT FAILED] ${field || 'unknown field'}: wrong key, tampered or moved value:`, err.message);
      return '';
    }
  },
};

// Lookup key for an encrypted column (E1). The stored value is encrypted with a random IV, so it
// cannot be searched; this keyed HMAC of the plain value is deterministic and can.
// Its own key, derived from ENCRYPTION_KEY, so it never equals the encryption key.
const INDEX_KEY = Buffer.from(
  crypto.hkdfSync('sha256', Buffer.from(ENCRYPTION_KEY, 'utf8'), Buffer.alloc(0), 'devi-db-index-v1', 32)
);

export const blindIndex = (value) =>
  crypto.createHmac('sha256', INDEX_KEY).update(String(value ?? '').trim()).digest('hex');

// Shorthands for database field encryption in services: enc(value, 'users.full_name', user.id)
export const encryptField = (value, field, rowId) => Encryption.encrypt(value, field, rowId);
export const decryptField = (value, field, rowId) => Encryption.decrypt(value, field, rowId);

export default Encryption;

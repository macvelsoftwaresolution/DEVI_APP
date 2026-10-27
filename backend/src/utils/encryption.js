import crypto from 'crypto';
import { ENCRYPTION_KEY } from '../config/security.js';

/**
 * Server-side field encryption for sensitive database columns (AES-256-GCM).
 *
 * - The key lives only in backend/.env (ENCRYPTION_KEY). Apps and the dashboard never see it.
 * - GCM gives confidentiality + integrity: a tampered value fails to decrypt instead of returning garbage.
 * - Stored format: `enc:v1:<iv>:<authTag>:<ciphertext>` (base64url parts).
 * - Values without the prefix are treated as legacy plain text, so old rows keep working
 *   until they are re-saved or migrated (npm run migrate:encrypt).
 */

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

// Derive a 256-bit key from the .env secret (HKDF so the raw secret is never used directly)
const KEY = Buffer.from(
  crypto.hkdfSync('sha256', Buffer.from(ENCRYPTION_KEY, 'utf8'), Buffer.alloc(0), 'devi-db-field-v1', 32)
);

export const Encryption = {
  isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(PREFIX);
  },

  /**
   * Encrypts a string for storage. Empty values and already-encrypted values are returned as is.
   */
  encrypt(value) {
    if (value === null || value === undefined || value === '') return value;
    const text = String(value);
    if (this.isEncrypted(text)) return text;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  },

  /**
   * Decrypts a stored value. Legacy plain text is returned unchanged.
   * If decryption fails (wrong key / tampered data) an empty string is returned and a warning is logged.
   */
  decrypt(value) {
    if (!this.isEncrypted(value)) return value;
    try {
      const [ivPart, tagPart, dataPart] = value.slice(PREFIX.length).split(':');
      const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivPart, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
    } catch (err) {
      console.warn('⚠️ [FIELD DECRYPT FAILED] Wrong ENCRYPTION_KEY or tampered value:', err.message);
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

// Shorthands for database field encryption in services
export const encryptField = (value) => Encryption.encrypt(value);
export const decryptField = (value) => Encryption.decrypt(value);

export default Encryption;

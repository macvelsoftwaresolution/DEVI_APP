import crypto from 'crypto';
import { ENCRYPTION_KEY, ENCRYPTION_ALLOW_V1, ENCRYPTION_KEY_ID, ENCRYPTION_OLD_KEYS } from '../config/security.js';

/**
 * Server-side field encryption for sensitive database columns (AES-256-GCM).
 *
 * - The key lives only in backend/.env (ENCRYPTION_KEY). Apps and the dashboard never see it.
 * - GCM gives confidentiality + integrity: a tampered value fails to decrypt instead of returning garbage.
 * - Stored format: `enc:v3:<keyId>:<iv>:<authTag>:<ciphertext>` (base64url parts).
 * - Each value is bound to its place (E6): the table + column and the owning row go in as GCM
 *   additional data (AAD), so a value copied into another column or another user's row fails to
 *   decrypt instead of showing up there. See rowKeyFor for which row owns each table's values.
 * - Key rotation (E3): keyId says which key wrote the value. New values use ENCRYPTION_KEY
 *   (ENCRYPTION_KEY_ID); retired keys in ENCRYPTION_OLD_KEYS still read old values until
 *   `npm run rotate:key -- --apply` re-encrypts them.
 * - Older formats are still read: `enc:v2:` (AAD, no key id) and `enc:v1:` (no AAD; refused once
 *   ENCRYPTION_ALLOW_V1=false). Values without a prefix are treated as legacy plain text.
 */

const PREFIX_V1 = 'enc:v1:';
const PREFIX_V2 = 'enc:v2:';
const PREFIX = 'enc:v3:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

// Field key + lookup-index key for one .env secret (HKDF so the raw secret is never used directly)
const deriveKeys = (id, secret) => ({
  id,
  field: Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'devi-db-field-v1', 32)),
  index: Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'devi-db-index-v1', 32)),
});

const CURRENT = deriveKeys(ENCRYPTION_KEY_ID, ENCRYPTION_KEY);
const OLD = ENCRYPTION_OLD_KEYS.map(({ id, secret }) => deriveKeys(id, secret));
const ALL_KEYS = [CURRENT, ...OLD];
const KEYS_BY_ID = new Map(ALL_KEYS.map((k) => [k.id, k]));
export const CURRENT_KEY_ID = CURRENT.id;

// Every encrypted column, and the row id its values are bound to
export const ENCRYPTED_COLUMNS = {
  users: ['mobile_number', 'full_name', 'address_1', 'address_2'],
  guardians: ['name', 'mobile_number'],
  sos_history: ['location_address', 'operator_notes', 'coords'],
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

const parts = (value, prefix) => value.slice(prefix.length).split(':');

// One GCM decrypt; throws when the key, the AAD or the data do not match
const open = (key, iv, tag, data, aad) => {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
};

// v1 / v2 values carry no key id: try the current key, then the retired ones
const openWithAnyKey = (iv, tag, data, aad) => {
  for (const k of ALL_KEYS) {
    try {
      return open(k.field, iv, tag, data, aad);
    } catch {
      // next key
    }
  }
  throw new Error('no configured key can read it');
};

export const Encryption = {
  isEncrypted(value) {
    return typeof value === 'string' && [PREFIX, PREFIX_V2, PREFIX_V1].some((p) => value.startsWith(p));
  },

  // Written in the newest format with the current key (nothing for rotate:key to do)
  isCurrent(value) {
    return typeof value === 'string' && value.startsWith(`${PREFIX}${CURRENT.id}:`);
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
    const cipher = crypto.createCipheriv(ALGORITHM, CURRENT.field, iv);
    cipher.setAAD(aadFor(field, rowId));
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${CURRENT.id}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  },

  /**
   * Decrypts a stored value read from `field` of the row `rowId`. Legacy plain text is returned unchanged.
   * If decryption fails (wrong or missing key, tampered value, or a value moved from another
   * column / row) an empty string is returned and a warning is logged.
   */
  decrypt(value, field, rowId) {
    if (!this.isEncrypted(value)) return value;
    try {
      if (value.startsWith(PREFIX)) {
        const [keyId, iv, tag, data] = parts(value, PREFIX);
        const key = KEYS_BY_ID.get(keyId);
        if (!key) throw new Error(`key "${keyId}" is not configured (add it to ENCRYPTION_OLD_KEYS)`);
        return open(key.field, iv, tag, data, aadFor(field, rowId));
      }
      if (value.startsWith(PREFIX_V2)) {
        const [iv, tag, data] = parts(value, PREFIX_V2);
        return openWithAnyKey(iv, tag, data, aadFor(field, rowId));
      }
      if (!ENCRYPTION_ALLOW_V1) throw new Error('enc:v1 values are refused (ENCRYPTION_ALLOW_V1=false)');
      const [iv, tag, data] = parts(value, PREFIX_V1);
      return openWithAnyKey(iv, tag, data, null);
    } catch (err) {
      console.warn(`⚠️ [FIELD DECRYPT FAILED] ${field || 'unknown field'}: wrong key, tampered or moved value:`, err.message);
      return '';
    }
  },
};

// Lookup key for an encrypted column (E1). The stored value is encrypted with a random IV, so it
// cannot be searched; this keyed HMAC of the plain value is deterministic and can.
// Its own key, derived from the encryption secret, so it never equals the encryption key.
const hmac = (key, value) => crypto.createHmac('sha256', key).update(String(value ?? '').trim()).digest('hex');

// What new rows store (current key)
export const blindIndex = (value) => hmac(CURRENT.index, value);

// Every hash a stored row may have while a key rotation is in progress: search with all of them
export const blindIndexes = (value) => ALL_KEYS.map((k) => hmac(k.index, value));

// Shorthands for database field encryption in services: enc(value, 'users.full_name', user.id)
export const encryptField = (value, field, rowId) => Encryption.encrypt(value, field, rowId);
export const decryptField = (value, field, rowId) => Encryption.decrypt(value, field, rowId);

export default Encryption;

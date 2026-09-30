import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Standard 256-bit (32 bytes) AES key derived via SHA-256
const SECRET_SEED = process.env.ENCRYPTION_KEY || 'devi_aes_256_military_grade_secret_key_2026';
const AES_KEY = crypto.createHash('sha256').update(SECRET_SEED).digest();
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // 128-bit IV for AES-CBC

export const Encryption = {
  /**
   * Encrypts plaintext string using AES-256-CBC with randomized IV
   * Output format: `${ivBase64}:${cipherBase64}`
   * @param {string} text - Plaintext to encrypt
   * @returns {string} - Encrypted payload
   */
  encrypt(text) {
    if (text === null || text === undefined) return '';
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, AES_KEY, iv);
      let encrypted = cipher.update(String(text), 'utf8', 'base64');
      encrypted += cipher.final('base64');
      return `${iv.toString('base64')}:${encrypted}`;
    } catch (err) {
      console.error('❌ [AES-256 ENCRYPTION ERROR]:', err.message);
      return String(text);
    }
  },

  /**
   * Decrypts an AES-256 encrypted payload
   * @param {string} cipherString - Formatted `${ivBase64}:${cipherBase64}`
   * @returns {string} - Decrypted plaintext
   */
  decrypt(cipherString) {
    if (!cipherString || typeof cipherString !== 'string') return cipherString;

    const parts = cipherString.split(':');
    if (parts.length !== 2) {
      // Not encrypted or legacy unencrypted string
      return cipherString;
    }

    try {
      const [ivBase64, dataBase64] = parts;
      const iv = Buffer.from(ivBase64, 'base64');
      if (iv.length !== IV_LENGTH) {
        return cipherString; // Invalid IV size, fallback to raw string
      }

      const decipher = crypto.createDecipheriv(ALGORITHM, AES_KEY, iv);
      let decrypted = decipher.update(dataBase64, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      // Graceful fallback if plain text was passed
      return cipherString;
    }
  },

  /**
   * Encrypts a JavaScript object / payload into an AES-256 encrypted string
   * @param {object} obj - Object to encrypt
   * @returns {string} - Encrypted string
   */
  encryptObject(obj) {
    try {
      const json = JSON.stringify(obj);
      return this.encrypt(json);
    } catch (err) {
      console.error('❌ [AES-256 ENCRYPT OBJECT ERROR]:', err.message);
      return '';
    }
  },

  /**
   * Decrypts an AES-256 encrypted string back into a JavaScript object
   * @param {string} cipherString - Encrypted string
   * @returns {object|null} - Decrypted object or null
   */
  decryptObject(cipherString) {
    try {
      const decrypted = this.decrypt(cipherString);
      return JSON.parse(decrypted);
    } catch (err) {
      return null;
    }
  },

  /**
   * Validates if a given string matches the AES-256 encrypted signature
   */
  isEncrypted(str) {
    if (typeof str !== 'string') return false;
    const parts = str.split(':');
    return parts.length === 2 && parts[0].length === 24; // 16 bytes base64 is 24 chars
  },
};

export default Encryption;

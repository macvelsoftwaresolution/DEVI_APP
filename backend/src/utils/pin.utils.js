import crypto from 'crypto';

/**
 * Enterprise PIN Hashing using PBKDF2 with SHA-512 and randomized salt (NIST Approved)
 * @param {string} pin - 4 to 6 digit security PIN
 * @returns {string} - salt:hash format
 */
export function hashPin(pin) {
  if (!pin) throw new Error('PIN is required for hashing');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(pin).trim(), salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies PIN against stored PBKDF2 hash using timingSafeEqual (prevention of timing attacks)
 * @param {string} pin - User-entered PIN
 * @param {string} storedHash - Stored salt:hash
 * @returns {boolean} - true if valid
 */
export function verifyPin(pin, storedHash) {
  if (!pin || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, originalHash] = parts;
  try {
    const computedHash = crypto.pbkdf2Sync(String(pin).trim(), salt, 10000, 64, 'sha512').toString('hex');
    const computedBuf = Buffer.from(computedHash, 'hex');
    const originalBuf = Buffer.from(originalHash, 'hex');

    if (computedBuf.length !== originalBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, originalBuf);
  } catch (err) {
    console.error('PIN verification error:', err.message);
    return false;
  }
}

import crypto from 'crypto';

/**
 * Admin password hashing (scrypt). The .env keeps only the hash, so a leaked .env does not
 * reveal the password.
 * Stored format: `scrypt:<N>:<r>:<p>:<salt>:<hash>` (base64url parts; no `$`, so .env tools leave it alone).
 */

const PREFIX = 'scrypt';
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const MIN_LENGTH = 12;

const COMMON_PASSWORDS = ['password', 'admin', 'devi', 'qwerty', '123456', 'welcome', 'letmein'];

const scrypt = (password, salt, n, r, p) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, KEY_LEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });

export const isPasswordHash = (value) => {
  const parts = String(value || '').trim().split(':');
  return parts.length === 6 && parts[0] === PREFIX && parts.slice(1, 4).every((x) => /^\d+$/.test(x)) && !!parts[4] && !!parts[5];
};

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return [PREFIX, N, R, P, salt.toString('base64url'), key.toString('base64url')].join(':');
}

// True when the password matches the stored hash (constant-time compare)
export async function verifyPassword(password, stored) {
  if (!isPasswordHash(stored)) return false;
  const [, n, r, p, salt, hash] = stored.trim().split(':');
  const expected = Buffer.from(hash, 'base64url');
  try {
    const key = await scrypt(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Reasons a new admin password is too weak (empty list = OK)
export function passwordProblems(password, username = '') {
  const pw = String(password || '');
  const lower = pw.toLowerCase();
  const problems = [];
  if (pw.length < MIN_LENGTH) problems.push(`must be at least ${MIN_LENGTH} characters`);
  if (username && lower.includes(String(username).toLowerCase())) problems.push('must not contain the username');
  if (COMMON_PASSWORDS.some((w) => lower.includes(w))) problems.push('must not contain common words like "admin" or "password"');
  if (new Set(pw).size < 6) problems.push('uses too few different characters');
  return problems;
}

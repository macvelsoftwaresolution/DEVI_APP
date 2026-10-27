import crypto from 'crypto';

// Admin password hashing with scrypt (built into Node, memory-hard, no native dependency).
// Stored format: scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>, so the cost can be raised later
// without breaking existing hashes.

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

const scrypt = (password, salt, n, r, p) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, KEY_LEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );

export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password), salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
};

export const verifyPassword = async (password, stored) => {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, expected] = parts;
  const expectedBuf = Buffer.from(expected, 'base64url');
  const actual = await scrypt(String(password), Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);
};

// Compared against when the username does not exist, so a wrong username takes as long as a wrong password
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(KEY_LEN).toString('base64url')}`;

// Random password for a new or reset admin account (shown once by the CLI)
export const generatePassword = () => crypto.randomBytes(15).toString('base64url');

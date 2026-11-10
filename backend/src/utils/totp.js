import crypto from 'crypto';

/**
 * Time-based one-time codes (TOTP, RFC 6238) for admin 2FA: 6 digits, 30 seconds, HMAC-SHA1,
 * which is what Google Authenticator, Microsoft Authenticator and others expect.
 * The secret is shared as base32 (RFC 4648), the "setup key" those apps accept.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export const base32Encode = (buf) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    // Only the unread bits matter (at most 12), so the value never overflows 32 bits
    value = ((value << 8) | byte) & 0xfff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (text) => {
  const clean = String(text || '').toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32');
    value = ((value << 5) | i) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

// 160 random bits, the size RFC 4226 recommends
export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export const totpCode = (secret, counter) => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const n = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(n).padStart(DIGITS, '0');
};

export const totpCounter = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * The time step the code matches, or null. Accepts one step either side for clock drift.
 * Callers must refuse a step they already accepted for this account (replay).
 */
export const verifyTotp = (secret, code, now = Date.now()) => {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const current = totpCounter(now);
  for (const counter of [current, current - 1, current + 1]) {
    const expected = totpCode(secret, counter);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return counter;
  }
  return null;
};

// The link authenticator apps read from a QR code
export const otpauthUrl = (username, secret, issuer = 'DEVI Admin') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${username}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

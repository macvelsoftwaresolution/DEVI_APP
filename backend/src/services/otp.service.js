import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { blindIndex } from '../utils/encryption.js';
import { safeEqual } from '../middlewares/auth.middleware.js';
import { WhatsAppService } from './whatsapp.service.js';
import { isGuestCountryNumber } from '../utils/phone.js';

/**
 * Login codes sent on WhatsApp (db/otp.sql).
 *
 * - 6 digits, valid for 5 minutes, used once, 5 wrong tries and the code is dead.
 * - A number gets one code a minute and 5 an hour: each code is a paid message, so these limits
 *   stop a bot spending the WhatsApp balance. rateLimiter.js adds a limit per IP on top.
 * - Sign up codes to numbers abroad have a daily total (FOREIGN_OTP_DAILY_LIMIT): a sign up needs no
 *   account, and these messages cost the most. Counted in memory: a restart only lets more through.
 * - Only a keyed hash of the code is stored, tied to the number it was sent to.
 */

export const CODE_TTL_MS = 5 * 60 * 1000;
export const RESEND_WAIT_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_FOREIGN_DAILY_LIMIT = 50;

const codeHash = (phone, code) => blindIndex(`otp:${phone}:${code}`);

const supabaseStore = {
  async get(key) {
    const { data, error } = await supabase.from('otp_codes').select('*').eq('phone_hash', key).maybeSingle();
    if (error) throw error;
    return data;
  },
  async save(row) {
    const { error } = await supabase.from('otp_codes').upsert(row, { onConflict: 'phone_hash' });
    if (error) throw error;
  },
};

export const createOtpService = ({
  store = supabaseStore,
  send = (phone, code) => WhatsAppService.sendOtp(phone, code),
  now = Date.now,
} = {}) => {
  const foreignSignups = { day: '', count: 0 };

  return {
    // Returns { success } or { success: false, reason }: WAIT (with retryAfter seconds), LIMIT,
    // LIMIT_FOREIGN or a send failure. newNumber: a sign up, which has no account behind it yet.
    async sendCode(phone, { newNumber = false } = {}) {
      const key = blindIndex(phone);
      const row = await store.get(key);
      const time = now();

      const sinceLast = row ? time - new Date(row.sent_at).getTime() : Infinity;
      if (sinceLast < RESEND_WAIT_MS) {
        return { success: false, reason: 'WAIT', retryAfter: Math.ceil((RESEND_WAIT_MS - sinceLast) / 1000) };
      }
      const sameHour = row && time - new Date(row.window_start).getTime() < HOUR_MS;
      const sentThisHour = sameHour ? row.send_count : 0;
      if (sentThisHour >= MAX_SENDS_PER_HOUR) return { success: false, reason: 'LIMIT' };

      const capped = newNumber && !isGuestCountryNumber(phone);
      if (capped) {
        const day = new Date(time).toISOString().slice(0, 10);
        if (foreignSignups.day !== day) Object.assign(foreignSignups, { day, count: 0 });
        const limit = Number(process.env.FOREIGN_OTP_DAILY_LIMIT) || DEFAULT_FOREIGN_DAILY_LIMIT;
        if (foreignSignups.count >= limit) return { success: false, reason: 'LIMIT_FOREIGN' };
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const out = await send(phone, code);
      if (!out?.success) return { success: false, reason: out?.reason || 'SEND_FAILED' };
      if (capped) foreignSignups.count += 1;

      await store.save({
        phone_hash: key,
        code_hash: codeHash(phone, code),
        expires_at: new Date(time + CODE_TTL_MS).toISOString(),
        attempts: 0,
        sent_at: new Date(time).toISOString(),
        window_start: sameHour ? row.window_start : new Date(time).toISOString(),
        send_count: sentThisHour + 1,
      });
      return { success: true };
    },

    // True once for the right code; the try is counted before the code is checked
    async verifyCode(phone, code) {
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
      const key = blindIndex(phone);
      const row = await store.get(key);
      if (!row?.code_hash || now() > new Date(row.expires_at).getTime() || row.attempts >= MAX_ATTEMPTS) return false;

      await store.save({ ...row, attempts: row.attempts + 1 });
      if (!safeEqual(row.code_hash, codeHash(phone, code))) return false;

      await store.save({ ...row, code_hash: null, expires_at: null });
      return true;
    },
  };
};

export const OtpService = createOtpService();

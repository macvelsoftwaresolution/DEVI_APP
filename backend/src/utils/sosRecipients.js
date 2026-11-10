// Who receives an SOS WhatsApp, and what name it shows.
import crypto from 'crypto';
import { normalizePhone, isGuestCountryNumber, isValidGuestId, phoneCountry } from './phone.js';

// The WhatsApp goes out from DEVI's business number, so a request must not be able to send it to
// any numbers it likes: a flood of fake alerts gets the number reported and banned by Meta, and then
// real SOS alerts stop reaching guardians.
//
// The app's list is the user's current list (the server copy can be stale: the app saves guardians
// on the phone first and syncs in the background without retry), so the app's numbers are always used.
// What changes is how much they are trusted:
// - Logged-in user: numbers also saved on the account are verified, with no limit. Other numbers
//   (e.g. a guardian added while offline) are unverified. An empty app list falls back to the account.
// - Guest or expired login: every number is unverified. Guest records are not trusted either, because
//   anyone can create one through /user/guest.
// Unverified numbers: at most MAX_GUARDIANS, each receiving at most RECIPIENT_LIMIT alerts an hour,
// and only in the Instant SOS countries (GUEST_SOS_COUNTRIES). Saved guardians abroad get the hourly limit too.

// A user can have at most this many guardians (the app enforces the same limit)
export const MAX_GUARDIANS = 3;
export const RECIPIENT_LIMIT = 3;
export const RECIPIENT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_NAME_LENGTH = 40;

const uniqueMobiles = (values) => [...new Set(values.map(normalizePhone).filter(Boolean))];

/**
 * @param {object} p
 * @param {object|null} p.account   logged-in user (from the JWT), with saved guardians
 * @param {Array} p.requestContacts numbers sent by the app (strings or { phone })
 * @returns {Array<{ phone: string, verified: boolean }>} verified = saved on the account (no limit)
 */
export const pickSosRecipients = ({ account, requestContacts }) => {
  const saved = new Set(uniqueMobiles((account?.guardians || []).map((g) => g.phone)));
  const fromRequest = Array.isArray(requestContacts)
    ? uniqueMobiles(requestContacts.map((c) => (c && typeof c === 'object' ? c.phone || c.number : c)))
    : [];

  // Old app or empty list: a logged-in user's saved guardians are still alerted
  if (fromRequest.length === 0) return [...saved].map((phone) => ({ phone, verified: true }));

  const verified = fromRequest.filter((p) => saved.has(p)).map((phone) => ({ phone, verified: true }));
  const unverified = fromRequest
    .filter((p) => !saved.has(p))
    .slice(0, MAX_GUARDIANS)
    .map((phone) => ({ phone, verified: false }));
  return [...verified, ...unverified];
};

/**
 * The name shown in "<name> is in danger". From an unverified request it must not carry links
 * or long text, or DEVI's number could be used to send scam messages.
 */
export const sanitizeVictimName = (name, fallback = 'DEVI User') => {
  const cleaned = String(name ?? '')
    .split(/\s+/)
    .filter((word) => !/(https?:|www\.|\/\/|@|\.[a-z]{2,}(\/|$))/i.test(word))
    .join(' ')
    .replace(/[^\p{L}\p{M}\p{N} .'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned || fallback;
};

/**
 * Per-number hourly limit for alerts that did not come from a logged-in user.
 * In memory: a server restart clears the counts, which only ever lets more alerts through.
 */
export class RecipientLimiter {
  constructor({ limit = RECIPIENT_LIMIT, windowMs = RECIPIENT_WINDOW_MS } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.sent = new Map(); // phone -> timestamps (ms) of alerts sent within the window
  }

  // Records one alert to `phone` and returns true, or returns false when the limit is reached
  tryConsume(phone, now = Date.now()) {
    const recent = (this.sent.get(phone) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.sent.set(phone, recent);
      return false;
    }
    recent.push(now);
    this.sent.set(phone, recent);
    if (this.sent.size > 10000) this.prune(now);
    return true;
  }

  prune(now = Date.now()) {
    for (const [phone, times] of this.sent) {
      const recent = times.filter((t) => now - t < this.windowMs);
      if (recent.length === 0) this.sent.delete(phone);
      else this.sent.set(phone, recent);
    }
  }
}

export const recipientLimiter = new RecipientLimiter();

/**
 * Daily ceiling on paid SOS sends to unverified numbers, per country (section 10: paid abuse).
 * Instant SOS needs no login, so a script could trigger SOS after SOS to fresh numbers: the
 * per-number limit above does not stop that, this does. Saved guardians of a logged-in user are
 * never counted or stopped.
 *
 * SOS_UNVERIFIED_DAILY_CAP: "IN:1000,*:100" (per country, * for any other; 0 = no cap). A day is
 * an IST day. In memory: a restart clears the counts, which only ever lets more through; with
 * several servers each has its own count (S1, Redis).
 */
export const DEFAULT_DAILY_CAP = 'IN:1000,*:100';

export const parseDailyCap = (raw = DEFAULT_DAILY_CAP) => {
  const caps = new Map();
  for (const part of String(raw || '').split(',')) {
    const [country, n] = part.split(':').map((x) => x.trim().toUpperCase());
    const limit = Number(n);
    if (country && Number.isInteger(limit) && limit >= 0) caps.set(country, limit);
  }
  return caps;
};

const istDay = (now) => new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export class DailyCap {
  constructor({ caps = parseDailyCap(process.env.SOS_UNVERIFIED_DAILY_CAP ?? DEFAULT_DAILY_CAP), countryOf = phoneCountry } = {}) {
    this.caps = caps;
    this.countryOf = countryOf;
    this.day = null;
    this.counts = new Map(); // country -> sends today
  }

  limitFor(country) {
    return this.caps.has(country) ? this.caps.get(country) : (this.caps.get('*') ?? 0);
  }

  // Counts one send to `phone` and returns true, or returns false when its country is at the cap
  tryTake(phone, now = Date.now()) {
    const day = istDay(now);
    if (day !== this.day) {
      this.day = day;
      this.counts.clear();
    }
    const country = this.countryOf(phone) || '*';
    const limit = this.limitFor(country);
    if (!limit) return true;
    const used = this.counts.get(country) || 0;
    if (used >= limit) return false;
    this.counts.set(country, used + 1);
    return true;
  }

  // For the health check: [{ country, used, limit }] for today
  usage(now = Date.now()) {
    if (istDay(now) !== this.day) return [];
    return [...this.counts].map(([country, used]) => ({ country, used, limit: this.limitFor(country) }));
  }
}

export const dailyCap = new DailyCap();

/**
 * Why this guardian must not be sent to, or null. The caller reports the reason back, so the phone
 * warns the user and shows a Call button instead of implying the guardian was reached.
 */
export const sendBlockReason = ({ phone, verified }, limiter = recipientLimiter, { overIpLimit = false, cap = dailyCap } = {}) => {
  if (overIpLimit && !verified) return 'IP_LIMIT';
  const guestCountry = isGuestCountryNumber(phone);
  if (!verified && !guestCountry) return 'FOREIGN_NEEDS_LOGIN';
  if ((!verified || !guestCountry) && !limiter.tryConsume(phone)) return 'RECIPIENT_LIMIT';
  if (!verified && cap && !cap.tryTake(phone)) return 'DAILY_CAP';
  return null;
};

/**
 * Who an SOS belongs to. The token decides for a logged-in user. Without one only a guest ID is
 * taken from the request: a phone number there could file an alert under someone else's account.
 * Anything else still gets through, as a new guest: an SOS is never refused for its ID.
 */
export const sosUserId = (tokenPhone, requestId) => {
  if (tokenPhone) return tokenPhone;
  if (isValidGuestId(requestId)) return requestId;
  return `GUEST_${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;
};

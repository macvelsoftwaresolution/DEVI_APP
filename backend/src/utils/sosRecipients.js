// Who receives an SOS WhatsApp, and what name it shows.
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
// Unverified numbers: at most MAX_GUARDIANS, each receiving at most RECIPIENT_LIMIT alerts an hour.

// A user can have at most this many guardians (the app enforces the same limit)
export const MAX_GUARDIANS = 3;
export const RECIPIENT_LIMIT = 3;
export const RECIPIENT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_NAME_LENGTH = 40;

// Any Indian mobile format (+91, 0 prefix, spaces) → 10 digits, or null
export const parseIndianMobile = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const match = digits.match(/^(?:91|0)?([6-9]\d{9})$/);
  return match ? match[1] : null;
};

const uniqueMobiles = (values) => [...new Set(values.map(parseIndianMobile).filter(Boolean))];

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

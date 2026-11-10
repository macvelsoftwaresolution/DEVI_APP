import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

// Phone numbers everywhere are E.164 ("+919876543210"): stored, hashed for lookup, in tokens and
// sent to WhatsApp and the call providers. A number with no country code is read as Indian
// (older app builds and contacts saved without +91).

const DEFAULT_COUNTRY = 'IN';
const MOBILE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

// Countries open for sign up and guardians, or "ALL". Every number here can be sent a paid SOS
// call by anyone who can trigger an SOS, so a country is opened on purpose.
const countryList = (value) =>
  (value || DEFAULT_COUNTRY)
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

const includesCountry = (list, country) => list.includes('ALL') || list.includes(country);

export const allowedCountries = () => countryList(process.env.ALLOWED_COUNTRIES);

// Countries an Instant SOS (no login, no OTP) may send to. Anyone can trigger one, and foreign calls
// and messages cost far more, so other countries need a logged-in user's saved guardians.
export const guestCountries = () => countryList(process.env.GUEST_SOS_COUNTRIES);

// Random 128-bit guest ID (the app's UUID v4, hex). Old time-based IDs could be guessed (R14).
export const isValidGuestId = (id) => typeof id === 'string' && /^GUEST_[0-9A-F]{32}$/.test(id);

const parseMobile = (raw) => {
  const text = String(raw ?? '').trim();
  // Guest IDs are hex: their digits must never be read as a phone number
  if (text.startsWith('GUEST_')) return null;
  // The app's older contact format: "Amma (9876543210)"
  const number = text.match(/\+?\d[\d\s()-]{5,}\d/)?.[0];
  if (!number) return null;
  const parsed = parsePhoneNumberFromString(number, DEFAULT_COUNTRY);
  return parsed?.isValid() && MOBILE_TYPES.has(parsed.getType()) ? parsed : null;
};

// E.164 number from user input, or null: not a mobile number, or its country is not open
export const normalizePhone = (raw) => {
  const parsed = parseMobile(raw);
  return parsed && includesCountry(allowedCountries(), parsed.country) ? parsed.number : null;
};

// ISO country of a mobile number ("IN"), or null
export const phoneCountry = (raw) => parseMobile(raw)?.country || null;

// True when no login is needed to send to this number
export const isGuestCountryNumber = (raw) => {
  const parsed = parseMobile(raw);
  return !!parsed && includesCountry(guestCountries(), parsed.country);
};

// The form stored in the database and in tokens. Guest IDs and other identifiers stay as they are,
// and so does a number from a country closed after it was saved: it must still find its account.
export const canonicalPhone = (raw) => parseMobile(raw)?.number || String(raw ?? '').trim();

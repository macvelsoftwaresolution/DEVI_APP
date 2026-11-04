import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

// Phone numbers everywhere are E.164 ("+919876543210"): stored, hashed for lookup, in tokens and
// sent to WhatsApp and the call providers. A number with no country code is read as Indian
// (older app builds and contacts saved without +91).

const DEFAULT_COUNTRY = 'IN';
const MOBILE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

// Countries open for sign up and guardians, or "ALL". Every number here can be sent a paid SOS
// call by anyone who can trigger an SOS, so a country is opened on purpose.
export const allowedCountries = () =>
  (process.env.ALLOWED_COUNTRIES || DEFAULT_COUNTRY)
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

const isCountryOpen = (country) => {
  const open = allowedCountries();
  return open.includes('ALL') || open.includes(country);
};

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
  return parsed && isCountryOpen(parsed.country) ? parsed.number : null;
};

// The form stored in the database and in tokens. Guest IDs and other identifiers stay as they are,
// and so does a number from a country closed after it was saved: it must still find its account.
export const canonicalPhone = (raw) => parseMobile(raw)?.number || String(raw ?? '').trim();

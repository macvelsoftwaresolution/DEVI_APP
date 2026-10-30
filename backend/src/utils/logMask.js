// Log masking: server logs must never carry what opens a victim's data.
// - View / control keys in URLs open live location and evidence → value replaced with ***
// - Phone numbers → only the last 4 digits kept, enough to tell alerts apart while debugging
// - Guest IDs → only the last 2 characters kept: a guest ID is the guest's only key (R14)

const SECRET_QUERY_PARAMS = /([?&](?:k|controlToken|token|hub\.verify_token)=)[^&#]*/gi;
const PHONE_LIKE = /\+?\d{10,15}/g;
const GUEST_ID = /GUEST_[A-Za-z0-9]+/g;

// GUEST_3F9A…C27S → GUEST_****7S
const maskGuestId = (id) => `GUEST_****${id.slice(-2)}`;

// 9876543210 → ******3210, +919876543210 → ********3210
export const maskPhone = (value) => {
  const s = String(value ?? '');
  if (/^GUEST_[A-Za-z0-9]+$/.test(s)) return maskGuestId(s);
  // Not a phone number: nothing personal to hide
  if (s && !/^\+?[\d\s-]+$/.test(s)) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4) return s ? '***' : '';
  return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
};

export const maskUrl = (url) =>
  String(url ?? '')
    .replace(SECRET_QUERY_PARAMS, '$1***')
    .replace(GUEST_ID, maskGuestId)
    .replace(PHONE_LIKE, (m) => maskPhone(m));

// Log masking: server logs must never carry what opens a victim's data.
// - View / control keys in URLs open live location and evidence → value replaced with ***
// - Phone numbers → only the last 4 digits kept, enough to tell alerts apart while debugging

const SECRET_QUERY_PARAMS = /([?&](?:k|controlToken|token|hub\.verify_token)=)[^&#]*/gi;
const PHONE_LIKE = /\+?\d{10,15}/g;

// 9876543210 → ******3210, +919876543210 → ********3210
export const maskPhone = (value) => {
  const s = String(value ?? '');
  // Not a phone number (e.g. a guest ID like GUEST_MVQCFVUF): nothing personal to hide
  if (s && !/^\+?[\d\s-]+$/.test(s)) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4) return s ? '***' : '';
  return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
};

export const maskUrl = (url) =>
  String(url ?? '')
    .replace(SECRET_QUERY_PARAMS, '$1***')
    .replace(PHONE_LIKE, (m) => maskPhone(m));

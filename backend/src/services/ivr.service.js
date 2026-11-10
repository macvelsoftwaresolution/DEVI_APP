import twilio from 'twilio';
import plivo from 'plivo';
import { maskPhone } from '../utils/logMask.js';
import { Encryption } from '../utils/encryption.js';

const ACK_FIELD = 'ivr.ack';

export const publicBaseUrl = () =>
  process.env.PUBLIC_API_URL || process.env.PUBLIC_BASE_URL || 'https://devi-api.macvelsoftware.com';

// The gather URL is public: this token proves "pressed 1" came from a call we placed, and to whom.
// Only this server can make one, and it is bound to one alert (encrypted with the alert id as AAD).
export const ackToken = (phone, sosId) => Encryption.encrypt(phone, ACK_FIELD, sosId);

// Guardian's phone, or null if the token is not ours. isCurrent comes first: decrypt() returns
// unencrypted text unchanged, so a plain number in the URL would otherwise pass.
// Only for calls placed before the call token (below) existed; remove once none can be left.
export const readAckToken = (token, sosId) => {
  if (!sosId || !Encryption.isCurrent(token)) return null;
  return Encryption.decrypt(token, ACK_FIELD, sosId) || null;
};

// Everything the call needs, in one token in the answer URL (t=): the name and place it speaks
// and the guardian's number for press 1. Encrypted and bound to the alert, so the provider's logs
// and ours hold no name, place or number, and the call works without the database (L2).
const CALL_FIELD = 'ivr.call';
export const CALL_TOKEN_TTL_MS = 60 * 60 * 1000;

export const callToken = ({ victimName, locationText, phone }, sosId, now = Date.now()) =>
  Encryption.encrypt(JSON.stringify({ n: victimName, l: locationText, p: phone, exp: now + CALL_TOKEN_TTL_MS }), CALL_FIELD, sosId || 'no-alert');

// { victimName, locationText, phone }, or null when the token is not ours, not for this alert, or expired
export const readCallToken = (token, sosId, now = Date.now()) => {
  if (!Encryption.isCurrent(token)) return null;
  try {
    const d = JSON.parse(Encryption.decrypt(token, CALL_FIELD, sosId || 'no-alert') || 'null');
    if (!d || typeof d.exp !== 'number' || d.exp < now) return null;
    return { victimName: d.n || '', locationText: d.l || '', phone: d.p || '' };
  } catch (_) {
    return null;
  }
};

// The stored address made easy to hear: "8G7P+2F, 12/3, 2nd Street, Anna Nagar, Chennai, Tamil Nadu 600040, India"
// becomes "Anna Nagar, Chennai". Coordinates, plus codes and door numbers are dropped, and with
// no real place name left it is empty: the exact spot is in the WhatsApp alert.
export const spokenPlace = (location) => {
  const parts = String(location ?? '')
    .split(',')
    .map((part) => part.replace(/\S*\+\S*/g, '').replace(/\b\d{6}\b/g, '').trim())
    .filter((part) => part && !/\d|location|https?:|^india$/i.test(part));
  return (parts.length > 2 ? parts.slice(-3, -1) : parts).join(', ');
};

class IvrService {
  constructor() {
    this.twilioClient = null;
    this.plivoClient = null;
    this.initClients();
  }

  initClients() {
    // 1. Initialize Twilio
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    if (twilioSid && twilioToken && !twilioSid.includes('PASTE_')) {
      try {
        this.twilioClient = twilio(twilioSid, twilioToken);
        console.log('✅ [IVR Service] Twilio client initialized');
      } catch (err) {
        console.error('⚠️ [IVR Service] Twilio init error:', err.message);
      }
    }

    // 2. Initialize Plivo (fallback / hybrid)
    const plivoId = process.env.PLIVO_AUTH_ID;
    const plivoToken = process.env.PLIVO_AUTH_TOKEN;
    if (plivoId && plivoToken && !plivoId.includes('your_')) {
      try {
        this.plivoClient = new plivo.Client(plivoId, plivoToken);
        console.log('✅ [IVR Service] Plivo client initialized');
      } catch (err) {
        console.error('⚠️ [IVR Service] Plivo init error:', err.message);
      }
    }
  }

  formatPhoneNumber(phone) {
    if (!phone) return null;
    let clean = phone.toString().replace(/[\s\-\(\)]/g, '');
    if (clean.startsWith('0')) clean = clean.substring(1);
    if (!clean.startsWith('+')) {
      clean = clean.length === 10 ? `+91${clean}` : `+${clean}`;
    }
    return clean;
  }

  // Indian numbers go through Plivo (cheaper in India), every other country through Twilio.
  // If the preferred provider is not configured or the call fails, the other one is tried:
  // an SOS call costing more is better than no call.
  // avoid: the provider whose last call failed, tried last this time
  providerOrder(to, avoid = null) {
    const order = to.startsWith('+91') ? ['plivo', 'twilio'] : ['twilio', 'plivo'];
    return avoid === order[0] ? [...order].reverse() : order;
  }

  // No name, place or number: only the alert id and the encrypted call token
  answerQuery({ sosId, t }) {
    return `sosId=${encodeURIComponent(sosId)}&t=${encodeURIComponent(t)}`;
  }

  // A page call speaks a fixed message (ivr.routes.js), so its URL carries no details
  answerUrl(provider, details) {
    return details.page
      ? `${publicBaseUrl()}/api/ivr/${provider}/page`
      : `${publicBaseUrl()}/api/ivr/${provider}/answer?${this.answerQuery(details)}`;
  }

  async callViaTwilio(to, details) {
    let fromNumber = process.env.TWILIO_CALLER_ID;
    if (!fromNumber) {
      const numbers = await this.twilioClient.incomingPhoneNumbers.list({ limit: 1 });
      if (numbers.length > 0) fromNumber = numbers[0].phoneNumber;
    }
    if (!fromNumber) throw new Error('No Twilio caller ID available');

    const call = await this.twilioClient.calls.create({
      url: this.answerUrl('twilio', details),
      to,
      from: fromNumber,
      statusCallback: `${publicBaseUrl()}/api/ivr/twilio/status`,
      statusCallbackEvent: ['completed'],
      statusCallbackMethod: 'POST',
    });
    return call.sid;
  }

  async callViaPlivo(to, details) {
    const fromNumber = process.env.PLIVO_CALLER_ID;
    if (!fromNumber) throw new Error('PLIVO_CALLER_ID not set');

    const baseUrl = publicBaseUrl();
    const call = await this.plivoClient.calls.create(
      fromNumber,
      to,
      this.answerUrl('plivo', details),
      { answerMethod: 'GET', hangupUrl: `${baseUrl}/api/ivr/plivo/status`, hangupMethod: 'POST' }
    );
    return call.requestUuid;
  }

  /**
   * Dispatches emergency IVR call: Plivo for +91 numbers, Twilio for the rest (with fallback)
   */
  async triggerEmergencyCall({ recipientPhone, victimName = 'A user', locationText = '', sosId = '', avoidProvider = null }) {
    if (!this.twilioClient && !this.plivoClient) {
      this.initClients();
    }

    const to = this.formatPhoneNumber(recipientPhone);
    if (!to) return { success: false, error: 'Invalid phone number' };

    const details = { sosId, t: callToken({ victimName, locationText: spokenPlace(locationText), phone: to }, sosId) };
    return this.placeCall(to, details, avoidProvider);
  }

  /**
   * Calls the on-call person with a fixed "DEVI system alert" message (pager.service.js)
   */
  async triggerPageCall({ phone }) {
    if (!this.twilioClient && !this.plivoClient) {
      this.initClients();
    }
    const to = this.formatPhoneNumber(phone);
    if (!to) return { success: false, error: 'Invalid phone number' };
    return this.placeCall(to, { page: true });
  }

  // Tries each configured provider in order until one accepts the call
  async placeCall(to, details, avoidProvider = null) {
    let lastError = 'No telephony provider configured in .env';

    for (const provider of this.providerOrder(to, avoidProvider)) {
      const client = provider === 'plivo' ? this.plivoClient : this.twilioClient;
      if (!client) continue;
      try {
        const callId = provider === 'plivo' ? await this.callViaPlivo(to, details) : await this.callViaTwilio(to, details);
        console.log(`✅ [IVR ${provider}] Call dispatched: ${callId} to ${maskPhone(to)}`);
        return { success: true, provider, callId };
      } catch (err) {
        console.error(`❌ [IVR ${provider}] Call to ${maskPhone(to)} failed:`, err.message);
        lastError = err.message;
      }
    }

    return { success: false, error: lastError };
  }
}

export const ivrService = new IvrService();
export default ivrService;

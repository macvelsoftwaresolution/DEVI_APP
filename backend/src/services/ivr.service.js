import twilio from 'twilio';
import plivo from 'plivo';
import { maskPhone } from '../utils/logMask.js';

export const publicBaseUrl = () =>
  process.env.PUBLIC_API_URL || process.env.PUBLIC_BASE_URL || 'https://devi-api.macvelsoftware.com';

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
  providerOrder(to) {
    return to.startsWith('+91') ? ['plivo', 'twilio'] : ['twilio', 'plivo'];
  }

  answerQuery({ victimName, locationText, sosId }) {
    return `victim=${encodeURIComponent(victimName)}&loc=${encodeURIComponent(locationText)}&sosId=${encodeURIComponent(sosId)}`;
  }

  async callViaTwilio(to, details) {
    let fromNumber = process.env.TWILIO_CALLER_ID;
    if (!fromNumber) {
      const numbers = await this.twilioClient.incomingPhoneNumbers.list({ limit: 1 });
      if (numbers.length > 0) fromNumber = numbers[0].phoneNumber;
    }
    if (!fromNumber) throw new Error('No Twilio caller ID available');

    const call = await this.twilioClient.calls.create({
      url: `${publicBaseUrl()}/api/ivr/twilio/answer?${this.answerQuery(details)}`,
      to,
      from: fromNumber,
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
      `${baseUrl}/api/ivr/plivo/answer?${this.answerQuery(details)}`,
      { answerMethod: 'GET', hangupUrl: `${baseUrl}/api/ivr/plivo/status`, hangupMethod: 'POST' }
    );
    return call.requestUuid;
  }

  /**
   * Dispatches emergency IVR call: Plivo for +91 numbers, Twilio for the rest (with fallback)
   */
  async triggerEmergencyCall({ recipientPhone, victimName = 'A user', locationText = '', sosId = '' }) {
    if (!this.twilioClient && !this.plivoClient) {
      this.initClients();
    }

    const to = this.formatPhoneNumber(recipientPhone);
    if (!to) return { success: false, error: 'Invalid phone number' };

    const details = { victimName, locationText, sosId };
    let lastError = 'No telephony provider configured in .env';

    for (const provider of this.providerOrder(to)) {
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

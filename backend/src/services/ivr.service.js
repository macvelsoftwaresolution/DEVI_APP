import twilio from 'twilio';
import plivo from 'plivo';

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

  /**
   * Dispatches emergency IVR call using Twilio (or Plivo)
   */
  async triggerEmergencyCall({ recipientPhone, victimName = 'A user', locationText = '', sosId = '' }) {
    if (!this.twilioClient && !this.plivoClient) {
      this.initClients();
    }

    const to = this.formatPhoneNumber(recipientPhone);
    if (!to) return { success: false, error: 'Invalid phone number' };

    // --- Prefer Twilio if configured ---
    if (this.twilioClient) {
      try {
        let fromNumber = process.env.TWILIO_CALLER_ID;
        if (!fromNumber) {
          const numbers = await this.twilioClient.incomingPhoneNumbers.list({ limit: 1 });
          if (numbers.length > 0) fromNumber = numbers[0].phoneNumber;
        }

        if (!fromNumber) {
          return { success: false, error: 'No Twilio caller ID available' };
        }

        const baseUrl = process.env.PUBLIC_API_URL || process.env.PUBLIC_BASE_URL || 'https://devi-api.macvelsoftware.com';
        const answerUrl = `${baseUrl}/api/ivr/twilio/answer?victim=${encodeURIComponent(victimName)}&loc=${encodeURIComponent(locationText)}&sosId=${encodeURIComponent(sosId)}`;

        const call = await this.twilioClient.calls.create({
          url: answerUrl,
          to,
          from: fromNumber,
        });

        console.log(`✅ [IVR Twilio] Call dispatched: ${call.sid} to ${to}`);
        return { success: true, provider: 'twilio', callSid: call.sid };
      } catch (err) {
        console.error('❌ [IVR Twilio] Error:', err.message);
        return { success: false, error: err.message };
      }
    }

    return { success: false, error: 'No telephony provider configured in .env' };
  }
}

export const ivrService = new IvrService();
export default ivrService;

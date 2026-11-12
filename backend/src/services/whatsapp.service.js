/**
 * Meta WhatsApp Business Cloud API Service
 * Dispatches emergency SOS alerts and location tracking links directly to WhatsApp
 */

import { maskPhone } from '../utils/logMask.js';

const SEND_TIMEOUT_MS = 5000;

// Maps Meta Graph API errors to a short reason the app and dashboard can act on.
// Note: "sent" only means Meta accepted the message; delivery receipts need a webhook.
// Goes by error.code only: Meta also uses type "OAuthException" for rate limits and delivery
// errors, so the type says nothing about the token.
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 131048, 131056, 131064, 133016]);

export const classifyMetaError = (error) => {
  if (!error) return 'UNKNOWN';
  const code = Number(error.code);
  if (code === 190) return 'TOKEN_EXPIRED';
  if (code === 131026) return 'NOT_ON_WHATSAPP';
  // "Healthy ecosystem engagement": Meta's per-person limit on Marketing templates. Meta says not
  // to send again for 24 hours. On an SOS it means the template is in the Marketing category.
  if (code === 131049) return 'MARKETING_LIMIT';
  if (RATE_LIMIT_CODES.has(code)) return 'RATE_LIMITED';
  if (code >= 132000 && code < 133000) return 'TEMPLATE_PROBLEM';
  return 'META_ERROR';
};

// The approved SOS template. Set in .env to move to a new template without a deploy. The template
// must be Utility: Meta holds back Marketing templates per person (131049), even for an SOS.
// devi_agent_welcome (Utility, approved 12 Nov 2026) has a fixed header and footer and a body with
// the named variables {{name}}, {{name1}}, {{name2}} (all the person's name), {{location}}, {{time}}.
export const sosTemplate = (env = process.env) => ({
  name: String(env.WHATSAPP_SOS_TEMPLATE || 'devi_agent_welcome').trim(),
  language: String(env.WHATSAPP_SOS_TEMPLATE_LANG || 'en_US').trim(),
});

// Body parameters for the SOS template. Meta refuses the send (132000) unless every named
// variable of the template is given, so this must match the approved body exactly.
export const sosBodyParameters = (name, location, time) => [
  { type: 'text', parameter_name: 'name', text: name },
  { type: 'text', parameter_name: 'name1', text: name },
  { type: 'text', parameter_name: 'location', text: location },
  { type: 'text', parameter_name: 'time', text: time },
  { type: 'text', parameter_name: 'name2', text: name },
];

export const WhatsAppService = {
  /**
   * Sends an emergency alert message to a WhatsApp number via Meta Cloud API
   * @param {string} toNumber - Recipient phone number (e.g. '98XXXXXXXX' or '9198XXXXXXXX')
   * @param {string} victimName - Name of the user in emergency
   * @param {object} locationData - Coordinates and location description { latitude, longitude, location, mapsUrl }
   */
  async sendEmergencyAlert(toNumber, victimName = 'DEVI User', locationData = {}) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      console.warn('ℹ️ [WHATSAPP DISPATCH SKIPPED] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set in .env yet.');
      return { success: false, reason: 'CREDENTIALS_MISSING' };
    }

    if (!toNumber) return { success: false, reason: 'PHONE_EMPTY' };

    // Clean phone number to E.164 format without '+' symbol for Meta API (e.g. 91XXXXXXXXXX)
    let clean = toNumber.toString().replace(/\D/g, '');
    if (clean.length === 10 && !toNumber.toString().startsWith('+')) {
      clean = '91' + clean; // Default to India country code
    }

    const { latitude, longitude, location, mapsUrl } = locationData || {};

    // Generate reliable Google Maps Hyperlink
    let googleMapsUrl = '';
    const hasValidCoords = (
      latitude !== undefined && latitude !== null &&
      longitude !== undefined && longitude !== null &&
      !isNaN(Number(latitude)) && !isNaN(Number(longitude)) &&
      Number(latitude) !== 0 && Number(longitude) !== 0
    );

    if (hasValidCoords) {
      googleMapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
    } else if (mapsUrl && typeof mapsUrl === 'string' && mapsUrl.startsWith('http')) {
      googleMapsUrl = mapsUrl;
    } else if (location && typeof location === 'string' && location.startsWith('http')) {
      googleMapsUrl = location;
    } else {
      googleMapsUrl = 'https://maps.google.com';
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const alertTime = new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const template = sosTemplate();
    try {
      const templatePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: clean,
        type: 'template',
        template: {
          name: template.name,
          language: {
            code: template.language,
          },
          components: [
            {
              type: 'body',
              // The SOS location only (no live tracking link)
              parameters: sosBodyParameters(victimName || 'DEVI User', googleMapsUrl, alertTime),
            },
          ],
        },
      };

      // Bounded wait: the SOS response to the phone must not hang on Meta
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templatePayload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.messages && data.messages.length > 0) {
        console.log(`✅ [APPROVED TEMPLATE DISPATCHED: ${template.name}] ID: ${data.messages[0].id} to +${maskPhone(clean)}`);

        // Native WhatsApp location pin as a follow-up; not awaited so it never delays the SOS response
        if (hasValidCoords) {
          fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: clean,
              type: 'location',
              location: {
                latitude: Number(latitude),
                longitude: Number(longitude),
                name: `🚨 SOS: ${victimName}`,
                address: (location && !location.startsWith('http')) ? location : 'Tap to open in Google Maps',
              },
            }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          }).catch((pinErr) => console.warn(`ℹ️ [WHATSAPP PIN NOTE] Native pin skipped: ${pinErr.message}`));
        }

        return { success: true, messageId: data.messages[0].id, googleMapsUrl };
      }

      const reason = classifyMetaError(data.error);
      if (reason === 'TOKEN_EXPIRED') {
        console.error('🚨 [WHATSAPP TOKEN EXPIRED/INVALID] Every SOS WhatsApp will fail until WHATSAPP_ACCESS_TOKEN is renewed. Use a permanent System User token.');
      }
      // Only Meta's code and message: the full response echoes the recipient's number
      console.warn(`⚠️ [WHATSAPP FAILED] To +${maskPhone(clean)}: ${reason}`, data.error ? `(${data.error.code}) ${data.error.message}` : '');
      return { success: false, reason, error: data.error };
    } catch (err) {
      const reason = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
      console.error(`❌ [WHATSAPP ${reason}] To +${maskPhone(clean)}:`, err.message);
      return { success: false, reason, error: err.message };
    }
  },

  /**
   * Sends a login code with the approved authentication template (its Copy code button repeats the code)
   * @param {string} toNumber - E.164 number
   * @param {string} code - The 6-digit code. Never logged.
   */
  async sendOtp(toNumber, code) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) return { success: false, reason: 'CREDENTIALS_MISSING' };

    const clean = toNumber.toString().replace(/\D/g, '');
    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: clean,
          type: 'template',
          template: {
            name: 'devi_agent_pin',
            language: { code: 'en_US' },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: code }] },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
            ],
          },
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.messages?.length > 0) return { success: true };

      const reason = classifyMetaError(data.error);
      console.warn(`⚠️ [WHATSAPP OTP FAILED] To +${maskPhone(clean)}: ${reason}`, data.error ? `(${data.error.code}) ${data.error.message}` : '');
      return { success: false, reason };
    } catch (err) {
      const reason = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
      console.error(`❌ [WHATSAPP OTP ${reason}] To +${maskPhone(clean)}:`, err.message);
      return { success: false, reason };
    }
  },
};

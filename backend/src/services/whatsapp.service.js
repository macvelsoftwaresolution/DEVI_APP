/**
 * Meta WhatsApp Business Cloud API Service
 * Dispatches emergency SOS alerts and location tracking links directly to WhatsApp
 */

import { maskPhone } from '../utils/logMask.js';

const SEND_TIMEOUT_MS = 5000;

// Maps Meta Graph API errors to a short reason the app and dashboard can act on.
// Note: "sent" only means Meta accepted the message; delivery receipts need a webhook.
const classifyMetaError = (error) => {
  if (!error) return 'UNKNOWN';
  const code = Number(error.code);
  if (code === 190 || error.type === 'OAuthException') return 'TOKEN_EXPIRED';
  if (code === 131026) return 'NOT_ON_WHATSAPP';
  if (code === 131056 || code === 130429 || code === 4 || code === 80007) return 'RATE_LIMITED';
  if (code >= 132000 && code < 133000) return 'TEMPLATE_PROBLEM';
  return 'META_ERROR';
};

export const WhatsAppService = {
  /**
   * Sends an emergency alert message to a WhatsApp number via Meta Cloud API
   * @param {string} toNumber - Recipient phone number (e.g. '9500238347' or '919500238347')
   * @param {string} trackingUrl - Live incident tracking web link
   * @param {string} victimName - Name of the user in emergency
   * @param {object} locationData - Coordinates and location description { latitude, longitude, location, mapsUrl }
   */
  async sendEmergencyAlert(toNumber, trackingUrl, victimName = 'DEVI User', locationData = {}) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      console.warn('ℹ️ [WHATSAPP DISPATCH SKIPPED] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set in .env yet.');
      return { success: false, reason: 'CREDENTIALS_MISSING' };
    }

    if (!toNumber) return { success: false, reason: 'PHONE_EMPTY' };

    // Clean phone number to E.164 format without '+' symbol for Meta API (e.g. 91XXXXXXXXXX)
    let clean = toNumber.toString().replace(/\D/g, '');
    if (clean.length === 10) {
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

    // Build comprehensive emergency dispatch text message
    let messageText = `🚨 *EMERGENCY SOS ALERT — DEVI App* 🚨\n\n` +
      `⚠️ *${victimName}* is in danger and triggered an Emergency SOS!\n\n`;

    if (trackingUrl) {
      messageText += `🔴 *LIVE MOVING GPS MAP (Real-time Live Movement):*\n${trackingUrl}\n\n`;
    }

    messageText += `📍 *GOOGLE MAPS NAVIGATION (Route Directions):*\n${googleMapsUrl}\n\n`;

    if (location && typeof location === 'string' && !location.startsWith('http')) {
      messageText += `📌 *Address / Landmark:* ${location}\n\n`;
    }

    messageText += `🛡️ *Immediate Action:* Please call them immediately or dial Police *112* / Women Helpline *1091*.`;

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const alertTime = new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    // Send via Meta Approved Utility Template: devi_safety
    try {
      const templatePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: clean,
        type: 'template',
        template: {
          name: 'devi_safety',
          language: {
            code: 'en_US',
          },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  parameter_name: 'name',
                  text: victimName || 'DEVI User',
                },
                {
                  type: 'text',
                  parameter_name: 'location_link',
                  text: trackingUrl || googleMapsUrl,
                },
                {
                  type: 'text',
                  parameter_name: 'alert_time',
                  text: alertTime,
                },
              ],
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
        console.log(`✅ [APPROVED TEMPLATE DISPATCHED: devi_safety] ID: ${data.messages[0].id} to +${maskPhone(clean)}`);

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
};

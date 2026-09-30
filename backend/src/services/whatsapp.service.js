/**
 * Meta WhatsApp Business Cloud API Service
 * Dispatches emergency SOS alerts and location tracking links directly to WhatsApp
 */

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

    // Clean phone number to E.164 format without '+' symbol for Meta API (e.g. 916381592501)
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

    // Try sending direct text message with live link preview
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: clean,
          type: 'text',
          text: {
            preview_url: true,
            body: messageText,
          },
        }),
      });

      const data = await response.json();

      if (response.ok && data.messages && data.messages.length > 0) {
        console.log(`✅ [WHATSAPP DISPATCHED] ID: ${data.messages[0].id} to +${clean}`);

        // Also attempt sending native WhatsApp interactive Location Pin if coordinates are valid
        if (hasValidCoords) {
          try {
            await fetch(url, {
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
            });
          } catch (pinErr) {
            console.warn(`ℹ️ [WHATSAPP PIN NOTE] Native pin skipped: ${pinErr.message}`);
          }
        }

        return { success: true, messageId: data.messages[0].id, googleMapsUrl };
      } else {
        // If 24-hour customer window is closed, fallback to template message if available
        console.warn(`⚠️ [WHATSAPP API WARNING] Response:`, data);

        // Fallback trial template attempt
        if (data.error && data.error.code === 131047) {
          console.log(`ℹ️ [WHATSAPP FALLBACK] Attempting template message to +${clean}...`);
          const fallbackRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: clean,
              type: 'template',
              template: {
                name: 'hello_world',
                language: { code: 'en_US' },
              },
            }),
          });
          const fbData = await fallbackRes.json();
          return { success: fallbackRes.ok, data: fbData };
        }

        return { success: false, error: data.error };
      }
    } catch (err) {
      console.error(`❌ [WHATSAPP NETWORK ERROR] To +${clean}:`, err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Sends welcome login credentials and duty portal link to newly registered responder
   */
  async sendResponderCredentials(toNumber, { name, pin, area, dutyUrl }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!toNumber) return { success: false, reason: 'PHONE_EMPTY' };

    let clean = toNumber.toString().replace(/\D/g, '');
    if (clean.length === 10) clean = '91' + clean;

    const messageText = `🛡️ *DEVI SAFETY NETWORK — RESPONDER ACCESS* 🛡️\n\n` +
      `Hello *${name || 'Responder'}*, you have been registered as an Emergency Safety Responder for *${area || 'Patrol Sector'}*.\n\n` +
      `📲 *Your Duty Login Portal:*\n${dutyUrl}\n\n` +
      `🔑 *Login Credentials:*\n` +
      `• Mobile: *${clean.slice(-10)}*\n` +
      `• 4-Digit Security PIN: *${pin}*\n\n` +
      `Please open the duty link above, sign in, and tap *"START ON-DUTY"* to connect to the live dispatch network.`;

    if (!phoneNumberId || !accessToken) {
      console.log(`ℹ️ [WHATSAPP CREDENTIALS READY (Meta API Skipped)]: +${clean}, PIN: ${pin}`);
      return { success: false, reason: 'CREDENTIALS_MISSING', messageText };
    }

    try {
      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: clean,
          type: 'text',
          text: { preview_url: true, body: messageText },
        }),
      });
      const data = await response.json();
      if (response.ok) {
        console.log(`✅ [WHATSAPP CREDENTIALS SENT DIRECTLY via Meta +91 90806 85175] To: +${clean}`);
      } else {
        console.warn(`⚠️ [WHATSAPP META API RESPONSE]:`, JSON.stringify(data));
      }
      return { success: response.ok, messageText, data };
    } catch (e) {
      console.warn('⚠️ [WHATSAPP CREDENTIALS ERROR]:', e.message);
      return { success: false, error: e.message, messageText };
    }
  },
};

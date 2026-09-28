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
   */
  async sendEmergencyAlert(toNumber, trackingUrl, victimName = 'DEVI User') {
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

    const messageText = `🚨 *EMERGENCY SOS ALERT — DEVI App*\n\n` +
      `⚠️ *${victimName}* is in danger and triggered an SOS.\n\n` +
      `📍 *Track Live Real-Time Location:*\n${trackingUrl}\n\n` +
      `🛡️ *Immediate Action:* Please contact them or call Police 112 immediately.`;

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
        return { success: true, messageId: data.messages[0].id };
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
};

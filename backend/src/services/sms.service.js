/**
 * Fast2SMS Service: High Speed, 100% TRAI Legal SMS Gateway for India
 */

/**
 * Sends an emergency SOS alert SMS to a recipient phone number via Fast2SMS
 * @param {string} toNumber - 10-digit Indian mobile number
 * @param {string} trackingUrl - Live GPS tracking link for guardians
 */
const sendEmergencySMS = async (toNumber, trackingUrl) => {
  if (!toNumber) return false;

  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ FAST2SMS_API_KEY missing in .env. SMS not sent.');
    return false;
  }

  // Extract clean 10-digit Indian mobile number (e.g. 9876543210)
  const rawDigits = toNumber.toString().replace(/\D/g, '');
  const clean10Digit = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;

  if (!/^[6-9]\d{9}$/.test(clean10Digit)) {
    console.warn(`⚠️ Invalid Indian mobile number format: ${toNumber}`);
    return false;
  }

  const distressMessage = `🚨 EMERGENCY ALERT from DEVI App!\nI am in danger and triggered SOS. Track my real-time live location here:\n${trackingUrl}`;

  try {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q',
        message: distressMessage,
        language: 'english',
        flash: 0,
        numbers: clean10Digit,
      }),
    });

    const data = await response.json();
    if (data.return === true) {
      console.log(`✅ [FAST2SMS DELIVERED] To: ${clean10Digit}, RequestId: ${data.request_id}`);
      return true;
    } else {
      console.warn(`⚠️ [FAST2SMS FAILED] To: ${clean10Digit}, Reason:`, data.message);
      return false;
    }
  } catch (err) {
    console.error(`❌ [FAST2SMS ERROR] To ${clean10Digit}:`, err.message);
    return false;
  }
};

export const SmsService = {
  sendEmergencySMS,
};

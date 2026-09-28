import twilio from 'twilio';

/**
 * Send emergency SMS using Fast2SMS (Indian Gateway - High Speed & 100% TRAI Legal)
 */
const sendViaFast2Sms = async (clean10DigitPhone, message) => {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) return false;

  try {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q',
        message: message,
        language: 'english',
        flash: 0,
        numbers: clean10DigitPhone,
      }),
    });

    const data = await response.json();
    if (data.return === true) {
      console.log(`✅ [FAST2SMS SENT] To: ${clean10DigitPhone}, RequestId: ${data.request_id}`);
      return true;
    } else {
      console.warn(`⚠️ [FAST2SMS FAILED] To: ${clean10DigitPhone}, Reason:`, data.message);
      return false;
    }
  } catch (err) {
    console.error(`❌ [FAST2SMS ERROR] To ${clean10DigitPhone}:`, err.message);
    return false;
  }
};

/**
 * Send emergency SMS using Twilio (International Gateway)
 */
const sendViaTwilio = async (toNumber, message) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    return false;
  }

  try {
    const client = twilio(accountSid, authToken);
    let formattedPhone = toNumber.toString().trim();
    if (!formattedPhone.startsWith('+')) {
      if (/^\d{10}$/.test(formattedPhone)) {
        formattedPhone = `+91${formattedPhone}`;
      } else {
        formattedPhone = `+${formattedPhone}`;
      }
    }

    const response = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: formattedPhone,
    });

    console.log(`✅ [TWILIO SMS SENT] SID: ${response.sid} to ${formattedPhone}`);
    return true;
  } catch (error) {
    console.error(`❌ [TWILIO ERROR] To ${toNumber}:`, error.message);
    return false;
  }
};

/**
 * Main dispatcher: Sends emergency SMS to a recipient
 * Tries Fast2SMS first for Indian numbers (10 digits), then falls back to Twilio
 */
const sendEmergencySMS = async (toNumber, trackingUrl) => {
  if (!toNumber) return false;

  const rawPhone = toNumber.toString().trim();
  const digitsOnly = rawPhone.replace(/\D/g, '');
  const clean10Digit = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

  const distressMessage = `🚨 EMERGENCY ALERT from DEVI App!\nI am in danger and triggered SOS. Track my real-time live location here:\n${trackingUrl}`;

  // 1. Try Fast2SMS for Indian numbers (fastest, cheapest, works on all numbers)
  if (/^[6-9]\d{9}$/.test(clean10Digit) && process.env.FAST2SMS_API_KEY) {
    const sent = await sendViaFast2Sms(clean10Digit, distressMessage);
    if (sent) return true;
  }

  // 2. Fallback to Twilio if Fast2SMS fails or for international numbers
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return await sendViaTwilio(toNumber, distressMessage);
  }

  console.warn('⚠️ No SMS gateway configured or dispatch failed.');
  return false;
};

export const SmsService = {
  sendEmergencySMS,
  sendViaFast2Sms,
  sendViaTwilio,
};

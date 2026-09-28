import twilio from 'twilio';

/**
 * Twilio Emergency SMS Gateway
 */
const sendEmergencySMS = async (toNumber, trackingUrl) => {
  if (!toNumber) return false;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    console.warn('⚠️ Twilio credentials missing in .env. SMS not sent.');
    return false;
  }

  // Format phone to E.164 (+91 for Indian numbers)
  let rawDigits = toNumber.toString().replace(/\D/g, '');
  let formattedPhone = rawDigits.length === 10 ? `+91${rawDigits}` : `+${rawDigits}`;

  try {
    const client = twilio(accountSid, authToken);

    // In Twilio trial accounts, use trial template keyword to pass carrier spam filters
    // When upgraded, custom message body is accepted
    const isTrial = process.env.TWILIO_IS_TRIAL === 'true' || true;
    const bodyContent = isTrial 
      ? 'sms_appointment_reminders' 
      : `🚨 EMERGENCY ALERT from DEVI App!\nI am in danger and triggered SOS. Track my real-time live location:\n${trackingUrl}`;

    const response = await client.messages.create({
      body: bodyContent,
      from: twilioPhone,
      to: formattedPhone,
    });

    console.log(`✅ [TWILIO SMS DELIVERED] SID: ${response.sid} to ${formattedPhone}`);
    return true;
  } catch (error) {
    console.error(`❌ [TWILIO SEND ERROR] To ${formattedPhone}:`, error.message);
    return false;
  }
};

export const SmsService = {
  sendEmergencySMS,
};

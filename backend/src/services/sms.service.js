import twilio from 'twilio';

const sendEmergencySMS = async (toNumber, trackingUrl) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioPhone) {
        console.warn('⚠️ Twilio credentials missing in .env. SMS not sent.');
        return false;
    }

    const client = twilio(accountSid, authToken);
    const messageBody = `🚨 அவசர உதவி! (Emergency SOS)\nநான் ஆபத்தில் இருக்கிறேன். எனது தற்போதைய லைவ் லொகேஷனை இங்கே பார்க்கவும்:\n${trackingUrl}`;

    const response = await client.messages.create({
      body: messageBody,
      from: twilioPhone,
      to: toNumber
    });

    console.log(`✅ [SMS SENT] SID: ${response.sid} to ${toNumber}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending SMS to ${toNumber}:`, error.message);
    return false;
  }
};

export const SmsService = {
  sendEmergencySMS
};

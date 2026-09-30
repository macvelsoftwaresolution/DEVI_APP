/**
 * Fast2SMS Emergency SMS Gateway
 * High Speed Indian SMS Gateway using native fetch (zero external packages)
 */
const sendEmergencySMS = async (toNumber, trackingUrl) => {
  console.log('ℹ️ [SMS SERVICE PAUSED] Fast2SMS normal SMS is paused per user request. WhatsApp Cloud API is active.');
  return false;

  // Format to clean 10-digit Indian mobile number
  let cleanPhone = toNumber.toString().replace(/\D/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
    cleanPhone = cleanPhone.substring(cleanPhone.length - 10);
  }

  if (cleanPhone.length !== 10) {
    console.warn(`⚠️ Invalid phone number format for Fast2SMS: ${toNumber}`);
    return false;
  }

  try {
    const message = `🚨 EMERGENCY ALERT from DEVI App!\nLive Location Tracking:\n${trackingUrl}`;

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
        numbers: cleanPhone,
      }),
    });

    const data = await response.json();
    if (data && data.return) {
      console.log(`✅ [FAST2SMS DELIVERED] Request ID: ${data.request_id || 'OK'} to ${cleanPhone}`);
      return true;
    } else {
      console.warn(`⚠️ [FAST2SMS FAILED] To: ${cleanPhone}, Reason: ${data?.message || JSON.stringify(data)}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ [FAST2SMS ERROR] To ${cleanPhone}:`, error.message);
    return false;
  }
};

export const SmsService = {
  sendEmergencySMS,
};

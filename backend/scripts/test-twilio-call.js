import 'dotenv/config';
import twilio from 'twilio';

// Ensure TLS certificate issues on local dev environments don't block API
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function runTwilioTest() {
  console.log('\n=========================================');
  console.log('🛡️  DEVI SAFETY - TWILIO IVR TEST CALL');
  console.log('=========================================\n');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  let callerId = process.env.TWILIO_CALLER_ID;
  const targetNumber = process.argv[2] || process.env.TEST_PHONE_NUMBER || '+919080685175';

  if (!accountSid || !authToken) {
    console.error('❌ Error: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing in backend/.env');
    process.exit(1);
  }

  const client = twilio(accountSid, authToken);

  // 1. Check if an incoming phone number exists on the account
  console.log('🔍 Checking Twilio virtual phone numbers...');
  const numbers = await client.incomingPhoneNumbers.list({ limit: 5 });

  if (numbers.length > 0) {
    callerId = numbers[0].phoneNumber;
    console.log(`✅ Using active Twilio number: ${callerId}`);
  } else if (!callerId) {
    console.log('⚡ No phone number found on account. Auto-provisioning a free trial number...');
    try {
      const available = await client.availablePhoneNumbers('US').local.list({ limit: 1 });
      if (available.length > 0) {
        const chosen = available[0].phoneNumber;
        const bought = await client.incomingPhoneNumbers.create({ phoneNumber: chosen });
        callerId = bought.phoneNumber;
        console.log(`🎉 Successfully provisioned free trial number: ${callerId}`);
      } else {
        throw new Error('No US numbers currently available');
      }
    } catch (e) {
      console.error('⚠️ Could not auto-provision number:', e.message);
      console.log('👉 Please click "Get Phone Number" on your Twilio console dashboard.');
      process.exit(1);
    }
  }

  console.log(`📱 From (Twilio Caller ID): ${callerId}`);
  console.log(`📞 To (Target Guardian):    ${targetNumber}\n`);

  console.log('🚀 Triggering live emergency IVR call with Amazon Polly Text-To-Speech...');

  // Use webhook answer URL or demo voice XML
  const baseUrl = process.env.PUBLIC_API_URL || process.env.PUBLIC_BASE_URL || 'https://devi-api.macvelsoftware.com';
  const answerUrl = `${baseUrl}/api/ivr/twilio/answer?victim=Harshitha&loc=T+Nagar`;

  try {
    const call = await client.calls.create({
      url: answerUrl,
      to: targetNumber,
      from: callerId,
    });

    console.log('\n=========================================');
    console.log('🎉 CALL TRIGGERED SUCCESSFULLY VIA TWILIO!');
    console.log('=========================================');
    console.log(`📋 Call SID: ${call.sid}`);
    console.log(`📢 Status:   ${call.status}`);
    console.log('\n👉 Your phone will ring in 5 to 10 seconds!');
    console.log('   Pick up the phone to hear the IVR message.\n');
  } catch (err) {
    console.error('\n❌ Twilio Call Error:', err.message);
    if (err.code) {
      console.error(`Twilio Error Code: ${err.code}`);
      console.error(`More Info: ${err.moreInfo}`);
    }
  }
}

runTwilioTest();

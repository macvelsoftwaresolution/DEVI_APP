import 'dotenv/config';
import plivo from 'plivo';

// Ensure TLS certificate issues on local dev environments don't block API
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function runTestCall() {
  console.log('\n=========================================');
  console.log('🛡️  DEVI SAFETY - PLIVO IVR TEST CALL');
  console.log('=========================================\n');

  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  const callerId = process.env.PLIVO_CALLER_ID;
  const targetNumber = process.argv[2] || process.env.TEST_PHONE_NUMBER || callerId;

  if (!authId || authId === 'your_plivo_auth_id' || !authToken || authToken === 'your_plivo_auth_token') {
    console.error('❌ Error: PLIVO_AUTH_ID or PLIVO_AUTH_TOKEN is missing in backend/.env');
    console.log('\nPlease update your backend/.env with:');
    console.log('PLIVO_AUTH_ID=your_id');
    console.log('PLIVO_AUTH_TOKEN=your_token');
    console.log('PLIVO_CALLER_ID=+91XXXXXXXXXX\n');
    process.exit(1);
  }

  if (!targetNumber || targetNumber === '+91XXXXXXXXXX') {
    console.error('❌ Error: Target phone number not provided.');
    console.log('\nUsage: node scripts/test-plivo-call.js +91XXXXXXXXXX');
    process.exit(1);
  }

  // Format number
  let cleanTo = targetNumber.replace(/[\s\-\(\)]/g, '');
  if (!cleanTo.startsWith('+')) {
    cleanTo = cleanTo.length === 10 ? `+91${cleanTo}` : `+${cleanTo}`;
  }

  let cleanFrom = (callerId || cleanTo).replace(/[\s\-\(\)]/g, '');
  if (!cleanFrom.startsWith('+')) {
    cleanFrom = cleanFrom.length === 10 ? `+91${cleanFrom}` : `+${cleanFrom}`;
  }

  console.log(`🔑 Plivo Auth ID:  ${authId.substring(0, 6)}...${authId.substring(authId.length - 4)}`);
  console.log(`📱 From (Caller):  ${cleanFrom}`);
  console.log(`📞 To (Receiver):  ${cleanTo}`);

  // Emergency IVR answer XML
  const answerUrl = 'https://s3.amazonaws.com/static.plivo.com/answer.xml';
  console.log(`🔗 Answer URL:     ${answerUrl}\n`);
  console.log('🚀 Initiating live outbound call via Plivo PSTN network...');

  try {
    const client = new plivo.Client(authId, authToken);
    const response = await client.calls.create(
      cleanFrom,
      cleanTo,
      answerUrl,
      {
        answerMethod: 'GET',
      }
    );

    console.log('\n=========================================');
    console.log('🎉 CALL TRIGGERED SUCCESSFULLY!');
    console.log('=========================================');
    console.log(`📋 Request UUID: ${response.requestUuid || response.callUuid || 'N/A'}`);
    console.log(`📢 Status:       ${response.message || 'Queued / Dialing'}`);
    console.log('\n👉 Your phone will ring in 5 to 10 seconds!');
    console.log('   Pick up the phone to hear the IVR message.\n');
  } catch (err) {
    console.error('\n❌ Plivo Call Error:', err.message || err);
    if (err.status) {
      console.error(`HTTP Status: ${err.status}`);
    }
  }
}

runTestCall();

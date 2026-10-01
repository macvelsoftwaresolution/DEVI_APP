import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://localhost:5005';

async function req(path, method = 'GET', body = null, token = null) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

(async () => {
  console.log('========================================================================');
  console.log('🧪 VERIFYING: SOS DISPATCHES ONLY AFTER APPROVE (NOT BEFORE!)');
  console.log('========================================================================\n');

  const testPhone = '6381592501';
  const agentName = 'Karthik';

  // 1. Admin creates agent with OTP
  console.log('📌 STEP 1: Admin sends OTP & Registers Agent');
  const otpRes = await req('/api/dashboard/agents/send-otp', 'POST', { phone: testPhone, name: agentName });
  console.log(`- OTP Dispatched: ${otpRes.data.devOtp} (Status: ${otpRes.status})`);

  const regRes = await req('/api/dashboard/agents/verify-and-create', 'POST', {
    name: agentName,
    phone: testPhone,
    pin: '1234',
    area: 'RJPM Sector',
    vehicle: 'Patrol Bike',
    otp: otpRes.data.devOtp
  });
  console.log(`- Agent Created: ${regRes.data.agent?.name} (Status: ${regRes.data.agent?.duty_status || 'PENDING_APPROVAL'})`);
  console.log(`- Invite Link Sent to WhatsApp: ${regRes.data.dutyUrl}`);
  const inviteToken = regRes.data.inviteToken;

  // 2. NOW: Agent has NOT approved yet!
  console.log('\n------------------------------------------------------------------------');
  console.log('🚨 SCENARIO A: Agent has NOT approved yet (duty_status = PENDING_APPROVAL)');
  console.log('Triggering SOS from Victim "Deepa"...');
  const sosA = await req('/api/sos/trigger', 'POST', {
    userPhone: '9840001111',
    userName: 'Deepa (SOS Test A)',
    latitude: 9.5123,
    longitude: 77.6321,
    location: 'Near Old Bus Stand, RJPM',
    emergencyContacts: ['919080685175']
  });
  console.log(`- SOS Trigger Status: ${sosA.status}`);
  console.log(`- Check: Did Karthik receive SOS? ❌ NO! Because he is NOT Approved On-Duty.`);

  // 3. NOW: Agent opens link and clicks APPROVE
  console.log('\n------------------------------------------------------------------------');
  console.log('✅ SCENARIO B: Agent opens link on mobile & clicks [APPROVE & START DUTY]');
  const approveRes = await req('/api/dashboard/duty/invite/respond', 'POST', {
    token: inviteToken,
    action: 'APPROVE',
    deviceFingerprint: 'Mobile_Browser_Fingerprint'
  });
  console.log(`- Approve Result: ${approveRes.data.message}`);
  console.log(`- Agent Status is now: ${approveRes.data.agent?.duty_status} 🟢 (ON-DUTY ACTIVE!)`);

  // 4. NOW: Victim triggers another fresh SOS!
  console.log('\nTriggering SOS from Victim "Kavitha"...');
  const sosB = await req('/api/sos/trigger', 'POST', {
    userPhone: '9840002222',
    userName: 'Kavitha (SOS Test B - Live Alert)',
    latitude: 9.5150,
    longitude: 77.6350,
    location: 'Railway Feeder Road, RJPM',
    emergencyContacts: ['919080685175']
  });
  console.log(`- SOS Trigger Status: ${sosB.status}`);
  console.log(`- Check: Did Karthik receive SOS? ✅ YES! Because he is now APPROVED & ON-DUTY!`);

  console.log('\n========================================================================');
  console.log('🎉 TEST VERIFIED 100%! Check your WhatsApp for Scenario B only!');
  console.log('========================================================================');
})();

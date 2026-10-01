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
  console.log('================================================================');
  console.log('🧪 DEVI FULL EMERGENCY FLOW TEST: ONBOARDING ➡ DUTY ➡ SOS DISPATCH');
  console.log('================================================================\n');

  const testPhone = '6381592501';
  const agentName = 'Karthik';

  // STEP 1: Admin sends OTP to Agent
  console.log('--- STEP 1: Admin clicks [Send Verification OTP] ---');
  console.log(`Sending WhatsApp OTP to +91 ${testPhone}...`);
  const t1 = await req('/api/dashboard/agents/send-otp', 'POST', {
    phone: testPhone,
    name: agentName
  });
  console.log(`- Status: ${t1.status} (${t1.ok ? 'SUCCESS' : 'FAILED'})`);
  console.log(`- Message: ${t1.data.message}`);
  console.log(`- OTP Code Dispatched: ${t1.data.devOtp}`);
  if (!t1.ok) process.exit(1);

  const otp = t1.data.devOtp;

  // STEP 2: Admin enters OTP to Verify & Register Agent
  console.log('\n--- STEP 2: Admin inputs OTP in Dashboard to Verify ---');
  const t2 = await req('/api/dashboard/agents/verify-and-create', 'POST', {
    name: agentName,
    phone: testPhone,
    pin: '1234',
    area: 'RJPM Safety Zone',
    vehicle: 'Patrol Bike',
    otp
  });
  console.log(`- Status: ${t2.status} (${t2.ok ? 'SUCCESS' : 'FAILED'})`);
  console.log(`- Agent Created: ${t2.data.agent?.name} (ID: ${t2.data.agent?.id})`);
  console.log(`- Unique UUID Duty URL: ${t2.data.dutyUrl}`);
  console.log(`- WhatsApp Welcome Dispatched: ${t2.data.waDispatched ? 'YES (devi_agent_welcome)' : 'SIMULATED'}`);
  if (!t2.ok) process.exit(1);

  const inviteToken = t2.data.inviteToken;

  // STEP 3: Agent opens Link and Clicks [APPROVE & START DUTY]
  console.log('\n--- STEP 3: Agent clicks [✅ APPROVE & START DUTY] ---');
  const t3 = await req('/api/dashboard/duty/invite/respond', 'POST', {
    token: inviteToken,
    action: 'APPROVE',
    deviceFingerprint: 'OnePlus_Android14_Chrome'
  });
  console.log(`- Status: ${t3.status} (${t3.ok ? 'SUCCESS' : 'FAILED'})`);
  console.log(`- Agent Duty Mode: ${t3.data.agent?.duty_status} 🟢 (NOW ACTIVE ON-DUTY)`);
  if (!t3.ok) process.exit(1);

  // STEP 4: A victim triggers an Emergency SOS!
  console.log('\n--- STEP 4: Victim (Ananya) triggers Emergency SOS! ---');
  const sosPayload = {
    userPhone: '9840998877',
    userName: 'Ananya (Victim in Distress)',
    latitude: 9.5123,
    longitude: 77.6321,
    location: 'Bus Stand Road, Near RJPM Clock Tower',
    emergencyContacts: ['919080685175']
  };

  const t4 = await req('/api/sos/trigger', 'POST', sosPayload);
  console.log(`- SOS Trigger Status: ${t4.status} (${t4.ok ? 'SUCCESS' : 'FAILED'})`);
  console.log(`- Emergency SOS Alert ID: ${t4.data.data?.id}`);
  console.log(`- Victim Live Tracking URL: ${t4.data.data?.trackingUrl}`);

  console.log('\n================================================================');
  console.log('🎉 FULL TEST COMPLETE! Check your WhatsApp for the SOS message!');
  console.log('================================================================');
})();

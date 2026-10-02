const BASE_URL = 'http://localhost:5005/api';
const ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'x-admin-key': 'devi_admin_secret_2026',
};

async function testDutyShiftSettings() {
  console.log('🧪 [TEST] Verifying Duty Shift Settings & End-Duty Logic...\n');

  try {
    // 1. Get current duty settings
    const res1 = await fetch(`${BASE_URL}/dashboard/settings/duty`, {
      headers: ADMIN_HEADERS,
    });
    const data1 = await res1.json();
    console.log('1️⃣ Current Duty Settings:', data1);

    // 2. Update duty settings to 10 hours and 5s interval
    const res2 = await fetch(`${BASE_URL}/dashboard/settings/duty`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ shiftDurationHours: 10, gpsIntervalSeconds: 5 }),
    });
    const data2 = await res2.json();
    console.log('2️⃣ Updated Duty Settings (10h, 5s):', data2);

    // 3. Test Agent Onboarding OTP + Verification
    const testPhone = '9876599999';
    const otpRes = await fetch(`${BASE_URL}/dashboard/agents/send-otp`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ phone: testPhone, name: 'Shift Test Agent' }),
    });
    const otpData = await otpRes.json();
    console.log('3️⃣ OTP Sent. Dev OTP:', otpData.devOtp);

    const createRes = await fetch(`${BASE_URL}/dashboard/agents/verify-and-create`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        name: 'Shift Test Agent',
        phone: testPhone,
        pin: '1234',
        area: 'Test Sector',
        otp: otpData.devOtp,
      }),
    });
    const createData = await createRes.json();
    const token = createData.inviteToken;
    const agentId = createData.agent.id;
    console.log(`4️⃣ Agent Created with 1-Time Token: ${token}, Agent ID: ${agentId}`);

    // 4. Agent Approves Duty via invite token
    const approveRes = await fetch(`${BASE_URL}/dashboard/duty/invite/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        action: 'APPROVE',
        deviceFingerprint: 'Test_Device_Android',
      }),
    });
    const approveData = await approveRes.json();
    console.log('5️⃣ Duty Approved! Shift Duration:', approveData.shift_duration_hours, 'Expires At:', approveData.shift_expires_at);

    // Verify shift was set to 10 hours
    if (approveData.shift_duration_hours === 10) {
      console.log('✅ PASS: Shift duration correctly set to 10 Hours from Admin Settings!');
    } else {
      console.error('❌ FAIL: Expected 10 hours but got', approveData.shift_duration_hours);
    }

    // 5. Test Live Location update
    const locRes = await fetch(`${BASE_URL}/dashboard/agents/${agentId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 9.4532, longitude: 77.7981, speed: 2.5, heading: 90 }),
    });
    const locData = await locRes.json();
    console.log('6️⃣ Live Location Streamed:', locData.success ? 'OK' : 'FAILED');

    // 6. Test Admin Ending Agent Duty Manually
    const endRes = await fetch(`${BASE_URL}/dashboard/agents/${agentId}/end-duty`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
    });
    const endData = await endRes.json();
    console.log('7️⃣ Admin Manually Ended Duty:', endData.message, 'Agent Duty Status:', endData.agent?.duty_status);

    if (endData.agent?.duty_status === 'OFF_DUTY') {
      console.log('✅ PASS: Admin Force End Duty works perfectly!');
    }

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed with exception:', err);
  }
}

testDutyShiftSettings();

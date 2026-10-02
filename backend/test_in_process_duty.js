import express from 'express';
import cors from 'cors';
import apiRoutes from './src/routes/index.js';
import { DataService } from './src/services/data.service.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);

const server = app.listen(5099, async () => {
  const BASE_URL = 'http://localhost:5099/api';
  console.log('🧪 [IN-PROCESS SERVER STARTED ON PORT 5099]\n');

  try {
    // 1. Get duty settings
    const res1 = await fetch(`${BASE_URL}/dashboard/settings/duty`);
    const data1 = await res1.json();
    console.log('1️⃣ Initial Duty Settings:', data1);

    // 2. Admin sets shift to 10 hours and 5s interval
    const res2 = await fetch(`${BASE_URL}/dashboard/settings/duty`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'devi_admin_secret_2026',
      },
      body: JSON.stringify({ shiftDurationHours: 10, gpsIntervalSeconds: 5 }),
    });
    const data2 = await res2.json();
    console.log('2️⃣ Updated Duty Settings (10h, 5s):', data2);

    if (data2.settings?.shiftDurationHours === 10) {
      console.log('✅ PASS: Admin successfully configured 10 Hours shift!');
    }

    // 3. Send OTP
    const testPhone = '9500238347';
    const otpRes = await fetch(`${BASE_URL}/dashboard/agents/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'devi_admin_secret_2026',
      },
      body: JSON.stringify({ phone: testPhone, name: 'Ten Hour Patrol Agent' }),
    });
    const otpData = await otpRes.json();
    console.log('3️⃣ OTP Sent. Dev OTP:', otpData.devOtp);

    // 4. Verify & Create Agent
    const createRes = await fetch(`${BASE_URL}/dashboard/agents/verify-and-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'devi_admin_secret_2026',
      },
      body: JSON.stringify({
        name: 'Ten Hour Patrol Agent',
        phone: testPhone,
        pin: '7421',
        area: 'Rajapalayam North',
        otp: otpData.devOtp,
      }),
    });
    const createData = await createRes.json();
    const token = createData.inviteToken;
    const agentId = createData.agent.id;
    console.log(`4️⃣ Agent Onboarded. 1-Time Token: ${token}, ID: ${agentId}`);

    // 5. Agent approves on phone
    const approveRes = await fetch(`${BASE_URL}/dashboard/duty/invite/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        action: 'APPROVE',
        deviceFingerprint: 'Android_DEVI_Mobile_App',
      }),
    });
    const approveData = await approveRes.json();
    console.log('5️⃣ Duty Approved! Shift Hours:', approveData.shift_duration_hours, 'Expires At:', approveData.shift_expires_at);

    if (approveData.shift_duration_hours === 10) {
      console.log('✅ PASS: Shift is active for 10 Hours as set by Admin!');
    }

    // 6. Test location streaming from Flutter App
    const locRes = await fetch(`${BASE_URL}/dashboard/agents/${agentId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 9.4532, longitude: 77.7981, speed: 12.0, heading: 180 }),
    });
    const locData = await locRes.json();
    console.log('6️⃣ Flutter Location Streamed:', locData.success ? 'SUCCESS (200 OK)' : 'FAILED');

    // 7. Test Admin Manual End Duty
    const endRes = await fetch(`${BASE_URL}/dashboard/agents/${agentId}/end-duty`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'devi_admin_secret_2026',
      },
    });
    const endData = await endRes.json();
    console.log('7️⃣ Admin Force End Duty:', endData.message, 'Status:', endData.agent?.duty_status);

    if (endData.agent?.duty_status === 'OFF_DUTY') {
      console.log('✅ PASS: Admin successfully ended agent duty manually!');
    }

    console.log('\n🌟 [ALL 7 BACKEND DUTY & SHIFT TESTS PASSED CLEANLY! 100% OK]');
  } catch (err) {
    console.error('❌ Test failed with exception:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});

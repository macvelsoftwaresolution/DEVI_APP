// DEVI Field Responder On-Duty Live GPS Portal
// Mobile Web App for agents to stream real-time GPS coordinates to DEVI Command Center

export function renderAgentDutyHtml({ defaultAgentId = null } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>DEVI Responder | On-Duty Live GPS</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg: #090D16;
      --card: #131A29;
      --card-elevated: #1B2438;
      --border: rgba(255, 255, 255, 0.08);
      
      --cyan: #06B6D4;
      --green: #10B981;
      --red: #EF4444;
      --amber: #F59E0B;
      
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 16px;
      -webkit-font-smoothing: antialiased;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-icon {
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, #06B6D4 0%, #0284C7 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 0 14px rgba(6, 182, 212, 0.4);
    }

    .brand h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 800;
    }

    .brand p {
      font-size: 11px;
      color: var(--text-muted);
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 14px;
    }

    .card-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .select-agent {
      width: 100%;
      background: var(--card-elevated);
      border: 1px solid var(--border);
      color: #FFF;
      padding: 12px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      outline: none;
      margin-bottom: 12px;
    }

    /* BIG DUTY TOGGLE */
    .duty-toggle-btn {
      width: 100%;
      padding: 20px 16px;
      border-radius: 14px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      background: var(--card-elevated);
      color: #FFF;
      font-family: 'Outfit', sans-serif;
      font-size: 18px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.25s;
    }

    .duty-toggle-btn.on-duty {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%);
      border-color: var(--green);
      color: #34D399;
      box-shadow: 0 0 24px rgba(16, 185, 129, 0.3);
    }

    .duty-toggle-sub {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
    }

    /* TELEMETRY INFO */
    .telemetry-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }

    .telemetry-box {
      background: var(--card-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
    }

    .telemetry-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #FFF;
      margin-top: 2px;
    }

    .telemetry-lbl {
      font-size: 10px;
      color: var(--text-dim);
      text-transform: uppercase;
    }

    /* EMERGENCY ASSIGNMENT POPUP / BANNER */
    .assignment-box {
      background: rgba(239, 68, 68, 0.15);
      border: 2px solid var(--red);
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 14px;
      animation: alertPulse 1.4s infinite ease-in-out;
    }

    @keyframes alertPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
      50% { box-shadow: 0 0 20px 4px rgba(239, 68, 68, 0.4); }
    }

    .assignment-head {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 800;
      color: #F87171;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    .btn-nav-google {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
      color: #FFF;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 800;
      text-align: center;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 12px;
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
    }

    .btn-call-victim {
      width: 100%;
      padding: 10px;
      background: var(--card-elevated);
      border: 1px solid var(--border);
      color: #38BDF8;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
      display: block;
      margin-top: 6px;
    }

    .pulse-beacon {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #34D399;
      border-radius: 50%;
      box-shadow: 0 0 8px #34D399;
      animation: blink 1.2s infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.8); }
    }
  </style>
</head>
<body>

  <!-- TOP HEADER -->
  <header class="header">
    <div class="brand">
      <div class="brand-icon">🛡️</div>
      <div>
        <h1>DEVI Responder</h1>
        <p>Field Safety Agent On-Duty Portal</p>
      </div>
    </div>
    <div id="dutyBadge" style="font-size: 11px; font-weight: 700; color: var(--text-dim);">
      OFF DUTY
    </div>
  </header>

  <!-- SELECT AGENT PROFILE -->
  <div class="card">
    <div class="card-title">
      <span>Select Your Profile</span>
      <span style="color: var(--cyan); font-size: 11px;">Step 1</span>
    </div>
    <select id="agentSelect" class="select-agent" onchange="onAgentChanged(this.value)">
      <option value="">Loading responders...</option>
    </select>
    <div style="font-size: 11px; color: var(--text-dim);">
      Choose your registered responder profile before turning on duty.
    </div>
  </div>

  <!-- ON-DUTY TOGGLE -->
  <div class="card" style="text-align: center;">
    <button class="duty-toggle-btn" id="dutyToggleBtn" onclick="toggleDuty()">
      <span id="dutyBtnIcon" style="font-size: 28px;">🔴</span>
      <span id="dutyBtnText">TAP TO START ON-DUTY</span>
      <span class="duty-toggle-sub" id="dutyBtnSub">GPS location is currently idle</span>
    </button>
  </div>

  <!-- LIVE INCOMING EMERGENCY ASSIGNMENT -->
  <div class="assignment-box hidden" id="assignmentBox">
    <div class="assignment-head">
      <span>🚨</span>
      <span>EMERGENCY DISPATCH ASSIGNED TO YOU!</span>
    </div>

    <div style="font-size: 12px; line-height: 1.6; color: #FFF;">
      <div><strong>Victim Name:</strong> <span id="assignVictimName">--</span></div>
      <div><strong>Phone:</strong> <span id="assignVictimPhone" style="font-family: 'JetBrains Mono', monospace; color: #38BDF8;">--</span></div>
      <div><strong>Location:</strong> <span id="assignVictimLocation">--</span></div>
    </div>

    <a href="#" target="_blank" class="btn-nav-google" id="googleNavBtn">
      <span>🧭 NAVIGATE TURN-BY-TURN IN GOOGLE MAPS</span>
    </a>

    <a href="#" class="btn-call-victim" id="callVictimBtn">
      <span>📞 Call Victim Directly</span>
    </a>
  </div>

  <!-- REAL-TIME GPS TELEMETRY -->
  <div class="card">
    <div class="card-title">
      <span>Real-Time GPS Telemetry</span>
      <span id="gpsStatusPill" style="font-size: 10px; color: var(--text-dim);">GPS Standby</span>
    </div>

    <div class="telemetry-grid">
      <div class="telemetry-box">
        <div class="telemetry-lbl">Latitude</div>
        <div class="telemetry-val" id="latVal">--</div>
      </div>
      <div class="telemetry-box">
        <div class="telemetry-lbl">Longitude</div>
        <div class="telemetry-val" id="lngVal">--</div>
      </div>
      <div class="telemetry-box">
        <div class="telemetry-lbl">GPS Accuracy</div>
        <div class="telemetry-val" id="accVal">--</div>
      </div>
      <div class="telemetry-box">
        <div class="telemetry-lbl">Last Sync</div>
        <div class="telemetry-val" id="syncVal">--</div>
      </div>
    </div>

    <div style="font-size: 11px; color: var(--text-dim); margin-top: 10px; line-height: 1.4;">
      💡 Keep this screen open in your phone browser while patrolling. Your real-time position streams to the DEVI Control Room every 10 seconds.
    </div>
  </div>

  <script>
    let currentAgentId = '${defaultAgentId || ''}';
    let isOnDuty = false;
    let watchId = null;
    let syncInterval = null;
    let currentCoords = null;
    let audioCtx = null;
    let alertSoundInterval = null;

    // Fetch registered responders for the dropdown
    async function loadAgents() {
      try {
        const res = await fetch('/api/dashboard/agents');
        const data = await res.json();
        if (data.success && Array.isArray(data.agents)) {
          const select = document.getElementById('agentSelect');
          select.innerHTML = '<option value="">-- Choose Your Name --</option>' + data.agents.map(a => \`
            <option value="\${a.id}" \${a.id === currentAgentId ? 'selected' : ''}>
              \${a.name} (\${a.area})
            </option>
          \`).join('');

          if (currentAgentId) {
            select.value = currentAgentId;
          } else if (data.agents.length > 0) {
            currentAgentId = data.agents[0].id;
            select.value = currentAgentId;
          }
        }
      } catch (e) {
        console.error('Failed to load agents:', e);
      }
    }

    function onAgentChanged(id) {
      currentAgentId = id;
      if (isOnDuty) {
        stopDuty();
      }
    }

    // Toggle On-Duty
    function toggleDuty() {
      if (!currentAgentId) {
        alert('Please select your responder name first!');
        return;
      }

      if (!isOnDuty) {
        startDuty();
      } else {
        stopDuty();
      }
    }

    function startDuty() {
      if (!navigator.geolocation) {
        alert('GPS Geolocation is not supported by your browser.');
        return;
      }

      isOnDuty = true;
      updateDutyUI(true);

      // Request continuous high-accuracy position updates
      watchId = navigator.geolocation.watchPosition(
        onPositionSuccess,
        onPositionError,
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000
        }
      );

      // Periodic check & sync every 10 seconds
      syncInterval = setInterval(() => {
        if (currentCoords) {
          pushLocationToServer(currentCoords);
        }
      }, 10000);

      // Notify backend
      fetch('/api/dashboard/agents/' + currentAgentId + '/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ON_DUTY' })
      }).catch(() => {});
    }

    function stopDuty() {
      isOnDuty = false;
      updateDutyUI(false);

      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }

      document.getElementById('gpsStatusPill').textContent = 'GPS Standby';
      document.getElementById('gpsStatusPill').style.color = 'var(--text-dim)';

      fetch('/api/dashboard/agents/' + currentAgentId + '/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OFF_DUTY' })
      }).catch(() => {});
    }

    function onPositionSuccess(pos) {
      currentCoords = pos.coords;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy);

      document.getElementById('latVal').textContent = lat.toFixed(5);
      document.getElementById('lngVal').textContent = lng.toFixed(5);
      document.getElementById('accVal').textContent = '± ' + acc + ' m';
      document.getElementById('syncVal').textContent = new Date().toLocaleTimeString('en-GB');

      document.getElementById('gpsStatusPill').innerHTML = '<span class="pulse-beacon"></span> Live GPS Streaming';
      document.getElementById('gpsStatusPill').style.color = '#34D399';

      pushLocationToServer(currentCoords);
    }

    function onPositionError(err) {
      console.warn('GPS Error:', err.message);
      document.getElementById('gpsStatusPill').textContent = 'GPS Error: ' + err.message;
      document.getElementById('gpsStatusPill').style.color = '#EF4444';
    }

    // Push coordinates to DEVI Backend
    async function pushLocationToServer(coords) {
      if (!currentAgentId || !coords) return;
      try {
        const res = await fetch('/api/dashboard/agents/' + currentAgentId + '/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: coords.latitude,
            longitude: coords.longitude,
            heading: coords.heading,
            speed: coords.speed
          })
        });

        const data = await res.json();
        if (data.success && data.hasAssignment && data.assignment) {
          triggerEmergencyAssignmentAlert(data.assignment);
        } else {
          hideEmergencyAssignmentAlert();
        }
      } catch (err) {
        console.warn('Sync error:', err);
      }
    }

    function triggerEmergencyAssignmentAlert(assignment) {
      const box = document.getElementById('assignmentBox');
      box.classList.remove('hidden');

      document.getElementById('assignVictimName').textContent = assignment.user.name;
      document.getElementById('assignVictimPhone').textContent = assignment.user.phone;
      document.getElementById('assignVictimLocation').textContent = assignment.location;

      document.getElementById('callVictimBtn').href = 'tel:' + assignment.user.phone;
      
      // Google Maps turn-by-turn navigation URL
      const gmapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + assignment.latitude + ',' + assignment.longitude;
      document.getElementById('googleNavBtn').href = gmapsUrl;

      // Play Siren Chime
      playAgentAlarm();
    }

    function hideEmergencyAssignmentAlert() {
      document.getElementById('assignmentBox').classList.add('hidden');
      if (alertSoundInterval) {
        clearInterval(alertSoundInterval);
        alertSoundInterval = null;
      }
    }

    function playAgentAlarm() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';

        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.setValueAtTime(600, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.4);
      } catch (_) {}
    }

    function updateDutyUI(active) {
      const btn = document.getElementById('dutyToggleBtn');
      const icon = document.getElementById('dutyBtnIcon');
      const text = document.getElementById('dutyBtnText');
      const sub = document.getElementById('dutyBtnSub');
      const badge = document.getElementById('dutyBadge');

      if (active) {
        btn.classList.add('on-duty');
        icon.textContent = '🟢';
        text.textContent = 'YOU ARE ON DUTY';
        sub.textContent = 'Live GPS streaming to DEVI Command Center';
        badge.innerHTML = '<span class="pulse-beacon"></span> ON DUTY';
        badge.style.color = '#34D399';
      } else {
        btn.classList.remove('on-duty');
        icon.textContent = '🔴';
        text.textContent = 'TAP TO START ON-DUTY';
        sub.textContent = 'GPS location is currently idle';
        badge.textContent = 'OFF DUTY';
        badge.style.color = 'var(--text-dim)';
      }
    }

    window.addEventListener('DOMContentLoaded', () => {
      loadAgents();
    });
  </script>
</body>
</html>
`;
}

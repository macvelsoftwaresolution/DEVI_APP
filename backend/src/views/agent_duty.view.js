// DEVI Field Responder On-Duty Portal
// Clean, perfectly aligned, mobile-first Web App with 1-click Navigation & Siren Alert

export function renderAgentDutyHtml({ defaultAgentId = null } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>DEVI Responder Duty</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@600;700&family=Outfit:wght@700;800&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg: #090E1A;
      --card: #131B2E;
      --card-elevated: #1B253D;
      --card-border: rgba(255, 255, 255, 0.08);
      --green: #10B981;
      --green-glow: rgba(16, 185, 129, 0.35);
      --red: #EF4444;
      --red-glow: rgba(239, 68, 68, 0.4);
      --blue: #38BDF8;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 16px;
      max-width: 520px;
      margin: 0 auto;
      -webkit-font-smoothing: antialiased;
    }

    /* TOP HEADER */
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0 16px 0;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #0284C7 0%, #0369A1 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
      flex-shrink: 0;
    }

    .brand h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }

    .brand p {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 1px;
    }

    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--text-dim);
      transition: all 0.3s;
      flex-shrink: 0;
    }

    .status-pill.online {
      background: rgba(16, 185, 129, 0.15);
      border-color: var(--green);
      color: #34D399;
      box-shadow: 0 0 14px var(--green-glow);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-dim);
    }

    .status-pill.online .status-dot {
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.6; }
    }

    /* CARD STYLING */
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 14px;
    }

    /* RESPONDER PROFILE CARD (PERFECTLY ALIGNED, ZERO DROPDOWN) */
    .responder-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
    }

    .responder-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .responder-avatar {
      width: 46px;
      height: 46px;
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(2, 132, 199, 0.2) 100%);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      flex-shrink: 0;
    }

    .responder-details {
      flex: 1;
      min-width: 0;
    }

    .responder-role {
      font-size: 10px;
      font-weight: 800;
      color: var(--blue);
      letter-spacing: 0.6px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }

    .responder-name {
      font-size: 16px;
      font-weight: 800;
      color: #FFF;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .responder-meta {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 3px;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .responder-badge {
      font-size: 10px;
      font-weight: 800;
      color: #34D399;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 6px 10px;
      border-radius: 8px;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    /* 🚨 LIVE SOS DISPATCH ALERT CARD */
    .sos-alert-card {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.22) 0%, rgba(185, 28, 28, 0.18) 100%);
      border: 2px solid var(--red);
      border-radius: 18px;
      padding: 18px 16px;
      margin-bottom: 14px;
      box-shadow: 0 0 30px var(--red-glow);
      display: none;
      animation: alertPulse 1.4s infinite ease-in-out;
    }

    @keyframes alertPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
      50% { box-shadow: 0 0 24px 6px rgba(239, 68, 68, 0.45); }
    }

    .sos-alert-card.active {
      display: block;
    }

    .sos-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(239, 68, 68, 0.3);
      padding-bottom: 10px;
    }

    .sos-title {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 800;
      color: #F87171;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sos-p1-badge {
      background: var(--red);
      color: #FFF;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }

    .sos-info-box {
      background: rgba(0, 0, 0, 0.25);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .sos-row {
      font-size: 13px;
      color: #FFF;
      line-height: 1.6;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .sos-row strong {
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      min-width: 70px;
    }

    .sos-phone-val {
      font-family: 'JetBrains Mono', monospace;
      color: var(--blue);
      font-weight: 700;
    }

    .btn-maps {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
      color: #FFF;
      padding: 14px;
      border-radius: 12px;
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 15px;
      text-decoration: none;
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.5);
      transition: transform 0.2s;
    }

    .btn-maps:active {
      transform: scale(0.98);
    }

    .btn-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .btn-call {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #38BDF8;
      padding: 11px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      text-decoration: none;
    }

    .btn-safe {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid var(--green);
      color: #34D399;
      padding: 11px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }

    /* STANDBY RADAR CARD */
    .standby-card {
      background: var(--card);
      border: 1px dashed var(--card-border);
      border-radius: 16px;
      padding: 18px 16px;
      text-align: center;
      margin-bottom: 14px;
    }

    .standby-icon {
      font-size: 28px;
      margin-bottom: 6px;
    }

    .standby-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
    }

    .standby-sub {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 4px;
      line-height: 1.4;
    }

    /* BIG DUTY BUTTON */
    .duty-action-card {
      text-align: center;
      padding: 22px 16px;
    }

    .duty-btn {
      width: 100%;
      min-height: 115px;
      border-radius: 20px;
      border: 2px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: #FFF;
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }

    .duty-btn:active {
      transform: scale(0.98);
    }

    .duty-btn.active {
      background: linear-gradient(135deg, #059669 0%, #10B981 100%);
      border-color: #34D399;
      color: #FFF;
      box-shadow: 0 0 35px var(--green-glow);
    }

    .duty-btn-sub {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 12px;
      font-weight: 600;
      opacity: 0.9;
    }

    /* TELEMETRY STATS */
    .card-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .stat-box {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px 12px;
    }

    .stat-lbl {
      font-size: 10px;
      color: var(--text-dim);
      font-weight: 600;
      text-transform: uppercase;
    }

    .stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #FFF;
      margin-top: 2px;
    }

    /* SIMULATION BUTTON */
    .sim-bar {
      margin-top: auto;
      padding-top: 14px;
      text-align: center;
    }

    .sim-btn {
      background: transparent;
      border: 1px dashed rgba(255, 255, 255, 0.15);
      color: var(--text-dim);
      font-size: 11px;
      padding: 6px 14px;
      border-radius: 8px;
      cursor: pointer;
    }

    .sim-btn:hover {
      color: #FFF;
      border-color: var(--card-border);
    }
  </style>
</head>
<body>

  <!-- TOP HEADER -->
  <header class="top-bar">
    <div class="brand">
      <div class="brand-icon">🛡️</div>
      <div>
        <h1>DEVI Responder</h1>
        <p>Field Safety Duty Portal</p>
      </div>
    </div>
    <div class="status-pill" id="statusPill">
      <span class="status-dot"></span>
      <span id="statusText">OFF DUTY</span>
    </div>
  </header>

  <!-- NON-EDITABLE RESPONDER CARD (NO DROPDOWN, 100% CLEAN & ALIGNED) -->
  <div class="card responder-card">
    <div class="responder-left">
      <div class="responder-avatar">👮</div>
      <div class="responder-details">
        <div class="responder-role">ASSIGNED FIELD RESPONDER</div>
        <div class="responder-name" id="agentDisplayName">Karthi (Rapid Volunteer)</div>
        <div class="responder-meta" id="agentDisplayMeta">📍 Sivakasi Town Center (Bus Stand) • 📞 9876543210</div>
      </div>
    </div>
    <div class="responder-badge">VERIFIED</div>
  </div>

  <!-- 🚨 INCOMING SOS DISPATCH ALERT CARD -->
  <div class="sos-alert-card" id="sosAlertCard">
    <div class="sos-header">
      <div class="sos-title">
        <span>🚨</span>
        <span>EMERGENCY SOS ASSIGNED!</span>
      </div>
      <span class="sos-p1-badge">PRIORITY P1</span>
    </div>

    <div class="sos-info-box">
      <div class="sos-row">
        <strong>Victim:</strong>
        <span id="victimName" style="font-weight: 700; color: #FFF;">Deepa</span>
      </div>
      <div class="sos-row">
        <strong>Mobile:</strong>
        <span class="sos-phone-val" id="victimPhone">+91 9500238347</span>
      </div>
      <div class="sos-row">
        <strong>Location:</strong>
        <span id="victimLocation">Anna Nagar West, Chennai</span>
      </div>
    </div>

    <!-- 1-Click Turn-by-Turn Navigation -->
    <a href="#" target="_blank" class="btn-maps" id="mapsNavBtn">
      <span>🧭 OPEN GOOGLE MAPS NAVIGATION</span>
    </a>

    <div class="btn-row">
      <a href="#" class="btn-call" id="callVictimBtn">
        <span>📞 Call Victim</span>
      </a>
      <button class="btn-safe" onclick="markIncidentSafe()">
        <span>✅ Mark Reached</span>
      </button>
    </div>
  </div>

  <!-- STANDBY CARD -->
  <div class="standby-card" id="standbyCard">
    <div class="standby-icon">📡</div>
    <div class="standby-title">Sector Radar Active — No Live Emergencies</div>
    <div class="standby-sub">When a victim triggers SOS near you, emergency siren & Google Maps direction will pop up here instantly.</div>
  </div>

  <!-- BIG START/STOP DUTY TOGGLE BUTTON -->
  <div class="card duty-action-card">
    <button class="duty-btn" id="dutyToggleBtn" onclick="toggleDuty()">
      <span id="dutyBtnIcon" style="font-size: 34px;">⚪</span>
      <span id="dutyBtnTitle">START ON-DUTY</span>
      <span class="duty-btn-sub" id="dutyBtnSub">Tap to start sharing live GPS with Control Room</span>
    </button>
  </div>

  <!-- LIVE GPS TELEMETRY STATS -->
  <div class="card">
    <div class="card-label">
      <span>Live GPS Stream</span>
      <span id="gpsPill" style="font-size: 10px; color: var(--text-dim);">Standby</span>
    </div>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-lbl">Latitude</div>
        <div class="stat-val" id="latDisplay">--</div>
      </div>
      <div class="stat-box">
        <div class="stat-lbl">Longitude</div>
        <div class="stat-val" id="lngDisplay">--</div>
      </div>
      <div class="stat-box">
        <div class="stat-lbl">Accuracy</div>
        <div class="stat-val" id="accDisplay">--</div>
      </div>
      <div class="stat-box">
        <div class="stat-lbl">Last Sync</div>
        <div class="stat-val" id="syncDisplay">Never</div>
      </div>
    </div>
  </div>

  <!-- TEST DEMO TRIGGER -->
  <div class="sim-bar">
    <button class="sim-btn" onclick="simulateTestEmergency()">
      🔔 Test Alert Popup & Audio Siren
    </button>
  </div>

  <script>
    // State
    let currentAgentId = '${defaultAgentId || ''}' || localStorage.getItem('devi_active_agent_id') || 'agent-1';
    let isOnDuty = false;
    let watchId = null;
    let syncInterval = null;
    let pollInterval = null;
    let lastCoords = null;
    let activeAlertId = null;
    let audioCtx = null;
    let sirenInterval = null;

    // Elements
    const dutyBtn = document.getElementById('dutyToggleBtn');
    const dutyBtnIcon = document.getElementById('dutyBtnIcon');
    const dutyBtnTitle = document.getElementById('dutyBtnTitle');
    const dutyBtnSub = document.getElementById('dutyBtnSub');
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const gpsPill = document.getElementById('gpsPill');
    const latDisplay = document.getElementById('latDisplay');
    const lngDisplay = document.getElementById('lngDisplay');
    const accDisplay = document.getElementById('accDisplay');
    const syncDisplay = document.getElementById('syncDisplay');
    const sosAlertCard = document.getElementById('sosAlertCard');
    const standbyCard = document.getElementById('standbyCard');
    const agentDisplayName = document.getElementById('agentDisplayName');
    const agentDisplayMeta = document.getElementById('agentDisplayMeta');

    // Load Responders from Backend
    async function initResponders() {
      try {
        const res = await fetch('/api/dashboard/agents');
        const data = await res.json();
        if (data.success && Array.isArray(data.agents) && data.agents.length > 0) {
          const matched = data.agents.find(a => a.id === currentAgentId) || data.agents[0];
          setAgentProfile(matched);
        } else {
          setAgentProfile({ id: currentAgentId, name: 'Karthi (Rapid Volunteer)', area: 'Sivakasi Town Center (Bus Stand)', phone: '9876543210' });
        }
      } catch (e) {
        setAgentProfile({ id: currentAgentId, name: 'Karthi (Rapid Volunteer)', area: 'Sivakasi Town Center (Bus Stand)', phone: '9876543210' });
      }
    }

    function setAgentProfile(agent) {
      currentAgentId = agent.id;
      localStorage.setItem('devi_active_agent_id', agent.id);
      agentDisplayName.textContent = agent.name;
      agentDisplayMeta.textContent = '📍 ' + (agent.area || 'Patrol Sector') + ' • 📞 ' + (agent.phone || '');
    }

    // Toggle On / Off Duty
    function toggleDuty() {
      if (!isOnDuty) {
        startDuty();
      } else {
        stopDuty();
      }
    }

    function startDuty() {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }

      isOnDuty = true;
      updateUI(true);

      // Notify backend ON_DUTY
      fetch('/api/dashboard/agents/' + currentAgentId + '/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'AVAILABLE' })
      }).catch(() => {});

      // Watch GPS position in high accuracy
      watchId = navigator.geolocation.watchPosition(
        onPositionSuccess,
        onPositionError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 4000 }
      );

      // Stream coordinates to server every 5 seconds
      syncInterval = setInterval(() => {
        if (lastCoords) {
          pushLocation(lastCoords);
        }
      }, 5000);

      // Poll for active emergency assignments every 3 seconds
      pollInterval = setInterval(checkEmergencyAssignments, 3000);
    }

    function stopDuty() {
      isOnDuty = false;
      updateUI(false);
      stopSirenAlarm();

      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      fetch('/api/dashboard/agents/' + currentAgentId + '/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OFF_DUTY' })
      }).catch(() => {});
    }

    function onPositionSuccess(pos) {
      lastCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
        speed: pos.coords.speed || 0,
        heading: pos.coords.heading || 0
      };

      latDisplay.textContent = lastCoords.lat.toFixed(5);
      lngDisplay.textContent = lastCoords.lng.toFixed(5);
      accDisplay.textContent = Math.round(lastCoords.acc) + ' m';
      gpsPill.textContent = 'GPS Active';
      gpsPill.style.color = '#34D399';

      pushLocation(lastCoords);
    }

    function onPositionError(err) {
      console.warn('GPS Error:', err.message);
      accDisplay.textContent = 'Locating...';
      gpsPill.textContent = 'Searching...';
      gpsPill.style.color = '#F59E0B';
    }

    function pushLocation(coords) {
      fetch('/api/dashboard/agents/' + currentAgentId + '/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: coords.lat,
          longitude: coords.lng,
          speed: coords.speed,
          heading: coords.heading,
          accuracy: coords.acc
        })
      })
      .then(res => res.json())
      .then(() => {
        const now = new Date();
        syncDisplay.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      })
      .catch(() => {});
    }

    // Check if an emergency alert is assigned to this agent
    function checkEmergencyAssignments() {
      fetch('/api/dashboard/agents/' + currentAgentId + '/status')
        .then(res => res.json())
        .then(data => {
          if (data && data.hasAssignment && data.assignment) {
            showEmergencyAlert(data.assignment);
          } else {
            hideEmergencyAlert();
          }
        })
        .catch(() => {});
    }

    function showEmergencyAlert(assignment) {
      activeAlertId = assignment.id || assignment.alertId;
      document.getElementById('victimName').textContent = assignment.userName || assignment.victimName || 'DEVI User';
      document.getElementById('victimPhone').textContent = assignment.userPhone || assignment.phone || '+91 9500238347';
      document.getElementById('victimLocation').textContent = assignment.location || assignment.address || ('Coordinates: ' + assignment.latitude + ', ' + assignment.longitude);

      const lat = assignment.latitude || 13.0827;
      const lng = assignment.longitude || 80.2707;
      document.getElementById('mapsNavBtn').href = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
      document.getElementById('callVictimBtn').href = 'tel:' + (assignment.userPhone || assignment.phone || '');

      sosAlertCard.classList.add('active');
      standbyCard.style.display = 'none';

      // Play loud siren beep
      startSirenAlarm();
    }

    function hideEmergencyAlert() {
      sosAlertCard.classList.remove('active');
      standbyCard.style.display = 'block';
      stopSirenAlarm();
    }

    // Audio Web Siren Alarm (Loud Emergency Beep)
    function startSirenAlarm() {
      if (sirenInterval) return;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sirenInterval = setInterval(() => {
          if (!audioCtx) return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(850, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(450, audioCtx.currentTime + 0.35);
          gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.4);
        }, 800);
      } catch (e) {}
    }

    function stopSirenAlarm() {
      if (sirenInterval) {
        clearInterval(sirenInterval);
        sirenInterval = null;
      }
    }

    function markIncidentSafe() {
      if (!activeAlertId) {
        hideEmergencyAlert();
        return;
      }
      fetch('/api/dashboard/incidents/' + activeAlertId + '/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESOLVED', notes: 'Field responder arrived on scene. Victim secured.' })
      }).then(() => {
        alert('✅ Mission Complete: Incident marked as Safe/Resolved!');
        hideEmergencyAlert();
      }).catch(() => {
        hideEmergencyAlert();
      });
    }

    // Test Alert Simulation
    function simulateTestEmergency() {
      showEmergencyAlert({
        id: 'TEST_ALERT_101',
        victimName: 'Deepa (Emergency Simulation)',
        userPhone: '+91 9500238347',
        location: 'Anna Nagar Roundtana, Chennai',
        latitude: 13.0850,
        longitude: 80.2101
      });
    }

    function updateUI(active) {
      if (active) {
        dutyBtn.classList.add('active');
        dutyBtnIcon.textContent = '🟢';
        dutyBtnTitle.textContent = 'ON DUTY (ACTIVE)';
        dutyBtnSub.textContent = 'Streaming Live GPS to Command Center · Tap to Stop';
        statusPill.classList.add('online');
        statusText.textContent = 'ONLINE';
      } else {
        dutyBtn.classList.remove('active');
        dutyBtnIcon.textContent = '⚪';
        dutyBtnTitle.textContent = 'START ON-DUTY';
        dutyBtnSub.textContent = 'Tap to start sharing live GPS with Control Room';
        statusPill.classList.remove('online');
        statusText.textContent = 'OFF DUTY';
        gpsPill.textContent = 'Standby';
        gpsPill.style.color = 'var(--text-dim)';
      }
    }

    // Auto-init on page load
    initResponders();
  </script>
</body>
</html>`;
}

// DEVI 24/7 Command Center Dashboard
// Clean, Modern, Minimalistic Emergency Dispatch UX

export function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DEVI Command Center</title>
  
  <!-- Leaflet Map CSS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  
  <!-- Modern Clean Typography -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-darkest: #090D16;
      --bg-dark: #0F1626;
      --bg-surface: #151F34;
      --bg-elevated: #1D2A46;
      --bg-hover: #243456;
      
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: #38BDF8;

      --red: #EF4444;
      --red-soft: rgba(239, 68, 68, 0.15);
      --amber: #F59E0B;
      --amber-soft: rgba(245, 158, 11, 0.15);
      --green: #10B981;
      --green-soft: rgba(16, 185, 129, 0.15);
      --cyan: #06B6D4;
      --cyan-soft: rgba(6, 182, 212, 0.15);
      --blue: #38BDF8;

      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
      
      --header-height: 60px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-darkest);
      color: var(--text);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }

    /* TOP BAR */
    .topbar {
      height: var(--header-height);
      background: var(--bg-dark);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      z-index: 100;
      flex-shrink: 0;
    }

    .brand-box {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #EF4444 0%, #B91C1C 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 0 14px rgba(239, 68, 68, 0.35);
    }

    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.3px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .live-pill {
      font-size: 10px;
      font-weight: 700;
      color: #34D399;
      background: var(--green-soft);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 2px 7px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .live-dot {
      width: 6px;
      height: 6px;
      background: #34D399;
      border-radius: 50%;
      animation: pulse 1.6s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    /* TOP STATS */
    .top-stats {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .stat-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }

    .stat-chip.emergency {
      background: var(--red-soft);
      border-color: rgba(239, 68, 68, 0.4);
      color: #FCA5A5;
    }

    .clock {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      background: var(--bg-surface);
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
    }

    /* TOP BUTTONS */
    .top-btns {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text);
      height: 34px;
      padding: 0 12px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn:hover {
      background: var(--bg-elevated);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-green {
      background: var(--green-soft);
      border-color: rgba(16, 185, 129, 0.4);
      color: #34D399;
    }

    .btn-green:hover {
      background: rgba(16, 185, 129, 0.25);
    }

    /* MAIN CONTAINER */
    .app-main {
      display: flex;
      flex: 1;
      height: calc(100vh - var(--header-height));
      overflow: hidden;
      position: relative;
    }

    /* LEFT SIDEBAR: EMERGENCIES */
    .sidebar {
      width: 360px;
      background: var(--bg-dark);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 20;
    }

    .sidebar-head {
      padding: 14px 14px 10px;
      border-bottom: 1px solid var(--border);
    }

    .search-input {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 12px;
      color: #FFF;
      outline: none;
      margin-bottom: 10px;
    }

    .search-input:focus {
      border-color: var(--border-focus);
    }

    /* 4 MINI STATS */
    .mini-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }

    .stat-item {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 4px;
      text-align: center;
    }

    .stat-item .val {
      font-family: 'Outfit', sans-serif;
      font-size: 15px;
      font-weight: 700;
    }

    .stat-item .lbl {
      font-size: 9px;
      color: var(--text-dim);
      text-transform: uppercase;
      margin-top: 1px;
    }

    /* FILTER TABS */
    .tabs {
      display: flex;
      background: var(--bg-surface);
      padding: 3px;
      border-radius: 6px;
      border: 1px solid var(--border);
      gap: 2px;
    }

    .tab {
      flex: 1;
      padding: 4px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      border-radius: 5px;
      cursor: pointer;
      text-align: center;
    }

    .tab.active {
      background: var(--bg-elevated);
      color: #FFF;
    }

    /* INCIDENT LIST */
    .incidents-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .card:hover {
      background: var(--bg-elevated);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .card.active {
      border-color: var(--red);
      background: rgba(239, 68, 68, 0.08);
    }

    .card.emergency {
      border-left: 3px solid var(--red);
    }

    .card.assigned {
      border-left: 3px solid var(--amber);
    }

    .card.resolved {
      border-left: 3px solid var(--green);
      opacity: 0.7;
    }

    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .card-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
    }

    .badge {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 12px;
      letter-spacing: 0.3px;
    }

    .badge.ACTIVE, .badge.DISPATCHED {
      background: var(--red-soft);
      color: #FCA5A5;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .badge.ASSIGNED {
      background: var(--amber-soft);
      color: #FCD34D;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .badge.RESOLVED {
      background: var(--green-soft);
      color: #6EE7B7;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .card-user {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 2px;
    }

    .card-name {
      font-size: 13px;
      font-weight: 700;
      color: #FFF;
    }

    .card-phone {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-muted);
    }

    .card-loc {
      font-size: 11px;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 6px;
    }

    .card-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-dim);
      padding-top: 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
    }

    .tag {
      font-size: 9px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(99, 102, 241, 0.15);
      color: #A5B4FC;
    }

    /* CENTER MAP */
    .map-box {
      flex: 1;
      height: 100%;
      position: relative;
      background: #0B0E14;
    }

    #map {
      width: 100%;
      height: 100%;
      z-index: 1;
    }

    .map-controls {
      position: absolute;
      top: 14px;
      left: 14px;
      z-index: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .map-chip {
      background: rgba(15, 22, 38, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
    }

    /* Leaflet Layer Switcher Dark */
    .tactical-dark-tiles {
      filter: brightness(0.65) invert(1) contrast(3) hue-rotate(200deg) saturate(0.2) !important;
    }

    .leaflet-control-layers {
      background: rgba(15, 22, 38, 0.92) !important;
      backdrop-filter: blur(8px) !important;
      border: 1px solid var(--border) !important;
      color: #E2E8F0 !important;
      border-radius: 8px !important;
      font-size: 11px !important;
      padding: 4px 10px !important;
    }

    /* MAP MARKERS */
    .pulse-dot {
      width: 24px;
      height: 24px;
      position: relative;
    }

    .pulse-dot::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 12px;
      height: 12px;
      background: #EF4444;
      border-radius: 50%;
      border: 2px solid #FFF;
      box-shadow: 0 0 8px #EF4444;
    }

    .pulse-dot::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      border: 2px solid #EF4444;
      border-radius: 50%;
      animation: radarRing 1.8s infinite;
    }

    @keyframes radarRing {
      0% { width: 12px; height: 12px; opacity: 1; }
      100% { width: 38px; height: 38px; opacity: 0; }
    }

    .agent-pin {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #06B6D4 0%, #0284C7 100%);
      border-radius: 50%;
      border: 2px solid #FFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.6);
    }

    /* RIGHT DRAWER */
    .drawer {
      width: 440px;
      background: var(--bg-dark);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 30;
      transition: transform 0.2s;
    }

    .drawer.hidden {
      display: none;
    }

    .drawer-head {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .drawer-head-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-close {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 18px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 6px;
    }

    .btn-close:hover {
      background: var(--bg-surface);
      color: #FFF;
    }

    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .panel {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
    }

    .panel-head {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* VIDEO BOX */
    .video-frame {
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .video-player {
      width: 100%;
      height: 190px;
      background: #000;
      display: block;
      object-fit: cover;
    }

    .video-empty {
      height: 110px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-dim);
      font-size: 11px;
      text-align: center;
      padding: 14px;
    }

    .video-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }

    .btn-small {
      flex: 1;
      padding: 6px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: #FFF;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
      text-align: center;
    }

    /* DETAILS TABLE */
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 5px;
      margin-bottom: 5px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 12px;
    }

    .row:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .k { color: var(--text-dim); font-weight: 500; }
    .v { font-weight: 600; color: #FFF; text-align: right; }

    /* ACTION BUTTONS */
    .action-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 10px;
    }

    .btn-red {
      padding: 8px;
      background: var(--red);
      color: #FFF;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
    }

    .btn-police {
      padding: 8px;
      background: var(--bg-elevated);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #FCD34D;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
    }

    .btn-copy {
      grid-column: 1 / -1;
      padding: 7px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      text-align: center;
    }

    /* RESPONDERS LIST */
    .agent-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .agent-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .agent-card.nearest {
      border-color: rgba(6, 182, 212, 0.6);
      background: rgba(6, 182, 212, 0.06);
    }

    .agent-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .dist-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--cyan-soft);
      color: #67E8F9;
    }

    .agent-card-actions {
      display: flex;
      gap: 6px;
      margin-top: 2px;
    }

    .btn-assign {
      flex: 1;
      padding: 6px;
      background: var(--cyan);
      color: #000;
      border: none;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }

    .btn-wa {
      padding: 8px;
      background: #25D366;
      color: #000;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
      display: block;
      margin-top: 6px;
    }

    /* NOTES */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 6px;
    }

    .chip {
      padding: 2px 7px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 10px;
      color: var(--text-dim);
      cursor: pointer;
    }

    .notes-input {
      width: 100%;
      height: 55px;
      background: var(--bg-dark);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 11px;
      color: #FFF;
      outline: none;
      resize: none;
      font-family: inherit;
    }

    .notes-actions {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
    }

    /* MODAL */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(6px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-overlay.hidden { display: none; }

    .modal {
      width: 400px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }

    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      font-size: 15px;
      font-weight: 700;
    }

    .field { margin-bottom: 10px; }
    .field label { display: block; font-size: 10px; font-weight: 700; color: var(--text-dim); margin-bottom: 4px; text-transform: uppercase; }
    .input { width: 100%; background: var(--bg-dark); border: 1px solid var(--border); border-radius: 6px; padding: 7px 10px; font-size: 12px; color: #FFF; outline: none; }
    .input:focus { border-color: var(--cyan); }

    .modal-foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 14px; }
  </style>
</head>
<body>

  <!-- TOP BAR -->
  <header class="topbar">
    <div class="brand-box">
      <div class="brand-icon">🛡️</div>
      <div class="brand-title">
        <span>DEVI Response Center</span>
        <span class="live-pill"><span class="live-dot"></span>Live</span>
      </div>
    </div>

    <!-- STATS -->
    <div class="top-stats">
      <div class="stat-chip emergency" id="emergencyPill">
        <span style="color: #EF4444;">●</span>
        <span id="activeCountText">0 Active</span>
      </div>
      <div class="stat-chip">
        <span>Agents: <strong id="assignedCountText" style="color: #67E8F9;">0</strong></span>
      </div>
      <div class="clock" id="liveClock">--:--:-- IST</div>
    </div>

    <!-- BUTTONS -->
    <div class="top-btns">
      <button class="btn btn-green" onclick="openAddResponderModal()">
        <span>+</span> Add Agent
      </button>
      <button class="btn" onclick="copyDutyPortalLink()" title="Copy Agent On-Duty Mobile Link for WhatsApp">
        <span>🔗</span> Duty Link
      </button>
      <button class="btn" id="toggleRespondersBtn" onclick="toggleRespondersOnMap()">
        <span>🛡️</span> Agents (<span id="respondersCount">0</span>)
      </button>
      <button class="btn" id="audioToggleBtn" onclick="toggleAudioAlerts()">
        <span id="audioIcon">🔔</span> Sound ON
      </button>
      <button class="btn" onclick="fetchIncidents(true)">
        <span>🔄</span> Refresh
      </button>
    </div>
  </header>

  <!-- MAIN -->
  <div class="app-main">

    <!-- LEFT SIDEBAR -->
    <aside class="sidebar">
      <div class="sidebar-head">
        <input type="text" class="search-input" id="searchInput" placeholder="Search name, phone, or location..." oninput="handleSearch(this.value)">
        
        <div class="mini-stats">
          <div class="stat-item"><div class="val" id="statTotal">0</div><div class="lbl">Total</div></div>
          <div class="stat-item" style="border-color: rgba(239,68,68,0.3);"><div class="val" id="statActive" style="color: #F87171;">0</div><div class="lbl" style="color: #F87171;">Active</div></div>
          <div class="stat-item"><div class="val" id="statAssigned" style="color: #FCD34D;">0</div><div class="lbl">Assigned</div></div>
          <div class="stat-item"><div class="val" id="statResolved" style="color: #34D399;">0</div><div class="lbl">Resolved</div></div>
        </div>

        <div class="tabs">
          <button class="tab active" onclick="setFilter('ALL', this)">All</button>
          <button class="tab" onclick="setFilter('ACTIVE', this)">Active</button>
          <button class="tab" onclick="setFilter('ASSIGNED', this)">Assigned</button>
          <button class="tab" onclick="setFilter('RESOLVED', this)">Resolved</button>
        </div>
      </div>

      <div class="incidents-list" id="incidentList">
        <div style="text-align: center; padding: 40px 10px; color: var(--text-dim); font-size: 11px;">
          Connecting to live radar...
        </div>
      </div>
    </aside>

    <!-- CENTER MAP -->
    <main class="map-box">
      <div id="map"></div>
      <div class="map-controls">
        <div class="map-chip" id="sectorText">Tamil Nadu Sector</div>
        <button class="btn" onclick="fitAllEmergencyPins()" style="height: 28px; padding: 0 8px; font-size: 11px;">Fit Map</button>
        <button class="btn" onclick="focusLatestEmergency()" style="height: 28px; padding: 0 8px; font-size: 11px;">Latest SOS</button>
      </div>
    </main>

    <!-- RIGHT DRAWER -->
    <aside class="drawer hidden" id="tacticalDrawer">
      <div class="drawer-head">
        <div class="drawer-head-left">
          <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;" id="drawerAlertId">#SOS</span>
          <span class="badge ACTIVE" id="drawerStatusBadge">ACTIVE</span>
        </div>
        <button class="btn-close" onclick="closeDrawer()">✕</button>
      </div>

      <div class="drawer-body" id="drawerBody">
        <!-- Dynamic content rendered by renderTacticalDrawer -->
      </div>
    </aside>

  </div>

  <!-- ADD AGENT MODAL -->
  <div class="modal-overlay hidden" id="addResponderModal">
    <div class="modal">
      <div class="modal-head">
        <span>+ Add Response Agent</span>
        <button class="btn-close" onclick="closeAddResponderModal()">✕</button>
      </div>

      <form onsubmit="handleSaveResponder(event)">
        <div class="field">
          <label>Agent Name</label>
          <input type="text" id="respName" class="input" placeholder="e.g. Karthi" required>
        </div>

        <div class="field">
          <label>Mobile Number (For WhatsApp Alert & Login)</label>
          <input type="tel" id="respPhone" class="input" placeholder="e.g. 9876543210" required>
        </div>

        <div class="field">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="margin: 0;">4-Digit Security PIN</label>
            <button type="button" onclick="generateRandomPin()" style="background: none; border: none; color: #38BDF8; font-size: 11px; font-weight: 700; cursor: pointer;">🎲 Auto-Generate PIN</button>
          </div>
          <input type="text" id="respPin" class="input" placeholder="e.g. 7421" maxlength="6" style="font-family: 'JetBrains Mono', monospace; font-size: 16px; letter-spacing: 4px; font-weight: 700; text-align: center; color: #38BDF8;" required>
        </div>

        <div class="field">
          <label>Patrol Area / Assigned Station</label>
          <input type="text" id="respArea" class="input" placeholder="e.g. Central Bus Stand / Campus Gate" required>
        </div>

        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 10px; font-size: 11px; color: #6EE7B7; margin-bottom: 14px;">
          🚀 <strong>Instant Meta WhatsApp Dispatch:</strong> Clicking Save will immediately send the login credentials and duty portal link from our official Meta WhatsApp number (<strong>+91 90806 85175</strong>) directly to the responder's phone.
        </div>

        <div class="modal-foot">
          <button type="button" class="btn" onclick="closeAddResponderModal()">Cancel</button>
          <button type="submit" class="btn btn-green">Save & Dispatch Credentials</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Leaflet Map JS -->
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>

  <script>
    // State
    let incidents = [];
    let responders = [];
    let currentFilter = 'ALL';
    let searchQuery = '';
    let selectedIncidentId = null;
    let map = null;
    let markersMap = new Map();
    let responderMarkersMap = new Map();
    let dispatchLineLayer = null;
    let showRespondersOnMap = true;
    let audioAlertsEnabled = true;
    let previousActiveIds = new Set();
    let audioCtx = null;
    let hasAutoCentered = false;

    // Haversine Distance (km)
    function calculateDistanceKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    }

    // Initialize Map with Google Satellite Hybrid & Tactical Dark
    function initMap() {
      map = L.map('map', { zoomControl: false }).setView([10.85, 78.70], 8);
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const satelliteHybrid = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Satellite',
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 21
      });

      const tacticalDark = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
        className: 'tactical-dark-tiles'
      });

      const streetRoadmap = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 20
      });

      satelliteHybrid.addTo(map);

      L.control.layers({
        "🛰️ Satellite": satelliteHybrid,
        "🌑 Dark Map": tacticalDark,
        "🗺️ Streets": streetRoadmap
      }, null, { position: 'topright' }).addTo(map);
    }

    // Audio Alert
    function playEmergencyAlertSiren() {
      if (!audioAlertsEnabled) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';

        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(660, now + 0.15);
        osc.frequency.setValueAtTime(880, now + 0.30);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.start(now);
        osc.stop(now + 0.5);
      } catch (e) {}
    }

    function toggleAudioAlerts() {
      audioAlertsEnabled = !audioAlertsEnabled;
      const btn = document.getElementById('audioToggleBtn');
      btn.innerHTML = audioAlertsEnabled ? '<span id="audioIcon">🔔</span> Sound ON' : '<span id="audioIcon">🔕</span> Sound OFF';
    }

    // Digital Clock
    function updateClock() {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      document.getElementById('liveClock').textContent = \`\${hrs}:\${mins}:\${secs} IST\`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Fetch Responders
    async function fetchResponders() {
      try {
        const res = await fetch('/api/dashboard/agents');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.agents)) {
          responders = data.agents;
          document.getElementById('respondersCount').textContent = responders.length;
          document.getElementById('assignedCountText').textContent = responders.length;
          updateResponderMarkers();
          if (selectedIncidentId) {
            const inc = incidents.find(i => i.id === selectedIncidentId);
            if (inc) renderTacticalDrawer(inc);
          }
        }
      } catch (e) {}
    }

    // Update Responder Pins
    function updateResponderMarkers() {
      if (!map) return;
      if (!showRespondersOnMap) {
        for (const marker of responderMarkersMap.values()) map.removeLayer(marker);
        responderMarkersMap.clear();
        return;
      }

      const currentIds = new Set(responders.map(r => r.id));
      for (const [id, marker] of responderMarkersMap.entries()) {
        if (!currentIds.has(id)) {
          map.removeLayer(marker);
          responderMarkersMap.delete(id);
        }
      }

      responders.forEach(r => {
        const lat = parseFloat(r.latitude);
        const lng = parseFloat(r.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        const icon = L.divIcon({
          className: 'custom-responder-marker',
          html: '<div class="agent-pin">🛡️</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        if (responderMarkersMap.has(r.id)) {
          const marker = responderMarkersMap.get(r.id);
          marker.setLatLng([lat, lng]);
        } else {
          const marker = L.marker([lat, lng], { icon }).addTo(map);
          marker.bindTooltip(\`<strong>\${escapeHtml(r.name)}</strong><br/>📍 \${escapeHtml(r.area)}<br/>📞 \${escapeHtml(r.phone)}\`, { direction: 'top' });
          responderMarkersMap.set(r.id, marker);
        }
      });
    }

    function toggleRespondersOnMap() {
      showRespondersOnMap = !showRespondersOnMap;
      updateResponderMarkers();
    }

    // Fetch Incidents
    async function fetchIncidents(manual = false) {
      try {
        const res = await fetch('/api/dashboard/incidents');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.incidents)) {
          incidents = data.incidents;
          updateStats();
          renderIncidentList();
          updateMapMarkers();

          // Siren check
          const currentActiveIds = new Set();
          incidents.forEach(inc => {
            if (inc.status === 'DISPATCHED' || inc.status === 'ACTIVE') {
              currentActiveIds.add(inc.id);
              if (!previousActiveIds.has(inc.id) && !manual) playEmergencyAlertSiren();
            }
          });
          previousActiveIds = currentActiveIds;

          if (!hasAutoCentered && incidents.length > 0) {
            hasAutoCentered = true;
            focusLatestEmergency();
          }

          if (selectedIncidentId) {
            const activeInc = incidents.find(i => i.id === selectedIncidentId);
            if (activeInc) renderTacticalDrawer(activeInc);
          }
        }
      } catch (err) {}
    }

    // Stats
    function updateStats() {
      const total = incidents.length;
      const active = incidents.filter(i => i.status === 'DISPATCHED' || i.status === 'ACTIVE').length;
      const assigned = incidents.filter(i => i.status === 'ASSIGNED').length;
      const resolved = incidents.filter(i => i.status === 'RESOLVED').length;

      document.getElementById('statTotal').textContent = total;
      document.getElementById('statActive').textContent = active;
      document.getElementById('statAssigned').textContent = assigned;
      document.getElementById('statResolved').textContent = resolved;
      document.getElementById('activeCountText').textContent = \`\${active} Active\`;

      document.getElementById('emergencyPill').style.display = active > 0 ? 'flex' : 'none';
    }

    function setFilter(filter, btn) {
      currentFilter = filter;
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderIncidentList();
    }

    function handleSearch(query) {
      searchQuery = (query || '').toLowerCase().trim();
      renderIncidentList();
    }

    // Render Cards
    function renderIncidentList() {
      const container = document.getElementById('incidentList');
      let filtered = incidents;

      if (currentFilter === 'ACTIVE') {
        filtered = incidents.filter(i => i.status === 'DISPATCHED' || i.status === 'ACTIVE');
      } else if (currentFilter === 'ASSIGNED') {
        filtered = incidents.filter(i => i.status === 'ASSIGNED');
      } else if (currentFilter === 'RESOLVED') {
        filtered = incidents.filter(i => i.status === 'RESOLVED');
      }

      if (searchQuery) {
        filtered = filtered.filter(i => {
          const name = (i.user?.name || '').toLowerCase();
          const phone = (i.user?.phone || '').toLowerCase();
          const id = (i.id || '').toLowerCase();
          const loc = (i.location || '').toLowerCase();
          return name.includes(searchQuery) || phone.includes(searchQuery) || id.includes(searchQuery) || loc.includes(searchQuery);
        });
      }

      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-dim); font-size: 11px;">No incidents found.</div>';
        return;
      }

      container.innerHTML = filtered.map(inc => {
        const isEmergency = inc.status === 'DISPATCHED' || inc.status === 'ACTIVE';
        const isAssigned = inc.status === 'ASSIGNED';
        const isResolved = inc.status === 'RESOLVED';
        const isSelected = selectedIncidentId === inc.id;

        const cardClass = [
          'card',
          isEmergency ? 'emergency' : isAssigned ? 'assigned' : 'resolved',
          isSelected ? 'active' : ''
        ].join(' ');

        const shortId = inc.id.length > 8 ? \`#\${inc.id.substring(0, 6).toUpperCase()}\` : \`#\${inc.id}\`;

        let locText = inc.location || 'Location on map';
        if (locText.includes('Location disabled')) locText = 'GPS Disabled (Estimated Sector)';

        return \`
          <div class="\${cardClass}" onclick="selectIncident('\${inc.id}')">
            <div class="card-head">
              <span class="card-id">\${shortId}</span>
              <span class="badge \${inc.status}">\${inc.status}</span>
            </div>
            <div class="card-user">
              <span class="card-name">\${escapeHtml(inc.user.name)}</span>
              <span class="card-phone">\${escapeHtml(inc.user.phone)}</span>
            </div>
            <div class="card-loc">📍 \${escapeHtml(locText)}</div>
            <div class="card-foot">
              <span>\${inc.timeAgo}</span>
              <div style="display: flex; gap: 4px;">
                \${inc.evidenceUrl ? '<span class="tag">🎥 Video</span>' : ''}
                \${inc.assignedAgent ? \`<span class="tag" style="background: var(--amber-soft); color: #FCD34D;">👮 \${escapeHtml(inc.assignedAgent.split(' ')[0])}</span>\` : ''}
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    // Map Markers
    function updateMapMarkers() {
      if (!map) return;
      const currentIds = new Set(incidents.map(i => i.id));

      for (const [id, marker] of markersMap.entries()) {
        if (!currentIds.has(id)) {
          map.removeLayer(marker);
          markersMap.delete(id);
        }
      }

      incidents.forEach(inc => {
        const lat = parseFloat(inc.latitude);
        const lng = parseFloat(inc.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        const icon = L.divIcon({
          className: 'custom-marker',
          html: '<div class="pulse-dot"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        if (markersMap.has(inc.id)) {
          markersMap.get(inc.id).setLatLng([lat, lng]);
        } else {
          const marker = L.marker([lat, lng], { icon }).addTo(map);
          marker.bindTooltip(\`<strong>\${escapeHtml(inc.user.name)}</strong><br/>\${inc.status}\`, { direction: 'top' });
          marker.on('click', () => selectIncident(inc.id));
          markersMap.set(inc.id, marker);
        }
      });
    }

    function fitAllEmergencyPins() {
      if (!map) return;
      const all = [...Array.from(markersMap.values()), ...Array.from(responderMarkersMap.values())];
      if (all.length === 0) return;
      map.fitBounds(new L.featureGroup(all).getBounds().pad(0.2));
    }

    function focusLatestEmergency() {
      if (incidents.length === 0) return;
      const target = incidents.find(i => (i.status === 'DISPATCHED' || i.status === 'ACTIVE') && i.latitude && i.longitude) || incidents[0];
      if (target) selectIncident(target.id);
    }

    function selectIncident(id) {
      selectedIncidentId = id;
      const inc = incidents.find(i => i.id === id);
      if (!inc) return;

      renderIncidentList();

      const lat = parseFloat(inc.latitude);
      const lng = parseFloat(inc.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], 17, { animate: true, duration: 1 });
        document.getElementById('sectorText').textContent = \`Sector: \${lat.toFixed(4)}, \${lng.toFixed(4)}\`;
      }

      renderTacticalDrawer(inc);
      document.getElementById('tacticalDrawer').classList.remove('hidden');
    }

    function closeDrawer() {
      document.getElementById('tacticalDrawer').classList.add('hidden');
      selectedIncidentId = null;
      if (dispatchLineLayer && map) {
        map.removeLayer(dispatchLineLayer);
        dispatchLineLayer = null;
      }
      renderIncidentList();
    }

    // Render Drawer
    function renderTacticalDrawer(inc) {
      const shortId = inc.id.length > 8 ? \`#\${inc.id.substring(0, 6).toUpperCase()}\` : \`#\${inc.id}\`;
      document.getElementById('drawerAlertId').textContent = shortId;
      document.getElementById('drawerStatusBadge').textContent = inc.status;
      document.getElementById('drawerStatusBadge').className = \`badge \${inc.status}\`;

      const victimLat = parseFloat(inc.latitude);
      const victimLng = parseFloat(inc.longitude);

      // Rank Responders
      const rankedResponders = responders.map(r => {
        const rLat = parseFloat(r.latitude);
        const rLng = parseFloat(r.longitude);
        const distKm = (!isNaN(victimLat) && !isNaN(victimLng) && !isNaN(rLat) && !isNaN(rLng))
          ? calculateDistanceKm(victimLat, victimLng, rLat, rLng)
          : 999;
        const estMins = Math.max(1, Math.round(distKm * 2.5));
        return { ...r, distKm, estMins };
      }).sort((a, b) => a.distKm - b.distKm);

      // Guardians
      const guardiansHtml = inc.guardians && inc.guardians.length > 0
        ? inc.guardians.map(g => \`
            <div class="row">
              <span class="k">🛡️ \${escapeHtml(g.name || 'Guardian')}</span>
              <a href="tel:\${escapeHtml(g.phone)}" style="color: #38BDF8; font-family: 'JetBrains Mono', monospace; text-decoration: none; font-weight: 600;">
                📞 \${escapeHtml(g.phone)}
              </a>
            </div>
          \`).join('')
        : '<div style="color: var(--text-dim); font-size: 11px;">No guardians configured.</div>';

      // Responders HTML
      let respondersHtml = '';
      if (rankedResponders.length === 0) {
        respondersHtml = '<div style="padding: 10px; color: var(--text-dim); font-size: 11px; text-align: center;">No agents registered.</div>';
      } else {
        respondersHtml = rankedResponders.map((r, idx) => {
          const isNearest = idx === 0 && r.distKm < 50;
          const distText = r.distKm < 900 ? \`\${r.distKm.toFixed(1)} km (~\${r.estMins}m)\` : 'Location pending';

          return \`
            <div class="agent-card \${isNearest ? 'nearest' : ''}">
              <div class="agent-card-top">
                <span style="font-size: 12px; font-weight: 700; color: #FFF;">\${isNearest ? '⚡ ' : ''}\${escapeHtml(r.name)}</span>
                <span class="dist-badge">\${distText}</span>
              </div>
              <div style="font-size: 10px; color: var(--text-dim); display: flex; justify-content: space-between;">
                <span>📍 \${escapeHtml(r.area)} (\${escapeHtml(r.vehicle)})</span>
                <span style="font-family: 'JetBrains Mono', monospace;">📞 \${escapeHtml(r.phone)}</span>
              </div>
              <div class="agent-card-actions">
                <button class="btn-assign" onclick="assignAndAlertResponder('\${inc.id}', '\${r.id}', '\${escapeHtml(r.name)}', '\${escapeHtml(r.phone)}', \${r.distKm})">
                  Assign & Alert
                </button>
                <a href="tel:\${escapeHtml(r.phone)}" class="btn" style="padding: 0 8px; height: 26px; font-size: 10px;">
                  📞 Call
                </a>
              </div>
            </div>
          \`;
        }).join('');
      }

      const drawerBody = document.getElementById('drawerBody');
      drawerBody.innerHTML = \`
        <!-- EVIDENCE -->
        <div class="panel">
          <div class="panel-head">
            <span>Live Evidence</span>
            \${inc.evidenceUrl ? '<span style="color: #34D399; font-size: 9px;">● READY</span>' : ''}
          </div>
          
          <div class="video-frame">
            \${inc.evidenceUrl ? \`
              <video class="video-player" src="\${inc.evidenceUrl}" controls playsinline preload="metadata"></video>
            \` : \`
              <div class="video-empty">
                <span>⏳ Front camera recording in progress or pending upload...</span>
              </div>
            \`}
          </div>

          \${inc.evidenceUrl ? \`
            <div class="video-actions">
              <a href="\${inc.evidenceUrl}" target="_blank" class="btn-small">↗ Open Video</a>
              <a href="\${inc.evidenceUrl}" download="DEVI_EVIDENCE_\${inc.id}.mp4" class="btn-small">⬇ Download</a>
            </div>
          \` : ''}
        </div>

        <!-- VICTIM DETAILS -->
        <div class="panel">
          <div class="panel-head">Victim Details</div>
          <div class="row"><span class="k">Name</span><span class="v">\${escapeHtml(inc.user.name)}</span></div>
          <div class="row"><span class="k">Phone</span><span class="v" style="font-family: 'JetBrains Mono', monospace; color: #38BDF8;">\${escapeHtml(inc.user.phone)}</span></div>
          <div class="row"><span class="k">Time</span><span class="v">\${inc.displayTime} (\${inc.timeAgo})</span></div>
          <div class="row" style="flex-direction: column; gap: 2px;">
            <span class="k">Location</span>
            <span class="v" style="text-align: left; font-size: 11px; color: #E2E8F0;">\${escapeHtml(inc.location)}</span>
          </div>

          <div class="action-row">
            <a href="tel:\${escapeHtml(inc.user.phone)}" class="btn-red">📞 Call Victim</a>
            <a href="tel:112" class="btn-police">🚨 Call 112</a>
            <button class="btn-copy" onclick="copyTrackingLink('\${inc.id}')">📋 Copy Tracking Link</button>
          </div>
        </div>

        <!-- NEARBY AGENTS -->
        <div class="panel">
          <div class="panel-head">
            <span>Nearby Agents</span>
            <button onclick="openAddResponderModal()" style="background: none; border: none; color: #06B6D4; cursor: pointer; font-size: 10px; font-weight: 700;">+ Add</button>
          </div>

          \${inc.assignedAgent ? \`
            <div style="background: var(--amber-soft); border: 1px solid rgba(245,158,11,0.3); border-radius: 6px; padding: 8px; margin-bottom: 8px;">
              <div style="font-size: 11px; font-weight: 700; color: #FCD34D;">✓ Assigned: \${escapeHtml(inc.assignedAgent)}</div>
              <a href="\${generateWhatsAppAlertUrl(inc)}" target="_blank" class="btn-wa">💬 Send WhatsApp Alert</a>
            </div>
          \` : ''}

          <div class="agent-list">
            \${respondersHtml}
          </div>
        </div>

        <!-- GUARDIANS -->
        <div class="panel">
          <div class="panel-head">Guardians</div>
          \${guardiansHtml}
        </div>

        <!-- NOTES -->
        <div class="panel">
          <div class="panel-head">Incident Notes</div>
          
          <div class="chips">
            <span class="chip" onclick="appendNote('Call Attempt - ')">+ Call Attempt</span>
            <span class="chip" onclick="appendNote('Spoke to Victim - ')">+ Spoke to Victim</span>
            <span class="chip" onclick="appendNote('Agent Dispatched - ')">+ Dispatched</span>
            <span class="chip" onclick="appendNote('Victim Safe - ')">+ Safe</span>
          </div>

          <textarea class="notes-input" id="operatorNotesInput" placeholder="Add note...">\${inc.operatorNotes || ''}</textarea>

          <div class="notes-actions">
            <button class="btn" onclick="saveOperatorNotes('\${inc.id}')" style="height: 28px; font-size: 11px;">Save Note</button>
            <button class="btn btn-green" onclick="resolveIncident('\${inc.id}')" style="height: 28px; font-size: 11px;">✓ Resolve</button>
          </div>
        </div>
      \`;
    }

    function generateWhatsAppAlertUrl(inc, responderPhone = null) {
      const trackingUrl = \`\${window.location.origin}/track/\${inc.id}\`;
      const msg = \`🚨 DEVI EMERGENCY ALERT!\\nVictim: \${inc.user.name}\\nPhone: \${inc.user.phone}\\nLocation: \${inc.location}\\n\\n🔴 LIVE GPS TRACKING:\\n\${trackingUrl}\\n\\nPlease reach the spot immediately! Control room is guiding you.\`;
      
      const phoneClean = (responderPhone || '').replace(/[^0-9]/g, '');
      if (phoneClean) {
        return \`https://wa.me/91\${phoneClean.length === 10 ? phoneClean : phoneClean.slice(-10)}?text=\${encodeURIComponent(msg)}\`;
      }
      return \`https://api.whatsapp.com/send?text=\${encodeURIComponent(msg)}\`;
    }

    // Assign & Alert
    async function assignAndAlertResponder(alertId, responderId, responderName, responderPhone, distKm) {
      try {
        const res = await fetch('/api/dashboard/assign-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId, agentName: responderName, agentPhone: responderPhone }),
        });
        const data = await res.json();
        if (data.success) {
          drawTacticalDispatchLine(alertId, responderId);
          await fetchIncidents(true);
          await fetchResponders();

          const updated = incidents.find(i => i.id === alertId);
          if (updated) renderTacticalDrawer(updated);

          const waUrl = generateWhatsAppAlertUrl(updated, responderPhone);
          const shouldSend = confirm(\`✓ \${responderName} assigned!\\n\\nOpen WhatsApp to send live tracking link to \${responderName} (\${responderPhone})?\`);
          if (shouldSend) window.open(waUrl, '_blank');
        }
      } catch (e) {
        alert('Error assigning agent');
      }
    }

    async function drawTacticalDispatchLine(alertId, responderId) {
      const inc = incidents.find(i => i.id === alertId);
      const resp = responders.find(r => r.id === responderId);
      if (!inc || !resp || !map) return;

      const vLat = parseFloat(inc.latitude);
      const vLng = parseFloat(inc.longitude);
      const rLat = parseFloat(resp.latitude);
      const rLng = parseFloat(resp.longitude);
      if (isNaN(vLat) || isNaN(vLng) || isNaN(rLat) || isNaN(rLng)) return;

      if (dispatchLineLayer) {
        map.removeLayer(dispatchLineLayer);
        dispatchLineLayer = null;
      }

      try {
        // Query Open Source Routing Machine (OSRM) for real road driving coordinates
        const osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + rLng + ',' + rLat + ';' + vLng + ',' + vLat + '?overview=full&geometries=geojson';
        const res = await fetch(osrmUrl);
        const data = await res.json();

        if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const roadPoints = data.routes[0].geometry.coordinates.map(pt => [pt[1], pt[0]]);
          
          dispatchLineLayer = L.polyline(roadPoints, {
            color: '#38BDF8',
            weight: 5,
            opacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(map);

          map.fitBounds(dispatchLineLayer.getBounds().pad(0.2));
          return;
        }
      } catch (err) {
        console.warn('Real road routing error, using direct line fallback:', err);
      }

      // Fallback: direct line if OSRM is unreachable
      dispatchLineLayer = L.polyline([[rLat, rLng], [vLat, vLng]], {
        color: '#06B6D4',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.85
      }).addTo(map);

      map.fitBounds(dispatchLineLayer.getBounds().pad(0.3));
    }

    function appendNote(prefix) {
      const textarea = document.getElementById('operatorNotesInput');
      if (textarea) {
        const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const existing = textarea.value.trim();
        textarea.value = existing ? \`\${existing}\\n[\${time}] \${prefix}\` : \`[\${time}] \${prefix}\`;
        textarea.focus();
      }
    }

    function copyTrackingLink(id) {
      const url = \`\${window.location.origin}/track/\${id}\`;
      navigator.clipboard.writeText(url).then(() => {
        alert('Tracking Link Copied: ' + url);
      });
    }

    function copyDutyPortalLink() {
      const url = \`\${window.location.origin}/duty\`;
      navigator.clipboard.writeText(url).then(() => {
        alert('Agent Duty Link Copied!\\nSend this link to your field agents on WhatsApp:\\n' + url);
      });
    }

    async function saveOperatorNotes(alertId) {
      const textarea = document.getElementById('operatorNotesInput');
      const note = textarea ? textarea.value.trim() : '';
      if (!note) return;

      try {
        await fetch('/api/dashboard/add-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId, note }),
        });
        await fetchIncidents(true);
        alert('Note saved');
      } catch (e) {}
    }

    async function resolveIncident(alertId) {
      if (!confirm('Mark this incident as RESOLVED?')) return;
      try {
        await fetch(\`/api/dashboard/resolve/\${alertId}\`, { method: 'POST' });
        await fetchIncidents(true);
        closeDrawer();
      } catch (e) {}
    }

    // Modal & PIN Generation
    function generateRandomPin() {
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const pinInput = document.getElementById('respPin');
      if (pinInput) pinInput.value = pin;
      return pin;
    }

    function openAddResponderModal() {
      const nameInput = document.getElementById('respName');
      const phoneInput = document.getElementById('respPhone');
      const areaInput = document.getElementById('respArea');
      if (nameInput) nameInput.value = '';
      if (phoneInput) phoneInput.value = '';
      if (areaInput) areaInput.value = '';
      generateRandomPin();
      document.getElementById('addResponderModal').classList.remove('hidden');
    }

    function closeAddResponderModal() {
      document.getElementById('addResponderModal').classList.add('hidden');
    }

    async function handleSaveResponder(e) {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const origText = submitBtn ? submitBtn.innerText : 'Save & Dispatch Credentials';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = '⏳ Dispatching WhatsApp...';
      }

      const name = document.getElementById('respName').value.trim();
      const phone = document.getElementById('respPhone').value.trim();
      const pin = document.getElementById('respPin') ? document.getElementById('respPin').value.trim() : '';
      const area = document.getElementById('respArea').value.trim();

      try {
        const res = await fetch('/api/dashboard/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, pin, area }),
        });
        const data = await res.json();
        if (data.success) {
          closeAddResponderModal();
          await fetchResponders();

          const assignedPin = data.plainPin || pin;
          alert('✅ Responder ' + name + ' Registered Successfully!\n\n📲 Login credentials & duty link have been automatically dispatched from our official DEVI Meta Number (+91 90806 85175) directly to ' + phone + '.\n\n🔑 4-Digit Security PIN: ' + assignedPin);
        } else {
          alert('Failed to register responder: ' + (data.message || 'Unknown error'));
        }
      } catch (err) {
        alert('Network error: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = origText;
        }
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // WebSocket Real-time Listener for Instant Dashboard Updates
    let dashWs = null;
    function initDashboardWebSocket() {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = wsProtocol + '//' + window.location.host + '/ws';
        dashWs = new WebSocket(wsUrl);

        dashWs.onopen = () => {
          console.log('⚡ [DASHBOARD WEBSOCKET CONNECTED]');
          dashWs.send(JSON.stringify({ type: 'join', room: 'dashboard' }));
        };

        dashWs.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'sos:new' || msg.type === 'loc' || msg.type === 'status' || msg.type === 'agent_loc') {
              console.log('⚡ Realtime update via WS:', msg.type);
              fetchIncidents(false);
              fetchResponders();
            }
          } catch (e) {}
        };

        dashWs.onclose = () => {
          setTimeout(initDashboardWebSocket, 5000);
        };
      } catch (err) {
        console.warn('Dashboard WS init failed:', err);
      }
    }

    // Startup
    window.addEventListener('DOMContentLoaded', () => {
      initMap();
      fetchIncidents(true);
      fetchResponders();
      initDashboardWebSocket();
      // Relaxed polling fallback (15 seconds instead of 4 seconds)
      setInterval(() => {
        fetchIncidents(false);
        fetchResponders();
      }, 15000);
    });
  </script>
</body>
</html>
`;
}

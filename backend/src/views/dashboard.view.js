export function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DEVI Command Center | 24/7 Emergency Response Dashboard</title>
  
  <!-- Leaflet Map CSS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-dark: #07090E;
      --bg-surface: #0E131F;
      --bg-surface-elevated: #161D2F;
      --bg-glass: rgba(14, 19, 31, 0.85);
      --border-color: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(239, 68, 68, 0.4);
      --text-main: #F8FAFC;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
      --danger: #EF4444;
      --danger-dark: #B91C1C;
      --danger-glow: rgba(239, 68, 68, 0.35);
      --warning: #F59E0B;
      --success: #10B981;
      --accent: #6366F1;
      --primary: #8B5CF6;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-dark);
      color: var(--text-main);
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* TOP HEADER */
    header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      height: 64px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 1000;
      flex-shrink: 0;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, #EF4444 0%, #881337 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 0 20px var(--danger-glow);
    }

    .brand-text h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.3px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-text h1 span.tag {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #F87171;
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
    }

    .brand-text p {
      font-size: 12px;
      color: var(--text-muted);
    }

    .header-metrics {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .metric-pill {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-color);
      padding: 6px 14px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
    }

    .metric-pill .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .dot.live {
      background: #10B981;
      box-shadow: 0 0 10px #10B981;
      animation: pulse-live 1.8s infinite;
    }

    .dot.alert {
      background: #EF4444;
      box-shadow: 0 0 10px #EF4444;
      animation: pulse-alert 1.2s infinite;
    }

    @keyframes pulse-live {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
    }

    @keyframes pulse-alert {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(1.3); }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-btn {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }

    .header-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .header-btn.active {
      background: rgba(239, 68, 68, 0.15);
      border-color: var(--danger);
      color: #FCA5A5;
    }

    .live-clock {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--text-muted);
      background: var(--bg-surface-elevated);
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
    }

    /* MAIN CONTENT SPLIT */
    .dashboard-body {
      display: flex;
      flex: 1;
      height: calc(100vh - 64px);
      overflow: hidden;
      position: relative;
    }

    /* LEFT SIDEBAR: INCIDENT FEED (Step 7) */
    .incident-sidebar {
      width: 400px;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 10;
    }

    .sidebar-header {
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .sidebar-header .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .sidebar-header h2 {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 700;
    }

    .stats-chips {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }

    .stat-chip {
      background: var(--bg-surface-elevated);
      padding: 8px 6px;
      border-radius: 8px;
      text-align: center;
      border: 1px solid var(--border-color);
    }

    .stat-chip .val {
      font-size: 16px;
      font-weight: 800;
      font-family: 'Outfit', sans-serif;
    }

    .stat-chip .lbl {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-top: 2px;
    }

    .filter-tabs {
      display: flex;
      gap: 6px;
      background: var(--bg-dark);
      padding: 4px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
    }

    .filter-btn {
      flex: 1;
      padding: 6px 4px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 700;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: center;
    }

    .filter-btn.active {
      background: var(--bg-surface-elevated);
      color: var(--text-main);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }

    .incident-list {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .incident-list::-webkit-scrollbar {
      width: 6px;
    }
    .incident-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }

    .incident-card {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    .incident-card:hover {
      border-color: rgba(255, 255, 255, 0.25);
      transform: translateY(-1px);
    }

    .incident-card.active {
      border-color: var(--danger);
      background: rgba(239, 68, 68, 0.08);
      box-shadow: 0 4px 20px rgba(239, 68, 68, 0.15);
    }

    .incident-card.is-emergency {
      border-left: 4px solid var(--danger);
    }

    .incident-card.is-assigned {
      border-left: 4px solid var(--warning);
    }

    .incident-card.is-resolved {
      border-left: 4px solid var(--success);
      opacity: 0.75;
    }

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .card-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
    }

    .status-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.4px;
    }

    .status-badge.DISPATCHED, .status-badge.ACTIVE {
      background: rgba(239, 68, 68, 0.2);
      color: #F87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }

    .status-badge.ASSIGNED {
      background: rgba(245, 158, 11, 0.2);
      color: #FCD34D;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }

    .status-badge.RESOLVED {
      background: rgba(16, 185, 129, 0.2);
      color: #6EE7B7;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    .card-user {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .card-user-name {
      font-size: 14px;
      font-weight: 700;
      color: #FFF;
    }

    .card-user-phone {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
    }

    .card-loc {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.4;
    }

    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .card-time {
      color: var(--text-dim);
    }

    .evidence-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #A5B4FC;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
    }

    .assigned-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #FCD34D;
      font-size: 11px;
      font-weight: 600;
    }

    /* CENTER: MAP CONTAINER */
    .map-container {
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

    /* MAP OVERLAY CONTROLS */
    .map-overlay-badge {
      position: absolute;
      top: 16px;
      left: 16px;
      background: rgba(14, 19, 31, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      padding: 8px 14px;
      border-radius: 10px;
      z-index: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }

    /* RIGHT TACTICAL DRAWER (Steps 8 & 9) */
    .tactical-drawer {
      width: 440px;
      background: var(--bg-surface);
      border-left: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 10;
      transform: translateX(0);
      transition: transform 0.25s ease;
    }

    .tactical-drawer.hidden {
      display: none;
    }

    .drawer-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .drawer-header h2 {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .close-drawer-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-drawer-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #FFF;
    }

    .drawer-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .drawer-content::-webkit-scrollbar {
      width: 6px;
    }
    .drawer-content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }

    .drawer-section {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 16px;
    }

    .section-title {
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* STEP 7: EVIDENCE PLAYER */
    .video-player-box {
      width: 100%;
      border-radius: 10px;
      overflow: hidden;
      background: #000;
      border: 1px solid var(--border-color);
      margin-top: 8px;
    }

    video {
      width: 100%;
      height: auto;
      max-height: 220px;
      display: block;
      background: #000;
    }

    .evidence-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    .evidence-btn {
      flex: 1;
      padding: 8px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.35);
      color: #A5B4FC;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .no-evidence-box {
      padding: 20px;
      text-align: center;
      color: var(--text-dim);
      font-size: 12px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      border: 1px dashed rgba(255, 255, 255, 0.1);
    }

    /* VICTIM DETAILS */
    .victim-info-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      font-size: 13px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .info-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .info-label {
      color: var(--text-muted);
      font-size: 12px;
    }

    .info-value {
      font-weight: 600;
      color: #FFF;
      text-align: right;
    }

    /* STEP 9: ONE-CLICK CALL BUTTONS */
    .call-btn-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }

    .action-btn {
      padding: 10px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none;
      transition: all 0.2s;
    }

    .btn-victim {
      background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
      color: #FFF;
      box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35);
    }

    .btn-guardian {
      background: var(--bg-dark);
      border: 1px solid var(--border-color);
      color: var(--text-main);
    }

    .btn-guardian:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .btn-emergency {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #FCD34D;
      font-weight: 700;
    }

    /* STEP 8: DISPATCH & ASSIGN AGENT */
    .dispatch-input-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .select-agent-input {
      width: 100%;
      background: var(--bg-dark);
      border: 1px solid var(--border-color);
      color: #FFF;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
    }

    .select-agent-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .quick-agents-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .quick-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.15s;
    }

    .quick-pill:hover {
      background: rgba(99, 102, 241, 0.2);
      border-color: var(--accent);
      color: #FFF;
    }

    .btn-dispatch {
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
      color: #000;
      font-weight: 800;
      padding: 12px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 13px;
      box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
      transition: all 0.2s;
    }

    .btn-dispatch:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
    }

    /* STEP 9: OPERATOR LOG & NOTES */
    .notes-history-box {
      background: var(--bg-dark);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-muted);
      min-height: 80px;
      max-height: 140px;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.5;
      margin-bottom: 10px;
    }

    .add-note-box {
      display: flex;
      gap: 8px;
    }

    .note-input {
      flex: 1;
      background: var(--bg-dark);
      border: 1px solid var(--border-color);
      color: #FFF;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-family: inherit;
    }

    .note-input:focus {
      outline: none;
      border-color: var(--border-focus);
    }

    .btn-add-note {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-color);
      color: #FFF;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }

    .btn-resolve {
      width: 100%;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #10B981;
      font-weight: 800;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 13px;
      transition: all 0.2s;
      margin-top: 10px;
    }

    .btn-resolve:hover {
      background: #10B981;
      color: #000;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);
    }

    /* PULSING EMERGENCY MARKER */
    .pulse-marker-active {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #EF4444;
      border: 3px solid #FFF;
      box-shadow: 0 0 14px rgba(239, 68, 68, 0.9);
      position: relative;
    }

    .pulse-marker-active::after {
      content: '';
      position: absolute;
      top: -10px;
      left: -10px;
      right: -10px;
      bottom: -10px;
      border-radius: 50%;
      border: 2px solid #EF4444;
      animation: ripple 1.6s ease-out infinite;
    }

    .pulse-marker-assigned {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #F59E0B;
      border: 3px solid #FFF;
      box-shadow: 0 0 10px rgba(245, 158, 11, 0.8);
    }

    .pulse-marker-resolved {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #10B981;
      border: 2px solid #FFF;
      opacity: 0.8;
    }

    @keyframes ripple {
      0% { transform: scale(0.6); opacity: 1; }
      100% { transform: scale(1.8); opacity: 0; }
    }
  </style>
</head>
<body>

  <!-- TOP HEADER -->
  <header>
    <div class="brand-section">
      <div class="brand-icon">🛡️</div>
      <div class="brand-text">
        <h1>DEVI COMMAND CENTER <span class="tag">OPERATOR PORTAL</span></h1>
        <p>National Women Safety 24/7 Response Dispatcher</p>
      </div>
    </div>

    <div class="header-metrics">
      <div class="metric-pill">
        <span class="dot live"></span>
        <span>24/7 LIVE RADAR</span>
      </div>
      <div class="metric-pill" id="emergencyPill" style="display:none; border-color: rgba(239, 68, 68, 0.5);">
        <span class="dot alert"></span>
        <span id="emergencyCountText" style="color: #F87171; font-weight: 800;">0 ACTIVE ALERTS</span>
      </div>
      <div class="live-clock" id="liveClock">--:--:-- IST</div>
    </div>

    <div class="header-actions">
      <button class="header-btn active" id="audioToggleBtn" onclick="toggleAudioAlerts()">
        <span id="audioIcon">🔔</span> Sound ON
      </button>
      <button class="header-btn" onclick="fetchIncidents(true)">
        🔄 Refresh
      </button>
    </div>
  </header>

  <!-- DASHBOARD MAIN SPLIT -->
  <div class="dashboard-body">

    <!-- LEFT SIDEBAR: INCIDENT FEED (Step 7) -->
    <aside class="incident-sidebar">
      <div class="sidebar-header">
        <div class="title-row">
          <h2>Emergency Feed</h2>
          <span style="font-size: 11px; color: var(--text-dim);" id="lastSyncText">Syncing...</span>
        </div>

        <div class="stats-chips">
          <div class="stat-chip">
            <div class="val" id="statTotal" style="color: #FFF;">0</div>
            <div class="lbl">Total</div>
          </div>
          <div class="stat-chip">
            <div class="val" id="statActive" style="color: #F87171;">0</div>
            <div class="lbl">Active</div>
          </div>
          <div class="stat-chip">
            <div class="val" id="statAssigned" style="color: #FCD34D;">0</div>
            <div class="lbl">Assigned</div>
          </div>
          <div class="stat-chip">
            <div class="val" id="statResolved" style="color: #6EE7B7;">0</div>
            <div class="lbl">Resolved</div>
          </div>
        </div>

        <div class="filter-tabs">
          <button class="filter-btn active" data-filter="ALL" onclick="setFilter('ALL', this)">All</button>
          <button class="filter-btn" data-filter="ACTIVE" onclick="setFilter('ACTIVE', this)">Active</button>
          <button class="filter-btn" data-filter="ASSIGNED" onclick="setFilter('ASSIGNED', this)">Assigned</button>
          <button class="filter-btn" data-filter="RESOLVED" onclick="setFilter('RESOLVED', this)">Resolved</button>
        </div>
      </div>

      <div class="incident-list" id="incidentList">
        <div style="text-align: center; padding: 40px 20px; color: var(--text-dim); font-size: 13px;">
          Connecting to DEVI Dispatch Radar...
        </div>
      </div>
    </aside>

    <!-- CENTER: LEAFLET MAP -->
    <main class="map-container">
      <div class="map-overlay-badge">
        <span>📍 CHENNAI & REGIONAL COMMAND SECTOR</span>
      </div>
      <div id="map"></div>
    </main>

    <!-- RIGHT: TACTICAL INCIDENT DRAWER (Steps 7, 8, 9) -->
    <aside class="tactical-drawer hidden" id="tacticalDrawer">
      <div class="drawer-header">
        <h2>
          <span>🚨 INCIDENT</span>
          <span id="drawerAlertId" style="color: #EF4444; font-family: 'JetBrains Mono', monospace;">#--</span>
        </h2>
        <button class="close-drawer-btn" onclick="closeDrawer()" title="Close details">✕</button>
      </div>

      <div class="drawer-content" id="drawerContent">
        <!-- Content will be injected dynamically by JavaScript -->
      </div>
    </aside>

  </div>

  <!-- Leaflet Map JS -->
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>

  <script>
    // State
    let incidents = [];
    let currentFilter = 'ALL';
    let selectedIncidentId = null;
    let map = null;
    let markersMap = new Map();
    let audioAlertsEnabled = true;
    let previousActiveIds = new Set();
    let audioCtx = null;

    // Initialize Map
    function initMap() {
      // Default center: Chennai, Tamil Nadu
      map = L.map('map', {
        zoomControl: false,
      }).setView([13.0827, 80.2707], 13);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // High-tech dark tiles (CartoDB Dark Matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);
    }

    // Audio Alert Synthesizer (Web Audio API)
    function playEmergencyAlertSiren() {
      if (!audioAlertsEnabled) return;
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'sawtooth';
        const now = audioCtx.currentTime;
        
        // Two-tone emergency siren chime
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(660, now + 0.15);
        osc.frequency.setValueAtTime(880, now + 0.30);
        osc.frequency.setValueAtTime(660, now + 0.45);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc.start(now);
        osc.stop(now + 0.65);
      } catch (e) {
        console.warn('Audio alert error:', e);
      }
    }

    function toggleAudioAlerts() {
      audioAlertsEnabled = !audioAlertsEnabled;
      const btn = document.getElementById('audioToggleBtn');
      const icon = document.getElementById('audioIcon');
      if (audioAlertsEnabled) {
        btn.classList.add('active');
        btn.innerHTML = '<span id="audioIcon">🔔</span> Sound ON';
      } else {
        btn.classList.remove('active');
        btn.innerHTML = '<span id="audioIcon">🔕</span> Sound OFF';
      }
    }

    // Update Digital Clock
    function updateClock() {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      document.getElementById('liveClock').textContent = \`\${hrs}:\${mins}:\${secs} IST\`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Fetch Incidents from Backend API
    async function fetchIncidents(manual = false) {
      try {
        const res = await fetch('/api/dashboard/incidents');
        if (!res.ok) throw new Error('Failed to fetch incidents');
        const data = await res.json();
        if (data.success && Array.isArray(data.incidents)) {
          incidents = data.incidents;
          updateDashboardStats();
          renderIncidentList();
          updateMapMarkers();

          // Check for new active emergency alerts to play siren chime
          const currentActiveIds = new Set();
          incidents.forEach(inc => {
            if (inc.status === 'DISPATCHED' || inc.status === 'ACTIVE') {
              currentActiveIds.add(inc.id);
              if (!previousActiveIds.has(inc.id) && !manual) {
                playEmergencyAlertSiren();
              }
            }
          });
          previousActiveIds = currentActiveIds;

          // If drawer is open, refresh its content smoothly
          if (selectedIncidentId) {
            const activeInc = incidents.find(i => i.id === selectedIncidentId);
            if (activeInc) {
              renderTacticalDrawer(activeInc);
            }
          }

          document.getElementById('lastSyncText').textContent = 'Live radar active';
        }
      } catch (err) {
        console.error('Error fetching dashboard incidents:', err);
        document.getElementById('lastSyncText').textContent = 'Reconnecting...';
      }
    }

    // Update Top Statistics
    function updateDashboardStats() {
      const total = incidents.length;
      const active = incidents.filter(i => i.status === 'DISPATCHED' || i.status === 'ACTIVE').length;
      const assigned = incidents.filter(i => i.status === 'ASSIGNED').length;
      const resolved = incidents.filter(i => i.status === 'RESOLVED').length;

      document.getElementById('statTotal').textContent = total;
      document.getElementById('statActive').textContent = active;
      document.getElementById('statAssigned').textContent = assigned;
      document.getElementById('statResolved').textContent = resolved;

      const emergencyPill = document.getElementById('emergencyPill');
      const emergencyCountText = document.getElementById('emergencyCountText');
      if (active > 0) {
        emergencyPill.style.display = 'flex';
        emergencyCountText.textContent = \`\${active} ACTIVE \${active === 1 ? 'EMERGENCY' : 'EMERGENCIES'}\`;
      } else {
        emergencyPill.style.display = 'none';
      }
    }

    // Filter Incidents
    function setFilter(filter, btn) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderIncidentList();
    }

    // Render Left Sidebar Incident List
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

      if (filtered.length === 0) {
        container.innerHTML = \`
          <div style="text-align: center; padding: 40px 20px; color: var(--text-dim); font-size: 13px;">
            No incidents in this category.
          </div>
        \`;
        return;
      }

      container.innerHTML = filtered.map(inc => {
        const isEmergency = inc.status === 'DISPATCHED' || inc.status === 'ACTIVE';
        const isAssigned = inc.status === 'ASSIGNED';
        const isResolved = inc.status === 'RESOLVED';
        const isSelected = selectedIncidentId === inc.id;

        const cardClass = [
          'incident-card',
          isEmergency ? 'is-emergency' : isAssigned ? 'is-assigned' : 'is-resolved',
          isSelected ? 'active' : ''
        ].join(' ');

        return \`
          <div class="\${cardClass}" onclick="selectIncident('\${inc.id}')">
            <div class="card-top">
              <span class="card-id">#\${inc.id}</span>
              <span class="status-badge \${inc.status}">\${inc.status}</span>
            </div>
            <div class="card-user">
              <span class="card-user-name">\${escapeHtml(inc.user.name)}</span>
              <span class="card-user-phone">\${escapeHtml(inc.user.phone)}</span>
            </div>
            <div class="card-loc">
              📍 \${escapeHtml(inc.location)}
            </div>
            <div class="card-footer">
              <span class="card-time">\${inc.timeAgo}</span>
              \${inc.evidenceUrl ? '<span class="evidence-indicator">🎥 Evidence Ready</span>' : ''}
              \${inc.assignedAgent ? \`<span class="assigned-indicator">👮 \${escapeHtml(inc.assignedAgent)}</span>\` : ''}
            </div>
          </div>
        \`;
      }).join('');
    }

    // Update Map Markers
    function updateMapMarkers() {
      if (!map) return;

      const currentIds = new Set(incidents.map(i => i.id));

      // Remove markers for removed incidents
      for (const [id, marker] of markersMap.entries()) {
        if (!currentIds.has(id)) {
          map.removeLayer(marker);
          markersMap.delete(id);
        }
      }

      // Add or update markers
      incidents.forEach(inc => {
        const lat = parseFloat(inc.latitude);
        const lng = parseFloat(inc.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        const isEmergency = inc.status === 'DISPATCHED' || inc.status === 'ACTIVE';
        const isAssigned = inc.status === 'ASSIGNED';

        const iconHtml = isEmergency
          ? '<div class="pulse-marker-active"></div>'
          : isAssigned
            ? '<div class="pulse-marker-assigned"></div>'
            : '<div class="pulse-marker-resolved"></div>';

        const customIcon = L.divIcon({
          className: 'custom-leaflet-marker',
          html: iconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        if (markersMap.has(inc.id)) {
          const marker = markersMap.get(inc.id);
          marker.setLatLng([lat, lng]);
          marker.setIcon(customIcon);
        } else {
          const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
          marker.on('click', () => selectIncident(inc.id));
          markersMap.set(inc.id, marker);
        }
      });
    }

    // Select Incident & Open Tactical Drawer
    function selectIncident(id) {
      selectedIncidentId = id;
      const inc = incidents.find(i => i.id === id);
      if (!inc) return;

      // Highlight card
      renderIncidentList();

      // Pan map
      const lat = parseFloat(inc.latitude);
      const lng = parseFloat(inc.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], 16, { animate: true, duration: 1 });
      }

      // Render Tactical Drawer
      renderTacticalDrawer(inc);
      document.getElementById('tacticalDrawer').classList.remove('hidden');
    }

    function closeDrawer() {
      document.getElementById('tacticalDrawer').classList.add('hidden');
      selectedIncidentId = null;
      renderIncidentList();
    }

    // Render Full Tactical Drawer for Selected Incident
    function renderTacticalDrawer(inc) {
      document.getElementById('drawerAlertId').textContent = \`#\${inc.id}\`;

      const guardiansHtml = inc.guardians && inc.guardians.length > 0
        ? inc.guardians.map(g => \`
            <div class="info-row">
              <span class="info-label">🛡️ \${escapeHtml(g.name || 'Guardian')}</span>
              <a href="tel:\${escapeHtml(g.phone)}" class="action-btn btn-guardian" style="padding: 4px 10px; font-size: 11px;">
                📞 \${escapeHtml(g.phone)}
              </a>
            </div>
          \`).join('')
        : '<div style="color: var(--text-dim); font-size: 12px;">No guardians configured</div>';

      const drawerHtml = \`
        <!-- STEP 7: VIDEO / AUDIO EVIDENCE PLAYER -->
        <div class="drawer-section">
          <div class="section-title">
            <span>🎥 EMERGENCY RECORDED EVIDENCE (STEP 7)</span>
          </div>
          \${inc.evidenceUrl ? \`
            <div class="video-player-box">
              <video src="\${inc.evidenceUrl}" controls playsinline preload="metadata">
                Your browser does not support the video tag.
              </video>
            </div>
            <div class="evidence-actions">
              <a href="\${inc.evidenceUrl}" target="_blank" class="evidence-btn">
                <span>🔗 Full Screen Cloudinary Stream</span>
              </a>
            </div>
          \` : \`
            <div class="no-evidence-box">
              <span>⏳ 2-Min Evidence Recording in Progress or not uploaded yet</span>
            </div>
          \`}
        </div>

        <!-- VICTIM PROFILE & ONE-CLICK CONTACT (STEP 9) -->
        <div class="drawer-section">
          <div class="section-title">
            <span>👤 VICTIM PROFILE & DIRECT CONTACT (STEP 9)</span>
          </div>
          <div class="victim-info-grid">
            <div class="info-row">
              <span class="info-label">Name</span>
              <span class="info-value">\${escapeHtml(inc.user.name)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Mobile Number</span>
              <span class="info-value" style="font-family: 'JetBrains Mono', monospace;">\${escapeHtml(inc.user.phone)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Account Type</span>
              <span class="info-value">\${inc.user.isGuest ? '⚠️ Guest SOS Trigger' : '✅ Verified DEVI User'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Exact Location</span>
              <span class="info-value" style="font-size: 11px; max-width: 220px;">\${escapeHtml(inc.location)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Dispatched Time</span>
              <span class="info-value">\${inc.displayTime} (\${inc.timeAgo})</span>
            </div>
          </div>

          <!-- Quick Call Buttons -->
          <div class="call-btn-grid">
            <a href="tel:\${escapeHtml(inc.user.phone)}" class="action-btn btn-victim">
              <span>📞 CALL VICTIM</span>
            </a>
            <a href="tel:112" class="action-btn btn-emergency">
              <span>🚨 CALL 112 (POLICE)</span>
            </a>
          </div>
        </div>

        <!-- GUARDIANS CONTACT -->
        <div class="drawer-section">
          <div class="section-title">
            <span>🛡️ EMERGENCY GUARDIANS CONTACTS</span>
          </div>
          <div class="victim-info-grid">
            \${guardiansHtml}
          </div>
        </div>

        <!-- STEP 8: DISPATCH AGENT WORKFLOW -->
        <div class="drawer-section">
          <div class="section-title">
            <span>👮 STEP 8: ASSIGN & DISPATCH RESPONSE AGENT</span>
          </div>
          <div class="dispatch-input-group">
            \${inc.assignedAgent ? \`
              <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 10px; font-size: 12px; color: #FCD34D;">
                <strong>Currently Assigned Unit:</strong> \${escapeHtml(inc.assignedAgent)}
              </div>
            \` : ''}
            
            <input 
              type="text" 
              id="agentInput" 
              class="select-agent-input" 
              placeholder="Enter patrol officer name or unit..." 
              value="\${inc.assignedAgent ? escapeHtml(inc.assignedAgent) : ''}"
            />

            <div class="quick-agents-pills">
              <span class="quick-pill" onclick="setAgentText('Patrol Unit 01 (Rapid)')">Patrol 01</span>
              <span class="quick-pill" onclick="setAgentText('DEVI Mobile Rescue Team A')">Rescue Team A</span>
              <span class="quick-pill" onclick="setAgentText('Women Helpline Patrol 04')">Helpline Patrol 04</span>
              <span class="quick-pill" onclick="setAgentText('Ambulance Response 108')">Ambulance 108</span>
            </div>

            <button class="btn-dispatch" onclick="assignAgent('\${inc.id}')">
              <span>🚨 CONFIRM AGENT DISPATCH (STEP 8)</span>
            </button>
          </div>
        </div>

        <!-- STEP 9: OPERATOR ACTION LOG & NOTES -->
        <div class="drawer-section">
          <div class="section-title">
            <span>📝 STEP 9: OPERATOR ACTION LOG & GUIDANCE</span>
          </div>
          
          <div class="notes-history-box" id="notesHistoryBox">
\${inc.operatorNotes ? escapeHtml(inc.operatorNotes) : 'No operator notes recorded yet. Add initial contact log below.'}
          </div>

          <div class="add-note-box">
            <input 
              type="text" 
              id="newNoteInput" 
              class="note-input" 
              placeholder="e.g. Called victim, safe in store, patrol 2m away..." 
              onkeydown="if(event.key === 'Enter') addOperatorNote('\${inc.id}')"
            />
            <button class="btn-add-note" onclick="addOperatorNote('\${inc.id}')">Log</button>
          </div>

          \${inc.status !== 'RESOLVED' ? \`
            <button class="btn-resolve" onclick="resolveIncident('\${inc.id}')">
              <span>✅ MARK INCIDENT AS RESOLVED</span>
            </button>
          \` : \`
            <div style="text-align: center; color: #10B981; font-weight: 700; font-size: 13px; margin-top: 10px;">
              ✅ Incident Completed & Resolved
            </div>
          \`}
        </div>
      \`;

      document.getElementById('drawerContent').innerHTML = drawerHtml;
    }

    function setAgentText(name) {
      const input = document.getElementById('agentInput');
      if (input) input.value = name;
    }

    // Step 8: Assign Agent API Call
    async function assignAgent(alertId) {
      const input = document.getElementById('agentInput');
      const agentName = input ? input.value.trim() : '';
      if (!agentName) {
        alert('Please enter or select a patrol agent name / unit ID');
        return;
      }

      try {
        const res = await fetch('/api/dashboard/assign-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId, agentName }),
        });
        const data = await res.json();
        if (data.success) {
          await fetchIncidents(true);
        } else {
          alert(data.message || 'Failed to assign agent');
        }
      } catch (e) {
        console.error('Assign agent error:', e);
        alert('Network error while assigning agent');
      }
    }

    // Step 9: Add Operator Log Note API Call
    async function addOperatorNote(alertId) {
      const input = document.getElementById('newNoteInput');
      const note = input ? input.value.trim() : '';
      if (!note) return;

      try {
        const res = await fetch('/api/dashboard/add-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId, note }),
        });
        const data = await res.json();
        if (data.success) {
          input.value = '';
          await fetchIncidents(true);
        } else {
          alert('Failed to log operator note');
        }
      } catch (e) {
        console.error('Log note error:', e);
      }
    }

    // Resolve Incident API Call
    async function resolveIncident(alertId) {
      if (!confirm(\`Are you sure incident #\${alertId} is safe and resolved?\`)) return;

      try {
        const res = await fetch(\`/api/dashboard/resolve/\${alertId}\`, {
          method: 'POST',
        });
        const data = await res.json();
        if (data.success) {
          await fetchIncidents(true);
        } else {
          alert(data.message || 'Failed to resolve incident');
        }
      } catch (e) {
        console.error('Resolve incident error:', e);
      }
    }

    function escapeHtml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Startup
    window.addEventListener('DOMContentLoaded', () => {
      initMap();
      fetchIncidents();
      // Poll every 3 seconds for real-time live alerts
      setInterval(() => fetchIncidents(false), 3000);
    });
  </script>
</body>
</html>
`;
}

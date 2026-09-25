export function renderLiveTrackingHtml({ alertId, initialSession }) {
  const initialLat = initialSession?.latitude || 13.0827;
  const initialLng = initialSession?.longitude || 80.2707;
  const initialStatus = initialSession?.status || 'ACTIVE';
  const userPhone = initialSession?.userPhone || '';
  const userName = initialSession?.userName || 'DEVI User';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>🚨 DEVI Live Emergency Tracking #${alertId}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0B0F19;
      color: #F8FAFC;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Top Header Bar */
    header {
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(239, 68, 68, 0.3);
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(220, 38, 38, 0.15);
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-badge {
      background: linear-gradient(135deg, #EF4444, #DC2626);
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 0 16px rgba(239, 68, 68, 0.5);
    }
    .title-group h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: #FFF;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .title-group p {
      font-size: 12px;
      color: #94A3B8;
      font-weight: 500;
    }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-active {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.5);
      color: #EF4444;
    }
    .status-resolved {
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.5);
      color: #22C55E;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #EF4444;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
      70% { transform: scale(1.2); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }

    /* Main Map View */
    #map {
      flex: 1;
      width: 100%;
      height: 100%;
      z-index: 10;
    }

    /* Bottom Info Card */
    .bottom-panel {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 32px);
      max-width: 520px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 16px 18px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      z-index: 1000;
      transition: all 0.3s ease;
    }
    .info-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .user-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .user-name {
      font-size: 15px;
      font-weight: 700;
      color: #FFFFFF;
    }
    .user-coords {
      font-size: 12px;
      color: #94A3B8;
      font-family: monospace;
    }
    .last-update-tag {
      font-size: 11px;
      color: #38BDF8;
      background: rgba(56, 189, 248, 0.12);
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 600;
    }

    /* Emergency Action Buttons */
    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 16px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
      border: none;
    }
    .btn-nav {
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      color: white;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
    }
    .btn-nav:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
    }
    .btn-emergency {
      background: linear-gradient(135deg, #EF4444, #DC2626);
      color: white;
      box-shadow: 0 4px 14px rgba(220, 38, 38, 0.35);
    }
    .btn-emergency:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(220, 38, 38, 0.5);
    }

    /* Live Pulse Marker styling */
    .sos-marker-pin {
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      background: #EF4444;
      position: absolute;
      transform: rotate(-45deg);
      left: 50%;
      top: 50%;
      margin: -20px 0 0 -16px;
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.8);
      border: 2px solid #FFFFFF;
    }
    .sos-marker-pin::after {
      content: '';
      width: 14px;
      height: 14px;
      margin: 7px 0 0 7px;
      background: #FFFFFF;
      position: absolute;
      border-radius: 50%;
    }
    .sos-beacon {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 48px;
      height: 48px;
      margin: -24px 0 0 -24px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.4);
      animation: beaconWave 2s ease-out infinite;
    }
    @keyframes beaconWave {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.4); opacity: 0; }
    }
  </style>
</head>
<body>

  <!-- Top Header -->
  <header>
    <div class="brand-section">
      <div class="logo-badge">🛡️</div>
      <div class="title-group">
        <h1>DEVI Safety <span style="font-weight: 400; opacity: 0.7;">Live Monitor</span></h1>
        <p>Ref ID: #${alertId.substring(0, 8)}</p>
      </div>
    </div>
    <div id="statusBadge" class="status-badge status-active">
      <span class="pulse-dot" id="pulseDot"></span>
      <span id="statusText">LIVE TRACKING</span>
    </div>
  </header>

  <!-- Live Leaflet Map -->
  <div id="map"></div>

  <!-- Bottom Floating Info & Actions Panel -->
  <div class="bottom-panel">
    <div class="info-row">
      <div class="user-details">
        <span class="user-name" id="userName">${userName} ${userPhone ? '(' + userPhone + ')' : ''}</span>
        <span class="user-coords" id="coordsText">Lat: ${initialLat.toFixed(5)}, Lng: ${initialLng.toFixed(5)}</span>
      </div>
      <div class="last-update-tag" id="lastUpdatedTag">Updating live...</div>
    </div>

    <div class="actions-grid">
      <a id="navBtn" href="https://www.google.com/maps/dir/?api=1&destination=${initialLat},${initialLng}" target="_blank" class="btn btn-nav">
        🗺️ Live Navigation
      </a>
      <a href="tel:112" class="btn btn-emergency">
        🚨 Call Police 112
      </a>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    const alertId = "${alertId}";
    let currentLat = ${initialLat};
    let currentLng = ${initialLng};
    let breadcrumbCoords = [[currentLat, currentLng]];

    // 1. Initialize Leaflet Map
    const map = L.map('map', {
      center: [currentLat, currentLng],
      zoom: 16,
      zoomControl: true,
    });

    // 2. Add OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors | DEVI Safety'
    }).addTo(map);

    // 3. Custom SOS Live Marker
    const sosIcon = L.divIcon({
      className: 'custom-sos-marker',
      html: '<div class="sos-beacon"></div><div class="sos-marker-pin"></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    let marker = L.marker([currentLat, currentLng], { icon: sosIcon }).addTo(map);
    let polyline = L.polyline(breadcrumbCoords, {
      color: '#EF4444',
      weight: 4,
      opacity: 0.8,
      dashArray: '8, 8',
      lineJoin: 'round'
    }).addTo(map);

    // 4. Polling function for real-time live location updates
    async function fetchLiveLocation() {
      try {
        const res = await fetch('/api/sos/live/' + alertId);
        if (!res.ok) return;

        const data = await res.json();
        if (data && data.success && data.data) {
          const session = data.data;
          const lat = parseFloat(session.latitude);
          const lng = parseFloat(session.longitude);

          if (!isNaN(lat) && !isNaN(lng)) {
            currentLat = lat;
            currentLng = lng;

            // Move marker smoothly
            marker.setLatLng([lat, lng]);

            // Update Polyline breadcrumbs
            if (session.breadcrumbs && session.breadcrumbs.length > 0) {
              const points = session.breadcrumbs.map(b => [b.latitude, b.longitude]);
              polyline.setLatLngs(points);
            }

            // Update info display
            document.getElementById('coordsText').innerText = 'Lat: ' + lat.toFixed(5) + ', Lng: ' + lng.toFixed(5);
            document.getElementById('navBtn').href = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
            
            const now = new Date();
            document.getElementById('lastUpdatedTag').innerText = 'Live: ' + now.toLocaleTimeString();

            // Center map smoothly on the moving user
            map.panTo([lat, lng], { animate: true, duration: 1 });
          }

          // Handle resolved/deactivated state
          if (session.status === 'RESOLVED') {
            const badge = document.getElementById('statusBadge');
            badge.className = 'status-badge status-resolved';
            document.getElementById('pulseDot').style.display = 'none';
            document.getElementById('statusText').innerText = 'USER SAFE / SOS RESOLVED';
          }
        }
      } catch (err) {
        console.error('Error polling live location:', err);
      }
    }

    // Poll every 3 seconds for continuous real-time live tracking
    setInterval(fetchLiveLocation, 3000);
  </script>
</body>
</html>`;
}

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
  
  <!-- Leaflet Map CSS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #090D16;
      color: #F8FAFC;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Top Floating Header Bar */
    header {
      position: absolute;
      top: 14px;
      left: 14px;
      right: 14px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(18px);
      border: 1px solid rgba(239, 68, 68, 0.35);
      padding: 10px 14px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 1000;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-badge {
      background: linear-gradient(135deg, #EF4444, #DC2626);
      width: 38px;
      height: 38px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 0 16px rgba(239, 68, 68, 0.6);
      flex-shrink: 0;
    }
    .title-group h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.2px;
      color: #FFF;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .title-group p {
      font-size: 11px;
      color: #94A3B8;
      font-weight: 500;
    }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .status-active {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.6);
      color: #EF4444;
    }
    .status-resolved {
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(34, 197, 94, 0.6);
      color: #22C55E;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #EF4444;
      animation: pulse 1.4s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.8); }
      70% { transform: scale(1.3); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }

    /* Map Layer & Fullscreen View */
    #map {
      flex: 1;
      width: 100%;
      height: 100%;
      z-index: 10;
    }

    /* Map Controls (Satellite Toggle & Center Buttons) */
    .map-controls-group {
      position: absolute;
      top: 80px;
      right: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 1000;
    }
    .control-btn {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(10px);
      color: white;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
      transition: all 0.2s;
    }
    .control-btn:active {
      transform: scale(0.92);
      background: #1E293B;
    }

    /* Bottom Guardian Live Info Card */
    .bottom-panel {
      position: absolute;
      bottom: 14px;
      left: 14px;
      right: 14px;
      max-width: 540px;
      margin: 0 auto;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 22px;
      padding: 16px 18px;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.65);
      z-index: 1000;
    }

    /* Live Area & Landmark Name Header */
    .area-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 10px 12px;
      margin-bottom: 12px;
    }
    .area-icon {
      font-size: 20px;
      margin-top: 1px;
    }
    .area-text-group {
      flex: 1;
    }
    .area-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #FFFFFF;
      line-height: 1.3;
    }
    .area-sub {
      font-size: 11.5px;
      color: #94A3B8;
      margin-top: 2px;
    }

    /* Live Distance & Person Details */
    .info-metrics-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      gap: 10px;
    }
    .user-info-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .user-name {
      font-size: 15px;
      font-weight: 800;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .phone-badge {
      font-size: 11.5px;
      color: #38BDF8;
      font-weight: 600;
      text-decoration: none;
    }
    
    /* Distance Badge (Between Guardian and Victim) */
    .distance-badge {
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(2, 132, 199, 0.25));
      border: 1px solid rgba(56, 189, 248, 0.5);
      padding: 6px 12px;
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: right;
    }
    .distance-val {
      font-size: 13px;
      font-weight: 800;
      color: #38BDF8;
    }
    .distance-sub {
      font-size: 10.5px;
      color: #BAE6FD;
    }

    /* Action Buttons */
    .actions-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 14px;
      border-radius: 14px;
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
      transition: all 0.2s;
      border: none;
      cursor: pointer;
    }
    .btn-nav {
      background: linear-gradient(135deg, #2563EB, #1D4ED8);
      color: white;
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.45);
    }
    .btn-nav:hover {
      transform: translateY(-2px);
    }
    .btn-call {
      background: linear-gradient(135deg, #EF4444, #DC2626);
      color: white;
      box-shadow: 0 4px 16px rgba(220, 38, 38, 0.45);
    }
    .btn-call:hover {
      transform: translateY(-2px);
    }

    /* Custom Map Markers (Victim Red Pin & Guardian Blue Pin) */
    .victim-beacon {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 52px;
      height: 52px;
      margin: -26px 0 0 -26px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.45);
      animation: victimBeacon 2s ease-out infinite;
    }
    @keyframes victimBeacon {
      0% { transform: scale(0.4); opacity: 1; }
      100% { transform: scale(2.6); opacity: 0; }
    }
    .victim-pin {
      width: 34px;
      height: 34px;
      border-radius: 50% 50% 50% 0;
      background: #EF4444;
      position: absolute;
      transform: rotate(-45deg);
      left: 50%;
      top: 50%;
      margin: -22px 0 0 -17px;
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.9);
      border: 2.5px solid #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .victim-pin-inner {
      width: 12px;
      height: 12px;
      background: white;
      border-radius: 50%;
    }

    /* Guardian Blue Dot Marker */
    .guardian-pulse {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 40px;
      height: 40px;
      margin: -20px 0 0 -20px;
      border-radius: 50%;
      background: rgba(14, 165, 233, 0.4);
      animation: guardianPulse 2s ease-out infinite;
    }
    @keyframes guardianPulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    .guardian-dot {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #0284C7;
      border: 3px solid #FFFFFF;
      position: absolute;
      left: 50%;
      top: 50%;
      margin: -10px 0 0 -10px;
      box-shadow: 0 0 14px rgba(14, 165, 233, 0.8);
    }
    .guardian-label {
      position: absolute;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.9);
      color: #38BDF8;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 6px;
      white-space: nowrap;
      border: 1px solid rgba(56, 189, 248, 0.4);
    }
  </style>
</head>
<body>

  <!-- Top Header Bar -->
  <header>
    <div class="brand-section">
      <div class="logo-badge">🛡️</div>
      <div class="title-group">
        <h1>DEVI Safety <span style="font-weight: 400; opacity: 0.7;">Live Monitor</span></h1>
        <p id="refText">Ref ID: #${alertId.substring(0, 8)}</p>
      </div>
    </div>
    <div id="statusBadge" class="status-badge status-active">
      <span class="pulse-dot" id="pulseDot"></span>
      <span id="statusText">LIVE</span>
    </div>
  </header>

  <!-- Map Container -->
  <div id="map"></div>

  <!-- Map Floating Controls -->
  <div class="map-controls-group">
    <button class="control-btn" id="fitBoundsBtn" title="Show Both You & Person">🧭</button>
    <button class="control-btn" id="centerVictimBtn" title="Center on Person">📍</button>
    <button class="control-btn" id="toggleLayerBtn" title="Switch Satellite / Street Map">🛰️</button>
  </div>

  <!-- Bottom Panel -->
  <div class="bottom-panel">
    <!-- Area & Landmark Name -->
    <div class="area-box">
      <div class="area-icon">📍</div>
      <div class="area-text-group">
        <div class="area-title" id="areaNameText">Locating area name...</div>
        <div class="area-sub" id="areaSubText">GPS: ${initialLat.toFixed(5)}, ${initialLng.toFixed(5)}</div>
      </div>
    </div>

    <!-- User Details & Distance -->
    <div class="info-metrics-row">
      <div class="user-info-left">
        <span class="user-name">
          ${userName}
          ${userPhone ? '<a href="tel:' + userPhone + '" class="phone-badge">📞 ' + userPhone + '</a>' : ''}
        </span>
        <span style="font-size: 11px; color: #94A3B8;" id="lastUpdatedText">Live GPS syncing...</span>
      </div>

      <!-- Distance from Guardian to Victim -->
      <div class="distance-badge" id="distanceBadge">
        <span class="distance-val" id="distanceVal">Calculating...</span>
        <span class="distance-sub" id="distanceSub">from your location</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="actions-grid">
      <a id="navBtn" href="https://www.google.com/maps/dir/?api=1&destination=${initialLat},${initialLng}" target="_blank" class="btn btn-nav">
        🗺️ Google Navigation
      </a>
      <a href="tel:112" class="btn btn-call">
        🚨 Call Police 112
      </a>
    </div>
  </div>

  <!-- Leaflet Scripts -->
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    const alertId = "${alertId}";
    let victimLat = ${initialLat};
    let victimLng = ${initialLng};
    let guardianLat = null;
    let guardianLng = null;
    let lastGeocodedCoords = "";

    // 1. Tile Layers: Google Hybrid Satellite Map (Real Buildings + Road Labels) & Carto Street Map
    const satelliteHybridLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 21,
      subdomains: ['0', '1', '2', '3'],
      attribution: '© Google Satellite | DEVI Safety'
    });

    const streetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap | DEVI Safety'
    });

    let isSatellite = true; // Default to Satellite View

    // 2. Initialize Leaflet Map with Satellite as Primary
    const map = L.map('map', {
      center: [victimLat, victimLng],
      zoom: 17,
      zoomControl: false,
      layers: [satelliteHybridLayer]
    });

    // Toggle Satellite / Street View
    document.getElementById('toggleLayerBtn').innerText = '🗺️';
    document.getElementById('toggleLayerBtn').addEventListener('click', () => {
      if (isSatellite) {
        map.removeLayer(satelliteHybridLayer);
        map.addLayer(streetLayer);
        document.getElementById('toggleLayerBtn').innerText = '🛰️';
        isSatellite = false;
      } else {
        map.removeLayer(streetLayer);
        map.addLayer(satelliteHybridLayer);
        document.getElementById('toggleLayerBtn').innerText = '🗺️';
        isSatellite = true;
      }
    });

    // 3. Custom Markers
    const victimIcon = L.divIcon({
      className: 'custom-victim-marker',
      html: '<div class="victim-beacon"></div><div class="victim-pin"><div class="victim-pin-inner"></div></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    const guardianIcon = L.divIcon({
      className: 'custom-guardian-marker',
      html: '<div class="guardian-pulse"></div><div class="guardian-dot"></div><div class="guardian-label">YOU</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    let victimMarker = L.marker([victimLat, victimLng], { icon: victimIcon }).addTo(map);
    let guardianMarker = null;

    // Polyline for Victim Trail (Breadcrumbs)
    let trailPolyline = L.polyline([[victimLat, victimLng]], {
      color: '#EF4444',
      weight: 4,
      opacity: 0.85,
      dashArray: '6, 6'
    }).addTo(map);

    // Connecting Route Line between Guardian and Victim
    let connectionLine = L.polyline([], {
      color: '#0284C7',
      weight: 3,
      opacity: 0.75,
      dashArray: '4, 8'
    }).addTo(map);

    // 4. Reverse Geocoding (Converts GPS Lat/Lng to Area & Landmark Name)
    async function updateAreaName(lat, lng) {
      const coordKey = lat.toFixed(4) + ',' + lng.toFixed(4);
      if (coordKey === lastGeocodedCoords) return;
      lastGeocodedCoords = coordKey;

      try {
        const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1', {
          headers: { 'Accept-Language': 'en' }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.address) {
          const addr = data.address;
          const mainArea = addr.road || addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district || 'Near Landmark';
          const cityDistrict = addr.city || addr.town || addr.county || addr.state_district || addr.state || '';
          
          document.getElementById('areaNameText').innerText = mainArea + (cityDistrict ? ', ' + cityDistrict : '');
          document.getElementById('areaSubText').innerText = (data.display_name ? data.display_name.split(',').slice(0, 3).join(', ') : 'GPS: ' + lat.toFixed(5) + ', ' + lng.toFixed(5));
        }
      } catch (e) {
        document.getElementById('areaNameText').innerText = 'Near Coordinates (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')';
      }
    }

    // Initial Geocode lookup
    updateAreaName(victimLat, victimLng);

    // 5. Watch Guardian's Own Live Location
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((pos) => {
        guardianLat = pos.coords.latitude;
        guardianLng = pos.coords.longitude;

        if (!guardianMarker) {
          guardianMarker = L.marker([guardianLat, guardianLng], { icon: guardianIcon }).addTo(map);
        } else {
          guardianMarker.setLatLng([guardianLat, guardianLng]);
        }

        // Update connecting route line
        connectionLine.setLatLngs([[guardianLat, guardianLng], [victimLat, victimLng]]);

        // Calculate Distance between Guardian & Victim
        const distMeters = map.distance([guardianLat, guardianLng], [victimLat, victimLng]);
        let distText = '';
        let etaText = '';
        if (distMeters < 1000) {
          distText = Math.round(distMeters) + ' m away';
          etaText = '~' + Math.max(1, Math.round(distMeters / 80)) + ' min walk';
        } else {
          const km = (distMeters / 1000).toFixed(1);
          distText = km + ' km away';
          etaText = '~' + Math.max(1, Math.round(distMeters / 500)) + ' min drive';
        }

        document.getElementById('distanceVal').innerText = '📍 ' + distText;
        document.getElementById('distanceSub').innerText = etaText;

        // Update Turn-by-Turn Google Navigation Link with Origin + Destination
        document.getElementById('navBtn').href = 'https://www.google.com/maps/dir/?api=1&origin=' + guardianLat + ',' + guardianLng + '&destination=' + victimLat + ',' + victimLng + '&travelmode=driving';
      }, (err) => {
        console.log('Guardian location not shared:', err);
        document.getElementById('distanceVal').innerText = 'Direct Navigation';
        document.getElementById('distanceSub').innerText = 'Tap button below';
      }, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000
      });
    }

    // 6. Polling Live GPS of Victim every 3 seconds
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
            victimLat = lat;
            victimLng = lng;

            // Move Victim Marker
            victimMarker.setLatLng([lat, lng]);

            // Update Breadcrumb trail
            if (session.breadcrumbs && session.breadcrumbs.length > 0) {
              const pts = session.breadcrumbs.map(b => [b.latitude, b.longitude]);
              trailPolyline.setLatLngs(pts);
            }

            // Update Connection Line to Guardian
            if (guardianLat && guardianLng) {
              connectionLine.setLatLngs([[guardianLat, guardianLng], [victimLat, victimLng]]);
            }

            // Update Area Name
            updateAreaName(lat, lng);

            const now = new Date();
            document.getElementById('lastUpdatedText').innerText = 'Updated: ' + now.toLocaleTimeString();
          }

          // Handle Resolved / Safe State
          if (session.status === 'RESOLVED') {
            const badge = document.getElementById('statusBadge');
            badge.className = 'status-badge status-resolved';
            document.getElementById('pulseDot').style.display = 'none';
            document.getElementById('statusText').innerText = 'USER SAFE';
          }
        }
      } catch (err) {
        console.error('Error polling live location:', err);
      }
    }

    setInterval(fetchLiveLocation, 3000);

    // Map Controls Click Handlers
    document.getElementById('centerVictimBtn').addEventListener('click', () => {
      map.flyTo([victimLat, victimLng], 17, { duration: 1 });
    });

    document.getElementById('fitBoundsBtn').addEventListener('click', () => {
      if (guardianLat && guardianLng) {
        const bounds = L.latLngBounds([[victimLat, victimLng], [guardianLat, guardianLng]]);
        map.fitBounds(bounds, { padding: [80, 80] });
      } else {
        map.flyTo([victimLat, victimLng], 17);
      }
    });
  </script>
</body>
</html>`;
}

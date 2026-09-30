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
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛡️</text></svg>">
  
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
    
    /* Action Buttons */
    .actions-container {
      display: flex;
      width: 100%;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 13px 16px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 800;
      text-decoration: none;
      transition: all 0.2s;
      border: none;
      cursor: pointer;
      width: 100%;
    }
    .btn-nav {
      background: linear-gradient(135deg, #2563EB, #1D4ED8);
      color: white;
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.45);
    }
    .btn-nav:hover {
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
        <p id="refText">Real-Time Safe Tracking</p>
      </div>
    </div>
    <div id="statusBadge" class="status-badge status-active">
      <span class="pulse-dot" id="pulseDot"></span>
      <span id="statusText">LIVE</span>
    </div>
  </header>

  <!-- Map Container -->
  <div id="map"></div>



  <!-- Bottom Panel -->
  <div class="bottom-panel">
    <!-- Area & Landmark Name (Auto-refreshes every 2 min) -->
    <div class="area-box">
      <div class="area-icon">📍</div>
      <div class="area-text-group">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div class="area-title" id="areaNameText">Locating address...</div>
          <span id="addrRefreshBadge" style="font-size: 10px; color: #38BDF8; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 2px 7px; font-weight: 700; white-space: nowrap;">2m Auto-Sync</span>
        </div>
        <div class="area-sub" id="areaSubText">GPS: ${initialLat.toFixed(5)}, ${initialLng.toFixed(5)}</div>
      </div>
    </div>

    <!-- User Details -->
    <div class="info-metrics-row">
      <div class="user-info-left" style="width: 100%;">
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span class="user-name">
            ${userName}
            ${userPhone ? '<a href="tel:' + userPhone + '" class="phone-badge">📞 ' + userPhone + '</a>' : ''}
          </span>
          <span style="font-size: 11px; color: #94A3B8;" id="lastUpdatedText">Live GPS syncing...</span>
        </div>
      </div>
    </div>

    <!-- Emergency Evidence Media Banner (Cloudinary) -->
    <div id="evidenceContainer" style="display: ${initialSession?.evidenceUrl ? 'flex' : 'none'}; margin-bottom: 12px; background: rgba(220, 38, 38, 0.2); border: 1px solid rgba(239, 68, 68, 0.6); border-radius: 14px; padding: 10px 12px; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px;">📹</span>
        <div>
          <div style="font-size: 12.5px; font-weight: 700; color: #FCA5A5;">Emergency Audio / Video Evidence</div>
          <div style="font-size: 10.5px; color: #FECACA;">Cloud-recorded 2-min footage</div>
        </div>
      </div>
      <a id="evidencePlayBtn" href="${initialSession?.evidenceUrl || '#'}" target="_blank" style="background: linear-gradient(135deg, #EF4444, #DC2626); color: white; padding: 7px 14px; border-radius: 10px; font-size: 12px; font-weight: 800; text-decoration: none; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 10px rgba(239,68,68,0.5);">
        ▶ Watch Video
      </a>
    </div>

    <!-- Actions (Google Navigation Full Width) -->
    <div class="actions-container">
      <a id="navBtn" href="https://www.google.com/maps/dir/?api=1&destination=${initialLat},${initialLng}" target="_blank" class="btn btn-nav">
        🗺️ Google Navigation
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

    // 4. Reverse Geocoding with Fallbacks (OpenStreetMap Nominatim + BigDataCloud)
    async function fetchReverseGeocode(lat, lng) {
      // Primary: OpenStreetMap Nominatim
      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1', {
          headers: { 'Accept-Language': 'en' },
          signal: ctrl.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && data.address) {
            const a = data.address;
            const landmark = a.amenity || a.building || a.shop || a.school || a.landmark || a.place || a.tourism;
            const street = a.road || a.pedestrian || a.residential || a.suburb || a.neighbourhood || a.village;
            const city = a.city || a.town || a.county || a.state_district || '';
            const district = a.state_district || a.county || '';
            const state = a.state || '';

            let title = '';
            if (landmark && street) {
              title = landmark + ', ' + street;
            } else if (landmark) {
              title = landmark + (city ? ', ' + city : '');
            } else if (street) {
              title = street + (city ? ', ' + city : '');
            } else if (city) {
              title = city + ' Area';
            } else {
              title = 'Current Location';
            }

            let subParts = [];
            if (city && !title.includes(city)) subParts.push(city);
            if (district && district !== city) subParts.push(district);
            if (state) subParts.push(state);
            if (a.postcode) subParts.push(a.postcode);

            const sub = subParts.length > 0 ? subParts.join(', ') : (data.display_name ? data.display_name.split(',').slice(0, 3).join(', ') : '');
            return { title, sub };
          }
        }
      } catch (err) {
        console.warn('Nominatim geocode fallback:', err);
      }

      // Secondary Fallback: BigDataCloud Client Reverse Geocode
      try {
        const res2 = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lng + '&localityLanguage=en');
        if (res2.ok) {
          const d2 = await res2.json();
          if (d2) {
            const locality = d2.locality || d2.city || '';
            const district = d2.principalSubdivision || '';
            const title = locality ? (locality + ' Area') : 'Current Location';
            const sub = [d2.city, district, d2.countryName].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
            return { title, sub };
          }
        }
      } catch (err2) {
        console.warn('BigDataCloud fallback failed:', err2);
      }

      // Final Fallback
      return {
        title: 'Area (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')',
        sub: 'Live GPS Pinpoint'
      };
    }

    async function updateAreaName(lat, lng) {
      if (!lat || !lng) return;
      try {
        const result = await fetchReverseGeocode(lat, lng);
        if (result) {
          const areaTitleElem = document.getElementById('areaNameText');
          const areaSubElem = document.getElementById('areaSubText');
          const badgeElem = document.getElementById('addrRefreshBadge');
          if (areaTitleElem) areaTitleElem.innerText = result.title;
          if (areaSubElem) areaSubElem.innerText = result.sub;
          if (badgeElem) {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            badgeElem.innerText = 'Sync: ' + timeStr;
          }
        }
      } catch (e) {
        console.error('Error updating area name:', e);
      }
    }

    // Initial Geocode lookup on page load
    updateAreaName(victimLat, victimLng);

    // Auto-refresh Address strictly every 2 minutes (120,000 ms)
    setInterval(() => {
      if (victimLat && victimLng) {
        updateAreaName(victimLat, victimLng);
      }
    }, 120000);

    // 5. Watch Guardian's Own Live Location
    function initGuardianLocation() {
      if (!navigator.geolocation) return;

      let hasAutoFitted = false;

      navigator.geolocation.watchPosition((pos) => {
        guardianLat = pos.coords.latitude;
        guardianLng = pos.coords.longitude;

        if (!guardianMarker) {
          guardianMarker = L.marker([guardianLat, guardianLng], { icon: guardianIcon }).addTo(map);
        } else {
          guardianMarker.setLatLng([guardianLat, guardianLng]);
        }

        // Update connecting route line between Guardian and Victim
        connectionLine.setLatLngs([[guardianLat, guardianLng], [victimLat, victimLng]]);

        // Auto-fit bounds on first connect so both Guardian & Victim appear on screen together
        if (!hasAutoFitted && guardianLat && guardianLng && victimLat && victimLng) {
          hasAutoFitted = true;
          const bounds = L.latLngBounds([[victimLat, victimLng], [guardianLat, guardianLng]]);
          map.fitBounds(bounds, { padding: [70, 70], maxZoom: 17 });
        }

        // Update Turn-by-Turn Google Navigation Link with Origin + Destination
        const navBtn = document.getElementById('navBtn');
        if (navBtn) {
          navBtn.href = 'https://www.google.com/maps/dir/?api=1&origin=' + guardianLat + ',' + guardianLng + '&destination=' + victimLat + ',' + victimLng + '&travelmode=driving';
        }
      }, (err) => {
        console.log('Guardian location info:', err.message);
      }, {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      });
    }

    initGuardianLocation();

    // 6. Real-time Location Updates via Low-Bandwidth WebSocket (with Polling Fallback)
    function applyLocationUpdate(session) {
      if (!session) return;
      const lat = parseFloat(session.latitude);
      const lng = parseFloat(session.longitude);

      if (!isNaN(lat) && !isNaN(lng)) {
        victimLat = lat;
        victimLng = lng;

        // Move Victim Marker smoothly
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

        // Update Navigation link destination if Guardian location not yet acquired
        const navBtn = document.getElementById('navBtn');
        if (navBtn && (!guardianLat || !guardianLng)) {
          navBtn.href = 'https://www.google.com/maps/dir/?api=1&destination=' + victimLat + ',' + victimLng;
        }

        // Dynamically show Evidence link if uploaded to Cloudinary
        if (session.evidenceUrl) {
          const evCont = document.getElementById('evidenceContainer');
          const evBtn = document.getElementById('evidencePlayBtn');
          if (evCont && evBtn) {
            evCont.style.display = 'flex';
            evBtn.href = session.evidenceUrl;
          }
        }

        const now = new Date();
        const lastUpText = document.getElementById('lastUpdatedText');
        if (lastUpText) {
          lastUpText.innerText = 'GPS: ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      }

      // Handle Resolved / Safe State
      if (session.status === 'RESOLVED') {
        const badge = document.getElementById('statusBadge');
        if (badge) {
          badge.className = 'status-badge status-resolved';
        }
        const pulse = document.getElementById('pulseDot');
        if (pulse) pulse.style.display = 'none';
        const statusTxt = document.getElementById('statusText');
        if (statusTxt) statusTxt.innerText = 'USER SAFE';
      }
    }

    // Fallback HTTP Fetch
    async function fetchLiveLocation() {
      try {
        const res = await fetch('/api/sos/live/' + alertId);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.success && data.data) {
          applyLocationUpdate(data.data);
        }
      } catch (err) {
        console.warn('Fallback HTTP live check:', err);
      }
    }

    // Persistent Low-Bandwidth WebSocket Connection
    let ws = null;
    let wsFallbackInterval = null;

    function initWebSocketTracking() {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = wsProtocol + '//' + window.location.host + '/ws';
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('⚡ [WEBSOCKET CONNECTED] Real-time tracking room joined for Alert #' + alertId);
          ws.send(JSON.stringify({ type: 'join', room: 'alert:' + alertId }));
          // When WebSocket is active, reduce fallback polling to 30s to conserve bandwidth
          if (wsFallbackInterval) clearInterval(wsFallbackInterval);
          wsFallbackInterval = setInterval(fetchLiveLocation, 30000);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'loc' && String(msg.alertId) === String(alertId)) {
              applyLocationUpdate(msg);
            } else if (msg.type === 'status' && String(msg.alertId) === String(alertId)) {
              applyLocationUpdate({ status: msg.status });
            }
          } catch (e) {
            console.error('Error handling WS tracking packet:', e);
          }
        };

        ws.onclose = () => {
          console.warn('⚠️ [WEBSOCKET DISCONNECTED] Falling back to polling, retrying WS in 4s...');
          // Fast fallback polling while disconnected
          if (wsFallbackInterval) clearInterval(wsFallbackInterval);
          wsFallbackInterval = setInterval(fetchLiveLocation, 4000);
          setTimeout(initWebSocketTracking, 4000);
        };

        ws.onerror = (e) => {
          console.warn('WebSocket error:', e);
        };
      } catch (err) {
        console.error('WebSocket init error:', err);
        if (!wsFallbackInterval) wsFallbackInterval = setInterval(fetchLiveLocation, 4000);
      }
    }

    initWebSocketTracking();
  </script>
</body>
</html>`;
}

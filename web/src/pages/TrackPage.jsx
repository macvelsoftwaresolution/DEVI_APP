import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { Shield, Navigation, Video, Phone, Route, Compass, Clock, Zap } from 'lucide-react';
import { apiUrl, WS_URL } from '../config/api';
import { createVictimDivIcon, createGuardianDivIcon } from '../utils/mapMarkers';

export default function TrackPage() {
  const { alertId: paramAlertId } = useParams();
  const [searchParams] = useSearchParams();
  const alertId = paramAlertId || searchParams.get('id') || searchParams.get('alertId') || 'LIVE';

  const [session, setSession] = useState(null);
  const [victimLocation, setVictimLocation] = useState({ lat: 13.0827, lng: 80.2707 });
  const [guardianLocation, setGuardianLocation] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [areaTitle, setAreaTitle] = useState('Fetching Live Address...');
  const [areaSub, setAreaSub] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [evidenceUrl, setEvidenceUrl] = useState(null);

  const [routeInfo, setRouteInfo] = useState(null);
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const victimMarkerRef = useRef(null);
  const guardianMarkerRef = useRef(null);
  const trailRef = useRef(null);
  const routeLayersRef = useRef([]);
  const wsRef = useRef(null);
  const hasFitBoundsRef = useRef(false);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const satellite = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 21,
      subdomains: ['0', '1', '2', '3'],
      attribution: '© Google Satellite | DEVI Safety',
    });

    const street = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap | DEVI Safety',
    });

    const map = L.map(mapContainerRef.current, {
      center: [victimLocation.lat, victimLocation.lng],
      zoom: 17,
      zoomControl: false,
      layers: [satellite],
    });

    L.control.layers({ '🛰️ Satellite': satellite, '🗺️ Streets': street }, null, { position: 'topright' }).addTo(map);

    // Victim Marker
    const victimIcon = createVictimDivIcon({
      id: alertId,
      status: status,
      userName: session?.userName || session?.user?.name || 'Emergency Victim',
    }, true);

    const vMarker = L.marker([victimLocation.lat, victimLocation.lng], { icon: victimIcon }).addTo(map);
    victimMarkerRef.current = vMarker;

    // Trail
    const trail = L.polyline([[victimLocation.lat, victimLocation.lng]], {
      color: '#EF4444',
      weight: 4,
      opacity: 0.85,
      dashArray: '6, 6',
    }).addTo(map);
    trailRef.current = trail;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Geocoding (Backend Google Maps API with OSM Fallback)
  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(apiUrl(`/api/sos/geocode?lat=${lat}&lng=${lng}`));
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.address) {
          const parts = data.address.split(',');
          setAreaTitle(parts.slice(0, 2).join(',').trim());
          setAreaSub(parts.slice(2, 5).join(',').trim() || parts[0]);
          return;
        }
      }
    } catch (_) {}

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      if (res.ok) {
        const d = await res.json();
        if (d && d.address) {
          const addr = d.address;
          const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
          const city = addr.city || addr.town || addr.district || '';
          setAreaTitle(road ? `${road}, ${city}` : d.display_name?.split(',').slice(0, 2).join(',') || 'Live Location');
          setAreaSub(d.display_name?.split(',').slice(2, 5).join(',') || '');
          return;
        }
      }
    } catch (_) {}

    setAreaTitle(`GPS Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    setAreaSub('Live High-Accuracy GPS Pinpoint');
  };

  // 3. Fetch Real Road Routes with OSRM (Multi-Route Calculation & Shortest Path Discovery)
  const calculateRealRoadRoutes = async (origin, destination, selectedIdx = 0) => {
    const map = mapInstanceRef.current;
    if (!map || !origin || !destination) return;

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('OSRM API failed');
      const data = await res.json();

      if (data && data.routes && data.routes.length > 0) {
        // Sort routes: index 0 is always the shortest distance route
        const sortedRoutes = [...data.routes].sort((a, b) => a.distance - b.distance);
        setAvailableRoutes(sortedRoutes);

        // Clear previous polylines
        routeLayersRef.current.forEach((layer) => map.removeLayer(layer));
        routeLayersRef.current = [];

        const activeIdx = Math.min(selectedIdx, sortedRoutes.length - 1);
        setActiveRouteIndex(activeIdx);

        // 1. Render all alternative paths in subtle dashed gray
        sortedRoutes.forEach((route, idx) => {
          if (idx !== activeIdx) {
            const altCoords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            const altPoly = L.polyline(altCoords, {
              color: '#94A3B8',
              weight: 5,
              opacity: 0.55,
              dashArray: '6, 8',
            }).addTo(map);
            routeLayersRef.current.push(altPoly);
          }
        });

        // 2. Render Selected / Shortest Route in High-Visibility Glowing Cyan
        const chosenRoute = sortedRoutes[activeIdx];
        const bestCoords = chosenRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

        // Outer glow layer
        const glowPoly = L.polyline(bestCoords, {
          color: '#0284C7',
          weight: 9,
          opacity: 0.45,
        }).addTo(map);

        // Solid inner core
        const corePoly = L.polyline(bestCoords, {
          color: '#38BDF8',
          weight: 5,
          opacity: 1.0,
        }).addTo(map);

        routeLayersRef.current.push(glowPoly, corePoly);

        // Distance & ETA formatting
        const distKm = (chosenRoute.distance / 1000).toFixed(1);
        const durationMins = Math.round(chosenRoute.duration / 60);
        let timeStr = `${durationMins} mins`;
        if (durationMins >= 60) {
          const hrs = Math.floor(durationMins / 60);
          const mins = durationMins % 60;
          timeStr = `${hrs}h ${mins > 0 ? `${mins}m` : ''}`;
        }

        setRouteInfo({
          distKm,
          timeStr,
          routesCount: sortedRoutes.length,
          isShortest: activeIdx === 0,
          isRealRoad: true,
        });

        // Fit map bounds once to frame both Guardian and Victim
        if (!hasFitBoundsRef.current) {
          const bounds = L.latLngBounds([
            [origin.lat, origin.lng],
            [destination.lat, destination.lng],
          ]);
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
          hasFitBoundsRef.current = true;
        }
        return;
      }
    } catch (err) {
      console.warn('OSRM routing fallback to direct connection line:', err);
    }

    // Fallback if offline/OSRM unreachable
    routeLayersRef.current.forEach((layer) => map.removeLayer(layer));
    routeLayersRef.current = [];

    const fallbackLine = L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], {
      color: '#0284C7',
      weight: 4,
      opacity: 0.85,
      dashArray: '6, 8',
    }).addTo(map);

    routeLayersRef.current.push(fallbackLine);

    const R = 6371;
    const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
    const dLon = ((destination.lng - origin.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((origin.lat * Math.PI) / 180) * Math.cos((destination.lat * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const distKm = (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
    const mins = Math.max(1, Math.round(distKm * 2.5));

    setRouteInfo({
      distKm,
      timeStr: `~${mins} mins`,
      routesCount: 1,
      isShortest: true,
      isRealRoad: false,
    });
  };

  // 4. Fetch Live SOS Location
  const fetchLive = async () => {
    if (!alertId || alertId === 'LIVE') return;
    try {
      const res = await fetch(apiUrl(`/api/sos/live/${alertId}`));
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && data.data) {
        applyUpdate(data.data);
      }
    } catch (_) {}
  };

  const applyUpdate = (data) => {
    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      const newLoc = { lat, lng };
      setVictimLocation(newLoc);
      if (victimMarkerRef.current) {
        victimMarkerRef.current.setLatLng([lat, lng]);
        victimMarkerRef.current.setIcon(createVictimDivIcon({
          id: alertId,
          status: data.status || status,
          userName: data.userName || data.user?.name || 'Emergency Victim',
        }, true));
      }
      if (mapInstanceRef.current) mapInstanceRef.current.panTo([lat, lng]);
      if (data.breadcrumbs && data.breadcrumbs.length > 0 && trailRef.current) {
        trailRef.current.setLatLngs(data.breadcrumbs.map((b) => [b.latitude, b.longitude]));
      }
      reverseGeocode(lat, lng);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // Recalculate road routing with new victim location
      if (guardianLocation) {
        calculateRealRoadRoutes(guardianLocation, newLoc, activeRouteIndex);
      }
    }
    if (data.status) setStatus(data.status);
    if (data.evidenceUrl) setEvidenceUrl(data.evidenceUrl);
    setSession(data);
  };

  // 5. WebSocket Real-time Tracking
  useEffect(() => {
    fetchLive();
    let ws = null;

    try {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (alertId && alertId !== 'LIVE') {
          ws.send(JSON.stringify({ type: 'join', room: `alert:${alertId}` }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'loc' && String(msg.alertId) === String(alertId)) {
            applyUpdate(msg);
          } else if (msg.type === 'status' && String(msg.alertId) === String(alertId)) {
            setStatus(msg.status);
          }
        } catch (_) {}
      };
    } catch (_) {}

    const interval = setInterval(fetchLive, 8000);

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [alertId]);

  // 6. Watch Guardian Location & Trigger Real Road Routing
  useEffect(() => {
    if (!navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const gLat = pos.coords.latitude;
        const gLng = pos.coords.longitude;
        const newGuardianLoc = { lat: gLat, lng: gLng };
        setGuardianLocation(newGuardianLoc);

        const map = mapInstanceRef.current;
        if (!map) return;

        if (!guardianMarkerRef.current) {
          const gIcon = createGuardianDivIcon();
          guardianMarkerRef.current = L.marker([gLat, gLng], { icon: gIcon }).addTo(map);
        } else {
          guardianMarkerRef.current.setLatLng([gLat, gLng]);
        }

        // Calculate Real Road Route Paths
        calculateRealRoadRoutes(newGuardianLoc, victimLocation, activeRouteIndex);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [victimLocation.lat, victimLocation.lng]);

  const navUrl = guardianLocation
    ? `https://www.google.com/maps/dir/?api=1&origin=${guardianLocation.lat},${guardianLocation.lng}&destination=${victimLocation.lat},${victimLocation.lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${victimLocation.lat},${victimLocation.lng}`;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* FLOATING TOP HEADER */}
      <header
        style={{
          position: 'absolute',
          top: '14px',
          left: '14px',
          right: '14px',
          background: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(18px)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          padding: '10px 14px',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 1000,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', boxShadow: '0 0 16px rgba(239, 68, 68, 0.6)' }}>
            🚨
          </div>
          <div>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700', color: '#FFF' }}>DEVI Emergency Live Track</h1>
            <p style={{ fontSize: '11px', color: '#94A3B8' }}>SOS Incident #{alertId.substring(0, 6).toUpperCase()}</p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: '800',
            background: status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            border: `1px solid ${status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)'}`,
            color: status === 'ACTIVE' ? '#EF4444' : '#22C55E',
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: status === 'ACTIVE' ? '#EF4444' : '#22C55E', animation: status === 'ACTIVE' ? 'pulse 1.4s infinite' : 'none' }}></span>
          <span>{status === 'ACTIVE' ? 'LIVE RESCUE ACTIVE' : 'USER SAFE'}</span>
        </div>
      </header>

      {/* MAP */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }}></div>

      {/* BOTTOM INFO PANEL */}
      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '14px',
          right: '14px',
          maxWidth: '540px',
          margin: '0 auto',
          background: 'rgba(15, 23, 42, 0.96)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '22px',
          padding: '16px 18px',
          boxShadow: '0 16px 45px rgba(0, 0, 0, 0.65)',
          zIndex: 1000,
        }}
      >
        {/* Address & Real-time Road Route Badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div style={{ flex: 1, paddingRight: '10px' }}>
            <div style={{ fontSize: '15px', fontWeight: '800', color: '#FFF', lineHeight: '1.2' }}>{areaTitle}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{areaSub}</div>
          </div>
          <div style={{ textAlign: 'right', minWidth: '120px' }}>
            <div style={{ fontSize: '10px', color: '#38BDF8', fontFamily: 'JetBrains Mono, monospace' }}>
              {lastUpdated ? `Sync: ${lastUpdated}` : 'Syncing...'}
            </div>
            {routeInfo && (
              <div style={{ marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '3px 8px', borderRadius: '8px' }}>
                <Zap size={12} color="#34D399" />
                <span style={{ fontSize: '11px', color: '#34D399', fontWeight: '800' }}>
                  {routeInfo.timeStr} ({routeInfo.distKm} km)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Multi-Path Shortest Route Selector */}
        {availableRoutes.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {availableRoutes.map((r, i) => {
              const km = (r.distance / 1000).toFixed(1);
              const mins = Math.round(r.duration / 60);
              const isSelected = activeRouteIndex === i;
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (guardianLocation) calculateRealRoadRoutes(guardianLocation, victimLocation, i);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '10px',
                    border: isSelected ? '1px solid #38BDF8' : '1px solid rgba(255,255,255,0.1)',
                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                    color: isSelected ? '#38BDF8' : '#94A3B8',
                    fontSize: '11px',
                    fontWeight: isSelected ? '800' : '600',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Route size={13} />
                  <span>{i === 0 ? `⚡ Shortest: ${mins}m (${km}km)` : `Path ${i + 1}: ${mins}m (${km}km)`}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Video Evidence Link */}
        {evidenceUrl && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(220, 38, 38, 0.2)', border: '1px solid rgba(239, 68, 68, 0.6)', borderRadius: '12px', padding: '8px 12px', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#FCA5A5' }}>📹 Emergency Video Evidence Ready</span>
            <a href={evidenceUrl} target="_blank" rel="noreferrer" style={{ background: '#EF4444', color: '#FFF', padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '800', textDecoration: 'none' }}>
              ▶ Watch
            </a>
          </div>
        )}

        {/* Google Navigation Button */}
        <a
          href={navUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
            color: '#FFF',
            padding: '14px',
            borderRadius: '14px',
            fontFamily: 'Outfit, sans-serif',
            fontSize: '15px',
            fontWeight: '800',
            textDecoration: 'none',
            boxShadow: '0 4px 18px rgba(2, 132, 199, 0.5)',
          }}
        >
          <Navigation size={18} /> Turn-by-Turn Google Navigation
        </a>
      </div>
    </div>
  );
}

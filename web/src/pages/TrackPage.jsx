import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { Shield, Navigation, Video, Phone } from 'lucide-react';
import { apiUrl, WS_URL } from '../config/api';

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

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const victimMarkerRef = useRef(null);
  const guardianMarkerRef = useRef(null);
  const trailRef = useRef(null);
  const connectionLineRef = useRef(null);
  const wsRef = useRef(null);

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
    const victimIcon = L.divIcon({
      className: 'custom-victim-marker',
      html: '<div class="victim-beacon"></div><div class="victim-pin"></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

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

    // Connection Line
    const connLine = L.polyline([], {
      color: '#0284C7',
      weight: 3,
      opacity: 0.75,
      dashArray: '4, 8',
    }).addTo(map);
    connectionLineRef.current = connLine;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Geocoding
  const reverseGeocode = async (lat, lng) => {
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

  // 3. Fetch Live Location
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
      setVictimLocation({ lat, lng });
      if (victimMarkerRef.current) victimMarkerRef.current.setLatLng([lat, lng]);
      if (mapInstanceRef.current) mapInstanceRef.current.panTo([lat, lng]);
      if (data.breadcrumbs && data.breadcrumbs.length > 0 && trailRef.current) {
        trailRef.current.setLatLngs(data.breadcrumbs.map((b) => [b.latitude, b.longitude]));
      }
      reverseGeocode(lat, lng);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
    if (data.status) setStatus(data.status);
    if (data.evidenceUrl) setEvidenceUrl(data.evidenceUrl);
    setSession(data);
  };

  // 4. WebSocket Tracking
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

  // 5. Watch Guardian Location
  useEffect(() => {
    if (!navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const gLat = pos.coords.latitude;
        const gLng = pos.coords.longitude;
        setGuardianLocation({ lat: gLat, lng: gLng });

        const map = mapInstanceRef.current;
        if (!map) return;

        if (!guardianMarkerRef.current) {
          const gIcon = L.divIcon({
            className: 'custom-guardian-marker',
            html: '<div class="guardian-pulse"></div><div class="guardian-dot"></div><div class="guardian-label">YOU</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          guardianMarkerRef.current = L.marker([gLat, gLng], { icon: gIcon }).addTo(map);
        } else {
          guardianMarkerRef.current.setLatLng([gLat, gLng]);
        }

        if (connectionLineRef.current) {
          connectionLineRef.current.setLatLngs([[gLat, gLng], [victimLocation.lat, victimLocation.lng]]);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [victimLocation]);

  const calcEtaText = () => {
    if (!guardianLocation || !victimLocation) return null;
    const R = 6371;
    const dLat = ((victimLocation.lat - guardianLocation.lat) * Math.PI) / 180;
    const dLon = ((victimLocation.lng - guardianLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((guardianLocation.lat * Math.PI) / 180) * Math.cos((victimLocation.lat * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const mins = Math.max(1, Math.round(distKm * 2.5));
    return { distKm: distKm.toFixed(1), mins };
  };

  const eta = calcEtaText();

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: '#FFF' }}>{areaTitle}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>{areaSub}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#38BDF8', fontFamily: 'JetBrains Mono, monospace' }}>
              {lastUpdated ? `Sync: ${lastUpdated}` : 'Syncing...'}
            </div>
            {eta && (
              <div style={{ fontSize: '11px', color: '#34D399', fontWeight: '700' }}>
                ⚡ ~{eta.mins}m ({eta.distKm} km)
              </div>
            )}
          </div>
        </div>

        {evidenceUrl && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(220, 38, 38, 0.2)', border: '1px solid rgba(239, 68, 68, 0.6)', borderRadius: '12px', padding: '8px 12px', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#FCA5A5' }}>📹 Emergency Video Evidence Ready</span>
            <a href={evidenceUrl} target="_blank" rel="noreferrer" style={{ background: '#EF4444', color: '#FFF', padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '800', textDecoration: 'none' }}>
              ▶ Watch
            </a>
          </div>
        )}

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

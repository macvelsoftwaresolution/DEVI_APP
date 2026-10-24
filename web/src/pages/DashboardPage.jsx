import React, { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, Polyline, Circle } from '@react-google-maps/api';
import { Volume2, VolumeX, RefreshCw, X, Phone, Navigation, MapPin, LogOut } from 'lucide-react';
import { adminFetch, getAdminToken, logoutAdmin, WS_URL } from '../config/api';
import { createVictimDivIcon } from '../utils/mapMarkers';

// Define static constants outside component to avoid re-renders resetting map position
const defaultMapCenter = { lat: 10.85, lng: 78.70 };
const defaultMapOptions = { disableDefaultUI: true, zoomControl: true };

export default function DashboardPage() {
  const [incidents, setIncidents] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [liveTime, setLiveTime] = useState('');
  const [emergencyAlertModal, setEmergencyAlertModal] = useState(null); // { id, name, phone, location, lat, lng }
  const [operatorNote, setOperatorNote] = useState('');

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const mapInstanceRef = useRef(null);
  const audioCtxRef = useRef(null);
  const prevActiveIdsRef = useRef(new Set());
  const initialLoadRef = useRef(true);
  const wsRef = useRef(null);

  // Digital Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  

  // Smooth Cinematic Map FlyTo Helper (Prevents animation jitter / abrupt snap)
  const isFlyingRef = useRef(false);
  const smoothFlyTo = (lat, lng, zoom = 17) => {
    const map = mapInstanceRef.current;
    if (!map || isNaN(lat) || isNaN(lng)) return;
    
    // Stop any conflicting animation and smoothly glide
    map.panTo({ lat, lng });
    map.setZoom(zoom);

    setTimeout(() => {
      isFlyingRef.current = false;
    }, 2900);
  };

  // Audio Siren & Voice Announcement (Speaks Real Place Name, NEVER raw GPS numbers)
  const speakEmergencyAlert = async (victimName, location, lat, lng) => {
    if (!audioEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();

      let placeName = location || '';

      // Check if location is raw GPS numbers, URL, or placeholder
      const isRawCoordinates =
        !placeName ||
        placeName.includes('GPS') ||
        placeName.includes('http') ||
        placeName.includes('maps.google') ||
        placeName.includes('Latitude') ||
        placeName.includes('அட்சரேகை') ||
        /^\s*[-+]?[0-9]*\.?[0-9]+\s*,\s*[-+]?[0-9]*\.?[0-9]+\s*$/.test(placeName);

      if (isRawCoordinates && lat && lng) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14`);
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const town = addr.city || addr.town || addr.village || addr.suburb || addr.state_district || 'Sivakasi';
            const state = addr.state || 'Tamil Nadu';
            placeName = `${town}, ${state}`;
          }
        } catch (_) {}
      }

      // Final fallback to clean human-readable place if still contains numbers
      if (!placeName || placeName.includes('GPS') || placeName.includes('http')) {
        placeName = (lat && lng && Math.abs(lat - 9.466) < 0.1) ? 'Sivakasi, Tamil Nadu' : 'Current Incident Location';
      }

      const text = `Emergency SOS Alert! Victim ${victimName || 'User'} needs assistance at ${placeName}.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95; // Steady, neat and clear voice cadence
      utterance.pitch = 1.05;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    } catch (_) {}
  };

  const playSiren = (inc = null) => {
    if (!audioEnabled) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.type = 'sawtooth';

      const now = audioCtxRef.current.currentTime;
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(660, now + 0.15);
      osc.frequency.setValueAtTime(880, now + 0.30);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.start(now);
      osc.stop(now + 0.5);

      if (inc) {
        setTimeout(() => {
          speakEmergencyAlert(inc.user?.name, inc.location, parseFloat(inc.latitude), parseFloat(inc.longitude));
        }, 500);
      }
    } catch (_) {}
  };

  // Fetch Incidents
  const fetchIncidents = async (manual = false) => {
    try {
      const res = await adminFetch('/api/dashboard/incidents');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.incidents)) {
        setIncidents((prev) => {
          const prevMap = new Map(prev.map((i) => [String(i.id), i]));
          return data.incidents.map((serverInc) => {
            const existing = prevMap.get(String(serverInc.id));
            if (!existing) return serverInc;
            const existingCrumbs = existing.breadcrumbs || [];
            const serverCrumbs = serverInc.breadcrumbs || [];
            const mergedCrumbs = existingCrumbs.length >= serverCrumbs.length ? existingCrumbs : serverCrumbs;
            return {
              ...serverInc,
              accuracy: serverInc.accuracy != null ? serverInc.accuracy : existing.accuracy,
              breadcrumbs: mergedCrumbs,
            };
          });
        });

        const currentActive = new Set();
        const isFirstLoad = initialLoadRef.current;
        if (isFirstLoad) {
          initialLoadRef.current = false;
        }

        data.incidents.forEach((inc) => {
          if (inc.status === 'DISPATCHED' || inc.status === 'ACTIVE') {
            currentActive.add(inc.id);
            // Only alert if NOT first load and not already tracked
            if (!isFirstLoad && !prevActiveIdsRef.current.has(inc.id) && !manual) {
              const lat = parseFloat(inc.latitude);
              const lng = parseFloat(inc.longitude);
              playSiren(inc);
              setEmergencyAlertModal({
                id: inc.id,
                name: inc.user?.name || 'Emergency Victim',
                phone: inc.user?.phone || 'N/A',
                location: inc.location || 'Live GPS Location',
                lat,
                lng,
              });
              setSelectedIncidentId(inc.id);
              smoothFlyTo(lat, lng, 17);
            }
          }
        });
        prevActiveIdsRef.current = currentActive;

        if (!selectedIncidentId && data.incidents.length > 0) {
          const activeOrAssigned = data.incidents.find((i) => i.status === 'DISPATCHED' || i.status === 'ACTIVE');
          if (activeOrAssigned) {
            setSelectedIncidentId(activeOrAssigned.id);
          }
        }
      }
    } catch (e) {
      console.warn('Fetch incidents error:', e);
    }
  };

  // WebSocket Connection
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connectWs = () => {
      try {
        ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('⚡ [REACT DASHBOARD WS CONNECTED]');
          ws.send(JSON.stringify({ type: 'join', room: 'dashboard', token: getAdminToken() }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            // Admin session expired: the server refused the dashboard room
            if (msg.type === 'error' && msg.code === 'ADMIN_AUTH_REQUIRED') {
              logoutAdmin();
              return;
            }

            // Immediate live coordinate updates for zero-latency movement on map & line
            if (msg.type === 'loc' && msg.alertId) {
              const vLat = parseFloat(msg.latitude);
              const vLng = parseFloat(msg.longitude);
              const acc = msg.accuracy != null && !isNaN(parseFloat(msg.accuracy)) ? parseFloat(msg.accuracy) : null;
              if (!isNaN(vLat) && !isNaN(vLng)) {
                setIncidents((prev) =>
                  prev.map((inc) => {
                    if (String(inc.id) === String(msg.alertId)) {
                      // Filter stationary jitter: ignore if moved less than 3.5m from last crumb
                      const existingCrumbs = inc.breadcrumbs || [{ latitude: inc.latitude, longitude: inc.longitude }];
                      const lastCrumb = existingCrumbs[existingCrumbs.length - 1];
                      let shouldAppend = true;
                      if (lastCrumb) {
                        const dist = calcDistKm(parseFloat(lastCrumb.latitude), parseFloat(lastCrumb.longitude), vLat, vLng);
                        const minMoveKm = (acc && acc < 10) ? 0.0035 : 0.006;
                        if (dist < minMoveKm) {
                          shouldAppend = false;
                        }
                      }

                      const updatedBreadcrumbs = shouldAppend
                        ? [
                            ...existingCrumbs,
                            { latitude: vLat, longitude: vLng, accuracy: acc, timestamp: new Date().toISOString() },
                          ]
                        : existingCrumbs;

                      return {
                        ...inc,
                        latitude: vLat,
                        longitude: vLng,
                        accuracy: acc ?? inc.accuracy,
                        location: msg.address || inc.location,
                        breadcrumbs: updatedBreadcrumbs,
                      };
                    }
                    return inc;
                  })
                );
              }
            } else if (msg.type === 'sos:new') {
              const alertData = msg.data;
              if (alertData) {
                const lat = parseFloat(alertData.latitude);
                const lng = parseFloat(alertData.longitude);
                playSiren(alertData);
                setEmergencyAlertModal({
                  id: alertData.id,
                  name: alertData.userName || alertData.user?.name || 'Emergency Victim',
                  phone: alertData.userPhone || alertData.user?.phone || 'N/A',
                  location: alertData.location || 'Live GPS Location',
                  lat,
                  lng,
                });
                setSelectedIncidentId(alertData.id);
                smoothFlyTo(lat, lng, 17);
              }
              fetchIncidents(true);
            } else if (msg.type === 'incident:evidence' && msg.alertId) {
              setIncidents((prev) =>
                prev.map((inc) =>
                  String(inc.id) === String(msg.alertId)
                    ? { ...inc, evidenceUrl: msg.evidenceUrl }
                    : inc
                )
              );
              fetchIncidents(false);
            } else if (msg.type === 'status' || msg.type === 'incident:resolved') {
              fetchIncidents(false);
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          if (document.visibilityState !== 'hidden') {
            reconnectTimeout = setTimeout(connectWs, 4000);
          }
        };
      } catch (err) {
        console.warn('WS error:', err);
      }
    };

    connectWs();
    fetchIncidents(true);

    const pollInterval = setInterval(() => {
      fetchIncidents(false);
    }, 15000);

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, []);

  // Selected Incident Focus
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);

  useEffect(() => {
    if (selectedIncident) {
      setOperatorNote(selectedIncident.operatorNotes || '');
    }
  }, [selectedIncidentId, selectedIncident?.operatorNotes]);

  // Distance Calculator
  const calcDistKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Save Notes
  const handleSaveNote = async () => {
    if (!selectedIncidentId || !operatorNote.trim()) return;
    try {
      await adminFetch('/api/dashboard/add-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: selectedIncidentId, note: operatorNote.trim() }),
      });
      fetchIncidents(true);
      alert('Note saved');
    } catch (_) {}
  };

  // Resolve Incident
  const handleResolveIncident = async () => {
    if (!selectedIncidentId || !confirm('Mark this incident as RESOLVED?')) return;
    try {
      await adminFetch(`/api/dashboard/resolve/${selectedIncidentId}`, { method: 'POST' });
      fetchIncidents(true);
      setSelectedIncidentId(null);
    } catch (_) {}
  };

  // Filtered Incidents
  const filteredIncidents = incidents
    .filter((inc) => {
      if (filter === 'ACTIVE') return inc.status === 'DISPATCHED' || inc.status === 'ACTIVE';
      if (filter === 'RESOLVED') return inc.status === 'RESOLVED';
      return true;
    })
    .filter((inc) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (inc.user?.name || '').toLowerCase().includes(q) ||
        (inc.user?.phone || '').toLowerCase().includes(q) ||
        (inc.id || '').toLowerCase().includes(q) ||
        (inc.location || '').toLowerCase().includes(q)
      );
    });

  const activeCount = incidents.filter((i) => i.status === 'DISPATCHED' || i.status === 'ACTIVE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* TOP HEADER */}
      <header
        style={{
          height: '60px',
          background: 'var(--bg-dark)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              boxShadow: '0 0 14px rgba(239, 68, 68, 0.35)',
            }}
          >
            🛡️
          </div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '16px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>DEVI Response Center</span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: '700',
                color: '#34D399',
                background: 'var(--green-soft)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '2px 7px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ width: '6px', height: '6px', background: '#34D399', borderRadius: '50%', animation: 'pulse 1.6s infinite' }}></span>
              Live
            </span>
          </div>
        </div>

        {/* STATS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                background: 'var(--red-soft)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#FCA5A5',
              }}
            >
              <span style={{ color: '#EF4444' }}>●</span>
              <span>{activeCount} Active</span>
            </div>
          )}
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface)',
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
            }}
          >
            {liveTime || '--:--:-- IST'}
          </div>
        </div>

        {/* BUTTONS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: audioEnabled ? '#34D399' : 'var(--text-dim)',
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            {audioEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {audioEnabled ? 'Sound ON' : 'Sound OFF'}
          </button>
          <button
            onClick={() => fetchIncidents(true)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: '#FFF',
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => {
              if (window.confirm('Sign out of the admin dashboard?')) logoutAdmin();
            }}
            title="Sign out"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#FCA5A5',
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 60px)', overflow: 'hidden', position: 'relative' }}>
        {/* SIDEBAR: INCIDENTS */}
        <aside
          style={{
            width: '360px',
            background: 'var(--bg-dark)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            zIndex: 20,
          }}
        >
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              placeholder="Search name, phone, or location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '12px',
                color: '#FFF',
                outline: 'none',
                marginBottom: '10px',
              }}
            />

            {/* MINI STATS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '10px' }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700' }}>{incidents.length}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '1px' }}>Total</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700', color: '#F87171' }}>{activeCount}</div>
                <div style={{ fontSize: '9px', color: '#F87171', textTransform: 'uppercase', marginTop: '1px' }}>Active</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700', color: '#34D399' }}>
                  {incidents.filter((i) => i.status === 'RESOLVED').length}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '1px' }}>Resolved</div>
              </div>
            </div>

            {/* TABS */}
            <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border)', gap: '2px' }}>
              {['ALL', 'ACTIVE', 'RESOLVED'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  style={{
                    flex: 1,
                    padding: '4px',
                    background: filter === tab ? 'var(--bg-elevated)' : 'transparent',
                    border: 'none',
                    color: filter === tab ? '#FFF' : 'var(--text-muted)',
                    fontSize: '11px',
                    fontWeight: '600',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {tab.charAt(0) + tab.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* INCIDENT CARDS */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filteredIncidents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-dim)', fontSize: '11px' }}>No incidents found.</div>
            ) : (
              filteredIncidents.map((inc) => {
                const isEmergency = inc.status === 'DISPATCHED' || inc.status === 'ACTIVE';
                const isSelected = selectedIncidentId === inc.id;

                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncidentId(inc.id)}
                    style={{
                      background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--red)' : 'var(--border)'}`,
                      borderLeft: isEmergency ? '3px solid var(--red)' : '3px solid var(--green)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)' }}>
                        #{inc.id.substring(0, 6).toUpperCase()}
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '12px',
                          background: isEmergency ? 'var(--red-soft)' : 'var(--green-soft)',
                          color: isEmergency ? '#FCA5A5' : '#6EE7B7',
                        }}
                      >
                        {inc.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#FFF' }}>{inc.user?.name || 'Victim'}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{inc.user?.phone}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' }}>
                      📍 {inc.location || 'GPS Location'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <span>{inc.timeAgo || 'Just now'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* MAP */}
        <main style={{ flex: 1, height: '100%', position: 'relative', background: '#0B0E14' }}>
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={defaultMapCenter}
              zoom={8}
              onLoad={(map) => { mapInstanceRef.current = map; }}
              options={defaultMapOptions}
            >
              {/* Incidents */}
              {incidents.map((inc) => {
                const lat = parseFloat(inc.latitude);
                const lng = parseFloat(inc.longitude);
                if (isNaN(lat) || isNaN(lng)) return null;
                const isEmergency = inc.status === 'DISPATCHED' || inc.status === 'ACTIVE';
                const isSelected = selectedIncidentId === inc.id;
                return (
                  <OverlayView
                    key={inc.id}
                    position={{ lat, lng }}
                    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                    getPixelPositionOffset={(width, height) => ({ x: -100, y: -85 })}
                  >
                    <div 
                      onClick={() => setSelectedIncidentId(inc.id)}
                      dangerouslySetInnerHTML={{ __html: createVictimDivIcon(inc, isSelected) }} 
                      style={{ cursor: 'pointer' }}
                    />
                  </OverlayView>
                );
              })}
              
              {/* Polylines for Selected Incident */}
              {selectedIncident && (() => {
                 const vLat = parseFloat(selectedIncident.latitude);
                 const vLng = parseFloat(selectedIncident.longitude);
                 if (isNaN(vLat) || isNaN(vLng)) return null;
                 
                 return (
                   <>
                     {/* Victim Movement Trail (Jitter Filtered, Glow & Direction Indicated) */}
                      {selectedIncident.breadcrumbs && selectedIncident.breadcrumbs.length > 1 && (() => {
                        const cleanTrail = [];
                        selectedIncident.breadcrumbs.forEach((b) => {
                          const lat = parseFloat(b.latitude);
                          const lng = parseFloat(b.longitude);
                          if (isNaN(lat) || isNaN(lng)) return;
                          const last = cleanTrail[cleanTrail.length - 1];
                          if (!last) {
                            cleanTrail.push({ lat, lng });
                          } else {
                            const dist = calcDistKm(last.lat, last.lng, lat, lng);
                            // Dynamic threshold: filter stationary jitter (< 3.5m) and impossible teleports (> 600m)
                            if (dist >= 0.0035 && dist <= 0.6) {
                              cleanTrail.push({ lat, lng });
                            }
                          }
                        });

                        // Ensure current live victim location is connected at the tip
                        if (cleanTrail.length > 0) {
                          const last = cleanTrail[cleanTrail.length - 1];
                          if (calcDistKm(last.lat, last.lng, vLat, vLng) >= 0.002) {
                            cleanTrail.push({ lat: vLat, lng: vLng });
                          }
                        }

                        if (cleanTrail.length <= 1) return null;

                        const arrowIcons = (window.google && window.google.maps) ? [{
                          icon: {
                            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                            strokeColor: '#B91C1C',
                            fillColor: '#EF4444',
                            fillOpacity: 1,
                            scale: 2.2,
                            strokeWeight: 1,
                          },
                          offset: '100%',
                          repeat: '70px',
                        }] : [];

                        return (
                          <>
                            {/* Outer Ambient Glow Line */}
                            <Polyline 
                              path={cleanTrail} 
                              options={{ 
                                strokeColor: '#EF4444', 
                                strokeOpacity: 0.3, 
                                strokeWeight: 8, 
                                zIndex: 2 
                              }} 
                            />
                            {/* Sharp Core Polyline with Direction Arrows */}
                            <Polyline 
                              path={cleanTrail} 
                              options={{ 
                                strokeColor: '#EF4444', 
                                strokeOpacity: 0.95, 
                                strokeWeight: 4, 
                                icons: arrowIcons,
                                zIndex: 3 
                              }} 
                            />
                            {/* SOS Trigger Origin Point Marker */}
                            {cleanTrail.length > 1 && calcDistKm(cleanTrail[0].lat, cleanTrail[0].lng, vLat, vLng) >= 0.015 && (
                              <OverlayView
                                position={cleanTrail[0]}
                                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                                getPixelPositionOffset={() => ({ x: -14, y: -14 })}
                              >
                                <div 
                                  title="SOS Trigger Point (Origin)"
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: '#10B981',
                                    border: '2px solid #FFFFFF',
                                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.8)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '12px',
                                    cursor: 'default',
                                  }}
                                >
                                  🏁
                                </div>
                              </OverlayView>
                            )}
                          </>
                        );
                      })()}

                      {/* GPS Accuracy Radius Circle around Victim Pin */}
                      <Circle
                        center={{ lat: vLat, lng: vLng }}
                        radius={Math.max(6, Math.min(45, parseFloat(selectedIncident.accuracy) || 12))}
                        options={{
                          fillColor: '#EF4444',
                          fillOpacity: 0.12,
                          strokeColor: '#EF4444',
                          strokeOpacity: 0.55,
                          strokeWeight: 1.5,
                          clickable: false,
                          zIndex: 1,
                        }}
                      />

                   </>
                 );
              })()}
            </GoogleMap>
          ) : (
            <div style={{color: 'white', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>Loading Google Maps...</div>
          )}
        </main>

        {/* RIGHT DRAWER */}
        {selectedIncident && (
          <aside
            style={{
              width: '440px',
              background: 'var(--bg-dark)',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              zIndex: 30,
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: '700' }}>#{selectedIncident.id.substring(0, 6).toUpperCase()}</span>
                <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '12px', background: 'var(--red-soft)', color: '#FCA5A5' }}>
                  {selectedIncident.status}
                </span>
              </div>
              <button onClick={() => setSelectedIncidentId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* EVIDENCE */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Live Evidence
                </div>
                {selectedIncident.evidenceUrl ? (
                  <video src={selectedIncident.evidenceUrl} controls style={{ width: '100%', height: '190px', borderRadius: '8px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '11px' }}>
                    ⏳ Video evidence recording in progress or pending upload...
                  </div>
                )}
              </div>

              {/* VICTIM DETAILS */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Victim Details
                </div>
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Name</span>
                    <span style={{ fontWeight: '600' }}>{selectedIncident.user?.name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Phone</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--blue)', fontWeight: '700' }}>{selectedIncident.user?.phone}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Location</span>
                    <span style={{ fontSize: '11px', textAlign: 'right', maxWidth: '240px' }}>{selectedIncident.location}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>GPS Accuracy</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: selectedIncident.accuracy && selectedIncident.accuracy <= 10 ? '#34D399' : '#FBBF24', fontWeight: '700' }}>
                      {selectedIncident.accuracy ? `±${Math.round(selectedIncident.accuracy)} meters` : 'High Precision'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '12px' }}>
                  <a href={`tel:${selectedIncident.user?.phone}`} style={{ padding: '8px', background: 'var(--red)', color: '#FFF', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textAlign: 'center', textDecoration: 'none' }}>
                    📞 Call Victim
                  </a>
                  <a href="tel:112" style={{ padding: '8px', background: 'var(--bg-elevated)', border: '1px solid rgba(245,158,11,0.4)', color: '#FCD34D', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textAlign: 'center', textDecoration: 'none' }}>
                    🚨 Call 112
                  </a>
                </div>
              </div>

              {/* OPERATOR NOTES */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Incident Notes
                </div>
                <textarea
                  value={operatorNote}
                  onChange={(e) => setOperatorNote(e.target.value)}
                  placeholder="Operator notes..."
                  style={{
                    width: '100%',
                    height: '55px',
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    fontSize: '11px',
                    color: '#FFF',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <button onClick={handleSaveNote} style={{ padding: '6px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: '#FFF', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                    Save Note
                  </button>
                  <button onClick={handleResolveIncident} style={{ padding: '6px 12px', background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,0.4)', color: '#34D399', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                    ✓ Mark Resolved
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* FLOATING TACTICAL EMERGENCY SOS HUD (Non-blocking, live map zoom visible) */}
      {emergencyAlertModal && (
        <div
          style={{
            position: 'absolute',
            top: '75px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '540px',
            maxWidth: '92vw',
            background: 'linear-gradient(180deg, rgba(30, 18, 20, 0.95) 0%, rgba(15, 11, 12, 0.95) 100%)',
            border: '2px solid #EF4444',
            boxShadow: '0 8px 32px rgba(239, 68, 68, 0.5), 0 0 20px rgba(0,0,0,0.8)',
            backdropFilter: 'blur(12px)',
            borderRadius: '16px',
            overflow: 'hidden',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideDown 0.3s ease-out',
          }}
        >
          {/* ALERT HEADER */}
          <div
            style={{
              background: 'linear-gradient(90deg, #EF4444 0%, #B91C1C 100%)',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#FFF',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px', animation: 'bounce 1s infinite' }}>🚨</span>
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '900', letterSpacing: '0.5px' }}>
                  EMERGENCY SOS TRIGGERED!
                </div>
                <div style={{ fontSize: '10px', opacity: 0.9 }}>Auto-Zooming Map to Victim Location...</div>
              </div>
            </div>
            <button
              onClick={() => setEmergencyAlertModal(null)}
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: 'none',
                color: '#FFF',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* ALERT BODY */}
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: '700' }}>Victim: </span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: '#FFF' }}>{emergencyAlertModal.name}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#38BDF8', fontWeight: '700', marginLeft: '8px' }}>
                  📞 {emergencyAlertModal.phone}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <a
                  href={`tel:${emergencyAlertModal.phone}`}
                  style={{
                    background: 'var(--red)',
                    color: '#FFF',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontWeight: '700',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none',
                  }}
                >
                  <Phone size={13} /> Call
                </a>
                <button
                  onClick={() => {
                    if (mapInstanceRef.current && !isNaN(emergencyAlertModal.lat) && !isNaN(emergencyAlertModal.lng)) {
                      smoothFlyTo(emergencyAlertModal.lat, emergencyAlertModal.lng, 19);
                    }
                  }}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: '#67E8F9',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontWeight: '700',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <Navigation size={13} /> Re-Zoom
                </button>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={15} color="#EF4444" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#FEE2E2', lineHeight: '1.2' }}>
                  {emergencyAlertModal.location}
                </span>
              </div>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0, marginLeft: '8px' }}>
                {emergencyAlertModal.lat?.toFixed(5)}, {emergencyAlertModal.lng?.toFixed(5)}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

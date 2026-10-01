import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { Shield, Radio, Volume2, VolumeX, RefreshCw, Plus, Link2, X, Phone, CheckCircle, Navigation, MapPin, Settings, Clock, UserCheck, Power } from 'lucide-react';
import { apiUrl, WS_URL } from '../config/api';
import { createVictimDivIcon, createResponderDivIcon } from '../utils/mapMarkers';

export default function DashboardPage() {
  const [incidents, setIncidents] = useState([]);
  const [responders, setResponders] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [showResponders, setShowResponders] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [liveTime, setLiveTime] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showShiftSettingsModal, setShowShiftSettingsModal] = useState(false);
  const [showAgentsListModal, setShowAgentsListModal] = useState(false);
  const [shiftHours, setShiftHours] = useState(8);
  const [gpsInterval, setGpsInterval] = useState(10);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [emergencyAlertModal, setEmergencyAlertModal] = useState(null); // { id, name, phone, location, lat, lng }
  const [operatorNote, setOperatorNote] = useState('');
  const [isSavingResponder, setIsSavingResponder] = useState(false);

  // Responder Form & OTP Verification
  const [respName, setRespName] = useState('');
  const [respPhone, setRespPhone] = useState('');
  const [respPin, setRespPin] = useState('7421');
  const [respArea, setRespArea] = useState('');
  const [respVehicle, setRespVehicle] = useState('Patrol Bike');
  const [addAgentStep, setAddAgentStep] = useState(1); // 1 = Details, 2 = OTP Verification
  const [respOtp, setRespOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [createdInviteInfo, setCreatedInviteInfo] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map());
  const responderMarkersRef = useRef(new Map());
  const dispatchLineRef = useRef(null);
  const audioCtxRef = useRef(null);
  const prevActiveIdsRef = useRef(new Set());
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

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([10.85, 78.70], 8);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const satellite = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      attribution: '© Google Satellite',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 21,
    });

    const dark = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
      className: 'tactical-dark-tiles',
    });

    const street = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '© Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    });

    satellite.addTo(map);
    L.control.layers({ '🛰️ Satellite': satellite, '🌑 Dark Map': dark, '🗺️ Streets': street }, null, { position: 'topright' }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Smooth Cinematic Map FlyTo Helper (Prevents animation jitter / abrupt snap)
  const isFlyingRef = useRef(false);
  const smoothFlyTo = (lat, lng, zoom = 17) => {
    const map = mapInstanceRef.current;
    if (!map || isNaN(lat) || isNaN(lng)) return;
    
    // Stop any conflicting animation and smoothly glide
    map.stop();
    isFlyingRef.current = true;
    map.flyTo([lat, lng], zoom, {
      animate: true,
      duration: 2.8, // Smooth cinematic glide while audio speaks
      easeLinearity: 0.2,
      noMoveStart: true,
    });

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
      const res = await fetch(apiUrl('/api/dashboard/incidents'));
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.incidents)) {
        setIncidents(data.incidents);

        const currentActive = new Set();
        data.incidents.forEach((inc) => {
          if (inc.status === 'DISPATCHED' || inc.status === 'ACTIVE') {
            currentActive.add(inc.id);
            if (!prevActiveIdsRef.current.has(inc.id) && !manual) {
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
      }
    } catch (e) {
      console.warn('Fetch incidents error:', e);
    }
  };

  // Fetch Responders
  const fetchResponders = async () => {
    try {
      const res = await fetch(apiUrl('/api/dashboard/agents'));
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.agents)) {
        setResponders(data.agents);
      }
    } catch (e) {}
  };

  // Fetch System Duty Settings
  const fetchDutySettings = async () => {
    try {
      const res = await fetch(apiUrl('/api/dashboard/settings/duty'));
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.settings) {
        setShiftHours(data.settings.shiftDurationHours || 8);
        setGpsInterval(data.settings.gpsIntervalSeconds || 10);
      }
    } catch (_) {}
  };

  // Save Duty Settings
  const handleSaveDutySettings = async (e) => {
    if (e) e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch(apiUrl('/api/dashboard/settings/duty'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftDurationHours: Number(shiftHours), gpsIntervalSeconds: Number(gpsInterval) }),
      });
      const data = await res.json();
      if (data.success) {
        setShowShiftSettingsModal(false);
        alert(`✅ Duty Shift Configuration Updated!\n• Shift Duration: ${shiftHours} Hours\n• GPS Update Frequency: Every ${gpsInterval}s`);
      } else {
        alert(data.message || 'Failed to update settings');
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // End Agent Duty Manually
  const handleEndAgentDuty = async (agentId, agentName) => {
    if (!window.confirm(`Are you sure you want to end ${agentName}'s duty shift now?`)) return;
    try {
      const res = await fetch(apiUrl(`/api/dashboard/agents/${agentId}/end-duty`), {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        fetchResponders();
      }
    } catch (_) {}
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
          ws.send(JSON.stringify({ type: 'join', room: 'dashboard' }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'sos:new' || msg.type === 'incident:assigned' || msg.type === 'incident:en_route') {
              fetchIncidents(false);
              fetchResponders();
            } else if (msg.type === 'loc' || msg.type === 'status' || msg.type === 'agent_loc' || msg.type === 'agent_update') {
              fetchIncidents(false);
              fetchResponders();
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
    fetchResponders();
    fetchDutySettings();

    const pollInterval = setInterval(() => {
      fetchIncidents(false);
      fetchResponders();
    }, 15000);

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, []);

  // Update Incident Map Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set(incidents.map((i) => i.id));
    for (const [id, marker] of markersRef.current.entries()) {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    }

    incidents.forEach((inc) => {
      const lat = parseFloat(inc.latitude);
      const lng = parseFloat(inc.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const isSelected = inc.id === selectedIncidentId;
      const icon = createVictimDivIcon(inc, isSelected);

      if (markersRef.current.has(inc.id)) {
        const marker = markersRef.current.get(inc.id);
        marker.setLatLng([lat, lng]);
        marker.setIcon(icon);
      } else {
        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.bindTooltip(`<strong>${inc.user?.name || inc.userName || 'Victim'}</strong><br/>Status: <strong>${inc.status}</strong>`, { direction: 'top' });
        marker.on('click', () => setSelectedIncidentId(inc.id));
        markersRef.current.set(inc.id, marker);
      }
    });
  }, [incidents, selectedIncidentId]);

  // Update Responder Map Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!showResponders) {
      for (const marker of responderMarkersRef.current.values()) map.removeLayer(marker);
      responderMarkersRef.current.clear();
      return;
    }

    const currentIds = new Set(responders.map((r) => r.id));
    for (const [id, marker] of responderMarkersRef.current.entries()) {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        responderMarkersRef.current.delete(id);
      }
    }

    responders.forEach((r) => {
      const lat = parseFloat(r.latitude);
      const lng = parseFloat(r.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const icon = createResponderDivIcon(r, false);

      if (responderMarkersRef.current.has(r.id)) {
        const marker = responderMarkersRef.current.get(r.id);
        marker.setLatLng([lat, lng]);
        marker.setIcon(icon);
      } else {
        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.bindTooltip(`<strong>${r.name}</strong><br/>📍 ${r.area || 'Sector'}<br/>📞 ${r.phone}`, { direction: 'top' });
        responderMarkersRef.current.set(r.id, marker);
      }
    });
  }, [responders, showResponders]);

  // Selected Incident Focus
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (dispatchLineRef.current) {
      map.removeLayer(dispatchLineRef.current);
      dispatchLineRef.current = null;
    }

    if (!selectedIncident) return;
    const vLat = parseFloat(selectedIncident.latitude);
    const vLng = parseFloat(selectedIncident.longitude);

    if (selectedIncident.assignedAgent) {
      const assignedResp = responders.find((r) =>
        selectedIncident.assignedAgent.toLowerCase().includes(r.name.toLowerCase()) ||
        (r.phone && selectedIncident.assignedAgent.includes(r.phone.slice(-10)))
      );

      if (assignedResp) {
        const rLat = parseFloat(assignedResp.latitude);
        const rLng = parseFloat(assignedResp.longitude);
        if (!isNaN(vLat) && !isNaN(vLng) && !isNaN(rLat) && !isNaN(rLng)) {
          const polyline = L.polyline(
            [
              [rLat, rLng],
              [vLat, vLng],
            ],
            {
              color: '#38BDF8',
              weight: 4,
              opacity: 0.9,
              dashArray: '8, 8',
              lineCap: 'round',
            }
          ).addTo(map);

          dispatchLineRef.current = polyline;

          map.fitBounds(
            [
              [rLat, rLng],
              [vLat, vLng],
            ],
            { padding: [70, 70], maxZoom: 16 }
          );
          setOperatorNote(selectedIncident.operatorNotes || '');
          return;
        }
      }
    }

    if (!isNaN(vLat) && !isNaN(vLng) && !isFlyingRef.current) {
      smoothFlyTo(vLat, vLng, 17);
    }
    setOperatorNote(selectedIncident.operatorNotes || '');
  }, [selectedIncidentId, selectedIncident?.assignedAgent, responders]);

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

  // Rank Responders for Selected Incident
  const rankedResponders = selectedIncident
    ? responders
        .map((r) => {
          const vLat = parseFloat(selectedIncident.latitude);
          const vLng = parseFloat(selectedIncident.longitude);
          const rLat = parseFloat(r.latitude);
          const rLng = parseFloat(r.longitude);
          const distKm = !isNaN(vLat) && !isNaN(vLng) && !isNaN(rLat) && !isNaN(rLng) ? calcDistKm(vLat, vLng, rLat, rLng) : 999;
          const estMins = Math.max(1, Math.round(distKm * 2.5));
          return { ...r, distKm, estMins };
        })
        .sort((a, b) => a.distKm - b.distKm)
    : [];

  // Assign Responder
  const handleAssignResponder = async (responder) => {
    if (!selectedIncident) return;
    try {
      const res = await fetch(apiUrl('/api/dashboard/assign-agent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId: selectedIncident.id,
          agentName: responder.name,
          agentPhone: responder.phone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchIncidents(true);
        fetchResponders();
        alert(`🚨 Emergency Alert Dispatched to ${responder.name}!\n\nOfficial Meta WhatsApp alert (+91 90806 85175) sent directly to ${responder.phone} with Victim Details & Live GPS Tracking link.`);
      }
    } catch (e) {
      alert('Error assigning agent');
    }
  };

  // Save Notes
  const handleSaveNote = async () => {
    if (!selectedIncidentId || !operatorNote.trim()) return;
    try {
      await fetch(apiUrl('/api/dashboard/add-note'), {
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
      await fetch(apiUrl(`/api/dashboard/resolve/${selectedIncidentId}`), { method: 'POST' });
      fetchIncidents(true);
      setSelectedIncidentId(null);
    } catch (_) {}
  };

  // Send Verification OTP to Agent's Phone
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    const clean = respPhone.replace(/\D/g, '').slice(-10);
    if (!clean || clean.length !== 10) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!respName.trim()) {
      alert('Please enter the agent name');
      return;
    }
    setIsSendingOtp(true);
    try {
      const res = await fetch(apiUrl('/api/dashboard/agents/send-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, name: respName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setDevOtp(data.devOtp || '');
        setAddAgentStep(2);
      } else {
        alert(data.message || 'Failed to dispatch verification OTP');
      }
    } catch (err) {
      alert('Network connection error: ' + err.message);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify OTP & Save Responder with Single-Use Invite Token
  const handleVerifyAndSaveResponder = async (e) => {
    if (e) e.preventDefault();
    if (!respOtp || respOtp.trim().length !== 6) {
      alert('Please enter the 6-digit verification code');
      return;
    }
    setIsSavingResponder(true);
    try {
      const res = await fetch(apiUrl('/api/dashboard/agents/verify-and-create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: respName.trim(),
          phone: respPhone.trim(),
          pin: respPin.trim(),
          area: respArea.trim(),
          vehicle: respVehicle,
          otp: respOtp.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setAddAgentStep(1);
        setRespOtp('');
        setDevOtp('');
        fetchResponders();
        setCreatedInviteInfo({
          name: data.agent?.name || respName,
          phone: data.agent?.phone || respPhone,
          pin: data.plainPin || respPin,
          dutyUrl: data.dutyUrl,
          waMeUrl: data.waMeUrl,
          inviteToken: data.inviteToken,
        });
        setRespName('');
        setRespPhone('');
        setRespArea('');
      } else {
        alert('Verification failed: ' + (data.message || 'Invalid OTP code'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setIsSavingResponder(false);
    }
  };

  // Filtered Incidents
  const filteredIncidents = incidents
    .filter((inc) => {
      if (filter === 'ACTIVE') return inc.status === 'DISPATCHED' || inc.status === 'ACTIVE';
      if (filter === 'ASSIGNED') return inc.status === 'ASSIGNED';
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
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            <span>Agents: <strong style={{ color: '#67E8F9' }}>{responders.length}</strong></span>
          </div>
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
            onClick={() => setShowAddModal(true)}
            style={{
              background: 'var(--green-soft)',
              borderColor: 'rgba(16, 185, 129, 0.4)',
              color: '#34D399',
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '700',
            }}
          >
            <Plus size={14} /> Add Agent
          </button>
          <button
            onClick={() => {
              const url = `${window.location.origin}/duty`;
              navigator.clipboard.writeText(url);
              alert('Duty Portal Link Copied:\n' + url);
            }}
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
            <Link2 size={14} /> Duty Link
          </button>
          <button
            onClick={() => setShowShiftSettingsModal(true)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: '#38BDF8',
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '700',
            }}
          >
            <Settings size={14} /> Shift: {shiftHours}h
          </button>
          <button
            onClick={() => setShowAgentsListModal(true)}
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
            🛡️ Agents ({responders.length})
          </button>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700' }}>{incidents.length}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '1px' }}>Total</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700', color: '#F87171' }}>{activeCount}</div>
                <div style={{ fontSize: '9px', color: '#F87171', textTransform: 'uppercase', marginTop: '1px' }}>Active</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700', color: '#FCD34D' }}>
                  {incidents.filter((i) => i.status === 'ASSIGNED').length}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '1px' }}>Assigned</div>
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
              {['ALL', 'ACTIVE', 'ASSIGNED', 'RESOLVED'].map((tab) => (
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
                const isAssigned = inc.status === 'ASSIGNED';
                const isSelected = selectedIncidentId === inc.id;

                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncidentId(inc.id)}
                    style={{
                      background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--red)' : 'var(--border)'}`,
                      borderLeft: isEmergency ? '3px solid var(--red)' : isAssigned ? '3px solid var(--amber)' : '3px solid var(--green)',
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
                          background: isEmergency ? 'var(--red-soft)' : isAssigned ? 'var(--amber-soft)' : 'var(--green-soft)',
                          color: isEmergency ? '#FCA5A5' : isAssigned ? '#FCD34D' : '#6EE7B7',
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
                      {inc.assignedAgent && (
                        <span style={{ fontSize: '9px', fontWeight: '600', padding: '1px 5px', borderRadius: '4px', background: 'var(--amber-soft)', color: '#FCD34D' }}>
                          👮 {inc.assignedAgent.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* MAP */}
        <main style={{ flex: 1, height: '100%', position: 'relative', background: '#0B0E14' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }}></div>
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

              {/* NEARBY AGENTS & DISPATCH */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Nearby Responders</span>
                  <span style={{ color: '#06B6D4' }}>{rankedResponders.length} Available</span>
                </div>

                {/* CURRENTLY ASSIGNED RESPONDER BANNER */}
                {selectedIncident.assignedAgent && (
                  <div style={{
                    background: selectedIncident.responderStatus === 'EN_ROUTE' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                    border: `1px solid ${selectedIncident.responderStatus === 'EN_ROUTE' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '10px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '800', color: selectedIncident.responderStatus === 'EN_ROUTE' ? '#34D399' : '#38BDF8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        ✓ ASSIGNED SAFETY RESPONDER
                      </span>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: '800',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        background: selectedIncident.responderStatus === 'EN_ROUTE' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                        color: selectedIncident.responderStatus === 'EN_ROUTE' ? '#34D399' : '#FBBF24',
                        border: `1px solid ${selectedIncident.responderStatus === 'EN_ROUTE' ? '#10B981' : '#F59E0B'}`,
                      }}>
                        {selectedIncident.responderStatus === 'EN_ROUTE' ? '🚀 EN ROUTE (CONFIRMED OK)' : '⏳ ALERT DISPATCHED'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#FFF' }}>
                      👮 {selectedIncident.assignedAgent}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {rankedResponders.slice(0, 4).map((r, idx) => {
                    const cleanPhone10 = r.phone ? r.phone.toString().replace(/\D/g, '').slice(-10) : '';
                    const isThisAssigned = selectedIncident?.assignedAgent && (
                      selectedIncident.assignedAgent.toLowerCase().includes(r.name.toLowerCase()) ||
                      (cleanPhone10 && selectedIncident.assignedAgent.includes(cleanPhone10))
                    );

                    return (
                      <div
                        key={r.id}
                        style={{
                          background: isThisAssigned ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-elevated)',
                          border: `1px solid ${isThisAssigned ? '#38BDF8' : idx === 0 ? 'rgba(6, 182, 212, 0.6)' : 'var(--border)'}`,
                          borderRadius: '8px',
                          padding: '8px 10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#FFF' }}>{r.name}</span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', fontWeight: '700', color: '#67E8F9' }}>
                            {r.distKm < 900 ? `${r.distKm.toFixed(1)} km (~${r.estMins}m)` : 'Standby'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
                          <span>📍 {r.area || 'Patrol Sector'}</span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>📞 {r.phone}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          {isThisAssigned ? (
                            selectedIncident.responderStatus === 'EN_ROUTE' ? (
                              <div
                                style={{
                                  flex: 1,
                                  padding: '7px',
                                  background: 'rgba(16, 185, 129, 0.22)',
                                  border: '1px solid #10B981',
                                  color: '#34D399',
                                  borderRadius: '5px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  textAlign: 'center',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                }}
                              >
                                <span>🚀</span> En Route to Scene (Confirmed OK)
                              </div>
                            ) : (
                              <div
                                style={{
                                  flex: 1,
                                  padding: '7px',
                                  background: 'rgba(56, 189, 248, 0.22)',
                                  border: '1px solid #38BDF8',
                                  color: '#38BDF8',
                                  borderRadius: '5px',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  textAlign: 'center',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                }}
                              >
                                <span>✓</span> Assigned & Alerted (Awaiting Acceptance)
                              </div>
                            )
                          ) : (
                            <button
                              onClick={() => handleAssignResponder(r)}
                              style={{
                                flex: 1,
                                padding: '6px',
                                background: selectedIncident.assignedAgent ? 'rgba(255, 255, 255, 0.08)' : 'var(--cyan)',
                                color: selectedIncident.assignedAgent ? '#E2E8F0' : '#000',
                                border: selectedIncident.assignedAgent ? '1px solid var(--border)' : 'none',
                                borderRadius: '5px',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'pointer',
                              }}
                            >
                              {selectedIncident.assignedAgent ? 'Re-assign & Alert' : 'Assign & Alert'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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

      {/* ADD AGENT MODAL WITH TWO-STEP OTP VERIFICATION */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '440px', maxWidth: '94vw', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.2)', border: '1px solid #38BDF8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                  🛡️
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#FFF' }}>
                    {addAgentStep === 1 ? 'Add & Verify Responder' : 'Confirm Phone OTP'}
                  </h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {addAgentStep === 1 ? 'Step 1 of 2: Responder Details' : 'Step 2 of 2: Authentic Mobile Number Check'}
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowAddModal(false); setAddAgentStep(1); setRespOtp(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {addAgentStep === 1 ? (
              /* STEP 1: Details & Send OTP */
              <form onSubmit={handleSendOtp}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-dim)', marginBottom: '5px', textTransform: 'uppercase' }}>Responder Name</label>
                  <input required type="text" placeholder="e.g. Karthik" value={respName} onChange={(e) => setRespName(e.target.value)} style={{ width: '100%', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: '#FFF', outline: 'none' }} />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-dim)', marginBottom: '5px', textTransform: 'uppercase' }}>Mobile Number (10 Digits)</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <span style={{ padding: '0 10px', fontSize: '13px', fontWeight: '700', color: '#38BDF8', background: 'rgba(56, 189, 248, 0.1)', borderRight: '1px solid var(--border)' }}>+91</span>
                    <input required type="tel" maxLength={10} placeholder="e.g. 9876543210" value={respPhone} onChange={(e) => setRespPhone(e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', padding: '9px 12px', fontSize: '14px', fontWeight: '700', color: '#FFF', outline: 'none' }} />
                  </div>
                </div>



                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-dim)', marginBottom: '5px', textTransform: 'uppercase' }}>Patrol Area / Station</label>
                  <input required type="text" placeholder="e.g. Central Sector / Sivakasi" value={respArea} onChange={(e) => setRespArea(e.target.value)} style={{ width: '100%', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: '#FFF', outline: 'none' }} />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-dim)', marginBottom: '5px', textTransform: 'uppercase' }}>Patrol Unit Vehicle</label>
                  <select value={respVehicle} onChange={(e) => setRespVehicle(e.target.value)} style={{ width: '100%', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: '#FFF', outline: 'none' }}>
                    <option value="Patrol Bike">🏍️ Rapid Response Patrol Bike</option>
                    <option value="Patrol Car">🚓 Emergency Safety Patrol Car</option>
                    <option value="Quick Response Team">🛡️ Tactical Response Unit</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '9px 16px', background: 'var(--bg-dark)', border: '1px solid var(--border)', color: '#FFF', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                  <button disabled={isSendingOtp} type="submit" style={{ padding: '9px 18px', background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)', border: 'none', color: '#FFF', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isSendingOtp ? '⏳ Sending OTP...' : 'Send Verification OTP 📲'}
                  </button>
                </div>
              </form>
            ) : (
              /* STEP 2: Confirm OTP & Issue 1-Time UUID Invite */
              <form onSubmit={handleVerifyAndSaveResponder}>
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>📲</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#FFF' }}>Verification Code Sent!</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>Sent to <strong style={{ color: '#38BDF8' }}>+91 {respPhone}</strong>. Ask responder for the 6-digit code.</div>
                  </div>
                </div>

                {devOtp && (
                  <div
                    onClick={() => setRespOtp(devOtp)}
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px dashed #10B981',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      marginBottom: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#34D399', fontWeight: '700' }}>💡 Demo/Testing Code: <strong>{devOtp}</strong></span>
                    <span style={{ fontSize: '10px', color: '#6EE7B7', textDecoration: 'underline' }}>Auto-Fill</span>
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', textAlign: 'center' }}>
                    Enter 6-Digit Verification Code
                  </label>
                  <input
                    required
                    autoFocus
                    type="text"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={respOtp}
                    onChange={(e) => setRespOtp(e.target.value.replace(/\D/g, ''))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-dark)',
                      border: '2px solid #38BDF8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '24px',
                      fontWeight: '900',
                      letterSpacing: '10px',
                      textAlign: 'center',
                      color: '#FFF',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setAddAgentStep(1)}
                    style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    ← Change Phone
                  </button>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      style={{ padding: '8px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', color: '#94A3B8', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Resend OTP
                    </button>
                    <button
                      disabled={isSavingResponder}
                      type="submit"
                      style={{
                        padding: '9px 18px',
                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        border: 'none',
                        color: '#FFF',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {isSavingResponder ? '⏳ Verifying...' : 'Verify & Dispatch 🚀'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CREATED INVITE SUCCESS MODAL (SINGLE-USE UUID LINK DISPLAY) */}
      {createdInviteInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '480px', maxWidth: '94vw', background: 'var(--bg-surface)', border: '1px solid #10B981', borderRadius: '18px', padding: '24px', boxShadow: '0 25px 60px rgba(16,185,129,0.25)' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', border: '2px solid #10B981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '8px' }}>
                ✅
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#FFF' }}>Responder Phone Verified!</h3>
              <p style={{ fontSize: '12px', color: '#94A3B8' }}>{createdInviteInfo.name} (+91 {createdInviteInfo.phone}) registered & 1-time invite created.</p>
            </div>

            <div style={{ background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: '700' }}>SECURITY PIN:</span>
                <span style={{ fontSize: '13px', color: '#38BDF8', fontWeight: '900', letterSpacing: '2px' }}>{createdInviteInfo.pin}</span>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: '700', display: 'block', marginBottom: '4px' }}>1-TIME ACTIVATION LINK (DEVICE LOCKED):</span>
                <div style={{ fontSize: '11px', color: '#E2E8F0', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '6px', wordBreak: 'break-all', fontFamily: 'JetBrains Mono, monospace' }}>
                  {createdInviteInfo.dutyUrl}
                </div>
              </div>
              <div style={{ fontSize: '10.5px', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span>🔒</span> Link is locked to 1 device upon acceptance and cannot be shared.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {createdInviteInfo.waMeUrl && (
                <a
                  href={createdInviteInfo.waMeUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '10px 16px',
                    background: '#25D366',
                    color: '#FFF',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '800',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  💬 Open in WhatsApp
                </a>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdInviteInfo.dutyUrl);
                  alert('1-Time Invite Link copied to clipboard!');
                }}
                style={{ padding: '10px 16px', background: 'var(--bg-dark)', border: '1px solid var(--border)', color: '#38BDF8', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
              >
                📋 Copy Link
              </button>
              <button
                onClick={() => setCreatedInviteInfo(null)}
                style={{ padding: '10px 16px', background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,0.4)', color: '#34D399', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT & GPS SETTINGS MODAL */}
      {showShiftSettingsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '450px', maxWidth: '94vw', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38BDF8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  ⚙️
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#FFF' }}>Shift & GPS Tracking Settings</h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Control responder duty duration & battery sync rate</p>
                </div>
              </div>
              <button onClick={() => setShowShiftSettingsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveDutySettings}>
              {/* Shift Duration Selection */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Default Shift Duration
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '10px' }}>
                  {[4, 8, 10, 12].map((hrs) => (
                    <button
                      type="button"
                      key={hrs}
                      onClick={() => setShiftHours(hrs)}
                      style={{
                        padding: '10px 0',
                        borderRadius: '8px',
                        border: `1px solid ${shiftHours === hrs ? '#38BDF8' : 'var(--border)'}`,
                        background: shiftHours === hrs ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-dark)',
                        color: shiftHours === hrs ? '#38BDF8' : '#FFF',
                        fontWeight: '800',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {hrs} Hours
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Custom Shift Hours:</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={shiftHours}
                    onChange={(e) => setShiftHours(parseInt(e.target.value) || 8)}
                    style={{ width: '60px', background: 'transparent', border: 'none', color: '#38BDF8', fontWeight: '800', fontSize: '14px', outline: 'none' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>hrs (Auto-ends duty afterwards)</span>
                </div>
              </div>

              {/* GPS Update Rate */}
              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  GPS Telemetry Sync Frequency
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { sec: 5, label: '5s (Ultra Live)' },
                    { sec: 10, label: '10s (Standard)' },
                    { sec: 30, label: '30s (Eco Saver)' },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.sec}
                      onClick={() => setGpsInterval(item.sec)}
                      style={{
                        padding: '10px 0',
                        borderRadius: '8px',
                        border: `1px solid ${gpsInterval === item.sec ? '#10B981' : 'var(--border)'}`,
                        background: gpsInterval === item.sec ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-dark)',
                        color: gpsInterval === item.sec ? '#34D399' : '#FFF',
                        fontWeight: '800',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowShiftSettingsModal(false)}
                  style={{ padding: '10px 16px', background: 'var(--bg-dark)', border: '1px solid var(--border)', color: '#FFF', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  disabled={isSavingSettings}
                  type="submit"
                  style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #0284C7, #0369A1)', border: 'none', color: '#FFF', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
                >
                  {isSavingSettings ? 'Saving...' : '💾 Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AGENTS & ON-DUTY MANAGEMENT MODAL */}
      {showAgentsListModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '640px', maxWidth: '94vw', maxHeight: '85vh', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  🛡️
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#FFF' }}>Field Responders ({responders.length})</h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Manage live shift statuses & emergency patrol units</p>
                </div>
              </div>
              <button onClick={() => setShowAgentsListModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {responders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
                  No agents registered yet. Click "+ Add Agent" to onboard with OTP.
                </div>
              ) : (
                responders.map((agent) => {
                  const isOnDuty = agent.duty_status === 'ON_DUTY' || agent.duty_status === 'AVAILABLE';
                  const isPending = agent.duty_status === 'PENDING_APPROVAL';

                  // Calculate remaining shift time if on duty
                  let remainingStr = '';
                  if (isOnDuty && agent.shift_expires_at) {
                    const diffMs = new Date(agent.shift_expires_at).getTime() - Date.now();
                    if (diffMs > 0) {
                      const hrs = Math.floor(diffMs / (3600 * 1000));
                      const mins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
                      remainingStr = `⏳ ${hrs}h ${mins}m left`;
                    } else {
                      remainingStr = '⏰ Shift Expired';
                    }
                  }

                  return (
                    <div
                      key={agent.id}
                      style={{
                        background: 'var(--bg-dark)',
                        border: `1px solid ${isOnDuty ? 'rgba(16, 185, 129, 0.4)' : isPending ? 'rgba(245, 158, 11, 0.4)' : 'var(--border)'}`,
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '800', color: '#FFF' }}>{agent.name}</span>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: '800',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: isOnDuty ? 'rgba(16, 185, 129, 0.15)' : isPending ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                              color: isOnDuty ? '#34D399' : isPending ? '#FBBF24' : '#94A3B8',
                              border: `1px solid ${isOnDuty ? '#10B981' : isPending ? '#F59E0B' : 'transparent'}`,
                            }}
                          >
                            {isOnDuty ? '🟢 ON DUTY' : isPending ? '🟡 PENDING APPROVAL' : '⚪ OFF DUTY'}
                          </span>
                          {remainingStr && (
                            <span style={{ fontSize: '10px', color: '#FBBF24', fontWeight: '700' }}>
                              {remainingStr}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'flex', gap: '12px' }}>
                          <span>📞 +91 {agent.phone}</span>
                          <span>📍 {agent.area || 'All Sectors'}</span>
                          <span>{agent.vehicle || 'Patrol Unit'}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setShowAgentsListModal(false);
                            const lat = parseFloat(agent.latitude);
                            const lng = parseFloat(agent.longitude);
                            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                              smoothFlyTo(lat, lng, 17);
                              const marker = responderMarkersRef.current.get(agent.id);
                              if (marker) marker.openTooltip();
                            } else {
                              alert(`📍 ${agent.name} is currently ON-DUTY.\nWaiting for GPS coordinates update from the device.`);
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(56, 189, 248, 0.15)',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            color: '#38BDF8',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <MapPin size={12} /> View on Map
                        </button>
                        {isOnDuty ? (
                          <button
                            onClick={() => handleEndAgentDuty(agent.id, agent.name)}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              color: '#F87171',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Power size={12} /> End Duty
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const dutyUrl = `${window.location.origin}/duty`;
                              navigator.clipboard.writeText(dutyUrl);
                              alert(`Duty portal link copied for ${agent.name}:\n${dutyUrl}`);
                            }}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              color: '#38BDF8',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: 'pointer',
                            }}
                          >
                            Copy Link
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                onClick={() => { setShowAgentsListModal(false); setShowAddModal(true); }}
                style={{ padding: '8px 14px', background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,0.4)', color: '#34D399', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} /> Add New Agent
              </button>
              <button
                onClick={() => setShowAgentsListModal(false)}
                style={{ padding: '8px 16px', background: 'var(--bg-dark)', border: '1px solid var(--border)', color: '#FFF', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div style={{ fontSize: '10px', opacity: 0.9 }}>Auto-Zooming Map & Dispatching Tactical Unit...</div>
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
                      mapInstanceRef.current.flyTo([emergencyAlertModal.lat, emergencyAlertModal.lng], 19, { animate: true, duration: 1.5 });
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

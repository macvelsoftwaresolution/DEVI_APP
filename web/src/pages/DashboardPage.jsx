import React, { useState, useEffect, useRef } from 'react';
import { adminFetch, getAdminToken, logoutAdmin, WS_URL } from '../config/api';
import { isActiveIncident } from '../utils/incidents';
import { playSirenTone, speakEmergencyAlert } from '../utils/alertSounds';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import IncidentSidebar from '../components/dashboard/IncidentSidebar';
import IncidentDrawer from '../components/dashboard/IncidentDrawer';
import EmergencyAlertBanner from '../components/dashboard/EmergencyAlertBanner';

export default function DashboardPage() {
  const [incidents, setIncidents] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [liveTime, setLiveTime] = useState('');
  const [emergencyAlertModal, setEmergencyAlertModal] = useState(null); // { id, name, phone, location, lat, lng }
  const [operatorNote, setOperatorNote] = useState('');

  const audioCtxRef = useRef(null);
  const prevActiveIdsRef = useRef(new Set());
  const initialLoadRef = useRef(true);
  const wsRef = useRef(null);
  // Latest selection, for callbacks created on mount (poll interval, WebSocket handlers)
  const selectedIdRef = useRef(null);
  useEffect(() => {
    selectedIdRef.current = selectedIncidentId;
  }, [selectedIncidentId]);

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

  // Siren + spoken announcement for a new SOS (respects the Sound ON/OFF toggle)
  const playSiren = (inc = null) => {
    if (!audioEnabled) return;
    try {
      playSirenTone(audioCtxRef);
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
        setIncidents(data.incidents);

        const currentActive = new Set();
        const isFirstLoad = initialLoadRef.current;
        if (isFirstLoad) {
          initialLoadRef.current = false;
        }

        data.incidents.forEach((inc) => {
          if (isActiveIncident(inc)) {
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
                location: inc.location || 'Location not available',
                lat,
                lng,
              });
              setSelectedIncidentId(inc.id);
            }
          }
        });
        prevActiveIdsRef.current = currentActive;

        // Read the ref: this function is also run from the mount-time poll and WebSocket handlers,
        // where selectedIncidentId is still the first render's value (null)
        if (!selectedIdRef.current && data.incidents.length > 0) {
          const activeOrAssigned = data.incidents.find((i) => isActiveIncident(i));
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

            if (msg.type === 'sos:new') {
              const alertData = msg.data;
              if (alertData) {
                const lat = parseFloat(alertData.latitude);
                const lng = parseFloat(alertData.longitude);
                playSiren(alertData);
                setEmergencyAlertModal({
                  id: alertData.id,
                  name: alertData.userName || alertData.user?.name || 'Emergency Victim',
                  phone: alertData.userPhone || alertData.user?.phone || 'N/A',
                  location: alertData.location || 'Location not available',
                  lat,
                  lng,
                });
                setSelectedIncidentId(alertData.id);
              }
              fetchIncidents(true);
            } else if (msg.type === 'incident:whatsapp' && msg.alertId) {
              setIncidents((prev) =>
                prev.map((inc) =>
                  String(inc.id) === String(msg.alertId) ? { ...inc, whatsapp: msg.whatsapp } : inc
                )
              );
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
              if (msg.alertId) {
                const targetId = String(msg.alertId);
                setIncidents((prev) =>
                  prev.map((inc) =>
                    String(inc.id) === targetId
                      ? { ...inc, status: 'RESOLVED' }
                      : inc
                  )
                );
              }
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
      if (filter === 'ACTIVE') return isActiveIncident(inc);
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

  const activeCount = incidents.filter((i) => isActiveIncident(i)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <DashboardHeader
        activeCount={activeCount}
        liveTime={liveTime}
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled(!audioEnabled)}
        onRefresh={() => fetchIncidents(true)}
      />

      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 60px)', overflow: 'hidden', position: 'relative' }}>
        <IncidentSidebar
          incidents={incidents}
          filteredIncidents={filteredIncidents}
          activeCount={activeCount}
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          selectedIncidentId={selectedIncidentId}
          onSelect={setSelectedIncidentId}
        />

        {/* Records only (no live map): the selected SOS fills the rest of the screen */}
        {selectedIncident ? (
          <IncidentDrawer
            incident={selectedIncident}
            note={operatorNote}
            onNoteChange={setOperatorNote}
            onSaveNote={handleSaveNote}
            onResolve={handleResolveIncident}
            onClose={() => setSelectedIncidentId(null)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
            Select an SOS record to see its details
          </div>
        )}
      </div>

      {emergencyAlertModal && (
        <EmergencyAlertBanner
          alert={emergencyAlertModal}
          onClose={() => setEmergencyAlertModal(null)}
        />
      )}
    </div>
  );
}

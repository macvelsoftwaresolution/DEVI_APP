import React, { useState, useEffect, useRef } from 'react';
import { Shield, LogOut, Navigation, Phone, CheckCircle, Radio, Bell } from 'lucide-react';
import { apiUrl, WS_URL } from '../config/api';

export default function DutyPage() {
  const [authToken, setAuthToken] = useState(localStorage.getItem('devi_responder_token') || '');
  const [currentAgent, setCurrentAgent] = useState(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);
  const [lastCoords, setLastCoords] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('Standby');

  // Login Form
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const watchIdRef = useRef(null);
  const syncIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sirenIntervalRef = useRef(null);
  const wakeLockRef = useRef(null);

  // Check Auth
  const checkAuth = async () => {
    const token = localStorage.getItem('devi_responder_token');
    if (!token) {
      setCurrentAgent(null);
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/dashboard/duty/me'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.agent) {
          setCurrentAgent(data.agent);
          if (data.hasAssignment && data.assignment) {
            showEmergency(data.assignment);
          }
          if (localStorage.getItem('devi_duty_active') === 'true') {
            startDuty(data.agent.id, token);
          }
          return;
        }
      }
    } catch (_) {}

    localStorage.removeItem('devi_responder_token');
    setCurrentAgent(null);
  };

  useEffect(() => {
    checkAuth();
    return () => {
      stopDuty();
    };
  }, []);

  // Login Handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const res = await fetch(apiUrl('/api/dashboard/duty/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone.trim(), pin: loginPin.trim() }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        localStorage.setItem('devi_responder_token', data.token);
        setAuthToken(data.token);
        setCurrentAgent(data.agent);
        checkAuth();
      } else {
        setLoginError(data.message || 'Login failed');
      }
    } catch (err) {
      setLoginError('Network connection error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout
  const handleLogout = () => {
    if (confirm('Are you sure you want to stop duty and sign out?')) {
      stopDuty();
      localStorage.removeItem('devi_responder_token');
      localStorage.removeItem('devi_duty_active');
      setAuthToken('');
      setCurrentAgent(null);
    }
  };

  // Siren
  const startSiren = () => {
    if (sirenIntervalRef.current) return;
    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      sirenIntervalRef.current = setInterval(() => {
        if (!audioCtxRef.current) return;
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(850, audioCtxRef.current.currentTime);
        osc.frequency.exponentialRampToValueAtTime(450, audioCtxRef.current.currentTime + 0.35);
        gain.gain.setValueAtTime(0.3, audioCtxRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.start();
        osc.stop(audioCtxRef.current.currentTime + 0.4);
      }, 800);
    } catch (_) {}
  };

  const stopSiren = () => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
  };

  const showEmergency = (assignment) => {
    setActiveAlert(assignment);
    startSiren();
  };

  const hideEmergency = () => {
    setActiveAlert(null);
    stopSiren();
  };

  // Toggle Duty
  const toggleDuty = () => {
    if (!isOnDuty) {
      startDuty(currentAgent?.id, authToken);
    } else {
      stopDuty();
    }
  };

  const startDuty = (agentId, token) => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsOnDuty(true);
    localStorage.setItem('devi_duty_active', 'true');

    // Acquire Screen WakeLock to prevent mobile screen from sleeping on-duty
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((lock) => {
        wakeLockRef.current = lock;
        console.log('🔒 Screen WakeLock active: Phone screen will stay awake.');
      }).catch((e) => console.warn('WakeLock error:', e));
    }

    // Notify backend
    if (agentId) {
      fetch(apiUrl(`/api/dashboard/agents/${agentId}/duty`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'AVAILABLE' }),
      }).catch(() => {});
    }

    // Watch position
    if (!watchIdRef.current) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy,
            speed: pos.coords.speed || 0,
            heading: pos.coords.heading || 0,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          };
          setLastCoords(coords);
          setGpsStatus('GPS Active');
          pushLocation(agentId, token, coords);
        },
        (err) => {
          console.warn('GPS error:', err.message);
          setGpsStatus('Searching...');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 4000 }
      );
    }

    // Periodic Push
    if (!syncIntervalRef.current) {
      syncIntervalRef.current = setInterval(() => {
        if (lastCoords) pushLocation(agentId, token, lastCoords);
      }, 5000);
    }

    // Periodic Check assignments
    if (!pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(apiUrl('/api/dashboard/duty/me'), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (data && data.hasAssignment && data.assignment) {
            showEmergency(data.assignment);
          } else {
            hideEmergency();
          }
        } catch (_) {}
      }, 3000);
    }
  };

  const stopDuty = () => {
    setIsOnDuty(false);
    localStorage.removeItem('devi_duty_active');
    setGpsStatus('Standby');
    stopSiren();

    if (wakeLockRef.current) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null;
      }).catch(() => {});
    }

    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (currentAgent?.id) {
      fetch(apiUrl(`/api/dashboard/agents/${currentAgent.id}/duty`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OFF_DUTY' }),
      }).catch(() => {});
    }
  };

  const pushLocation = (agentId, token, coords) => {
    if (!agentId) return;
    fetch(apiUrl(`/api/dashboard/agents/${agentId}/location`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        latitude: coords.lat,
        longitude: coords.lng,
        speed: coords.speed,
        heading: coords.heading,
        accuracy: coords.acc,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.hasAssignment && data.assignment) {
          showEmergency(data.assignment);
        }
      })
      .catch(() => {});
  };

  const handleMarkSafe = () => {
    if (!activeAlert?.id || activeAlert?.id === 'TEST_ALERT_101') {
      alert('✅ Mission Complete: Incident marked as Safe/Resolved!');
      hideEmergency();
      return;
    }

    fetch(apiUrl(`/api/dashboard/resolve/${activeAlert.id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Field responder arrived on scene. Victim secured.' }),
    })
      .then(() => {
        alert('✅ Mission Complete: Incident marked as Safe/Resolved!');
        hideEmergency();
      })
      .catch(() => hideEmergency());
  };

  // Test Simulation
  const simulateEmergency = () => {
    showEmergency({
      id: 'TEST_ALERT_101',
      userName: 'Deepa (Simulation Alert)',
      userPhone: '+91 9500238347',
      location: 'Anna Nagar Roundtana, Chennai',
      latitude: 13.085,
      longitude: 80.2101,
    });
  };

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '16px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', background: 'linear-gradient(135deg, #0284C7, #0369A1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            🛡️
          </div>
          <div>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '18px', fontWeight: '800' }}>DEVI Responder</h1>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Field Safety Duty Portal</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {currentAgent && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
                background: isOnDuty ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isOnDuty ? 'var(--green)' : 'var(--border)'}`,
                color: isOnDuty ? '#34D399' : 'var(--text-dim)',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnDuty ? 'var(--green)' : 'var(--text-dim)', animation: isOnDuty ? 'pulse 1.5s infinite' : 'none' }}></span>
              <span>{isOnDuty ? 'ONLINE' : 'OFF DUTY'}</span>
            </div>
          )}

          {currentAgent && (
            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#FCA5A5',
                padding: '6px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <LogOut size={13} /> Logout
            </button>
          )}
        </div>
      </header>

      {/* LOGIN VIEW */}
      {!currentAgent ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '26px 20px', textAlign: 'center', marginTop: '10px' }}>
          <div style={{ width: '58px', height: '58px', margin: '0 auto 14px auto', background: 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(2, 132, 199, 0.3)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
            👮
          </div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '20px', fontWeight: '800', marginBottom: '6px' }}>Field Responder Sign In</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '22px' }}>Enter your registered mobile number and 4-digit security PIN to access the Duty & Live Dispatch Network.</p>

          {loginError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--red)', color: '#FCA5A5', padding: '10px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px', fontWeight: '600', textAlign: 'left' }}>
              ❌ {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>REGISTERED MOBILE NUMBER</label>
              <input
                type="tel"
                required
                placeholder="e.g. 9876543210"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                style={{ width: '100%', padding: '13px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '12px', color: '#FFF', fontSize: '15px', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>4-DIGIT SECURITY PIN</label>
              <input
                type="password"
                required
                maxLength={6}
                placeholder="••••"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value)}
                style={{ width: '100%', padding: '13px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '12px', color: '#FFF', fontSize: '18px', letterSpacing: '6px', outline: 'none' }}
              />
            </div>

            <button
              disabled={isLoggingIn}
              type="submit"
              style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)', color: '#FFF', border: 'none', borderRadius: '12px', fontWeight: '800', fontSize: '15px', cursor: 'pointer', marginTop: '8px' }}
            >
              {isLoggingIn ? 'Verifying PIN...' : 'SIGN IN TO DUTY'}
            </button>
          </form>
        </div>
      ) : (
        /* AUTHENTICATED PORTAL */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* RESPONDER PROFILE */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '46px', height: '46px', background: 'rgba(56, 189, 248, 0.2)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                👮
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--blue)', textTransform: 'uppercase' }}>ASSIGNED FIELD RESPONDER</div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#FFF' }}>{currentAgent.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📍 {currentAgent.area || 'Patrol Sector'} • 📞 {currentAgent.phone}</div>
              </div>
            </div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#34D399', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px 10px', borderRadius: '8px' }}>
              VERIFIED
            </div>
          </div>

          {/* ACTIVE SOS DISPATCH CARD */}
          {activeAlert && (
            <div style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.22) 0%, rgba(185, 28, 28, 0.18) 100%)', border: '2px solid var(--red)', borderRadius: '18px', padding: '18px 16px', animation: 'pulse 1.4s infinite ease-in-out' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(239, 68, 68, 0.3)', paddingBottom: '10px', marginBottom: '12px' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '16px', fontWeight: '800', color: '#F87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🚨</span> EMERGENCY SOS ASSIGNED!
                </div>
                <span style={{ background: 'var(--red)', color: '#FFF', fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '6px' }}>PRIORITY P1</span>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '12px', padding: '12px', marginBottom: '12px', fontSize: '13px', lineHeight: '1.6' }}>
                <div><strong>Victim:</strong> <span style={{ fontWeight: '700', color: '#FFF' }}>{activeAlert.userName || activeAlert.victimName || 'Victim'}</span></div>
                <div><strong>Mobile:</strong> <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--blue)', fontWeight: '700' }}>{activeAlert.userPhone || activeAlert.phone}</span></div>
                <div><strong>Location:</strong> <span>{activeAlert.location || activeAlert.address || 'GPS Location'}</span></div>
              </div>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${activeAlert.latitude || 13.0827},${activeAlert.longitude || 80.2707}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', background: 'linear-gradient(135deg, #EF4444, #DC2626)', color: '#FFF', padding: '14px', borderRadius: '12px', fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '15px', textDecoration: 'none', marginBottom: '8px' }}
              >
                🧭 OPEN GOOGLE MAPS NAVIGATION
              </a>

              <div style={{ display: 'flex', gap: '8px' }}>
                <a href={`tel:${activeAlert.userPhone || activeAlert.phone}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#38BDF8', padding: '11px', borderRadius: '10px', fontWeight: '700', fontSize: '13px', textDecoration: 'none' }}>
                  <Phone size={14} /> Call Victim
                </a>
                <button onClick={handleMarkSafe} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid var(--green)', color: '#34D399', padding: '11px', borderRadius: '10px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                  <CheckCircle size={14} /> Mark Reached
                </button>
              </div>
            </div>
          )}

          {/* STANDBY RADAR CARD */}
          {!activeAlert && (
            <div style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: '16px', padding: '18px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>📡</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>Sector Radar Active — No Live Emergencies</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>When a victim triggers SOS near you, emergency siren & Google Maps direction will pop up here instantly.</div>
            </div>
          )}

          {/* BIG DUTY TOGGLE */}
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <button
              onClick={toggleDuty}
              style={{
                width: '100%',
                minHeight: '115px',
                borderRadius: '20px',
                border: `2px solid ${isOnDuty ? 'rgba(16, 185, 129, 0.8)' : 'rgba(255, 255, 255, 0.12)'}`,
                background: isOnDuty ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.35) 0%, rgba(5, 150, 105, 0.25) 100%)' : 'rgba(255, 255, 255, 0.04)',
                color: '#FFF',
                fontFamily: 'Outfit, sans-serif',
                fontSize: '20px',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: isOnDuty ? '0 0 35px rgba(16, 185, 129, 0.4)' : 'none',
                transition: 'all 0.3s',
              }}
            >
              <div style={{ fontSize: '26px' }}>{isOnDuty ? '🟢' : '⚪'}</div>
              <div>{isOnDuty ? 'ON DUTY (ACTIVE)' : 'START ON-DUTY'}</div>
              <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>
                {isOnDuty ? 'Streaming Live GPS to Command Center · Tap to Stop' : 'Tap to start sharing live GPS with Control Room'}
              </div>
            </button>
          </div>

          {/* GPS METRICS */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-dim)', textTransform: 'uppercase' }}>LIVE GPS STREAM</span>
              <span style={{ fontSize: '10px', fontWeight: '800', color: isOnDuty ? '#34D399' : 'var(--text-dim)' }}>{gpsStatus}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'var(--bg-darkest)', padding: '8px 10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>LATITUDE</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: '700' }}>{lastCoords?.lat.toFixed(5) || '--'}</div>
              </div>
              <div style={{ background: 'var(--bg-darkest)', padding: '8px 10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>LONGITUDE</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: '700' }}>{lastCoords?.lng.toFixed(5) || '--'}</div>
              </div>
              <div style={{ background: 'var(--bg-darkest)', padding: '8px 10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>ACCURACY</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: '700' }}>{lastCoords ? `${Math.round(lastCoords.acc)} m` : '--'}</div>
              </div>
              <div style={{ background: 'var(--bg-darkest)', padding: '8px 10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>LAST SYNC</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: '700' }}>{lastCoords?.time || '--'}</div>
              </div>
            </div>
          </div>

          {/* SIMULATE TEST BUTTON */}
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <button
              onClick={simulateEmergency}
              style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)', color: 'var(--text-dim)', fontSize: '11px', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer' }}
            >
              🔔 Test Alert Popup & Audio Siren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

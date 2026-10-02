import React, { useState, useEffect, useRef } from 'react';
import { Shield, LogOut, Navigation, Phone, CheckCircle, Radio, Bell, Lock, XCircle, AlertTriangle, ArrowRight, Smartphone, MapPin, Download } from 'lucide-react';
import { apiUrl, WS_URL } from '../config/api';

export default function DutyPage() {
  const [authToken, setAuthToken] = useState(localStorage.getItem('devi_responder_token') || '');
  const [currentAgent, setCurrentAgent] = useState(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);
  const [lastCoords, setLastCoords] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('Standby');
  const [isAcceptingMission, setIsAcceptingMission] = useState(false);
  const [missionAccepted, setMissionAccepted] = useState(false);

  // Invite Flow State (?invite=<uuid>)
  const [inviteToken, setInviteToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('invite') || params.get('token') || '';
  });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [inviteError, setInviteError] = useState(null);
  const [inviteDeclined, setInviteDeclined] = useState(false);
  const [isRespondingInvite, setIsRespondingInvite] = useState(false);

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
  const audioKeepAliveRef = useRef(null);

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
    } catch (_) { }

    localStorage.removeItem('devi_responder_token');
    setCurrentAgent(null);
  };

  // Verify Invite Token on Mount
  useEffect(() => {
    if (inviteToken) {
      const verifyInvite = async () => {
        setInviteLoading(true);
        setInviteError(null);
        try {
          const res = await fetch(apiUrl(`/api/dashboard/duty/invite/${inviteToken}`));
          const data = await res.json();
          if (data.success && data.invite) {
            setInviteData(data.invite);
          } else {
            setInviteError(data.message || 'Invitation is invalid or has expired.');
          }
        } catch (err) {
          setInviteError('Failed to connect to verification server. Please check internet.');
        } finally {
          setInviteLoading(false);
        }
      };
      verifyInvite();
    } else {
      checkAuth();
    }
    return () => {
      stopDuty();
    };
  }, [inviteToken]);

  // Handle Respond to Invite (APPROVE or REJECT)
  const handleRespondInvite = async (action) => {
    if (!inviteToken) return;
    setIsRespondingInvite(true);
    try {
      const deviceFingerprint = `${navigator.userAgent}_${screen.width}x${screen.height}`;
      const res = await fetch(apiUrl('/api/dashboard/duty/invite/respond'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          action,
          deviceFingerprint,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (action === 'APPROVE') {
          localStorage.setItem('devi_responder_token', data.token);
          setAuthToken(data.token);
          setCurrentAgent(data.agent);
          setInviteData(null);
          setInviteToken('');
          window.history.replaceState({}, document.title, window.location.pathname);
          startDuty(data.agent.id, data.token);
        } else {
          setInviteDeclined(true);
          setInviteData(null);
        }
      } else {
        alert(data.message || 'Could not process invitation');
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setIsRespondingInvite(false);
    }
  };

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
    } catch (_) { }
  };

  const stopSiren = () => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
  };

  const showEmergency = (assignment) => {
    setActiveAlert(assignment);
    if (assignment?.responderStatus === 'EN_ROUTE') {
      setMissionAccepted(true);
      stopSiren();
    } else {
      setMissionAccepted(false);
      startSiren();
    }
  };

  const hideEmergency = () => {
    setActiveAlert(null);
    setMissionAccepted(false);
    stopSiren();
  };

  const handleAcceptMission = async () => {
    if (!activeAlert?.id || !currentAgent?.id) return;
    setIsAcceptingMission(true);
    try {
      const res = await fetch(apiUrl(`/api/dashboard/agents/${currentAgent.id}/accept-assignment`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ alertId: activeAlert.id }),
      });
      const data = await res.json();
      if (data.success) {
        setMissionAccepted(true);
        stopSiren();
      }
    } catch (err) {
      console.warn('Accept mission error:', err);
    } finally {
      setIsAcceptingMission(false);
    }
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

    // Start silent audio keep-alive (keeps mobile browser process alive in pocket)
    try {
      if (!audioKeepAliveRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.00001; // Silent inaudible carrier wave
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          audioKeepAliveRef.current = { ctx, osc };
          console.log('📻 Background Audio Keep-Alive active.');
        }
      }
    } catch (_) {}

    // Notify backend
    if (agentId) {
      fetch(apiUrl(`/api/dashboard/agents/${agentId}/duty`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'AVAILABLE' }),
      }).catch(() => { });
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
          if (err.code === 1) {
            setGpsStatus('⚠️ Permission Denied (Allow location in browser)');
          } else if (err.code === 2) {
            setGpsStatus('⚠️ GPS Disabled (Turn on GPS in phone settings)');
          } else {
            setGpsStatus('Searching GPS...');
          }
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
        } catch (_) { }
      }, 3000);
    }
  };

  const stopDuty = () => {
    setIsOnDuty(false);
    localStorage.removeItem('devi_duty_active');
    setGpsStatus('Standby');
    stopSiren();

    if (audioKeepAliveRef.current) {
      try {
        audioKeepAliveRef.current.osc.stop();
        audioKeepAliveRef.current.ctx.close();
      } catch (_) {}
      audioKeepAliveRef.current = null;
    }

    if (wakeLockRef.current) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null;
      }).catch(() => { });
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
      }).catch(() => { });
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
      .catch(() => { });
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

      {/* 1. INVITE FLOW (ALWAYS DISPLAYED WHEN inviteToken IS PRESENT IN URL) */}
      {inviteToken ? (
        <>
          {/* INVITE FLOW: LOADING STATE */}
          {inviteLoading && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '36px 20px', textAlign: 'center', marginTop: '10px' }}>
              <div style={{ width: '48px', height: '48px', margin: '0 auto 16px auto', border: '3px solid rgba(56, 189, 248, 0.2)', borderTop: '3px solid #38BDF8', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Verifying Security Credentials...</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Validating your single-use UUID responder authorization token.</p>
            </div>
          )}

          {/* INVITE FLOW: ERROR OR ALREADY CLAIMED */}
          {!inviteLoading && inviteError && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '18px', padding: '28px 20px', textAlign: 'center', marginTop: '10px' }}>
              <div style={{ width: '60px', height: '60px', margin: '0 auto 14px auto', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={30} color="#F87171" />
              </div>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '20px', fontWeight: '800', color: '#FCA5A5', marginBottom: '8px' }}>Access Restricted / Link Expired</h2>
              <p style={{ fontSize: '13px', color: '#CBD5E1', lineHeight: '1.6', marginBottom: '18px' }}>
                {inviteError}
              </p>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: '10px', padding: '12px', fontSize: '11px', color: 'var(--text-dim)', textAlign: 'left', marginBottom: '20px' }}>
                ⚠️ <strong>Security Notice:</strong> DEVI Emergency Responder links are strictly locked to 1 device upon registration and cannot be forwarded, reused, or shared.
              </div>
              <button
                onClick={() => {
                  setInviteToken('');
                  setInviteError(null);
                  window.history.replaceState({}, document.title, window.location.pathname);
                }}
                style={{ width: '100%', padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', color: '#38BDF8', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              >
                ← Sign In with Phone & PIN
              </button>
            </div>
          )}

          {/* INVITE FLOW: DECLINED SCREEN */}
          {!inviteLoading && inviteDeclined && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '28px 20px', textAlign: 'center', marginTop: '10px' }}>
              <div style={{ width: '60px', height: '60px', margin: '0 auto 14px auto', background: 'rgba(148, 163, 184, 0.15)', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <XCircle size={30} color="#94A3B8" />
              </div>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '8px' }}>Duty Assignment Declined</h2>
              <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: '1.6', marginBottom: '20px' }}>
                You have declined this emergency responder duty. The Control Room has been notified to re-route nearby calls to alternate personnel.
              </p>
              <button
                onClick={() => {
                  setInviteDeclined(false);
                  setInviteToken('');
                  window.history.replaceState({}, document.title, window.location.pathname);
                }}
                style={{ width: '100%', padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', color: '#FFF', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
              >
                Return to Sign In
              </button>
            </div>
          )}

          {/* INVITE FLOW: APPROVE OR REJECT CONSENT SCREEN */}
          {!inviteLoading && !inviteError && !inviteDeclined && inviteData && (
            <div style={{ background: 'var(--bg-surface)', border: '2px solid rgba(56, 189, 248, 0.4)', borderRadius: '20px', padding: '24px 20px', textAlign: 'center', marginTop: '10px', boxShadow: '0 15px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38BDF8', fontSize: '10px', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase', padding: '5px 12px', borderRadius: '20px', marginBottom: '16px' }}>
                <Shield size={12} /> OFFICIAL DISPATCH AUTHORIZATION
              </div>

              <div style={{ width: '64px', height: '64px', margin: '0 auto 12px auto', background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(3, 105, 161, 0.15))', border: '2px solid #0284C7', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px' }}>
                👮
              </div>

              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '22px', fontWeight: '900', color: '#FFF', marginBottom: '4px' }}>
                {inviteData.name}
              </h2>
              <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '18px' }}>
                Emergency Safety Responder Invitation
              </p>

              {/* Details Card */}
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', textAlign: 'left', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: '700' }}>REGISTERED MOBILE</span>
                  <span style={{ fontSize: '13px', color: '#38BDF8', fontWeight: '800', fontFamily: 'JetBrains Mono, monospace' }}>+91 {inviteData.phone}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: '700' }}>ASSIGNED PATROL SECTOR</span>
                  <span style={{ fontSize: '13px', color: '#FFF', fontWeight: '700' }}>📍 {inviteData.area || 'City Safety Zone'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: '700' }}>SECURITY STATUS</span>
                  <span style={{ fontSize: '11px', color: '#34D399', fontWeight: '800', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: '6px' }}>OTP VERIFIED</span>
                </div>
              </div>

              {/* Protocols Notice */}
              <div style={{ background: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: '12px', padding: '12px', textAlign: 'left', marginBottom: '22px', fontSize: '11.5px', color: '#CBD5E1', lineHeight: '1.6' }}>
                <div style={{ fontWeight: '800', color: '#38BDF8', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={13} /> Anti-Sharing & Security Protocol:
                </div>
                • Approving locks this duty access strictly to <strong>this phone/browser</strong>.<br />
                • <strong>Cannot be forwarded:</strong> Once claimed, this link is permanently invalidated.<br />
                • High-priority emergency alerts and turn-by-turn routing will activate immediately.
              </div>

              {/* Action Buttons: APPROVE vs REJECT */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  disabled={isRespondingInvite}
                  onClick={() => handleRespondInvite('APPROVE')}
                  style={{
                    width: '100%',
                    padding: '16px',
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '14px',
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: '900',
                    fontSize: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)',
                  }}
                >
                  <CheckCircle size={20} /> {isRespondingInvite ? 'Activating Duty...' : '✅ APPROVE & START DUTY'}
                </button>

                <button
                  disabled={isRespondingInvite}
                  onClick={() => {
                    if (confirm('Are you sure you want to decline this duty assignment? The Control Room will be informed.')) {
                      handleRespondInvite('REJECT');
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#F87171',
                    borderRadius: '12px',
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <XCircle size={15} /> ❌ DECLINE / REJECT
                </button>
              </div>
            </div>
          )}
        </>
      ) : !currentAgent ? (
        /* 2. FIELD RESPONDER SIGN IN FORM */
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
        /* AUTHENTICATED ON-DUTY ACTIVE SCREEN (MINIMAL & RUNNING IN BACKGROUND) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* ACTIVE SOS DISPATCH CARD (POPS UP IF EMERGENCY SOS OCCURS) */}
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

              {/* MISSION ACCEPTANCE BUTTON */}
              {!missionAccepted ? (
                <button
                  disabled={isAcceptingMission}
                  onClick={handleAcceptMission}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '12px',
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: '800',
                    fontSize: '15px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                    marginBottom: '10px',
                  }}
                >
                  <CheckCircle size={18} /> {isAcceptingMission ? 'Confirming...' : '✅ OK, ACCEPT MISSION (I AM EN ROUTE)'}
                </button>
              ) : (
                <div
                  style={{
                    width: '100%',
                    padding: '11px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid #10B981',
                    borderRadius: '12px',
                    color: '#34D399',
                    fontSize: '13px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}
                >
                  <span>✓</span> MISSION ACCEPTED — EN ROUTE TO SCENE
                </div>
              )}

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

          {/* CLEAN ON-DUTY ACTIVE CONFIRMATION CARD (NO CLUTTERED DASHBOARD) */}
          {!activeAlert && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '20px', padding: '32px 20px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div style={{ width: '74px', height: '74px', margin: '0 auto 16px auto', borderRadius: '50%', background: 'radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.05) 70%)', border: '2px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                🟢
              </div>

              <div style={{ display: 'inline-block', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', color: '#34D399', fontSize: '11px', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase', padding: '4px 14px', borderRadius: '20px', marginBottom: '12px' }}>
                DUTY APPROVED & ACTIVE
              </div>

              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '22px', fontWeight: '900', color: '#FFF', marginBottom: '6px' }}>
                {currentAgent.name}
              </h2>
              <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>
                Patrol Sector: <strong style={{ color: '#FFF' }}>{currentAgent.area || 'Active Zone'}</strong>
              </p>

              {/* Status info box */}
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', textAlign: 'left', marginBottom: '20px', fontSize: '12px', lineHeight: '1.7', color: '#CBD5E1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38BDF8', fontWeight: '800', marginBottom: '6px' }}>
                  <span>📡</span> Background Live Location Streaming:
                </div>
                • Live GPS location is active and syncing in the background.<br />
                • When an emergency SOS occurs, <strong>you will receive an instant WhatsApp alert with Google Maps navigation!</strong><br />
                • You can minimize this browser tab and keep using your phone.
              </div>

              {/* GPS status pill */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', marginBottom: '22px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-dim)', fontWeight: '700' }}>GPS Status:</span>
                <span style={{ color: '#34D399', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', animation: 'pulse 1.5s infinite' }}></span>
                  {gpsStatus} {lastCoords ? `(${Math.round(lastCoords.acc)}m accuracy)` : ''}
                </span>
              </div>

              {/* Download DEVI Responder Mobile APK */}
              <div style={{ marginBottom: '16px' }}>
                <a
                  href="/downloads/devi-responder.apk"
                  download="DEVI-Responder.apk"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '13px 14px',
                    background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.22) 0%, rgba(3, 105, 161, 0.18) 100%)',
                    border: '1px solid #38BDF8',
                    color: '#38BDF8',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: '800',
                    textDecoration: 'none',
                    textAlign: 'center',
                    boxShadow: '0 4px 14px rgba(56, 189, 248, 0.12)',
                  }}
                >
                  <Download size={16} /> 📥 Download DEVI Responder App (APK)
                </a>
                <p style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '6px', textAlign: 'center' }}>
                  Install on Android for 24/7 locked-in-pocket tracking with persistent notification
                </p>
              </div>

              {/* Exit Duty button */}
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#FCA5A5',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <LogOut size={15} /> 🛑 Stop Duty & Exit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

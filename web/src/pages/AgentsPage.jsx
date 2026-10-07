import React, { useState, useEffect } from 'react';
import { Shield, Search, UserCheck, Power, Clock, Plus, Phone, MapPin, Radio, X, Copy, ExternalLink, Key } from 'lucide-react';
import { apiUrl } from '../config/api';

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');

  // Add Agent State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAgentStep, setAddAgentStep] = useState(1);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isSavingResponder, setIsSavingResponder] = useState(false);

  const generateRandomPin = () => Math.floor(1000 + Math.random() * 9000).toString();
  const [respName, setRespName] = useState('');
  const [respPhone, setRespPhone] = useState('');
  const [respPin, setRespPin] = useState(generateRandomPin());
  const [respArea, setRespArea] = useState('');
  const [respVehicle, setRespVehicle] = useState('Motorcycle');
  const [respOtp, setRespOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');

  const [createdInviteInfo, setCreatedInviteInfo] = useState(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch(apiUrl('/api/dashboard/agents'));
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.agents)) {
          setAgents(data.agents);
        } else if (Array.isArray(data)) {
          setAgents(data);
        }
      }
    } catch (e) {
      console.warn('Fetch agents error:', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusDetails = (status) => {
    const s = String(status).toUpperCase();
    if (s === 'EN_ROUTE' || s === 'DISPATCHED') {
      return { text: 'EN-ROUTE', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
    }
    if (s === 'ON_DUTY' || s === 'AVAILABLE' || s === 'ACTIVE') {
      return { text: 'ON-DUTY', color: '#0EA5E9', bg: 'rgba(14, 165, 233, 0.15)' };
    }
    if (s === 'PENDING_APPROVAL' || s === 'PENDING') {
      return { text: 'PENDING', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
    }
    return { text: 'OFF-DUTY', color: '#64748B', bg: 'rgba(100, 116, 139, 0.15)' };
  };

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
      alert('Network error: ' + err.message);
    } finally {
      setIsSendingOtp(false);
    }
  };

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
        fetchAgents(); // Refresh the list
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
        setRespPin(generateRandomPin());
      } else {
        alert('Verification failed: ' + (data.message || 'Invalid OTP code'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setIsSavingResponder(false);
    }
  };

  const filteredAgents = agents.filter(agent => {
    const query = searchQuery.toLowerCase();
    const matchSearch =
      (agent.name && agent.name.toLowerCase().includes(query)) ||
      (agent.phone && agent.phone.includes(query)) ||
      (agent.area && agent.area.toLowerCase().includes(query));

    const s = String(agent.duty_status || agent.status || '').toUpperCase();
    let matchTab = true;
    if (activeTab === 'ON_DUTY') matchTab = (s === 'ON_DUTY' || s === 'AVAILABLE' || s === 'ACTIVE');
    if (activeTab === 'OFF_DUTY') matchTab = (s === 'OFF_DUTY' || s === '');
    if (activeTab === 'EN_ROUTE') matchTab = (s === 'EN_ROUTE' || s === 'DISPATCHED');
    if (activeTab === 'PENDING') matchTab = (s === 'PENDING_APPROVAL' || s === 'PENDING');

    return matchSearch && matchTab;
  });

  return (
    <div style={{ flex: 1, height: '100vh', display: 'flex', flexDirection: 'column', background: '#0B0E14', color: '#FFF', fontFamily: '"Inter", sans-serif' }}>

      {/* Header */}
      <header style={{ padding: '24px 32px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.15)', border: '1px solid #0EA5E9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={24} color="#38BDF8" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: '#FFF' }}>Field Responders</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-dim)' }}>Manage your emergency response fleet across all active zones</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{ padding: '10px 20px', background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,0.4)', color: '#34D399', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <Plus size={16} /> Add Agent
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>

        {/* Controls Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>

          <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-dark)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            {['ALL', 'ON_DUTY', 'EN_ROUTE', 'OFF_DUTY'].map(tab => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 16px',
                    background: isActive ? 'var(--bg-surface)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    color: isActive ? '#FFF' : 'var(--text-dim)',
                    fontSize: '13px',
                    fontWeight: isActive ? '700' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.2)' : 'none'
                  }}
                >
                  {tab.replace('_', ' ')}
                </button>
              );
            })}
          </div>

          <div style={{ position: 'relative', width: '320px' }}>
            <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by name, area, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 42px',
                background: 'var(--bg-dark)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                color: '#FFF',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-dim)' }}>Loading Agents...</div>
        ) : filteredAgents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '100px', background: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: '16px' }}>
            <UserCheck size={48} color="var(--border)" style={{ marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#FFF' }}>No Agents Found</h3>
            <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '14px' }}>Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {filteredAgents.map(agent => {
              const status = getStatusDetails(agent.duty_status || agent.status);
              return (
                <div key={agent.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.4)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-dark)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <UserCheck size={20} color="var(--text-dim)" />
                      </div>
                      <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '700', color: '#FFF' }}>{agent.name}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-dim)', fontSize: '12px' }}>
                          <Phone size={12} /> {agent.phone}
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '6px 12px', borderRadius: '20px', background: status.bg, color: status.color, fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.color }} />
                      {status.text}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: 'var(--bg-dark)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <MapPin size={14} color="#94A3B8" style={{ marginTop: '2px' }} />
                      <span style={{ fontSize: '13px', color: '#E2E8F0', lineHeight: '1.4' }}>{agent.area || 'No assigned area'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Radio size={14} color="#94A3B8" />
                      <span style={{ fontSize: '13px', color: '#94A3B8' }}>{agent.vehicle || 'Unknown Vehicle'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Last active: just now</span>
                    <button style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>View Details &rarr;</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Neat ADD AGENT Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '480px', maxWidth: '94vw', background: '#0F172A', border: '1px solid #1E293B', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38BDF8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38BDF8' }}>
                  <UserCheck size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#FFF', margin: 0 }}>
                    {addAgentStep === 1 ? 'Add New Responder' : 'Confirm Phone OTP'}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#94A3B8', margin: '4px 0 0 0' }}>
                    {addAgentStep === 1 ? 'Enter agent details to generate invite' : 'Verification code sent via SMS'}
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowAddModal(false); setAddAgentStep(1); setRespOtp(''); }} style={{ background: 'var(--bg-dark)', border: 'none', color: 'var(--text-dim)', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#334155'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-dark)'}>
                <X size={16} />
              </button>
            </div>

            {addAgentStep === 1 ? (
              <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94A3B8', marginBottom: '8px' }}>FULL NAME</label>
                    <input required type="text" placeholder="e.g. Karthik" value={respName} onChange={e => setRespName(e.target.value)} style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', color: '#FFF', outline: 'none', transition: 'border 0.2s' }} onFocus={e => e.currentTarget.style.border = '1px solid #38BDF8'} onBlur={e => e.currentTarget.style.border = '1px solid #334155'} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94A3B8', marginBottom: '8px' }}>MOBILE NUMBER</label>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#1E293B', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
                      <span style={{ padding: '0 12px', fontSize: '14px', fontWeight: '700', color: '#38BDF8', borderRight: '1px solid #334155' }}>+91</span>
                      <input required type="tel" maxLength={10} placeholder="9876543210" value={respPhone} onChange={e => setRespPhone(e.target.value)} style={{ width: '100%', background: 'transparent', border: 'none', padding: '12px', fontSize: '14px', color: '#FFF', outline: 'none' }} />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94A3B8', marginBottom: '8px' }}>ASSIGNED AREA / ZONE</label>
                  <input type="text" placeholder="e.g. Anna Nagar West" value={respArea} onChange={e => setRespArea(e.target.value)} style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', color: '#FFF', outline: 'none' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94A3B8', marginBottom: '8px' }}>VEHICLE TYPE</label>
                    <select value={respVehicle} onChange={e => setRespVehicle(e.target.value)} style={{ width: '100%', background: '#1E293B', border: '1px solid #334155', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', color: '#FFF', outline: 'none', cursor: 'pointer' }}>
                      <option value="Motorcycle">🏍️ Motorcycle</option>
                      <option value="Car">🚗 Car (Patrol)</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8' }}>APP LOGIN PIN</label>
                      <button type="button" onClick={() => setRespPin(generateRandomPin())} style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '12px', cursor: 'pointer', padding: 0 }}>Regenerate</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#1E293B', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
                      <span style={{ padding: '0 12px', color: '#94A3B8', borderRight: '1px solid #334155' }}><Key size={16} /></span>
                      <input type="text" value={respPin} readOnly style={{ width: '100%', background: 'transparent', border: 'none', padding: '12px', fontSize: '16px', fontWeight: '800', letterSpacing: '4px', color: '#34D399', outline: 'none' }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                  <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '12px 24px', background: 'transparent', border: 'none', color: '#94A3B8', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                  <button disabled={isSendingOtp} type="submit" style={{ padding: '12px 24px', background: '#0284C7', border: 'none', color: '#FFF', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)' }}>
                    {isSendingOtp ? 'Sending...' : 'Send OTP \u2192'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyAndSaveResponder} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '24px' }}>💬</div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#FFF' }}>Verification Code Sent!</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>Sent to <strong style={{ color: '#38BDF8' }}>+91 {respPhone}</strong></div>
                  </div>
                </div>

                {devOtp && (
                  <div onClick={() => setRespOtp(devOtp)} style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px dashed #10B981', borderRadius: '12px', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#34D399', fontWeight: '700' }}>Demo OTP: <strong>{devOtp}</strong></span>
                    <span style={{ fontSize: '12px', color: '#6EE7B7' }}>Click to fill</span>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94A3B8', marginBottom: '8px', textAlign: 'center' }}>ENTER 6-DIGIT CODE</label>
                  <input required autoFocus type="text" maxLength={6} value={respOtp} onChange={e => setRespOtp(e.target.value.replace(/\D/g, ''))} style={{ width: '100%', background: '#1E293B', border: '2px solid #334155', borderRadius: '12px', padding: '16px', fontSize: '24px', fontWeight: '800', letterSpacing: '8px', color: '#FFF', textAlign: 'center', outline: 'none' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  <button type="button" onClick={handleSendOtp} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Resend Code</button>
                  <button disabled={isSavingResponder} type="submit" style={{ padding: '12px 32px', background: '#10B981', border: 'none', color: '#FFF', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
                    {isSavingResponder ? 'Verifying...' : 'Verify & Add \u2714'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SUCCESS INVITE MODAL */}
      {createdInviteInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '400px', background: '#0F172A', border: '1px solid #1E293B', borderRadius: '24px', padding: '32px', textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', border: '2px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
              <UserCheck size={32} color="#10B981" />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', margin: '0 0 8px 0' }}>Agent Added Successfully!</h3>
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: '0 0 24px 0' }}>{createdInviteInfo.name} is now registered.</p>

            <div style={{ background: '#1E293B', borderRadius: '12px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>Login Phone:</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#FFF' }}>{createdInviteInfo.phone}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>Secret PIN:</span>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#34D399', letterSpacing: '2px' }}>{createdInviteInfo.pin}</span>
              </div>
            </div>

            <button onClick={() => setCreatedInviteInfo(null)} style={{ width: '100%', padding: '14px', background: '#334155', border: 'none', color: '#FFF', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

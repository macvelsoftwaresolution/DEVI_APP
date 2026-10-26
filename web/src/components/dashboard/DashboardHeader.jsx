import React from 'react';
import { Volume2, VolumeX, RefreshCw, LogOut } from 'lucide-react';
import { logoutAdmin } from '../../config/api';

// Top bar: title, active count, clock, sound toggle, refresh, logout
export default function DashboardHeader({ activeCount, liveTime, audioEnabled, onToggleAudio, onRefresh }) {
  return (
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
          onClick={onToggleAudio}
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
          onClick={onRefresh}
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
  );
}

import React from 'react';
import { X, Phone, Navigation, MapPin } from 'lucide-react';

// Floating banner shown when a new SOS arrives (does not block the map)
export default function EmergencyAlertBanner({ alert, onClose, onReZoom }) {
  return (
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
          onClick={onClose}
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
            <span style={{ fontSize: '14px', fontWeight: '800', color: '#FFF' }}>{alert.name}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#38BDF8', fontWeight: '700', marginLeft: '8px' }}>
              📞 {alert.phone}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <a
              href={`tel:${alert.phone}`}
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
              onClick={onReZoom}
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
              {alert.location}
            </span>
          </div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0, marginLeft: '8px' }}>
            {alert.lat?.toFixed(5)}, {alert.lng?.toFixed(5)}
          </span>
        </div>
      </div>
    </div>
  );
}

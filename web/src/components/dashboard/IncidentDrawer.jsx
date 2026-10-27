import React from 'react';
import { X } from 'lucide-react';
import { isActiveIncident, signalLostText } from '../../utils/incidents';

const WHATSAPP_REASON_TEXT = {
  TOKEN_EXPIRED: 'WhatsApp access token expired (renew it on the server)',
  CREDENTIALS_MISSING: 'WhatsApp is not configured on the server',
  NOT_ON_WHATSAPP: 'number is not on WhatsApp',
  TEMPLATE_PROBLEM: 'message template rejected or paused by Meta',
  RATE_LIMITED: 'WhatsApp rate limit reached',
  TIMEOUT: 'WhatsApp did not respond in time',
  NETWORK: 'server could not reach WhatsApp',
  CONTROL_ROOM_NOT_CONFIGURED: 'control room WhatsApp number is not set on the server (ADMIN_WHATSAPP)',
};

// Right panel for the selected incident: evidence, signal warning, victim details, notes, resolve
export default function IncidentDrawer({ incident, note, onNoteChange, onSaveNote, onResolve, onClose }) {
  return (
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
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: '700' }}>#{incident.id.substring(0, 6).toUpperCase()}</span>
          <span style={{ fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '12px', background: 'var(--red-soft)', color: '#FCA5A5' }}>
            {incident.status}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* EVIDENCE */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
            Live Evidence
          </div>
          {incident.evidenceUrl ? (
            <video src={incident.evidenceUrl} controls style={{ width: '100%', height: '190px', borderRadius: '8px', objectFit: 'cover' }} />
          ) : (
            <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '11px' }}>
              ⏳ Video evidence recording in progress or pending upload...
            </div>
          )}
        </div>

        {/* SIGNAL LOST WARNING */}
        {incident.signalLost && isActiveIncident(incident) && (
          <div style={{ background: 'var(--amber-soft)', border: '1px solid rgba(245, 158, 11, 0.5)', borderRadius: '10px', padding: '10px 12px' }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#FBBF24' }}>⚠️ {signalLostText(incident)}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Map shows the last known location. Call the victim or send help to this location.
            </div>
          </div>
        )}

        {/* WHATSAPP DISPATCH RESULT */}
        {incident.whatsapp && (
          <div
            style={{
              background: incident.whatsapp.status === 'ALL_SENT' ? 'var(--bg-surface)' : 'rgba(220, 38, 38, 0.12)',
              border: incident.whatsapp.status === 'ALL_SENT' ? '1px solid var(--border)' : '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '10px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: '800', color: incident.whatsapp.status === 'ALL_SENT' ? '#34D399' : '#FCA5A5' }}>
              {incident.whatsapp.status === 'ALL_SENT' ? '✅' : '⚠️'} WhatsApp: {incident.whatsapp.sent}/{incident.whatsapp.total} sent
            </div>
            {incident.whatsapp.status !== 'ALL_SENT' && (
              <>
                {(incident.whatsapp.results || []).filter((r) => !r.sent).map((r) => (
                  <div key={r.phone} style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Not sent to {r.role === 'control_room' ? 'control room' : 'guardian'} +{r.phone}: {WHATSAPP_REASON_TEXT[r.reason] || r.reason}
                  </div>
                ))}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Call these contacts directly.
                </div>
              </>
            )}
          </div>
        )}

        {/* VICTIM DETAILS */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
            Victim Details
          </div>
          <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Name</span>
              <span style={{ fontWeight: '600' }}>{incident.user?.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Phone</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--blue)', fontWeight: '700' }}>{incident.user?.phone}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Location</span>
              <span style={{ fontSize: '11px', textAlign: 'right', maxWidth: '240px' }}>{incident.location}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>GPS Accuracy</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: incident.accuracy && incident.accuracy <= 10 ? '#34D399' : '#FBBF24', fontWeight: '700' }}>
                {incident.accuracy ? `±${Math.round(incident.accuracy)} meters` : 'High Precision'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '12px' }}>
            <a href={`tel:${incident.user?.phone}`} style={{ padding: '8px', background: 'var(--red)', color: '#FFF', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textAlign: 'center', textDecoration: 'none' }}>
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
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
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
            <button onClick={onSaveNote} style={{ padding: '6px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: '#FFF', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
              Save Note
            </button>
            <button onClick={onResolve} style={{ padding: '6px 12px', background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,0.4)', color: '#34D399', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              ✓ Mark Resolved
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

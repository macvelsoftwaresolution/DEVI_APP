import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MapPin, Navigation, Phone, Clock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { apiUrl } from '../config/api';

// Guardian link from the WhatsApp alert (/track/:alertId?k=<view key>).
// Shows where the SOS was pressed (no live tracking); the link expires 24h after the alert is resolved.
// Status from the API: ACTIVE, SAFE (she pressed "I'm safe") or CLOSED (shown like an alert, never as safe).

// While the alert is active the page checks again, so "I'm safe" reaches the guardian without a refresh
const REFRESH_MS = 20000;

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const cardStyle = {
  width: '420px',
  maxWidth: '100%',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: '18px',
  padding: '24px 20px',
  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
};

const buttonStyle = {
  width: '100%',
  height: '46px',
  border: 'none',
  borderRadius: '10px',
  color: '#FFF',
  fontSize: '14px',
  fontWeight: '800',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  textDecoration: 'none',
};

const EMERGENCY_CALL = (
  <a href="tel:112" style={{ ...buttonStyle, background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginTop: '10px' }}>
    <Phone size={16} />
    Call 112 (Emergency)
  </a>
);

function Message({ icon, title, text }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>{icon}</div>
      <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '19px', fontWeight: '800', color: 'var(--text)' }}>{title}</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

export default function TrackPage() {
  const { alertId: paramAlertId } = useParams();
  const [searchParams] = useSearchParams();
  const alertId = paramAlertId || searchParams.get('id') || searchParams.get('alertId');
  const viewKey = searchParams.get('k');

  // loading | ok | expired | invalid | notfound | error
  const [state, setState] = useState(alertId && viewKey ? 'loading' : 'invalid');
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!alertId || !viewKey) return;
    let cancelled = false;
    let timer = null;
    const load = async () => {
      try {
        const res = await fetch(apiUrl(`/api/sos/location/${encodeURIComponent(alertId)}?k=${encodeURIComponent(viewKey)}`));
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.success) {
          setAlert(data.data);
          setState('ok');
          if (data.data.status === 'ACTIVE') timer = setTimeout(load, REFRESH_MS);
        } else if (res.status === 410) {
          setState('expired');
        } else if (res.status === 403) {
          setState('invalid');
        } else if (res.status === 404) {
          setState('notfound');
        } else {
          // Keep showing the last good result during a short network drop
          setState((s) => (s === 'ok' ? s : 'error'));
          timer = setTimeout(load, REFRESH_MS);
        }
      } catch {
        if (cancelled) return;
        setState((s) => (s === 'ok' ? s : 'error'));
        timer = setTimeout(load, REFRESH_MS);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [alertId, viewKey]);

  const hasCoords = alert && alert.latitude != null && alert.longitude != null;
  const mapsUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}` : null;
  const isSafe = alert?.status === 'SAFE';
  const isActive = alert?.status === 'ACTIVE';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-darkest)',
        padding: '16px',
      }}
    >
      <div style={cardStyle}>
        {state === 'loading' && <Message icon={<MapPin size={36} color="var(--text-muted)" />} title="Loading SOS location..." text="Please wait." />}

        {state === 'expired' && (
          <>
            <Message
              icon={<ShieldCheck size={40} color="var(--green)" />}
              title="This alert has ended"
              text="The SOS was marked safe and this link has expired. The location is no longer shown."
            />
            {EMERGENCY_CALL}
          </>
        )}

        {(state === 'invalid' || state === 'notfound') && (
          <>
            <Message
              icon={<ShieldAlert size={40} color="var(--amber)" />}
              title="This link is not valid"
              text="Open the full link from the DEVI WhatsApp alert. If someone is in danger, call 112 now."
            />
            {EMERGENCY_CALL}
          </>
        )}

        {state === 'error' && (
          <>
            <Message
              icon={<ShieldAlert size={40} color="var(--amber)" />}
              title="Could not load the location"
              text="Check your internet connection and open the link again. If someone is in danger, call 112 now."
            />
            {EMERGENCY_CALL}
          </>
        )}

        {state === 'ok' && isSafe && (
          <Message
            icon={<ShieldCheck size={44} color="var(--green)" />}
            title="She marked herself SAFE"
            text={`She pressed "I'm safe" in the DEVI app${alert.safeAt ? ` at ${formatTime(alert.safeAt)}` : ''}.`}
          />
        )}

        {state === 'ok' && alert && !isSafe && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: '800',
                  letterSpacing: '0.04em',
                  background: 'var(--red-soft)',
                  color: 'var(--red)',
                }}
              >
                {isActive ? 'SOS ACTIVE' : 'SOS ALERT'}
              </span>
              <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '20px', fontWeight: '800', color: 'var(--text)', marginTop: '10px' }}>
                SOS location
              </h1>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px' }}>
              <MapPin size={18} color="var(--red)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{alert.location}</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
              <Clock size={16} color="var(--text-dim)" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>SOS pressed at {formatTime(alert.timestamp)}</p>
            </div>

            <p
              style={{
                fontSize: '12px',
                color: 'var(--amber)',
                background: 'var(--amber-soft)',
                borderRadius: '8px',
                padding: '8px 12px',
                lineHeight: 1.45,
                marginBottom: '16px',
              }}
            >
              This is where the SOS was pressed. It is not a live location: she may have moved since then.
            </p>

            {mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...buttonStyle, background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)' }}>
                <Navigation size={16} />
                Open in Google Maps
              </a>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>GPS location was not available for this SOS.</p>
            )}
            {EMERGENCY_CALL}
          </>
        )}
      </div>
    </div>
  );
}

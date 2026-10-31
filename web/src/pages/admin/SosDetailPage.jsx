import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, MapPin, Phone, ExternalLink, Video, MessageCircle } from 'lucide-react';
import { useAdminData, StatusBadge, UserTypeBadge, Avatar, Empty, shortId, mapsUrl } from '../../components/admin/ui';

const WHATSAPP_REASON_TEXT = {
  TOKEN_EXPIRED: 'WhatsApp access token expired (renew it on the server)',
  CREDENTIALS_MISSING: 'WhatsApp is not configured on the server',
  NOT_ON_WHATSAPP: 'number is not on WhatsApp',
  TEMPLATE_PROBLEM: 'message template rejected or paused by Meta',
  RATE_LIMITED: 'WhatsApp rate limit reached',
  TIMEOUT: 'WhatsApp did not respond in time',
  NETWORK: 'server could not reach WhatsApp',
  RECIPIENT_LIMIT: 'this number already got 3 SOS alerts in the last hour (spam protection)',
  CONTROL_ROOM_NOT_CONFIGURED: 'control room WhatsApp number is not set on the server (ADMIN_WHATSAPP)',
};

const RESOLVED_BY_TEXT = { user: 'User (marked safe)', admin: 'Admin' };

export default function SosDetailPage() {
  const { alertId } = useParams();
  const { data, error, loading } = useAdminData(`/api/dashboard/incidents/${encodeURIComponent(alertId)}`);
  const inc = data?.incident;

  if (loading && !data) return <div className="adm-skel" style={{ height: 320 }} />;
  if (!inc) {
    return (
      <div className="adm-card">
        <Empty text={error || 'SOS record not found'} />
        <div style={{ textAlign: 'center', paddingBottom: 24 }}><Link to="/sos" className="adm-btn">Back to SOS Alerts</Link></div>
      </div>
    );
  }

  const hasFix = inc.latitude != null && inc.longitude != null;
  const wa = inc.whatsapp;

  return (
    <>
      <div className="adm-breadcrumb">
        <Link to="/sos">SOS Alerts</Link> <ChevronRight size={14} /> <span className="mono">{shortId(inc.id)}</span>
      </div>
      <div className="adm-page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            SOS {shortId(inc.id)} <StatusBadge status={inc.status} />
            {inc.isTest && <span className="adm-badge amber">Test mode</span>}
          </h1>
          <p>Sent {inc.displayTime}</p>
        </div>
      </div>

      <div className="adm-grid detail">
        <div className="adm-stack">
          <div className="adm-card">
            <div className="adm-card-head"><h2>Alert details</h2></div>
            <div className="adm-card-body">
              <dl className="adm-dl">
                <dt>SOS ID</dt><dd className="mono">{inc.id}</dd>
                <dt>Status</dt><dd><StatusBadge status={inc.status} /></dd>
                <dt>Sent at</dt><dd>{inc.displayTime}</dd>
                {inc.status === 'RESOLVED' && (
                  <>
                    <dt>Resolved at</dt><dd>{inc.resolvedTime || '–'}</dd>
                    <dt>Resolved by</dt><dd>{RESOLVED_BY_TEXT[inc.resolvedBy] || inc.resolvedBy || '–'}</dd>
                  </>
                )}
                <dt>Location</dt><dd>{inc.location}</dd>
                <dt>Coordinates</dt>
                <dd className="mono">{hasFix ? `${inc.latitude.toFixed(5)}, ${inc.longitude.toFixed(5)}` : 'No GPS fix'}</dd>
                <dt>GPS accuracy</dt><dd>{inc.accuracy ? `±${Math.round(inc.accuracy)} m` : 'Unknown'}</dd>
              </dl>
              {hasFix && (
                <a href={mapsUrl(inc.latitude, inc.longitude)} target="_blank" rel="noopener noreferrer" className="adm-btn" style={{ marginTop: 18 }}>
                  <MapPin size={16} /> Open in Google Maps <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head"><h2>Evidence</h2></div>
            <div className="adm-card-body">
              {inc.evidenceUrl ? (
                <video src={inc.evidenceUrl} controls preload="metadata" style={{ width: '100%', maxHeight: 420, borderRadius: 8, background: '#000' }} />
              ) : (
                <Empty text="No video evidence uploaded for this SOS" icon={<Video size={32} />} />
              )}
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head"><h2>Operator notes</h2></div>
            <div className="adm-card-body">
              {inc.operatorNotes ? (
                <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', color: 'var(--a-text-2)' }}>{inc.operatorNotes}</pre>
              ) : (
                <span className="muted">No notes</span>
              )}
            </div>
          </div>
        </div>

        <div className="adm-stack">
          <div className="adm-card">
            <div className="adm-card-head"><h2>User</h2></div>
            <div className="adm-card-body">
              <div className="adm-person" style={{ marginBottom: 14 }}>
                <Avatar name={inc.user.name} large />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{inc.user.name}</div>
                  <div style={{ marginTop: 4 }}><UserTypeBadge isGuest={inc.user.isGuest} /></div>
                </div>
              </div>
              <dl className="adm-dl" style={{ gridTemplateColumns: '80px 1fr' }}>
                <dt>{inc.user.isGuest ? 'Guest ID' : 'Phone'}</dt><dd className="mono">{inc.user.phone || '–'}</dd>
                <dt>Address</dt><dd>{inc.user.address || '–'}</dd>
              </dl>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {inc.user.id && <Link to={`/users/${inc.user.id}`} className="adm-btn sm">View profile</Link>}
                {inc.user.phone && !inc.user.isGuest && (
                  <a href={`tel:${inc.user.phone}`} className="adm-btn sm"><Phone size={14} /> Call</a>
                )}
              </div>
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head"><h2>Guardians</h2><span className="muted">{inc.guardians.length}</span></div>
            {inc.guardians.length === 0 && <div className="adm-card-body muted">No guardians saved</div>}
            {inc.guardians.map((g) => (
              <div key={g.id} className="adm-list-row">
                <Avatar name={g.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="adm-cell-main">{g.name}</div>
                  <div className="adm-cell-sub mono">{g.phone}</div>
                </div>
                <a href={`tel:${g.phone}`} className="adm-btn icon sm ghost" aria-label={`Call ${g.name}`}><Phone size={15} /></a>
              </div>
            ))}
          </div>

          {wa && (
            <div className="adm-card">
              <div className="adm-card-head">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MessageCircle size={16} /> WhatsApp</h2>
                <span className={`adm-badge ${wa.status === 'ALL_SENT' ? 'green' : 'amber'}`}>{wa.sent}/{wa.total} sent</span>
              </div>
              {wa.status !== 'ALL_SENT' && (
                <div className="adm-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  {(wa.results || []).filter((r) => !r.sent).map((r) => (
                    <div key={r.phone} className="muted">
                      Not sent to {r.role === 'control_room' ? 'control room' : 'guardian'} +{r.phone}: {WHATSAPP_REASON_TEXT[r.reason] || r.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

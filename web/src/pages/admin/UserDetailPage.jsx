import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Phone, Siren } from 'lucide-react';
import { useAdminData, StatusBadge, UserTypeBadge, Avatar, Empty, shortId } from '../../components/admin/ui';

export default function UserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { data, error, loading } = useAdminData(`/api/dashboard/users/${encodeURIComponent(userId)}`);
  const user = data?.user;

  if (loading && !data) return <div className="adm-skel" style={{ height: 320 }} />;
  if (!user) {
    return (
      <div className="adm-card">
        <Empty text={error || 'User not found'} />
        <div style={{ textAlign: 'center', paddingBottom: 24 }}><Link to="/users" className="adm-btn">Back to Users</Link></div>
      </div>
    );
  }

  const active = user.sos.filter((s) => s.status === 'ACTIVE').length;

  return (
    <>
      <div className="adm-breadcrumb">
        <Link to="/users">Users</Link> <ChevronRight size={14} /> <span>{user.name}</span>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-body" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Avatar name={user.name} large />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {user.name} <UserTypeBadge isGuest={user.isGuest} />
            </div>
            <div className="muted" style={{ marginTop: 4 }}>Joined {user.joinedOn || '–'}</div>
          </div>
          {user.phone && (
            <a href={`tel:${user.phone}`} className="adm-btn"><Phone size={16} /> Call</a>
          )}
        </div>
      </div>

      <div className="adm-grid detail">
        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <h2>SOS history</h2>
              <div className="sub">{user.sos.length} total · {active} active</div>
            </div>
          </div>
          {user.sos.length === 0 ? (
            <Empty text="This user has not sent any SOS" icon={<Siren size={32} />} />
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr><th>SOS ID</th><th>Location</th><th>Date & Time</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {user.sos.map((s) => (
                    <tr key={s.id} className="click" onClick={() => navigate(`/sos/${s.id}`)}>
                      <td className="mono">{shortId(s.id)}</td>
                      <td className="ellipsis" title={s.location}>{s.location}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{s.displayTime}</td>
                      <td><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="adm-stack">
          <div className="adm-card">
            <div className="adm-card-head"><h2>Profile</h2></div>
            <div className="adm-card-body">
              <dl className="adm-dl" style={{ gridTemplateColumns: '90px 1fr' }}>
                <dt>{user.isGuest ? 'Guest ID' : 'Phone'}</dt><dd className="mono">{user.phone || user.guestId || '–'}</dd>
                <dt>Address</dt><dd>{user.address || '–'}</dd>
                <dt>User ID</dt><dd className="mono" style={{ fontSize: 11.5 }}>{user.id}</dd>
              </dl>
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head"><h2>Guardians</h2><span className="muted">{user.guardians.length}</span></div>
            {user.guardians.length === 0 && <div className="adm-card-body muted">No guardians saved</div>}
            {user.guardians.map((g) => (
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
        </div>
      </div>
    </>
  );
}

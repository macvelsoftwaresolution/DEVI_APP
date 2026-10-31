import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Siren, CalendarClock, AlertTriangle, CheckCircle2, Users, UserRound, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAdminData, StatusBadge, PageHead, Empty, Avatar, shortId } from '../../components/admin/ui';
import SosBarChart from '../../components/admin/SosBarChart';

function StatCard({ icon: Icon, tone, label, value, hint }) {
  return (
    <div className="adm-card adm-stat">
      <div className="adm-stat-icon" style={{ background: `var(--a-${tone}-bg)`, color: `var(--a-${tone}-fg)` }}>
        <Icon size={20} />
      </div>
      <div>
        <div className="adm-stat-label">{label}</div>
        <div className="adm-stat-value">{value ?? '–'}</div>
        {hint && <div className="adm-stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const [days, setDays] = useState(30);
  const { data, error } = useAdminData(`/api/dashboard/stats?days=${days}`);

  const sos = data?.sos || {};
  const users = data?.users || {};
  const periodTotal = (data?.daily || []).reduce((sum, d) => sum + d.count, 0);

  return (
    <>
      <PageHead title="Dashboard" subtitle="Overview of SOS alerts and users" />
      {error && <div className="adm-alert red" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="adm-grid stats">
        <StatCard icon={Siren} tone="blue" label="Total SOS" value={sos.total} hint="All time" />
        <StatCard icon={CalendarClock} tone="amber" label="SOS today" value={sos.today} hint="India time" />
        <StatCard icon={AlertTriangle} tone="red" label="Active" value={sos.active} hint="Not resolved yet" />
        <StatCard icon={CheckCircle2} tone="green" label="Resolved" value={sos.resolved} />
      </div>
      <div className="adm-grid stats">
        <StatCard icon={Users} tone="blue" label="Total users" value={users.total} hint={users.newToday ? `${users.newToday} joined today` : undefined} />
        <StatCard icon={UserRound} tone="gray" label="Registered" value={users.registered} />
        <StatCard icon={UserRound} tone="gray" label="Guests" value={users.guests} />
        <StatCard icon={ShieldCheck} tone="green" label="Guardians" value={data?.guardians?.total} />
      </div>

      <div className="adm-grid two">
        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <h2>SOS alerts per day</h2>
              <div className="sub">{periodTotal} in the last {days} days</div>
            </div>
            <div className="adm-tabs" role="tablist">
              {[7, 30, 90].map((d) => (
                <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d}d</button>
              ))}
            </div>
          </div>
          <div className="adm-card-body">
            {data?.daily ? <SosBarChart daily={data.daily} /> : <div className="adm-skel" style={{ height: 220 }} />}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <h2>Latest SOS</h2>
            <Link to="/sos" className="adm-btn sm ghost">View all <ArrowRight size={14} /></Link>
          </div>
          {data && !data.recent?.length && <Empty text="No SOS alerts yet" />}
          {(data?.recent || []).map((inc) => (
            <Link key={inc.id} to={`/sos/${inc.id}`} className="adm-list-row">
              <Avatar name={inc.user.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="adm-cell-main" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inc.user.name}</div>
                <div className="adm-cell-sub">{inc.displayTime} · <span className="mono">{shortId(inc.id)}</span></div>
              </div>
              <StatusBadge status={inc.status} />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

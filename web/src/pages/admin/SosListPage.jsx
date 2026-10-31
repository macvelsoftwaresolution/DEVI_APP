import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Download, Siren } from 'lucide-react';
import { adminFetch } from '../../config/api';
import { useAdminData, StatusBadge, Pagination, Empty, SkeletonRows, PageHead, shortId } from '../../components/admin/ui';

const LIMIT = 20;

const csvCell = (value) => {
  let text = value === null || value === undefined ? '' : String(value);
  // Stop spreadsheet apps from running cell text as a formula
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

// Builds the query string from the current filters
const buildQuery = (params, extra = {}) => {
  const q = new URLSearchParams();
  ['status', 'search', 'from', 'to'].forEach((k) => {
    const v = params.get(k);
    if (v) q.set(k, v);
  });
  Object.entries(extra).forEach(([k, v]) => q.set(k, v));
  return q.toString();
};

export default function SosListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('search') || '');
  const [exporting, setExporting] = useState(false);

  const page = parseInt(params.get('page'), 10) || 1;
  const status = params.get('status') || 'ALL';
  const { data, error, loading } = useAdminData(`/api/dashboard/incidents?${buildQuery(params, { page, limit: LIMIT })}`);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'ALL') next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  // Search after the admin stops typing
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('search') || '') !== searchText.trim()) setParam('search', searchText.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await adminFetch(`/api/dashboard/incidents?${buildQuery(params, { page: 1, limit: 5000 })}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      const header = ['SOS ID', 'Date & Time (IST)', 'Status', 'User', 'Phone', 'User Type', 'Location', 'Latitude', 'Longitude', 'Resolved At (IST)', 'Resolved By', 'Test'];
      const rows = json.items.map((i) => [
        i.id, i.displayTime, i.status, i.user.name, i.user.phone, i.user.isGuest ? 'Guest' : 'Registered',
        i.location, i.latitude, i.longitude, i.resolvedTime, i.resolvedBy, i.isTest ? 'Yes' : 'No',
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `devi-sos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const items = data?.items || [];

  return (
    <>
      <PageHead title="SOS Alerts" subtitle="Every SOS sent from the DEVI app">
        <button className="adm-btn" onClick={exportCsv} disabled={exporting || !data?.total}>
          <Download size={16} /> {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </PageHead>

      <div className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-search">
            <Search size={16} />
            <input
              className="adm-input"
              placeholder="Search name, phone, location or ID"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="adm-tabs">
            {['ALL', 'ACTIVE', 'RESOLVED'].map((s) => (
              <button key={s} className={status === s ? 'on' : ''} onClick={() => setParam('status', s)}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            From
            <input type="date" className="adm-input" value={params.get('from') || ''} onChange={(e) => setParam('from', e.target.value)} />
          </label>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            To
            <input type="date" className="adm-input" value={params.get('to') || ''} onChange={(e) => setParam('to', e.target.value)} />
          </label>
        </div>

        {error && <div className="adm-alert red" style={{ margin: 16 }}>{error}</div>}

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>SOS ID</th>
                <th>User</th>
                <th>Location</th>
                <th>Date & Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <SkeletonRows cols={5} />
              ) : (
                items.map((inc) => (
                  <tr key={inc.id} className="click" onClick={() => navigate(`/sos/${inc.id}`)}>
                    <td className="mono">
                      {shortId(inc.id)}
                      {inc.isTest && <span className="adm-badge amber" style={{ marginLeft: 6 }}>Test</span>}
                    </td>
                    <td>
                      <div className="adm-cell-main">{inc.user.name}</div>
                      <div className="adm-cell-sub mono">{inc.user.phone || '–'}</div>
                    </td>
                    <td className="ellipsis" title={inc.location}>{inc.location}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{inc.displayTime}</td>
                    <td><StatusBadge status={inc.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && !items.length && <Empty text="No SOS alerts match these filters" icon={<Siren size={32} />} />}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} limit={data.limit} onPage={(p) => setParam('page', String(p))} />}
      </div>
    </>
  );
}

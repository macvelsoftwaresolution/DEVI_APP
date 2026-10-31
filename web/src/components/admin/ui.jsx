import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { adminFetch } from '../../config/api';

// Loads an admin API endpoint; reloads when the endpoint changes or a new SOS arrives
export function useAdminData(endpoint) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(endpoint);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.message || 'Could not load data');
        if (res.status === 404) setData(null);
        return;
      }
      setData(json);
      setError('');
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    setLoading(true);
    load();
    window.addEventListener('devi:refresh', load);
    return () => window.removeEventListener('devi:refresh', load);
  }, [load]);

  return { data, error, loading, reload: load };
}

export function StatusBadge({ status }) {
  if (status === 'RESOLVED') {
    return <span className="adm-badge green"><span className="dot" />Resolved</span>;
  }
  return <span className="adm-badge red"><span className="dot" />Active</span>;
}

export function UserTypeBadge({ isGuest }) {
  return isGuest ? <span className="adm-badge gray">Guest</span> : <span className="adm-badge blue">Registered</span>;
}

export const shortId = (id) => `#${String(id || '').substring(0, 8).toUpperCase()}`;

export function Avatar({ name, large }) {
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  return <span className={`adm-avatar${large ? ' lg' : ''}`} aria-hidden="true">{initials || '?'}</span>;
}

export function Pagination({ page, pages, total, limit, onPage }) {
  if (!total) return null;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return (
    <div className="adm-pager">
      <span>Showing {start}–{end} of {total}</span>
      <div className="btns">
        <button className="adm-btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={15} /> Prev
        </button>
        <span>Page {page} of {pages}</span>
        <button className="adm-btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export function Empty({ text, icon }) {
  return (
    <div className="adm-empty">
      {icon || <Inbox size={32} />}
      <div>{text}</div>
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 5 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r}>
      {Array.from({ length: cols }, (_, c) => (
        <td key={c}><div className="adm-skel" style={{ height: 14, width: c === 0 ? '70%' : '50%' }} /></td>
      ))}
    </tr>
  ));
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="adm-page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}

export const mapsUrl = (lat, lng) => `https://maps.google.com/?q=${lat},${lng}`;

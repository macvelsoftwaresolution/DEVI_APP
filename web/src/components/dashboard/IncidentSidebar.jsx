import React from 'react';
import { isActiveIncident } from '../../utils/incidents';

// Left panel: search, stats, filter tabs and incident cards
export default function IncidentSidebar({
  incidents,
  filteredIncidents,
  activeCount,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  selectedIncidentId,
  onSelect,
}) {
  return (
    <aside
      style={{
        width: '360px',
        background: 'var(--bg-dark)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
        <input
          type="text"
          placeholder="Search name, phone, or location..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '7px 10px',
            fontSize: '12px',
            color: '#FFF',
            outline: 'none',
            marginBottom: '10px',
          }}
        />

        {/* MINI STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '10px' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700' }}>{incidents.length}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '1px' }}>Total</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700', color: '#F87171' }}>{activeCount}</div>
            <div style={{ fontSize: '9px', color: '#F87171', textTransform: 'uppercase', marginTop: '1px' }}>Active</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 4px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '15px', fontWeight: '700', color: '#34D399' }}>
              {incidents.filter((i) => i.status === 'RESOLVED').length}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '1px' }}>Resolved</div>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border)', gap: '2px' }}>
          {['ALL', 'ACTIVE', 'RESOLVED'].map((tab) => (
            <button
              key={tab}
              onClick={() => onFilterChange(tab)}
              style={{
                flex: 1,
                padding: '4px',
                background: filter === tab ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                color: filter === tab ? '#FFF' : 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '5px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* INCIDENT CARDS */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filteredIncidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-dim)', fontSize: '11px' }}>No incidents found.</div>
        ) : (
          filteredIncidents.map((inc) => {
            const isEmergency = isActiveIncident(inc);
            const isSelected = selectedIncidentId === inc.id;

            return (
              <div
                key={inc.id}
                onClick={() => onSelect(inc.id)}
                style={{
                  background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)',
                  border: `1px solid ${isSelected ? 'var(--red)' : 'var(--border)'}`,
                  borderLeft: isEmergency ? '3px solid var(--red)' : '3px solid var(--green)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)' }}>
                    #{inc.id.substring(0, 6).toUpperCase()}
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '12px',
                      background: isEmergency ? 'var(--red-soft)' : 'var(--green-soft)',
                      color: isEmergency ? '#FCA5A5' : '#6EE7B7',
                    }}
                  >
                    {inc.status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#FFF' }}>{inc.user?.name || 'Victim'}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{inc.user?.phone}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' }}>
                  📍 {inc.location || 'GPS Location'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <span>{inc.timeAgo || 'Just now'}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

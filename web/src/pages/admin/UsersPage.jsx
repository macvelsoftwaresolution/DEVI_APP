import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { useAdminData, UserTypeBadge, Pagination, Empty, SkeletonRows, PageHead, Avatar } from '../../components/admin/ui';

const LIMIT = 20;

export default function UsersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('search') || '');

  const page = parseInt(params.get('page'), 10) || 1;
  const type = params.get('type') || 'ALL';
  const query = new URLSearchParams({ page, limit: LIMIT, type, search: params.get('search') || '' });
  const { data, error, loading } = useAdminData(`/api/dashboard/users?${query}`);

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

  const items = data?.items || [];

  return (
    <>
      <PageHead title="Users" subtitle="People who signed up or used DEVI as a guest" />

      <div className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-search">
            <Search size={16} />
            <input
              className="adm-input"
              placeholder="Search name, phone or address"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="adm-tabs">
            {[['ALL', 'All'], ['REGISTERED', 'Registered'], ['GUEST', 'Guests']].map(([v, label]) => (
              <button key={v} className={type === v ? 'on' : ''} onClick={() => setParam('type', v)}>{label}</button>
            ))}
          </div>
        </div>

        {error && <div className="adm-alert red" style={{ margin: 16 }}>{error}</div>}

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th className="num">Guardians</th>
                <th className="num">SOS</th>
                <th>Last SOS</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <SkeletonRows cols={6} />
              ) : (
                items.map((u) => (
                  <tr key={u.id} className="click" onClick={() => navigate(`/users/${u.id}`)}>
                    <td>
                      <div className="adm-person">
                        <Avatar name={u.name} />
                        <div>
                          <div className="adm-cell-main">{u.name}</div>
                          <div className="adm-cell-sub mono">{u.phone || u.guestId || '–'}</div>
                        </div>
                      </div>
                    </td>
                    <td><UserTypeBadge isGuest={u.isGuest} /></td>
                    <td className="num">{u.guardiansCount}</td>
                    <td className="num">{u.sosCount}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{u.lastSos || <span className="muted">–</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{u.joinedOn || '–'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && !items.length && <Empty text="No users match these filters" icon={<Users size={32} />} />}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} limit={data.limit} onPage={(p) => setParam('page', String(p))} />}
      </div>
    </>
  );
}

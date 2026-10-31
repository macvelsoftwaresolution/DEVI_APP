import React, { useState } from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { API_BASE_URL, getAdminToken, logoutAdmin } from '../../config/api';
import { applyTheme, getSavedTheme } from '../../utils/theme';
import { useAdminData, PageHead, Avatar } from '../../components/admin/ui';

// Reads the expiry time from the stored admin token
const sessionExpiry = () => {
  try {
    const payload = JSON.parse(atob(getAdminToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp
      ? new Date(payload.exp * 1000).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      : null;
  } catch {
    return null;
  }
};

export default function SettingsPage() {
  const { data } = useAdminData('/api/admin/verify');
  const [theme, setTheme] = useState(getSavedTheme);

  const pickTheme = (next) => {
    applyTheme(next);
    setTheme(next);
    // The layout keeps its own copy of the theme for the top bar button
    window.dispatchEvent(new Event('devi:theme'));
  };

  return (
    <>
      <PageHead title="Settings" subtitle="Your admin account and panel preferences" />

      <div className="adm-stack" style={{ maxWidth: 720 }}>
        <div className="adm-card">
          <div className="adm-card-head"><h2>Account</h2></div>
          <div className="adm-card-body">
            <div className="adm-person" style={{ marginBottom: 16 }}>
              <Avatar name={data?.username || 'Admin'} large />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{data?.username || '…'}</div>
                <div className="muted">Administrator</div>
              </div>
            </div>
            <dl className="adm-dl">
              <dt>Session expires</dt><dd>{sessionExpiry() || '–'} (IST)</dd>
              <dt>API server</dt><dd className="mono">{API_BASE_URL}</dd>
            </dl>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <h2>Appearance</h2>
              <div className="sub">Saved in this browser</div>
            </div>
          </div>
          <div className="adm-card-body">
            <div className="adm-tabs">
              <button className={theme === 'light' ? 'on' : ''} onClick={() => pickTheme('light')}>
                <Sun size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Light
              </button>
              <button className={theme === 'dark' ? 'on' : ''} onClick={() => pickTheme('dark')}>
                <Moon size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Dark
              </button>
            </div>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <h2>Sign out</h2>
              <div className="sub">End this admin session on this browser</div>
            </div>
            <button
              className="adm-btn"
              onClick={() => {
                if (window.confirm('Sign out of the admin panel?')) logoutAdmin();
              }}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

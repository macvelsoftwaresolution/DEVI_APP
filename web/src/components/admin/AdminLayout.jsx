import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Siren, Users, Settings, Shield, Menu, Moon, Sun, LogOut, RefreshCw, X, BellRing } from 'lucide-react';
import { getAdminToken, logoutAdmin, WS_URL } from '../../config/api';
import { applyTheme, getSavedTheme } from '../../utils/theme';
import { shortId } from './ui';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sos', label: 'SOS Alerts', icon: Siren },
  { to: '/users', label: 'Users', icon: Users },
];

const TITLES = [
  ['/dashboard', 'Dashboard'],
  ['/sos', 'SOS Alerts'],
  ['/users', 'Users'],
  ['/settings', 'Settings'],
];

// Tells every open page to reload its data
const refreshAll = () => window.dispatchEvent(new Event('devi:refresh'));

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState(getSavedTheme);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef(new Map());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Theme picked on the Settings page
  useEffect(() => {
    const sync = () => setTheme(getSavedTheme());
    window.addEventListener('devi:theme', sync);
    return () => window.removeEventListener('devi:theme', sync);
  }, []);

  // Close the mobile menu after navigating
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(toastTimers.current.get(id));
    toastTimers.current.delete(id);
  };

  // New SOS: small toast + refresh the open page (no siren, no banner)
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;
    let closed = false;
    const timers = toastTimers.current;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: 'dashboard', token: getAdminToken() }));
        ws.onmessage = (event) => {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
          // Admin session expired: the server refused the dashboard room
          if (msg.type === 'error' && msg.code === 'ADMIN_AUTH_REQUIRED') {
            logoutAdmin();
            return;
          }
          if (msg.type === 'sos:new' && msg.data) {
            const d = msg.data;
            const toast = {
              id: String(d.id || Date.now()),
              name: d.userName || d.user?.name || 'A user',
              location: d.location || 'Location not available',
            };
            setToasts((prev) => [toast, ...prev.filter((t) => t.id !== toast.id)].slice(0, 3));
            timers.set(toast.id, setTimeout(() => dismissToast(toast.id), 12000));
            refreshAll();
          } else if (['incident:resolved', 'status', 'incident:evidence', 'incident:whatsapp'].includes(msg.type)) {
            refreshAll();
          }
        };
        ws.onclose = () => {
          if (!closed) reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch (err) {
        console.warn('WS error:', err);
      }
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectTimeout);
      timers.forEach((t) => clearTimeout(t));
      if (ws) ws.close();
    };
  }, []);

  const title = TITLES.find(([path]) => location.pathname.startsWith(path))?.[1] || 'Admin';

  return (
    <div className={`adm adm-shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="adm-sidebar">
        <div className="adm-brand">
          <div className="adm-brand-logo"><Shield size={18} /></div>
          <div>
            <div className="adm-brand-name">DEVI</div>
            <div className="adm-brand-sub">Admin Panel</div>
          </div>
        </div>

        <nav className="adm-nav" aria-label="Main">
          <div className="adm-nav-label">Menu</div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
          <div className="adm-nav-label" style={{ marginTop: 8 }}>Account</div>
          <NavLink to="/settings">
            <Settings size={18} /> Settings
          </NavLink>
        </nav>

        <div className="adm-sidebar-foot">
          <button
            className="adm-btn ghost block"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => {
              if (window.confirm('Sign out of the admin panel?')) logoutAdmin();
            }}
          >
            <LogOut size={17} /> Logout
          </button>
        </div>
      </aside>
      <div className="adm-backdrop" onClick={() => setNavOpen(false)} />

      <div className="adm-main">
        <header className="adm-topbar">
          <button className="adm-btn icon ghost adm-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="adm-topbar-title">{title}</div>
          <button className="adm-btn icon ghost" onClick={refreshAll} title="Refresh" aria-label="Refresh">
            <RefreshCw size={17} />
          </button>
          <button
            className="adm-btn icon ghost"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        <main className="adm-content">
          <Outlet />
        </main>
      </div>

      <div className="adm-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="adm-toast">
            <BellRing size={18} color="var(--a-brand)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="adm-toast-title">New SOS from {t.name}</div>
              <div className="adm-toast-text">{t.location} · {shortId(t.id)}</div>
              <div className="adm-toast-actions">
                <button
                  className="adm-btn sm primary"
                  onClick={() => {
                    dismissToast(t.id);
                    navigate(`/sos/${t.id}`);
                  }}
                >
                  View
                </button>
              </div>
            </div>
            <button className="adm-btn icon ghost sm" style={{ width: 28 }} onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogIn, Shield } from 'lucide-react';
import { apiUrl, getAdminToken, setAdminToken } from '../config/api';
import { getSavedTheme } from '../utils/theme';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getSavedTheme());
  }, []);

  // Already signed in: go straight to the dashboard
  if (getAdminToken()) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter username and password');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        setAdminToken(data.token);
        navigate('/dashboard', { replace: true });
      } else {
        setError(data.message || 'Login failed');
      }
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="adm adm-login">
      <form onSubmit={handleSubmit} className="adm-card adm-login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="adm-brand-logo" style={{ width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px' }}>
            <Shield size={24} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>DEVI Admin Panel</h1>
          <p className="muted" style={{ marginTop: 4 }}>Sign in to continue</p>
        </div>

        <div className="adm-field">
          <label htmlFor="admin-username">Username</label>
          <input
            id="admin-username"
            className="adm-input"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="adm-field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            className="adm-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div role="alert" className="adm-alert red" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={isLoading} className="adm-btn primary block" style={{ height: 42, cursor: isLoading ? 'wait' : 'pointer' }}>
          <LogIn size={16} />
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Lock, User, LogIn, ShieldCheck, ArrowLeft } from 'lucide-react';
import { apiUrl, getAdminToken, setAdminToken } from '../config/api';

const inputWrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  background: 'var(--bg-dark)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '0 12px',
};

const inputStyle = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text)',
  fontSize: '14px',
  padding: '12px 0',
};

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Second step after a correct password: 'totp' (enter code) or 'setup' (first sign-in, add to an app)
  const [step, setStep] = useState('password');
  const [challenge, setChallenge] = useState('');
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl }
  const [code, setCode] = useState('');

  // Already signed in: go straight to the dashboard
  if (getAdminToken()) {
    return <Navigate to="/dashboard" replace />;
  }

  const backToPassword = () => {
    setStep('password');
    setChallenge('');
    setSetup(null);
    setCode('');
    setPassword('');
    setError('');
  };

  // Step 2: the 6-digit code from the authenticator app
  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/admin/login/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        setAdminToken(data.token);
        navigate('/dashboard', { replace: true });
      } else if (res.status === 401 && /expired/i.test(data.message || '')) {
        backToPassword();
        setError(data.message);
      } else {
        setError(data.message || 'Login failed');
        setCode('');
      }
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
      if (res.ok && data.success && (data.step === 'totp' || data.step === 'setup')) {
        setChallenge(data.challenge);
        setSetup(data.step === 'setup' ? { secret: data.secret, otpauthUrl: data.otpauthUrl } : null);
        setStep(data.step);
        setCode('');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isCodeStep = step === 'totp' || step === 'setup';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-darkest)',
        padding: '16px',
      }}
    >
      <form
        onSubmit={isCodeStep ? handleCodeSubmit : handleSubmit}
        style={{
          width: '380px',
          maxWidth: '100%',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          padding: '28px 24px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              margin: '0 auto 12px',
              background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '0 0 18px rgba(239, 68, 68, 0.35)',
            }}
          >
            🛡️
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '20px', fontWeight: '800', color: 'var(--text)' }}>
            DEVI Response Center
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {step === 'setup' ? 'Set up two-step verification' : step === 'totp' ? 'Two-step verification' : 'Admin sign in'}
          </p>
        </div>

        {step === 'setup' && setup && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '14px' }}>
            <p style={{ marginBottom: '8px' }}>
              First sign-in: open Google Authenticator or Microsoft Authenticator, choose{' '}
              <strong style={{ color: 'var(--text)' }}>Enter a setup key</strong>, and type this key:
            </p>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '14px',
                fontWeight: '700',
                color: 'var(--text)',
                background: 'var(--bg-dark)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '10px',
                textAlign: 'center',
                letterSpacing: '1px',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}
            >
              {setup.secret.match(/.{1,4}/g).join(' ')}
            </div>
            <p style={{ marginTop: '8px' }}>
              On a phone with the app installed you can also{' '}
              <a href={setup.otpauthUrl} style={{ color: 'var(--blue)' }}>open it directly</a>.
              Then enter the 6-digit code the app shows.
            </p>
          </div>
        )}

        {isCodeStep && (
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle} htmlFor="admin-code">6-digit code</label>
            <div style={inputWrapStyle}>
              <ShieldCheck size={16} color="var(--text-dim)" />
              <input
                id="admin-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                style={{ ...inputStyle, letterSpacing: '4px', fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          </div>
        )}

        {!isCodeStep && (
        <>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle} htmlFor="admin-username">Username</label>
          <div style={inputWrapStyle}>
            <User size={16} color="var(--text-dim)" />
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle} htmlFor="admin-password">Password</label>
          <div style={inputWrapStyle}>
            <Lock size={16} color="var(--text-dim)" />
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        </>
        )}

        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--red-soft)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#FCA5A5',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: '600',
              marginBottom: '14px',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            height: '44px',
            background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
            border: 'none',
            borderRadius: '10px',
            color: '#FFF',
            fontSize: '14px',
            fontWeight: '800',
            cursor: isLoading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          <LogIn size={16} />
          {isLoading ? 'Signing in...' : isCodeStep ? 'Verify' : 'Sign In'}
        </button>

        {isCodeStep && (
          <button
            type="button"
            onClick={backToPassword}
            style={{
              width: '100%',
              marginTop: '10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <ArrowLeft size={14} /> Use a different account
          </button>
        )}
      </form>
    </div>
  );
}

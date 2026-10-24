// DEVI API and WebSocket Configuration
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const API_BASE_URL = isLocal
  ? 'http://localhost:5005'
  : 'https://devi-api.macvelsoftware.com';

export const WS_URL = isLocal
  ? 'ws://localhost:5005/ws'
  : 'wss://devi-api.macvelsoftware.com/ws';

export function apiUrl(endpoint) {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${clean}`;
}

// --- Admin session (token from /api/admin/login, valid for 12 hours) ---
const ADMIN_TOKEN_KEY = 'devi_admin_token';

export function getAdminToken() {
  let token = null;
  try {
    token = localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
  if (!token) return null;

  // Drop expired tokens early so the dashboard does not flash before redirecting
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearAdminSession();
      return null;
    }
  } catch {
    clearAdminSession();
    return null;
  }
  return token;
}

export function setAdminToken(token) {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // Storage blocked: session lasts until the page is closed
  }
}

export function clearAdminSession() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function logoutAdmin() {
  clearAdminSession();
  window.location.href = '/login';
}

// Fetch wrapper for admin APIs: adds the token and sends the user to login when it expires
export async function adminFetch(endpoint, options = {}) {
  const token = getAdminToken();
  const res = await fetch(apiUrl(endpoint), {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) {
    logoutAdmin();
  }
  return res;
}

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

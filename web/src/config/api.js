// DEVI API and WebSocket Configuration
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const API_BASE_URL = isLocal
  ? 'http://localhost:5005'
  : 'https://devi.macvelsoftware.com';

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
export const WS_URL = isLocal
  ? 'ws://localhost:5005/ws'
  : `${wsProtocol}//${window.location.host}/ws`;

export function apiUrl(endpoint) {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${clean}`;
}

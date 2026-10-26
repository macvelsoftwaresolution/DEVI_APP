// Shared incident helpers for the admin dashboard

// Still needs attention (older rows use DISPATCHED for the same state)
export const isActiveIncident = (inc) => inc.status === 'ACTIVE' || inc.status === 'DISPATCHED';

// Straight-line distance in km between two GPS points (Haversine)
export const calcDistKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// "Signal lost" label: why the live location stopped and when it was last seen
export const signalLostText = (inc) => {
  const when = inc.lastSeen
    ? new Date(inc.lastSeen).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const why = inc.signalReason === 'APP_CLOSED' ? 'App closed by user' : 'Signal lost';
  return when ? `${why} • last seen ${when}` : why;
};

// Shared incident helpers for the admin dashboard

// Still needs attention (older rows use DISPATCHED for the same state)
export const isActiveIncident = (inc) => inc.status === 'ACTIVE' || inc.status === 'DISPATCHED';

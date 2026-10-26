// Real-time live tracking sessions (in memory, keyed by alert ID).
// Shared by the SOS and dashboard services; rebuilt from the database when missing.
export const liveTrackSessions = new Map();

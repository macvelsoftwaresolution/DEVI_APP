import { SosService } from './sos.service.js';
import { socketService } from './socket.service.js';

// The app sends a location (or heartbeat) at least every 20s while an SOS is active.
// No update for this long means the phone lost signal or the app was closed / killed.
const SIGNAL_TIMEOUT_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;

export const broadcastSignalLost = (session) => {
  socketService.broadcastToRoom('dashboard', {
    type: 'incident:signal_lost',
    alertId: session.id,
    reason: session.signalReason,
    lastSeen: session.lastUpdated,
  });
};

/**
 * Periodically flags active SOS alerts whose live location stopped,
 * and clears the flag when updates come back. The dashboard shows both states.
 */
export function startSignalWatchdog() {
  setInterval(() => {
    const now = Date.now();
    for (const session of SosService.getActiveLiveSessions()) {
      const lastUpdate = new Date(session.lastUpdated || 0).getTime();
      const isStale = now - lastUpdate > SIGNAL_TIMEOUT_MS;

      if (isStale && !session.signalLost) {
        SosService.setSignalState(session.id, { lost: true, reason: 'NO_UPDATES' });
        console.warn(`📡 [SIGNAL LOST] Alert ${session.id}, last update ${session.lastUpdated}`);
        broadcastSignalLost(session);
      } else if (!isStale && session.signalLost && session.signalLostAt && lastUpdate > new Date(session.signalLostAt).getTime()) {
        SosService.setSignalState(session.id, { lost: false });
        console.log(`📡 [SIGNAL RESTORED] Alert ${session.id}`);
        socketService.broadcastToRoom('dashboard', {
          type: 'incident:signal_restored',
          alertId: session.id,
          lastSeen: session.lastUpdated,
        });
      }
    }
  }, CHECK_INTERVAL_MS).unref();
}

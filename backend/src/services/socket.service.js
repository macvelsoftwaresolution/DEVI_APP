import { WebSocketServer, WebSocket } from 'ws';
import { SosService } from './sos.service.js';
import { decodeAdminToken, verifySosControlToken } from '../middlewares/auth.middleware.js';

class SocketService {
  constructor() {
    this.wss = null;
    this.rooms = new Map(); // roomName -> Set<WebSocket>
    this.clientRooms = new Map(); // WebSocket -> Set<string>
    this.heartbeatInterval = null;
  }

  /**
   * Initializes WebSocket Server attached to existing HTTP/HTTPS server
   * @param {import('http').Server} server
   */
  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    console.log('⚡ [WEBSOCKET SERVER] Initialized on path /ws (Low-Bandwidth Optimized)');

    this.wss.on('connection', (ws, req) => {
      ws.isAlive = true;
      this.clientRooms.set(ws, new Set());

      // Handle heartbeat ping/pong (keeps connection open on 2G/weak mobile carrier NATs)
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (data) => {
        try {
          const raw = data.toString();
          if (raw === 'ping') {
            ws.isAlive = true;
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
            return;
          }

          const msg = JSON.parse(raw);
          await this.handleClientMessage(ws, msg);
        } catch (err) {
          console.warn('⚠️ [WEBSOCKET] Malformed message received:', err.message);
        }
      });

      ws.on('close', () => {
        this.cleanupClient(ws);
      });

      ws.on('error', (err) => {
        console.warn('⚠️ [WEBSOCKET CLIENT ERROR]:', err.message);
        this.cleanupClient(ws);
      });

      // Send initial welcome & connection confirmation
      this.sendToClient(ws, {
        type: 'connected',
        serverTime: Date.now(),
        message: 'DEVI Realtime Low-Bandwidth Stream Connected',
      });
    });

    // Run active ping interval every 30 seconds to cull stale/dead connections
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          this.cleanupClient(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (_) {}
      });
    }, 30000);
  }

  /**
   * Cleans up client from all subscribed rooms
   */
  cleanupClient(ws) {
    const rooms = this.clientRooms.get(ws);
    if (rooms) {
      for (const room of rooms) {
        const clients = this.rooms.get(room);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            this.rooms.delete(room);
          }
        }
      }
      this.clientRooms.delete(ws);
    }
  }

  /**
   * Joins a client to a room (e.g., 'alert:123', 'dashboard')
   */
  joinRoom(ws, room) {
    if (!room) return;
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(ws);

    const clientRooms = this.clientRooms.get(ws);
    if (clientRooms) {
      clientRooms.add(room);
    }
  }

  /**
   * Removes client from a room
   */
  leaveRoom(ws, room) {
    if (!room) return;
    const clients = this.rooms.get(room);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.rooms.delete(room);
      }
    }
    const clientRooms = this.clientRooms.get(ws);
    if (clientRooms) {
      clientRooms.delete(room);
    }
  }

  /**
   * Safely sends JSON string to a specific WebSocket client
   */
  sendToClient(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Broadcasts to all clients subscribed to a specific room
   */
  broadcastToRoom(room, payload) {
    const clients = this.rooms.get(room);
    if (!clients || clients.size === 0) return;

    const data = JSON.stringify(payload);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Broadcasts to all connected clients
   */
  broadcastAll(payload) {
    if (!this.wss) return;
    const data = JSON.stringify(payload);
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * Processes inbound client messages
   */
  async handleClientMessage(ws, msg) {
    if (!msg || typeof msg !== 'object') return;
    const { type } = msg;

    switch (type) {
      case 'join': {
        // The dashboard room carries every incident, so only signed-in admins may join it
        if (msg.room === 'dashboard' && !decodeAdminToken(msg.token)) {
          this.sendToClient(ws, { type: 'error', code: 'ADMIN_AUTH_REQUIRED', room: msg.room });
          break;
        }
        this.joinRoom(ws, msg.room);
        this.sendToClient(ws, { type: 'joined', room: msg.room });
        break;
      }

      case 'leave': {
        this.leaveRoom(ws, msg.room);
        this.sendToClient(ws, { type: 'left', room: msg.room });
        break;
      }

      // Compact location update packet from Flutter App or Guardian
      case 'loc': {
        const { alertId, lat, lng, speed, heading, status, seq, accuracy, acc, spd, hd } = msg;
        if (!alertId || lat == null || lng == null) return;

        // Only the device that created the SOS may move its location
        if (!verifySosControlToken(String(alertId), msg.controlToken)) {
          this.sendToClient(ws, { type: 'error', code: 'SOS_CONTROL_REQUIRED', alertId });
          return;
        }
        const currentAccuracy = (accuracy != null ? Number(accuracy) : (acc != null ? Number(acc) : null));
        const currentSpeed = speed ?? spd ?? null;
        const currentHeading = heading ?? hd ?? null;

        // Persist/cache in SosService
        await SosService.updateLiveLocation({
          alertId,
          latitude: lat,
          longitude: lng,
          accuracy: currentAccuracy,
          status: status || 'ACTIVE',
        });

        const updatePayload = {
          type: 'loc',
          alertId: String(alertId),
          latitude: Number(lat),
          longitude: Number(lng),
          accuracy: currentAccuracy,
          speed: currentSpeed,
          heading: currentHeading,
          status: status || 'ACTIVE',
          timestamp: new Date().toISOString(),
        };

        // Broadcast to guardian web tracker watching this alert
        this.broadcastToRoom(`alert:${alertId}`, updatePayload);

        // Broadcast to operator command dashboard
        this.broadcastToRoom('dashboard', updatePayload);

        // Send tiny ACK back to mobile device so it knows transmission succeeded (low-bandwidth)
        if (seq != null) {
          this.sendToClient(ws, { type: 'ack', seq, alertId });
        }
        break;
      }

      case 'ping': {
        this.sendToClient(ws, { type: 'pong' });
        break;
      }

      default:
        break;
    }
  }

  // --- Outbound Convenience Broadcast Methods ---

  /**
   * Broadcasts real-time coordinate update (called by HTTP fallback or WS)
   */
  broadcastLocationUpdate(alertId, data) {
    const payload = {
      type: 'loc',
      alertId: String(alertId),
      ...data,
      timestamp: data.timestamp || new Date().toISOString(),
    };
    this.broadcastToRoom(`alert:${alertId}`, payload);
    this.broadcastToRoom('dashboard', payload);
  }

  /**
   * Broadcasts new emergency SOS event to operator dashboard
   */
  broadcastNewSosAlert(alertData) {
    const payload = {
      type: 'sos:new',
      data: alertData,
      timestamp: new Date().toISOString(),
    };
    // Dashboard only: victim details must not reach other connected clients
    this.broadcastToRoom('dashboard', payload);
  }

  /**
   * Broadcasts SOS status change (e.g. RESOLVED / CANCELLED)
   */
  broadcastSosStatus(alertId, statusData) {
    const payload = {
      type: 'status',
      alertId: String(alertId),
      status: statusData.status || 'RESOLVED',
      timestamp: new Date().toISOString(),
    };
    this.broadcastToRoom(`alert:${alertId}`, payload);
    this.broadcastToRoom('dashboard', payload);
  }
}

export const socketService = new SocketService();
export default socketService;

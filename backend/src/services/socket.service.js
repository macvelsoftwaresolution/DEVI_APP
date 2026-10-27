import { WebSocketServer, WebSocket } from 'ws';
import { decodeAdminToken } from '../middlewares/auth.middleware.js';

// Realtime channel for the admin dashboard only: new SOS alerts, WhatsApp results, evidence, status.
// There is no live location tracking, so phones and guardians never connect here.

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
   * Joins a client to a room ('dashboard')
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
        const room = typeof msg.room === 'string' ? msg.room : '';
        const isAdmin = !!decodeAdminToken(msg.token);

        // The dashboard room carries every incident, so only signed-in admins may join it
        if (room !== 'dashboard') {
          this.sendToClient(ws, { type: 'error', code: 'UNKNOWN_ROOM', room });
          break;
        }
        if (!isAdmin) {
          this.sendToClient(ws, { type: 'error', code: 'ADMIN_AUTH_REQUIRED', room });
          break;
        }
        this.joinRoom(ws, room);
        this.sendToClient(ws, { type: 'joined', room });
        break;
      }

      case 'leave': {
        this.leaveRoom(ws, msg.room);
        this.sendToClient(ws, { type: 'left', room: msg.room });
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
    this.broadcastToRoom('dashboard', payload);
  }
}

export const socketService = new SocketService();
export default socketService;

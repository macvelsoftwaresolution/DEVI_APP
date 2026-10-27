import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { isAllowedOrigin, WHATSAPP_VERIFY_TOKEN } from './config/security.js';
import { safeEqual } from './middlewares/auth.middleware.js';
import { maskUrl } from './utils/logMask.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';
import { globalLimiter } from './middlewares/rateLimiter.js';
import { socketService } from './services/socket.service.js';
import { startSignalWatchdog } from './services/signal.watchdog.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5005;

// Trust reverse proxy (NGINX / Cloudflare) for accurate client IPs and SSL detection
app.set('trust proxy', 1);

// Security Headers with Helmet
// CSP & Embedder disabled for embedded views to allow Leaflet CDN and OpenStreetMap tiles
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'x-sos-token'],
  })
);

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging: same columns as morgan 'dev', but tracking/control keys and phone numbers in URLs are masked
morgan.token('safe-url', (req) => maskUrl(req.originalUrl || req.url));
app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));

// Global API Rate Limiting
app.use('/api', globalLimiter);

// API Routes
app.use('/api', apiRoutes);

// WhatsApp Business Cloud API Webhook Handshake & Event Receiver
app.get(['/webhook', '/api/webhook'], (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && WHATSAPP_VERIFY_TOKEN && safeEqual(token, WHATSAPP_VERIFY_TOKEN)) {
    console.log('✅ [WHATSAPP WEBHOOK VERIFIED BY META]');
    return res.status(200).send(challenge);
  } else {
    console.warn(`❌ [WHATSAPP WEBHOOK FAILED] Verify token mismatch`);
    return res.sendStatus(403);
  }
});

app.post(['/webhook', '/api/webhook'], (req, res) => {
  // Events carry recipients' phone numbers: log only what kind of event arrived
  const change = req.body?.entry?.[0]?.changes?.[0];
  const statuses = (change?.value?.statuses || []).map((s) => s.status).join(',') || '-';
  console.log(`📩 [WHATSAPP EVENT RECEIVED] field: ${change?.field || 'unknown'}, statuses: ${statuses}`);
  return res.status(200).send('EVENT_RECEIVED');
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🛡️</text></svg>`);
});

// Redirect frontend portal routes to Web Domain (devi.macvelsoftware.com)
const WEB_PORTAL_URL = process.env.WEB_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://devi.macvelsoftware.com';
app.get(['/track/:alertId', '/dashboard'], (req, res) => {
  return res.redirect(302, `${WEB_PORTAL_URL}${req.originalUrl}`);
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'DEVI Women Safety Backend API',
    status: 'online',
    version: '1.0.0',
    security: {
      rateLimiting: 'active',
      helmetHeaders: 'active',
      jwtAuth: 'active',
    },
    documentation: '/api/health',
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Create HTTP and WebSocket Server
const server = http.createServer(app);
socketService.init(server);
startSignalWatchdog();

// Start server
server.listen(PORT, () => {
  console.log(`🚀 DEVI Backend server running on port ${PORT}`);
  console.log(`⚡ WebSocket Server listening on ws://localhost:${PORT}/ws`);
  console.log(`🛡️ Security enabled: Helmet, Rate Limiter, and JWT Auth active`);
  console.log(`📡 Health check available at: http://localhost:${PORT}/api/health`);
});

export default app;

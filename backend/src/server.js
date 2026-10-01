import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';
import { globalLimiter } from './middlewares/rateLimiter.js';
import { verifyAdminKey } from './middlewares/auth.middleware.js';
import { DataService } from './services/data.service.js';
import { socketService } from './services/socket.service.js';

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
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  })
);

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('dev'));

// Global API Rate Limiting
app.use('/api', globalLimiter);

// API Routes
app.use('/api', apiRoutes);

// WhatsApp Business Cloud API Webhook Handshake & Event Receiver
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'devi_whatsapp_verify_token_2026';

app.get(['/webhook', '/api/webhook'], (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ [WHATSAPP WEBHOOK VERIFIED BY META]');
    return res.status(200).send(challenge);
  } else {
    console.warn(`❌ [WHATSAPP WEBHOOK FAILED] Expected: ${WHATSAPP_VERIFY_TOKEN}, Received: ${token}`);
    return res.sendStatus(403);
  }
});

app.post(['/webhook', '/api/webhook'], (req, res) => {
  console.log('📩 [WHATSAPP EVENT RECEIVED]', JSON.stringify(req.body));
  return res.status(200).send('EVENT_RECEIVED');
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🛡️</text></svg>`);
});

// Redirect frontend portal routes to Web Domain (devi.macvelsoftware.com)
const WEB_PORTAL_URL = process.env.WEB_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://devi.macvelsoftware.com';
app.get(['/track/:alertId', '/duty', '/dashboard'], (req, res) => {
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

// Start server
server.listen(PORT, () => {
  console.log(`🚀 DEVI Backend server running on port ${PORT}`);
  console.log(`⚡ WebSocket Server listening on ws://localhost:${PORT}/ws`);
  console.log(`🛡️ Security enabled: Helmet, Rate Limiter, and JWT Auth active`);
  console.log(`📡 Health check available at: http://localhost:${PORT}/api/health`);
});

export default app;

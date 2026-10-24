import { Router } from 'express';
import multer from 'multer';
import { DataService } from '../services/data.service.js';
import { uploadMediaToCloudinary } from '../config/cloudinary.js';
import { sosTriggerLimiter } from '../middlewares/rateLimiter.js';
import { verifyAdmin, optionalToken } from '../middlewares/auth.middleware.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { socketService } from '../services/socket.service.js';
import { Encryption } from '../utils/encryption.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

const router = Router();

// POST /api/sos/trigger - Dispatches emergency alert, starts live tracking, and returns tracking URL
router.post('/trigger', sosTriggerLimiter, async (req, res, next) => {
  try {
    // Decrypt AES-256 payload if client sent encrypted payload
    let reqData = req.body;
    if (reqData.encrypted) {
      const decrypted = Encryption.decryptObject(reqData.encrypted);
      if (decrypted) reqData = { ...reqData, ...decrypted };
    }

    const { userPhone, location, latitude, longitude, accuracy, idempotency_key, idempotencyKey, captured_at } = reqData;
    const finalIdempotencyKey = idempotency_key || idempotencyKey || null;

    // STEP 1: Idempotency & Active Session Check (Prevents duplicate DB alerts & duplicate SMS)
    const existingSession = await DataService.findExistingSos({
      idempotencyKey: finalIdempotencyKey,
      userPhone,
    });

    const getWebBaseUrl = () => {
      if (process.env.WEB_BASE_URL) return process.env.WEB_BASE_URL;
      if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
      const host = req.get('host') || 'localhost:5005';
      const cleanHost = host.replace(/^devi-api\./, 'devi.');
      return `${req.protocol}://${cleanHost}`;
    };

    const baseUrl = getWebBaseUrl();

    if (existingSession) {
      const trackingUrl = `${baseUrl}/track/${existingSession.id}`;
      console.log(`🔁 [IDEMPOTENT / DUPLICATE SOS CAUGHT] Session ID: ${existingSession.id}, User: ${userPhone}, Key: ${finalIdempotencyKey || 'N/A'}. 🛑 Skipping duplicate SMS broadcast.`);

      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'Active emergency SOS already exists. Reusing existing session.',
        data: {
          ...existingSession,
          trackingUrl,
        },
      });
    }

    // STEP 2: Fresh SOS - Create session and persist to database
    const alert = await DataService.createSosAlert({
      userPhone,
      location,
      latitude,
      longitude,
      accuracy,
      idempotencyKey: finalIdempotencyKey,
      capturedAt: captured_at,
    });

    const trackingUrl = `${baseUrl}/track/${alert.id}`;
    console.log(`🚨 [NEW EMERGENCY SOS LOGGED] ID: ${alert.id}, User: ${userPhone}, Track: ${trackingUrl}`);

    // Retrieve victim's friendly display name if available
    let victimName = req.body.userName;
    if (!victimName && userPhone) {
      try {
        const u = await DataService.findUserByPhone(userPhone);
        if (u && u.name) victimName = u.name;
      } catch (_) { }
    }
    if (!victimName) victimName = userPhone || 'DEVI User';

    // STEP 3: Emergency Dispatch (WhatsApp active with Google Maps Hyperlink & Live Tracking)
    const contactsToSend = req.body.emergencyContacts || req.body.contactsAlerted;
    let dispatchedAnyWhatsApp = false;

    if (contactsToSend && Array.isArray(contactsToSend) && contactsToSend.length > 0) {
      contactsToSend.forEach(contact => {
        let contactPhone = typeof contact === 'object' ? (contact.phone || contact.number) : String(contact);
        const match = contactPhone.match(/(?:\+?91|0)?[6-9]\d{9}/);
        if (match) {
          contactPhone = match[0];
          dispatchedAnyWhatsApp = true;
          // Dispatch WhatsApp SOS message with Google Maps Hyperlink & live tracking link
          WhatsAppService.sendEmergencyAlert(
            contactPhone,
            trackingUrl,
            victimName,
            { latitude, longitude, location }
          );
        }
      });
    }

    // If Instant SOS / Guest user without personal guardians, dispatch WhatsApp to Emergency Control / Admin
    if (!dispatchedAnyWhatsApp) {
      const emergencyControlPhone = process.env.ADMIN_WHATSAPP || '916381592501';
      console.log(`📲 [INSTANT SOS WHATSAPP DISPATCH] Alerting Emergency Control Room (+${emergencyControlPhone}) with Google Maps & Live Tracking Link...`);
      WhatsAppService.sendEmergencyAlert(
        emergencyControlPhone,
        trackingUrl,
        `${victimName} (Instant SOS)`,
        { latitude, longitude, location: location || 'Live GPS Coordinates' }
      );
    }

    // Broadcast real-time emergency alert via WebSockets to operator dashboard
    socketService.broadcastNewSosAlert({
      id: alert.id,
      userPhone,
      userName: victimName,
      latitude,
      longitude,
      location,
      trackingUrl,
      timestamp: alert.timestamp || new Date().toISOString(),
      status: 'ACTIVE',
    });

    res.status(201).json({
      success: true,
      duplicate: false,
      message: 'Emergency SOS alert recorded and live tracking initiated',
      data: {
        ...alert,
        status: 'ACTIVE',
        trackingUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/geocode?lat=...&lng=... - Server-side secure reverse geocoding (Google Maps API + Cache)
router.get('/geocode', async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng query parameters are required' });
    }
    const address = await DataService.reverseGeocode(lat, lng);
    res.json({
      success: true,
      address: address || 'Live Emergency Location',
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sos/live-update - Updates live GPS coordinates stream from mobile app
router.post('/live-update', async (req, res, next) => {
  try {
    let reqData = req.body;
    if (reqData.encrypted) {
      const decrypted = Encryption.decryptObject(reqData.encrypted);
      if (decrypted) reqData = { ...reqData, ...decrypted };
    }

    const { alertId, latitude, longitude, address, status, accuracy, acc } = reqData;
    const finalAccuracy = accuracy != null ? parseFloat(accuracy) : (acc != null ? parseFloat(acc) : null);

    if (!alertId || latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: 'alertId, latitude, and longitude are required',
      });
    }

    const session = await DataService.updateLiveLocation({
      alertId,
      latitude,
      longitude,
      accuracy: finalAccuracy,
      address,
      status: status || 'ACTIVE',
    });

    // Real-time broadcast to WebSockets (Zero-overhead update for guardians & dashboard)
    socketService.broadcastLocationUpdate(alertId, {
      alertId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      accuracy: finalAccuracy,
      address,
      status: status || 'ACTIVE',
      lastUpdated: new Date().toISOString(),
    });

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/live/:alertId - Returns real-time coordinates and breadcrumbs for guardians
router.get('/live/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    const session = await DataService.getLiveLocation(alertId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Live tracking session not found or expired',
      });
    }

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sos/upload-evidence - Uploads 2-minute emergency video/audio evidence to Cloudinary and saves URL
router.post('/upload-evidence', upload.single('file'), async (req, res, next) => {
  try {
    const { alertId } = req.body;
    if (!alertId) {
      return res.status(400).json({
        success: false,
        message: 'alertId is required in request body',
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Video or audio file is required in multipart field "file"',
      });
    }

    const fileSizeMb = (req.file.size / (1024 * 1024)).toFixed(2);
    console.log(`📹 [EMERGENCY EVIDENCE UPLOAD] Alert ID: ${alertId}, Size: ${fileSizeMb}MB, MIME: ${req.file.mimetype}`);

    let evidenceUrl = '';

    // If Cloudinary credentials are provided, upload directly to Cloudinary
    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_KEY !== 'your_api_key'
    ) {
      const uploadRes = await uploadMediaToCloudinary(req.file.buffer, {
        public_id: `devi_sos_${alertId}_${Date.now()}`,
      });
      evidenceUrl = uploadRes.secure_url || uploadRes.url;
      console.log(`✅ [CLOUDINARY UPLOAD SUCCESS] Stored URL: ${evidenceUrl}`);
    } else {
      console.warn('⚠️ Cloudinary keys not yet configured in .env. Returning simulated Cloudinary URL.');
      evidenceUrl = `https://res.cloudinary.com/demo/video/upload/devi_sos_${alertId}_evidence.mp4`;
    }

    // Attach to active live session and persist to Supabase
    const session = await DataService.attachEvidenceUrl(alertId, evidenceUrl);

    try {
      socketService.broadcastToRoom('dashboard', {
        type: 'incident:evidence',
        alertId,
        evidenceUrl,
      });
    } catch (_) { }

    res.status(200).json({
      success: true,
      message: 'Emergency evidence video/audio uploaded and attached to SOS alert successfully',
      data: {
        alertId,
        evidenceUrl,
        session,
      },
    });
  } catch (err) {
    console.error('Evidence upload failed:', err);
    next(err);
  }
});

// POST /api/sos/resolve/:alertId - Deactivates live tracking when user marks as safe
router.post('/resolve/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    const session = await DataService.resolveSosAlert(alertId);

    console.log(`✅ [SOS RESOLVED/DEACTIVATED] ID: ${alertId}`);

    // Broadcast status change immediately to all WebSocket listeners
    socketService.broadcastSosStatus(alertId, { status: 'RESOLVED' });

    res.status(200).json({
      success: true,
      message: 'SOS Alert resolved successfully',
      data: session,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/history/:phone - Returns SOS emergency history for a user
router.get('/history/:phone', optionalToken, async (req, res, next) => {
  try {
    const { phone } = req.params;

    // Guest sessions (GUEST_xxx) have no login, so only registered numbers need a token
    if (!phone.startsWith('GUEST_') && !req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please log in to view your emergency history.',
      });
    }

    // Privacy check: User can only view their own emergency history
    if (req.user && req.user.phone !== phone) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: You cannot view another user emergency history',
      });
    }

    const history = await DataService.getSosHistory(phone);

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/history - Returns all SOS history (Protected: Operator / Admin only)
router.get('/history', verifyAdmin, async (req, res, next) => {
  try {
    const history = await DataService.getSosHistory();

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

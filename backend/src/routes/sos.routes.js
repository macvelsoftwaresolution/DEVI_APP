import { Router } from 'express';
import { Readable } from 'node:stream';
import multer from 'multer';
import { GeocodeService } from '../services/geocode.service.js';
import { SosService } from '../services/sos.service.js';
import { UserService } from '../services/user.service.js';
import { uploadMediaToCloudinary, evidenceDeliveryUrl } from '../config/cloudinary.js';
import { toEvidenceRef, parseEvidenceRef, evidenceLink, withEvidenceLink } from '../utils/evidence.js';
import { sosTriggerLimiter } from '../middlewares/rateLimiter.js';
import {
  verifyAdmin,
  optionalToken,
  signSosControlToken,
  verifySosControlToken,
  canResolveSos,
  signSosViewToken,
  verifySosViewToken,
  isTrackingLinkExpired,
  decodeAdminToken,
} from '../middlewares/auth.middleware.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { socketService } from '../services/socket.service.js';
import { broadcastSignalLost } from '../services/signal.watchdog.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

const router = Router();

// Only the device that created the alert may change it (resolve, move location, attach evidence).
// The token comes from the X-SOS-Token header or a `controlToken` field in the payload.
const hasSosControl = (req, alertId, payload = {}) =>
  verifySosControlToken(String(alertId), req.get('x-sos-token') || payload.controlToken);

const rejectSosControl = (res) =>
  res.status(403).json({
    success: false,
    message: 'This device is not allowed to update this SOS alert.',
  });

const hasAdminLogin = (req) => {
  const auth = req.get('authorization') || '';
  return !!decodeAdminToken(auth.startsWith('Bearer ') ? auth.slice(7) : null);
};

// View access to an alert's evidence: the guardian link key (?k=) or an admin login
const hasViewAccess = (req, alertId) =>
  verifySosViewToken(String(alertId), req.query.k) || hasAdminLogin(req);

// Strips internal fields (idempotency key, phone) before sending a session to clients.
// The stored evidence reference becomes the protected link, or null without view access.
const publicSession = (session, { includeEvidence = true } = {}) => {
  if (!session) return session;
  const { idempotencyKey, userPhone, userId, ...rest } = session;
  return { ...rest, evidenceUrl: includeEvidence ? evidenceLink(rest.id, rest.evidenceUrl) : null };
};

// Guardian tracking link carries the view key so evidence opens only for people who got the link
const trackingLink = (baseUrl, alertId) => `${baseUrl}/track/${alertId}?k=${signSosViewToken(String(alertId))}`;

// POST /api/sos/trigger - Dispatches emergency alert, starts live tracking, and returns tracking URL
router.post('/trigger', sosTriggerLimiter, optionalToken, async (req, res, next) => {
  try {
    // Transport is protected by HTTPS; the payload is plain JSON
    const reqData = req.body;

    const { userPhone, location, latitude, longitude, accuracy, idempotency_key, idempotencyKey, captured_at } = reqData;
    const finalIdempotencyKey = idempotency_key || idempotencyKey || null;

    // STEP 1: Idempotency & Active Session Check (Prevents duplicate DB alerts & duplicate SMS)
    const existingSession = await SosService.findExistingSos({
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
      const trackingUrl = trackingLink(baseUrl, existingSession.id);
      console.log(`🔁 [IDEMPOTENT / DUPLICATE SOS CAUGHT] Session ID: ${existingSession.id}, User: ${userPhone}, Key: ${finalIdempotencyKey || 'N/A'}. 🛑 Skipping duplicate SMS broadcast.`);

      // Hand the control token back only to the original device (same idempotency key)
      // or the logged-in owner, never to someone who only knows the phone number
      const isSameDevice = !!finalIdempotencyKey && existingSession.idempotencyKey === finalIdempotencyKey;
      const isOwner = !!req.user?.phone && req.user.phone === existingSession.userPhone;

      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'Active emergency SOS already exists. Reusing existing session.',
        data: {
          ...publicSession(existingSession),
          trackingUrl,
          ...((isSameDevice || isOwner) && { controlToken: signSosControlToken(existingSession.id) }),
        },
      });
    }

    // STEP 2: Fresh SOS - Create session and persist to database
    const alert = await SosService.createSosAlert({
      userPhone,
      location,
      latitude,
      longitude,
      accuracy,
      idempotencyKey: finalIdempotencyKey,
      capturedAt: captured_at,
    });

    const trackingUrl = trackingLink(baseUrl, alert.id);
    console.log(`🚨 [NEW EMERGENCY SOS LOGGED] ID: ${alert.id}, User: ${userPhone}, Track: ${trackingUrl}`);

    // Retrieve victim's friendly display name if available
    let victimName = req.body.userName;
    if (!victimName && userPhone) {
      try {
        const u = await UserService.findUserByPhone(userPhone);
        if (u && u.name) victimName = u.name;
      } catch (_) { }
    }
    if (!victimName) victimName = userPhone || 'DEVI User';

    // Dashboard first: operators see the alert immediately, before WhatsApp finishes
    socketService.broadcastNewSosAlert({
      id: alert.id,
      userPhone,
      userName: victimName,
      latitude: alert.latitude,
      longitude: alert.longitude,
      location: alert.location,
      trackingUrl,
      timestamp: alert.timestamp || new Date().toISOString(),
      status: 'ACTIVE',
    });

    // STEP 3: Emergency Dispatch (WhatsApp with live tracking link).
    // Wait for Meta's answer (bounded by the service timeout) so the phone learns who was NOT reached.
    const recipients = [];
    const contactsToSend = req.body.emergencyContacts || req.body.contactsAlerted;
    if (Array.isArray(contactsToSend)) {
      for (const contact of contactsToSend) {
        const raw = typeof contact === 'object' ? (contact.phone || contact.number) : String(contact);
        const match = String(raw || '').match(/(?:\+?91|0)?[6-9]\d{9}/);
        if (match) recipients.push({ phone: match[0].slice(-10), role: 'guardian' });
      }
    }

    // Instant SOS / Guest user without personal guardians: alert the Emergency Control / Admin number
    let isControlRoomOnly = false;
    if (recipients.length === 0) {
      // No fallback number: an emergency must never go to an unknown person's phone
      const emergencyControlPhone = (process.env.ADMIN_WHATSAPP || '').replace(/\D/g, '');
      if (emergencyControlPhone) {
        console.log(`📲 [INSTANT SOS WHATSAPP DISPATCH] Alerting Emergency Control Room (+${emergencyControlPhone})...`);
      } else {
        console.error('🚨 [CONTROL ROOM NOT CONFIGURED] ADMIN_WHATSAPP is not set: this SOS has no guardian and no control room WhatsApp. Only the dashboard was alerted.');
      }
      recipients.push({ phone: emergencyControlPhone, role: 'control_room' });
      isControlRoomOnly = true;
    }

    const results = await Promise.all(
      recipients.map(async (r) => {
        if (!r.phone) {
          return { phone: '', role: r.role, sent: false, reason: 'CONTROL_ROOM_NOT_CONFIGURED' };
        }
        const out = await WhatsAppService.sendEmergencyAlert(
          r.phone,
          trackingUrl,
          isControlRoomOnly ? `${victimName} (Instant SOS)` : victimName,
          { latitude: alert.latitude, longitude: alert.longitude, location: alert.location }
        ).catch((e) => ({ success: false, reason: 'NETWORK', error: e.message }));
        return { phone: r.phone, role: r.role, sent: !!out?.success, reason: out?.success ? null : (out?.reason || 'UNKNOWN') };
      })
    );

    const sentCount = results.filter((r) => r.sent).length;
    const whatsapp = {
      total: results.length,
      sent: sentCount,
      status: sentCount === results.length ? 'ALL_SENT' : sentCount === 0 ? 'NONE_SENT' : 'PARTIAL',
      results,
    };
    if (whatsapp.status !== 'ALL_SENT') {
      console.warn(`⚠️ [SOS WHATSAPP ${whatsapp.status}] Alert ${alert.id}: ${sentCount}/${results.length} accepted by WhatsApp`);
    }

    // Keep on the live session so retries (duplicate responses) and the dashboard see it too
    const liveSession = SosService.attachWhatsAppStatus(alert.id, whatsapp);
    socketService.broadcastToRoom('dashboard', { type: 'incident:whatsapp', alertId: alert.id, whatsapp });

    res.status(201).json({
      success: true,
      duplicate: false,
      message: 'Emergency SOS alert recorded and live tracking initiated',
      data: {
        ...publicSession(liveSession || alert),
        status: 'ACTIVE',
        trackingUrl,
        whatsapp,
        controlToken: signSosControlToken(alert.id),
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
    const address = await GeocodeService.reverseGeocode(lat, lng);
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
    const reqData = req.body;

    const { alertId, latitude, longitude, address, status, accuracy, acc } = reqData;
    const finalAccuracy = accuracy != null ? parseFloat(accuracy) : (acc != null ? parseFloat(acc) : null);

    if (!alertId || latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: 'alertId, latitude, and longitude are required',
      });
    }

    if (!hasSosControl(req, alertId, reqData)) {
      return rejectSosControl(res);
    }

    const session = await SosService.updateLiveLocation({
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
      data: publicSession(session),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/live/:alertId - Returns real-time coordinates and breadcrumbs for guardians
router.get('/live/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    // Without the link key anyone who learns an alert ID could follow the victim's live location.
    // Checked before the lookup so unknown and forbidden IDs look the same.
    const fullAccess = hasSosControl(req, alertId) || hasAdminLogin(req);
    if (!fullAccess && !verifySosViewToken(String(alertId), req.query.k)) {
      return res.status(403).json({
        success: false,
        code: 'TRACKING_KEY_REQUIRED',
        message: 'This tracking link is incomplete. Open the full link from the WhatsApp alert.',
      });
    }

    const session = await SosService.getLiveLocation(alertId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Live tracking session not found or expired',
      });
    }

    // Guardian links stop showing the location 24h after the alert is resolved
    if (!fullAccess && isTrackingLinkExpired(session)) {
      return res.status(410).json({
        success: false,
        code: 'TRACKING_LINK_EXPIRED',
        message: 'This alert has ended and the tracking link has expired.',
      });
    }

    res.status(200).json({
      success: true,
      data: publicSession(session),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/evidence/:alertId?k=<view key> - Streams the private evidence file.
// The Cloudinary URL is never sent to the client; Range is forwarded so video seeking works.
router.get('/evidence/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    if (!hasViewAccess(req, alertId)) {
      return res.status(403).json({ success: false, message: 'This evidence link is not valid.' });
    }

    const ref = parseEvidenceRef(await SosService.getEvidenceRef(alertId));
    if (!ref) {
      return res.status(404).json({ success: false, message: 'No evidence has been uploaded for this alert yet.' });
    }

    const upstream = await fetch(evidenceDeliveryUrl(ref), {
      headers: req.headers.range ? { Range: req.headers.range } : {},
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok && upstream.status !== 206) {
      console.error(`❌ [EVIDENCE FETCH FAILED] Alert ${alertId}: Cloudinary HTTP ${upstream.status}`);
      return res.status(502).json({ success: false, message: 'Evidence is temporarily unavailable. Try again.' });
    }

    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');

    const body = Readable.fromWeb(upstream.body);
    req.on('close', () => body.destroy());
    body.on('error', () => res.end());
    body.pipe(res);
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

    if (!hasSosControl(req, alertId, req.body)) {
      return rejectSosControl(res);
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Video or audio file is required in multipart field "file"',
      });
    }

    const fileSizeMb = (req.file.size / (1024 * 1024)).toFixed(2);
    console.log(`📹 [EMERGENCY EVIDENCE UPLOAD] Alert ID: ${alertId}, Size: ${fileSizeMb}MB, MIME: ${req.file.mimetype}`);

    // Stored reference (private asset), never a public Cloudinary URL
    let evidenceRef = '';

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
      evidenceRef = toEvidenceRef(uploadRes);
      console.log(`✅ [CLOUDINARY UPLOAD SUCCESS] Stored private evidence: ${evidenceRef}`);
    } else {
      console.warn('⚠️ Cloudinary keys not yet configured in .env. Storing simulated evidence reference.');
      evidenceRef = `cld:upload/video/devi_sos_${alertId}_evidence.mp4`;
    }

    // Attach to active live session and persist to Supabase
    const session = await SosService.attachEvidenceUrl(alertId, evidenceRef);
    const evidenceUrl = evidenceLink(alertId, evidenceRef);

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
        session: publicSession(session),
      },
    });
  } catch (err) {
    console.error('Evidence upload failed:', err);
    next(err);
  }
});

// POST /api/sos/resolve/:alertId - Deactivates live tracking when user marks as safe
router.post('/resolve/:alertId', optionalToken, async (req, res, next) => {
  try {
    const { alertId } = req.params;
    const auth = req.get('authorization') || '';
    const allowed = canResolveSos({
      alertId,
      controlToken: req.get('x-sos-token') || req.body?.controlToken,
      adminToken: auth.startsWith('Bearer ') ? auth.slice(7) : null,
      user: req.user,
      ownerId: req.user ? await SosService.getAlertOwnerId(alertId) : null,
    });
    if (!allowed) {
      return rejectSosControl(res);
    }

    const session = await SosService.resolveSosAlert(alertId);

    console.log(`✅ [SOS RESOLVED/DEACTIVATED] ID: ${alertId}`);

    // Broadcast status change immediately to all WebSocket listeners (dashboard & tracking rooms)
    socketService.broadcastSosStatus(alertId, { status: 'RESOLVED' });
    socketService.broadcastToRoom('dashboard', {
      type: 'incident:resolved',
      alertId,
      status: 'RESOLVED',
      resolvedAt: new Date().toISOString(),
    });

    res.status(200).json({
      success: true,
      message: 'SOS Alert resolved successfully',
      data: publicSession(session),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sos/app-closed/:alertId - Sent by the phone when the user swipes the app away during an SOS
router.post('/app-closed/:alertId', (req, res) => {
  const { alertId } = req.params;
  if (!hasSosControl(req, alertId, req.body)) {
    return rejectSosControl(res);
  }

  const session = SosService.setSignalState(alertId, { lost: true, reason: 'APP_CLOSED' });
  console.warn(`📴 [APP CLOSED DURING SOS] Alert ${alertId}`);
  broadcastSignalLost(session);
  res.json({ success: true });
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

    const history = await SosService.getSosHistory(phone);

    res.status(200).json({
      success: true,
      data: history.map((h) => withEvidenceLink(h)),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/history - Returns all SOS history (Protected: Operator / Admin only)
router.get('/history', verifyAdmin, async (req, res, next) => {
  try {
    const history = await SosService.getSosHistory();

    res.status(200).json({
      success: true,
      data: history.map((h) => withEvidenceLink(h)),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

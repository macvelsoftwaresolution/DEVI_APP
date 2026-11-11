import { Router } from 'express';
import { Readable } from 'node:stream';
import multer from 'multer';
import { SosService } from '../services/sos.service.js';
import { UserService } from '../services/user.service.js';
import { uploadMediaToCloudinary, evidenceDeliveryUrl } from '../config/cloudinary.js';
import { toEvidenceRef, parseEvidenceRef, evidenceLink, withEvidenceLink } from '../utils/evidence.js';
import { sosTriggerLimiter, evidenceUploadLimiter } from '../middlewares/rateLimiter.js';
import { maskPhone } from '../utils/logMask.js';
import { sanitizeVictimName, sosUserId } from '../utils/sosRecipients.js';
import { canonicalPhone } from '../utils/phone.js';
import {
  verifyAdmin,
  optionalToken,
  verifyToken,
  provenSosAlertIds,
  signSosControlToken,
  verifySosControlToken,
  requireSosControlHeaders,
  sosResolver,
  verifySosViewToken,
  decodeAdminToken,
  isTrackingLinkExpired,
} from '../middlewares/auth.middleware.js';
import { socketService } from '../services/socket.service.js';
import { sosDispatch, buildNotifyPlan } from '../services/sosDispatch.service.js';
import { sosOffline } from '../services/sosOffline.service.js';
import { audit } from '../services/audit.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  // A 2-minute video is ~35 MB; 60 MB leaves room without letting one request fill memory
  limits: { fileSize: 60 * 1024 * 1024 },
});

const router = Router();

// Only the device that created the alert may change it (resolve, attach evidence).
// The token comes from the X-SOS-Token header or a `controlToken` field in the payload.
const hasSosControl = (req, alertId, payload = {}) =>
  verifySosControlToken(String(alertId), req.get('x-sos-token') || payload.controlToken);

const rejectSosControl = (res) =>
  res.status(403).json({
    success: false,
    message: 'This device is not allowed to update this SOS alert.',
  });

const adminOf = (req) => {
  const auth = req.get('authorization') || '';
  return decodeAdminToken(auth.startsWith('Bearer ') ? auth.slice(7) : null);
};
const hasAdminLogin = (req) => !!adminOf(req);

// Audit log: an admin opening a location or evidence. Guardian links (?k=) are not admins.
const trackAdminView = (req, action, alertId) => {
  const admin = adminOf(req);
  if (admin) audit.record({ admin, action, targetType: 'sos', targetId: alertId, ip: req.ip });
};

// View access to an alert's evidence: the guardian link key (?k=) or an admin login
const hasViewAccess = (req, alertId) =>
  verifySosViewToken(String(alertId), req.query.k) || hasAdminLogin(req);

// Strips internal fields (idempotency key, phone) before sending a session to clients.
// The stored evidence reference becomes the protected link, or null without view access.
const publicSession = (session, { includeEvidence = true } = {}) => {
  if (!session) return session;
  const { idempotencyKey, userPhone, userId, needsPlaceName, planSaved, ...rest } = session;
  return { ...rest, evidenceUrl: includeEvidence ? evidenceLink(rest.id, rest.evidenceUrl) : null };
};


// POST /api/sos/trigger - Records the SOS and sends guardians its location on WhatsApp (no live tracking)
router.post('/trigger', sosTriggerLimiter, optionalToken, async (req, res, next) => {
  try {
    // Transport is protected by HTTPS; the payload is plain JSON
    const reqData = req.body;

    const { location, latitude, longitude, accuracy, idempotency_key, idempotencyKey, captured_at } = reqData;
    const finalIdempotencyKey = idempotency_key || idempotencyKey || null;

    // A logged-in user is identified by the token, never by the request body (R6)
    const account = req.user?.phone && !req.user.isGuest ? await UserService.findUserByPhone(req.user.phone) : null;
    const userPhone = sosUserId(req.user?.phone, reqData.userPhone);

    const replyDuplicate = (existingSession) => {
      // The idempotency key is not logged: with it, /trigger hands back the alert's control token
      console.log(`🔁 [IDEMPOTENT / DUPLICATE SOS CAUGHT] Session ID: ${existingSession.id}, User: ${maskPhone(userPhone)}. 🛑 Skipping duplicate SMS broadcast.`);
      // If the first request was cut off before its sends were queued, they go out now (L3).
      // Not awaited, and only takes it on when its sending stopped over 30 seconds ago.
      // An SOS taken without the database is not in it yet: the journal replay finishes that one.
      if (!existingSession.degraded) sosDispatch.resume(existingSession.id);

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
          ...((isSameDevice || isOwner) && { controlToken: signSosControlToken(existingSession.id) }),
        },
      });
    };

    // STEP 1: Idempotency & Active Session Check (Prevents duplicate DB alerts & duplicate SMS)
    const existingSession = await SosService.findExistingSos({
      idempotencyKey: finalIdempotencyKey,
      userPhone,
    });

    if (existingSession) return replyDuplicate(existingSession);

    // Name shown in the WhatsApp: the account's own name, else the request's name stripped of links.
    // An unverified request never gets a registered user's name from the database.
    const victimName = account?.name || sanitizeVictimName(reqData.userName);

    // Who it goes to, decided before saving so the plan is saved with the alert (L3).
    // Numbers saved on the account are verified; any other number is limited (R6).
    const plan = buildNotifyPlan({
      account,
      requestContacts: reqData.emergencyContacts || reqData.contactsAlerted,
      victimName,
      overIpLimit: !!req.sosOverIpLimit,
    });

    // Dashboard first: operators see the alert immediately, before WhatsApp finishes
    const announce = (a) => socketService.broadcastNewSosAlert({
      id: a.id,
      userPhone,
      userName: victimName,
      latitude: a.latitude,
      longitude: a.longitude,
      location: a.location,
      timestamp: a.timestamp || new Date().toISOString(),
      status: 'ACTIVE',
    });

    // STEP 2: Fresh SOS - Create session and persist to database
    let alert;
    let results;
    let saveError = null;
    try {
      alert = await SosService.createSosAlert({
        userPhone,
        location,
        latitude,
        longitude,
        accuracy,
        idempotencyKey: finalIdempotencyKey,
        capturedAt: captured_at,
        notifyPlan: plan,
      });
    } catch (err) {
      saveError = err;
    }

    if (saveError) {
      // L2: the database failed. Send anyway from the request and journal it (sosOffline.service.js).
      // A logged-in user's account could not be read either, so the numbers the app sent stand in
      // for the saved guardians: the token proves who she is, and an SOS must not wait for the
      // database to tell us her guardians.
      const offlinePlan = !account && req.user?.phone && !req.user.isGuest
        ? buildNotifyPlan({
          account: { guardians: (reqData.emergencyContacts || reqData.contactsAlerted || []).map((c) => ({ phone: c?.phone || c?.number || c })) },
          requestContacts: [],
          victimName,
          overIpLimit: !!req.sosOverIpLimit,
        })
        : plan;
      let duplicate;
      ({ session: alert, results, duplicate } = await sosOffline.accept({
        userPhone,
        idempotencyKey: finalIdempotencyKey,
        latitude,
        longitude,
        accuracy,
        location,
        plan: offlinePlan,
        cause: saveError.code || saveError.message || 'unknown',
        onSession: announce,
      }));
      // A resend of an SOS already sent without the database: answered, not sent again
      if (duplicate) return replyDuplicate(alert);
    } else {
      // Lost a race with a request using the same key: that request sends the alerts
      if (alert.duplicate) return replyDuplicate(alert);

      console.log(`🚨 [NEW EMERGENCY SOS LOGGED] ID: ${alert.id}, User: ${maskPhone(userPhone)}`);
      const verifiedCount = plan.recipients.filter((r) => r.verified).length;
      const guardianCount = plan.controlRoomOnly ? 0 : plan.recipients.length;
      console.log(`📨 [SOS RECIPIENTS] Alert ${alert.id}: ${verifiedCount} verified, ${guardianCount - verifiedCount} unverified`);

      announce(alert);
      await SosService.fillPlaceName(alert);

      // STEP 3: Emergency Dispatch (WhatsApp with the SOS location as a Google Maps link, no live tracking).
      // Wait for Meta's answer (bounded by the service timeout) so the phone learns who was NOT reached.
      // Once every send is queued the alert is marked sent; if this request dies before that, the
      // resumer sends the saved plan (sosDispatch.service.js)
      results = await sosDispatch.dispatchAlert(alert, plan, { markWhenQueued: alert.planSaved });
    }

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
      // degraded: sent, but the database was down, so it is saved later (and not yet retried)
      ...(saveError && { degraded: true }),
      message: saveError ? 'Emergency SOS alert sent; it will be saved when the server database is back' : 'Emergency SOS alert recorded',
      data: {
        ...publicSession(liveSession || alert),
        status: 'ACTIVE',
        whatsapp,
        controlToken: signSosControlToken(alert.id),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/location/:alertId?k=<view key> - Where the SOS was pressed, for the guardian link page.
// The saved SOS location only (there is no live tracking); hidden 24h after the alert is resolved.
router.get('/location/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    // Checked before the lookup so unknown and forbidden IDs look the same
    const isAdmin = hasAdminLogin(req);
    if (!isAdmin && !verifySosViewToken(String(alertId), req.query.k)) {
      return res.status(403).json({
        success: false,
        code: 'TRACKING_KEY_REQUIRED',
        message: 'This link is incomplete. Open the full link from the WhatsApp alert.',
      });
    }

    if (isAdmin) trackAdminView(req, 'view_location', alertId);
    const alert = await SosService.getAlertLocation(alertId);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'This SOS alert was not found.' });
    }

    if (!isAdmin && isTrackingLinkExpired(alert)) {
      return res.status(410).json({
        success: false,
        code: 'TRACKING_LINK_EXPIRED',
        message: 'This alert has ended and the link has expired.',
      });
    }

    // Guardian view: SAFE only when she marked herself safe. A dashboard close is CLOSED and the
    // page shows it like an alert (no mention of the control room)
    const { resolvedBy, resolvedTime, ...rest } = alert;
    const status = alert.status !== 'RESOLVED' ? 'ACTIVE' : resolvedBy === 'user' ? 'SAFE' : 'CLOSED';

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({
      success: true,
      data: { ...rest, status, ...(status === 'SAFE' && { safeAt: resolvedTime }) },
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

    // A video plays as many range requests: only its first one is recorded
    if (!req.headers.range || /^bytes=0-/.test(req.headers.range)) trackAdminView(req, 'view_evidence', alertId);
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
// Order matters (R15): rate limit and control token are checked from the headers first; only then
// does multer read the file into memory
router.post('/upload-evidence', evidenceUploadLimiter, requireSosControlHeaders, upload.single('file'), async (req, res, next) => {
  try {
    const alertId = req.sosAlertId;
    // The body copy, when sent, must be the same alert the token was checked for
    if (req.body?.alertId && String(req.body.alertId) !== alertId) {
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

// POST /api/sos/resolve/:alertId - Closes the alert when the user marks themselves safe
router.post('/resolve/:alertId', optionalToken, async (req, res, next) => {
  try {
    const { alertId } = req.params;
    const auth = req.get('authorization') || '';
    const resolvedBy = sosResolver({
      alertId,
      controlToken: req.get('x-sos-token') || req.body?.controlToken,
      adminToken: auth.startsWith('Bearer ') ? auth.slice(7) : null,
      user: req.user,
      ownerId: req.user ? await SosService.getAlertOwnerId(alertId) : null,
    });
    if (!resolvedBy) {
      return rejectSosControl(res);
    }

    const session = await SosService.resolveSosAlert(alertId, resolvedBy);

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

// POST /api/sos/claim - After a guest signs in, moves their Instant SOS alerts to the account.
// Body: { alerts: [{ alertId, controlToken }] }. Only alerts this device created (control token)
// and still owned by a guest session are moved.
router.post('/claim', verifyToken, async (req, res, next) => {
  try {
    if (req.user.isGuest || !req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Sign in to a registered account to save these alerts.',
      });
    }
    const alertIds = provenSosAlertIds(req.body?.alerts);
    const claimed = await SosService.claimGuestAlerts(alertIds, req.user.id, req.user.phone);
    console.log(`🔗 [GUEST ALERTS CLAIMED] ${claimed.length} alert(s) moved to ${maskPhone(req.user.phone)}`);

    res.status(200).json({
      success: true,
      data: { claimed },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sos/history/guest - A guest's own SOS history. Guests have no login, so the device
// proves each alert with its control token. Body: { alerts: [{ alertId, controlToken }] }
router.post('/history/guest', async (req, res, next) => {
  try {
    const alertIds = provenSosAlertIds(req.body?.alerts);
    const history = await SosService.getSosHistory(null, { alertIds });

    res.status(200).json({
      success: true,
      data: history.map((h) => withEvidenceLink(h)),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/history/:phone - Returns SOS emergency history for a signed-in user.
// Guest IDs are refused here: knowing one must never reveal its alerts (guests use /history/guest).
router.get('/history/:phone', optionalToken, async (req, res, next) => {
  try {
    const phone = canonicalPhone(req.params.phone);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please log in to view your emergency history.',
      });
    }

    // Privacy check: User can only view their own emergency history
    if (req.user.phone !== phone) {
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
    audit.record({ admin: req.admin, action: 'export_history', ip: req.ip, detail: { rows: history.length } });

    res.status(200).json({
      success: true,
      data: history.map((h) => withEvidenceLink(h)),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

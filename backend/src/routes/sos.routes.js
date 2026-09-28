import { Router } from 'express';
import multer from 'multer';
import { DataService } from '../services/data.service.js';
import { uploadMediaToCloudinary } from '../config/cloudinary.js';
import { sosTriggerLimiter } from '../middlewares/rateLimiter.js';
import { verifyAdminKey, optionalToken } from '../middlewares/auth.middleware.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

const router = Router();

// POST /api/sos/trigger - Dispatches emergency alert, starts live tracking, and returns tracking URL
router.post('/trigger', sosTriggerLimiter, async (req, res, next) => {
  try {
    const { userPhone, location, latitude, longitude } = req.body;

    const alert = await DataService.createSosAlert({
      userPhone,
      location,
      latitude,
      longitude,
    });

    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';
    const trackingUrl = `${protocol}://${host}/track/${alert.id}`;

    console.log(`🚨 [EMERGENCY SOS LOGGED] ID: ${alert.id}, User: ${userPhone}, Track: ${trackingUrl}`);

    res.status(201).json({
      success: true,
      message: 'Emergency SOS alert recorded and live tracking initiated',
      data: {
        ...alert,
        trackingUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sos/live-update - Updates live GPS coordinates stream from mobile app
router.post('/live-update', async (req, res, next) => {
  try {
    const { alertId, latitude, longitude, address, status } = req.body;

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
      address,
      status: status || 'ACTIVE',
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

    // Privacy check: User can only view their own emergency history
    if (req.user && req.user.phone && req.user.phone !== phone) {
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
router.get('/history', verifyAdminKey, async (req, res, next) => {
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

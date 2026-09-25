import { Router } from 'express';
import { DataService } from '../services/data.service.js';

const router = Router();

// POST /api/sos/trigger - Dispatches emergency alert, starts live tracking, and returns tracking URL
router.post('/trigger', async (req, res, next) => {
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
router.get('/history/:phone', async (req, res, next) => {
  try {
    const { phone } = req.params;
    const history = await DataService.getSosHistory(phone);

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sos/history - Returns all SOS history
router.get('/history', async (req, res, next) => {
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

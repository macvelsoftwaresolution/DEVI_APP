import { Router } from 'express';
import { DataService } from '../services/data.service.js';

const router = Router();

// POST /api/sos/trigger - Dispatches emergency alert and logs to database
router.post('/trigger', async (req, res, next) => {
  try {
    const { userPhone, location, latitude, longitude } = req.body;

    const alert = await DataService.createSosAlert({
      userPhone,
      location,
      latitude,
      longitude,
    });

    console.log(`🚨 [EMERGENCY SOS LOGGED TO SUPABASE] ID: ${alert.id}, User: ${userPhone}`);

    res.status(201).json({
      success: true,
      message: 'Emergency SOS alert recorded and dispatched to registered contacts',
      data: alert,
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

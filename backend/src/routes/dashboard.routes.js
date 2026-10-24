
import { Router } from 'express';
import { DataService } from '../services/data.service.js';
import { socketService } from '../services/socket.service.js';

const router = Router();

// GET all incidents for the operator dashboard
router.get('/incidents', async (req, res, next) => {
  try {
    const incidents = await DataService.getAllIncidentsForDashboard();
    res.json({
      success: true,
      count: incidents.length,
      incidents,
    });
  } catch (err) {
    next(err);
  }
});

// POST add operator log note to an incident
router.post('/add-note', async (req, res, next) => {
  try {
    const { alertId, note } = req.body;
    if (!alertId || !note) {
      return res.status(400).json({ success: false, message: 'alertId and note are required' });
    }

    const updated = await DataService.addIncidentNote(alertId, note);
    res.json({
      success: true,
      message: 'Operator note logged successfully',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// POST resolve an incident
router.post('/resolve/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    const session = await DataService.resolveSosAlert(alertId);
    try {
      socketService.broadcastToRoom('dashboard', {
        type: 'incident:resolved',
        alertId,
        session,
      });
    } catch (_) { }
    res.json({
      success: true,
      message: `Incident #${alertId} marked as RESOLVED`,
      session,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

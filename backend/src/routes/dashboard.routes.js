import { Router } from 'express';
import { DataService } from '../services/data.service.js';

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

// POST assign an emergency agent to an incident (Step 8)
router.post('/assign-agent', async (req, res, next) => {
  try {
    const { alertId, agentName } = req.body;
    if (!alertId || !agentName) {
      return res.status(400).json({ success: false, message: 'alertId and agentName are required' });
    }

    const updated = await DataService.assignAgent(alertId, agentName);
    res.json({
      success: true,
      message: `Unit ${agentName} assigned to incident #${alertId}`,
      session: updated,
    });
  } catch (err) {
    next(err);
  }
});

// POST add operator log note to an incident (Step 9)
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

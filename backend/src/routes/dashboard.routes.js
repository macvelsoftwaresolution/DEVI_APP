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

// GET all field responders/agents
router.get('/agents', async (req, res, next) => {
  try {
    const agents = await DataService.getResponders();
    res.json({
      success: true,
      count: agents.length,
      agents,
    });
  } catch (err) {
    next(err);
  }
});

// POST add a new field responder/agent
router.post('/agents', async (req, res, next) => {
  try {
    const { name, phone, area, latitude, longitude, vehicle } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }

    const agent = await DataService.addResponder({ name, phone, area, latitude, longitude, vehicle });
    res.json({
      success: true,
      message: 'Responder added successfully',
      agent,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE a responder/agent
router.delete('/agents/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await DataService.deleteResponder(id);
    res.json({
      success: true,
      message: 'Responder removed successfully',
    });
  } catch (err) {
    next(err);
  }
});

// POST update agent live GPS location (Streaming from Agent Duty Web Page)
router.post('/agents/:id/location', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, heading, speed } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
    }

    const updated = await DataService.updateAgentLiveLocation(id, { latitude, longitude, heading, speed });
    
    // Check if an emergency assignment is currently assigned to this agent
    const activeAssignment = await DataService.getAgentActiveAssignment(id);

    res.json({
      success: true,
      agent: updated,
      hasAssignment: !!activeAssignment,
      assignment: activeAssignment || null,
    });
  } catch (err) {
    next(err);
  }
});

// POST toggle agent duty status (ON_DUTY / OFF_DUTY)
router.post('/agents/:id/duty', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await DataService.setAgentDutyStatus(id, status || 'ON_DUTY');
    res.json({
      success: true,
      agent: updated,
    });
  } catch (err) {
    next(err);
  }
});

// GET agent duty info and active assignment
router.get('/agents/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await DataService.getAgentById(id);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const activeAssignment = await DataService.getAgentActiveAssignment(id);

    res.json({
      success: true,
      agent,
      hasAssignment: !!activeAssignment,
      assignment: activeAssignment || null,
    });
  } catch (err) {
    next(err);
  }
});

// POST assign an emergency agent to an incident (Step 8)
router.post('/assign-agent', async (req, res, next) => {
  try {
    const { alertId, agentName, agentPhone } = req.body;
    if (!alertId || !agentName) {
      return res.status(400).json({ success: false, message: 'alertId and agentName are required' });
    }

    const updated = await DataService.assignAgent(alertId, agentName, agentPhone);
    const trackingUrl = `${req.protocol}://${req.get('host')}/track/${alertId}`;

    res.json({
      success: true,
      message: `Responder ${agentName} assigned to incident #${alertId}`,
      session: updated,
      trackingUrl,
      dispatchText: `🚨 DEVI EMERGENCY ALERT: Assistance needed! Live Tracking: ${trackingUrl}`,
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

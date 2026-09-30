import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { DataService } from '../services/data.service.js';
import { socketService } from '../services/socket.service.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { verifyResponderAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// POST /api/dashboard/duty/login - Responder Authentication with Phone & 4-Digit Security PIN
router.post(['/duty/login', '/agents/login'], async (req, res, next) => {
  try {
    const { phone, pin } = req.body;
    const result = await DataService.authenticateResponder(phone, pin);
    if (!result.success) {
      return res.status(401).json({ success: false, message: result.message });
    }

    const agent = result.agent;
    const token = jwt.sign(
      { id: agent.id, role: 'responder', phone: agent.phone, name: agent.name },
      process.env.JWT_SECRET || 'devi_secret_key_change_in_production',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Responder authenticated successfully',
      token,
      agent: {
        id: agent.id,
        name: agent.name,
        phone: agent.phone,
        area: agent.area,
        vehicle: agent.vehicle,
        duty_status: agent.duty_status || agent.status || 'AVAILABLE',
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/duty/me - Returns current responder session & assignments
router.get('/duty/me', verifyResponderAuth, async (req, res, next) => {
  try {
    const agentId = req.responder.id;
    const agent = await DataService.getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    const activeAssignment = await DataService.getAgentActiveAssignment(agentId);
    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        phone: agent.phone,
        area: agent.area,
        vehicle: agent.vehicle,
        duty_status: agent.duty_status || agent.status || 'AVAILABLE',
      },
      hasAssignment: !!activeAssignment,
      assignment: activeAssignment || null,
    });
  } catch (err) {
    next(err);
  }
});

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

// POST add a new field responder/agent (Supports secure PIN & WhatsApp Auto-Dispatch)
router.post('/agents', async (req, res, next) => {
  try {
    const { name, phone, pin, area, latitude, longitude, vehicle } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }

    const agent = await DataService.addResponder({ name, phone, pin, area, latitude, longitude, vehicle });
    
    // Determine public duty portal URL
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const dutyUrl = `${baseUrl}/duty`;

    // Attempt sending via Meta Cloud WhatsApp API
    const waResult = await WhatsAppService.sendResponderCredentials(agent.phone, {
      name: agent.name,
      pin: agent.plainPin,
      area: agent.area,
      dutyUrl,
    });

    // Also craft wa.me click-to-chat URL for instant 1-click dispatch from Dashboard
    let cleanPhone = agent.phone.toString().replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const waText = `🛡️ *DEVI SAFETY NETWORK — RESPONDER ACCESS* 🛡️\n\n` +
      `Hello *${agent.name}*, you have been registered as an Emergency Safety Responder for *${agent.area}*.\n\n` +
      `📲 *Your Duty Login Portal:*\n${dutyUrl}\n\n` +
      `🔑 *Login Credentials:*\n` +
      `• Mobile: *${cleanPhone.slice(-10)}*\n` +
      `• 4-Digit Security PIN: *${agent.plainPin}*\n\n` +
      `Please open the duty link above, sign in, and tap *"START ON-DUTY"* to connect to the live dispatch network.`;

    const waMeUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;

    res.json({
      success: true,
      message: 'Responder registered successfully with encrypted PIN',
      agent,
      plainPin: agent.plainPin,
      dutyUrl,
      waMeUrl,
      waDispatched: waResult?.success || false,
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
    
    // Broadcast agent location to dashboard WebSocket
    socketService.broadcastAgentLocation(id, {
      id,
      name: updated ? updated.name : id,
      latitude,
      longitude,
      heading,
      speed,
      status: updated ? updated.duty_status : 'ON_DUTY',
    });

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


import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { DataService } from '../services/data.service.js';
import { socketService } from '../services/socket.service.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { verifyResponderAuth } from '../middlewares/auth.middleware.js';
import { supabase } from '../config/supabase.js';

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

// In-memory OTP store for new agent phone verification
const agentOtpStore = new Map();

// POST /api/dashboard/agents/send-otp - Dispatch 6-digit phone verification OTP
router.post('/agents/send-otp', async (req, res, next) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
    }

    // Generate 6-digit verification code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    agentOtpStore.set(cleanPhone, {
      otp,
      name: (name || 'Responder').trim(),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    console.log(`📱 [AGENT PHONE VERIFICATION OTP] Sent to +91 ${cleanPhone} — Code: ${otp}`);

    // Send OTP via WhatsApp
    const waResult = await WhatsAppService.sendVerificationOtp(cleanPhone, otp, name);

    res.json({
      success: true,
      message: `Verification OTP dispatched to +91 ${cleanPhone}`,
      phone: cleanPhone,
      devOtp: otp, // Available for instant testing & demo ease
      waDispatched: waResult?.success || false,
    });
  } catch (err) {
    next(err);
  }
});

// POST add a new field responder/agent (Supports OTP verification, secure PIN & UUID single-use activation)
router.post(['/agents', '/agents/verify-and-create'], async (req, res, next) => {
  try {
    const { name, phone, pin, area, latitude, longitude, vehicle, otp } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
    }

    // Strict Requirement: OTP must be provided and valid
    if (!otp) {
      return res.status(400).json({ success: false, message: 'Verification OTP is strictly required to register an agent.' });
    }

    const stored = agentOtpStore.get(cleanPhone);
    if (!stored) {
      return res.status(400).json({ success: false, message: 'OTP has expired or was not requested. Please tap Send OTP.' });
    }
    if (stored.otp !== otp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please enter the correct 6-digit code received on WhatsApp.' });
    }
    // OTP verified successfully!
    agentOtpStore.delete(cleanPhone);
    console.log(`✅ [PHONE NUMBER VERIFIED BY OTP] +91 ${cleanPhone}`);

    const agent = await DataService.addResponder({ name, phone: cleanPhone, pin, area, latitude, longitude, vehicle });

    // Generate Unique 1-Time UUID Token for Device Lock & Single-Use Access
    const inviteToken = randomUUID();
    DataService.createAgentInvite({
      agentId: agent.id,
      token: inviteToken,
      phone: agent.phone,
      name: agent.name,
      area: agent.area,
      pin: agent.plainPin,
    });

    // Determine public duty portal URL on web domain
    const baseUrl = process.env.WEB_BASE_URL || process.env.PUBLIC_BASE_URL || `${req.protocol}://${(req.get('host') || '').replace(/^devi-api\./, 'devi.')}`;
    const dutyUrl = `${baseUrl}/duty?invite=${inviteToken}`;

    // Attempt sending via Meta Cloud WhatsApp API
    const waResult = await WhatsAppService.sendResponderCredentials(agent.phone, {
      name: agent.name,
      pin: agent.plainPin,
      area: agent.area,
      dutyUrl,
    });

    // Also craft wa.me click-to-chat URL for instant 1-click dispatch from Dashboard
    let fullPhone = '91' + cleanPhone;
    const waText = `🛡️ *DEVI SAFETY NETWORK — RESPONDER ACCESS* 🛡️\n\n` +
      `Hello *${agent.name}*, you have been registered as an Emergency Safety Responder for *${agent.area}*.\n\n` +
      `📲 *Your 1-Time Secure Duty Portal:*\n${dutyUrl}\n\n` +
      `🔑 *Login Credentials:*\n` +
      `• Mobile: *${cleanPhone}*\n` +
      `• 4-Digit Security PIN: *${agent.plainPin}*\n\n` +
      `⚠️ *Security Notice:* This activation link is locked to your device and cannot be shared. Open the link to review and accept emergency duty.`;

    const waMeUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(waText)}`;

    // Broadcast new agent to Dashboard via WebSocket
    socketService.broadcastToRoom('dashboard', { type: 'agent_update' });

    res.json({
      success: true,
      message: 'Responder phone verified & registered successfully with 1-time invite token',
      agent,
      plainPin: agent.plainPin,
      inviteToken,
      dutyUrl,
      waMeUrl,
      waDispatched: waResult?.success || false,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/duty/invite/:token - Inspect invite token validity before rendering consent screen
router.get('/duty/invite/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const invite = DataService.getAgentInvite(token);
    if (!invite) {
      return res.status(404).json({ success: false, reason: 'NOT_FOUND', message: 'Invitation link is invalid or expired.' });
    }
    if (invite.claimed) {
      return res.status(403).json({
        success: false,
        reason: 'ALREADY_CLAIMED',
        message: 'This invitation has already been claimed on another device. For security, responder links cannot be shared or reused.',
      });
    }
    if (invite.status === 'REJECTED') {
      return res.status(400).json({
        success: false,
        reason: 'REJECTED',
        message: 'This emergency duty assignment was previously declined.',
      });
    }

    res.json({
      success: true,
      invite: {
        agentId: invite.agentId,
        name: invite.name,
        phone: invite.phone,
        area: invite.area,
        createdAt: invite.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/dashboard/duty/invite/respond - Agent clicks APPROVE or REJECT on invite screen
router.post('/duty/invite/respond', async (req, res, next) => {
  try {
    const { token, action, deviceFingerprint } = req.body;
    if (!token || !action) {
      return res.status(400).json({ success: false, message: 'Token and action are required' });
    }

    const result = await DataService.respondToAgentInvite(token, action, deviceFingerprint);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Broadcast updated agent status to Admin Dashboard live radar
    socketService.broadcastToRoom('dashboard', { type: 'agent_update' });

    if (action === 'APPROVE') {
      const agent = result.agent;
      const authToken = jwt.sign(
        { id: agent.id, role: 'responder', phone: agent.phone, name: agent.name },
        process.env.JWT_SECRET || 'devi_secret_key_change_in_production',
        { expiresIn: '30d' }
      );

      return res.json({
        success: true,
        message: 'Duty invitation accepted! You are now ON-DUTY.',
        token: authToken,
        shift_expires_at: result.shift_expires_at,
        shift_duration_hours: result.shift_duration_hours,
        gps_interval_seconds: result.gps_interval_seconds,
        agent: {
          id: agent.id,
          name: agent.name,
          phone: agent.phone,
          area: agent.area,
          vehicle: agent.vehicle,
          duty_status: 'ON_DUTY',
          shift_expires_at: result.shift_expires_at,
          shift_duration_hours: result.shift_duration_hours,
        },
      });
    } else {
      return res.json({
        success: true,
        rejected: true,
        message: 'Duty invitation declined. Control Room has been notified.',
      });
    }
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

// GET duty settings (shift duration, GPS frequency)
router.get('/settings/duty', async (req, res, next) => {
  try {
    const settings = DataService.getDutySettings();
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

// POST update duty settings
router.post('/settings/duty', async (req, res, next) => {
  try {
    const { shiftDurationHours, gpsIntervalSeconds, autoEndDuty } = req.body;
    const updated = DataService.updateDutySettings({ shiftDurationHours, gpsIntervalSeconds, autoEndDuty });
    res.json({ success: true, settings: updated });
  } catch (err) {
    next(err);
  }
});

// POST force end agent duty manually by Admin
router.post('/agents/:id/end-duty', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await DataService.setAgentDutyStatus(id, 'OFF_DUTY');
    socketService.broadcastToRoom('dashboard', { type: 'agent_update' });
    res.json({ success: true, agent: updated, message: 'Agent duty ended successfully' });
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
    socketService.broadcastToRoom('dashboard', { type: 'agent_update' });
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
    const baseUrl = process.env.WEB_BASE_URL || process.env.PUBLIC_BASE_URL || `${req.protocol}://${(req.get('host') || '').replace(/^devi-api\./, 'devi.')}`;
    const trackingUrl = `${baseUrl}/track/${alertId}`;

    // Get victim info from DB or session
    let victimName = 'DEVI Victim';
    let lat = null;
    let lng = null;
    let locStr = null;

    if (updated?.user?.name || updated?.userName) {
      victimName = updated.user?.name || updated.userName;
      lat = updated.latitude;
      lng = updated.longitude;
      locStr = updated.location;
    } else {
      try {
        const { data: sosRow } = await supabase.from('sos_history').select('*').eq('id', alertId).maybeSingle();
        if (sosRow) {
          victimName = sosRow.victim_name || sosRow.user_name || 'DEVI User';
          lat = sosRow.latitude;
          lng = sosRow.longitude;
          locStr = sosRow.address || sosRow.location;
        }
      } catch (_) { }
    }

    // DISPATCH OFFICIAL META WHATSAPP ALERT (devi_safety) TO THE ASSIGNED AGENT!
    let waDispatched = false;
    if (agentPhone) {
      const waRes = await WhatsAppService.sendEmergencyAlert(
        agentPhone,
        trackingUrl,
        victimName,
        { latitude: lat, longitude: lng, location: locStr }
      );
      waDispatched = waRes?.success || false;
      console.log(`🚨 [OFFICIAL META SOS DISPATCHED TO AGENT: ${agentName}] Phone: ${agentPhone}, Status: ${waDispatched}`);
    }

    // Broadcast incident assigned to dashboard WebSocket for instant UI update
    socketService.broadcastToRoom('dashboard', {
      type: 'incident:assigned',
      alertId,
      assignedAgent: updated?.assignedAgent || (agentPhone ? `${agentName} (${agentPhone})` : agentName),
      status: 'DISPATCHED',
      responderStatus: 'ASSIGNED',
    });

    res.json({
      success: true,
      message: `Emergency Alert dispatched via official Meta WhatsApp (+91 90806 85175) to ${agentName}`,
      session: updated,
      trackingUrl,
      waDispatched,
      dispatchText: `🚨 DEVI EMERGENCY ALERT: Assistance needed! Live Tracking: ${trackingUrl}`,
    });
  } catch (err) {
    next(err);
  }
});

// POST field responder accepts mission (Step 8.5 - En Route confirmation)
router.post(['/agents/:id/accept-assignment', '/agents/accept-assignment'], async (req, res, next) => {
  try {
    const targetAgentId = req.params.id || req.body.agentId;
    const targetAlertId = req.body.alertId || req.params.alertId;
    if (!targetAlertId) {
      return res.status(400).json({ success: false, message: 'alertId is required' });
    }

    const session = await DataService.acceptMission(targetAlertId, targetAgentId);

    // Retrieve Agent and Victim details
    const agent = targetAgentId ? await DataService.getAgentById(targetAgentId) : null;
    const agentName = agent?.name || session?.assignedAgent || 'Safety Responder';
    const agentPhone = agent?.phone || null;

    let victimName = session?.user?.name || session?.userName || 'DEVI Victim';
    let locationStr = session?.location || null;
    let lat = session?.latitude || null;
    let lng = session?.longitude || null;

    if (!locationStr || victimName === 'DEVI Victim') {
      try {
        const { data: sosRow } = await supabase.from('sos_history').select('*').eq('id', targetAlertId).maybeSingle();
        if (sosRow) {
          victimName = sosRow.victim_name || sosRow.user_name || victimName;
          locationStr = sosRow.address || sosRow.location || locationStr;
          lat = sosRow.latitude || lat;
          lng = sosRow.longitude || lng;
        }
      } catch (_) {}
    }

    const baseUrl = process.env.WEB_BASE_URL || process.env.PUBLIC_BASE_URL || `${req.protocol}://${(req.get('host') || '').replace(/^devi-api\./, 'devi.')}`;
    const trackingUrl = `${baseUrl}/dashboard?incident=${targetAlertId}`;

    // Broadcast instant mission takeover update directly to Command Dashboard
    socketService.broadcastToRoom('dashboard', {
      type: 'incident:en_route',
      alertId: targetAlertId,
      agentId: targetAgentId,
      agentName,
      agentPhone,
      victimName,
      location: locationStr,
      status: 'DISPATCHED',
      responderStatus: 'EN_ROUTE',
      acceptedAt: new Date().toISOString(),
    });
    socketService.broadcastToRoom('dashboard', { type: 'agent_update' });

    res.json({
      success: true,
      message: `Mission accepted. Agent ${agentName} is EN ROUTE. Control Room Dashboard updated.`,
      session,
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

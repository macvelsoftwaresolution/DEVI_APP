
import { Router } from 'express';
import { DashboardService } from '../services/dashboard.service.js';
import { SosService } from '../services/sos.service.js';
import { socketService } from '../services/socket.service.js';
import { sessions } from '../services/sessions.service.js';
import { audit } from '../services/audit.service.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateParam = (value) => (typeof value === 'string' && DATE_RE.test(value) ? value : undefined);
const textParam = (value) => (typeof value === 'string' ? value.slice(0, 100) : undefined);

// Audit log (audit.service.js): who opened, searched, exported or changed what. Never the search text.
const track = (req, action, targetType = null, targetId = null, detail = null) =>
  audit.record({ admin: req.admin, action, targetType, targetId, ip: req.ip, detail });
// List pages reload on every new SOS, so only searches and exports are recorded, not each view
export const listAudit = ({ search, limit }, kind) => {
  const exported = Number(limit) > 100;
  if (!search && !exported) return null;
  return {
    action: `${exported ? 'export' : 'search'}_${kind}`,
    detail: { ...(search && { searched: true }), ...(exported && { export: true, limit: Number(limit) }) },
  };
};

// GET dashboard stats: totals, daily SOS counts, latest SOS
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await DashboardService.getStats({ days: req.query.days });
    res.json({ success: true, ...stats });
  } catch (err) {
    next(err);
  }
});

// GET SOS records (paginated): ?page&limit&status&search&from&to&userId
router.get('/incidents', async (req, res, next) => {
  try {
    const { page, limit, status, search, from, to, userId } = req.query;
    const result = await DashboardService.listIncidents({
      page,
      limit,
      status: textParam(status),
      search: textParam(search),
      from: dateParam(from),
      to: dateParam(to),
      userId: textParam(userId),
    });
    const listed = listAudit({ search, limit }, 'incidents');
    if (listed) track(req, listed.action, userId ? 'user' : null, userId || null, { ...listed.detail, rows: result.items.length });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET one SOS record with the user's guardians
router.get('/incidents/:alertId', async (req, res, next) => {
  try {
    const incident = await DashboardService.getIncident(req.params.alertId);
    if (!incident) return res.status(404).json({ success: false, message: 'SOS record not found' });
    track(req, 'view_incident', 'sos', incident.id);
    res.json({ success: true, incident });
  } catch (err) {
    next(err);
  }
});

// GET users (paginated): ?page&limit&type&search
router.get('/users', async (req, res, next) => {
  try {
    const { page, limit, type, search } = req.query;
    const result = await DashboardService.listUsers({ page, limit, type: textParam(type), search: textParam(search) });
    const listed = listAudit({ search, limit }, 'users');
    if (listed) track(req, listed.action, null, null, { ...listed.detail, rows: result.items.length });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET one user with guardians and SOS history
router.get('/users/:userId', async (req, res, next) => {
  try {
    const user = await DashboardService.getUser(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    track(req, 'view_user', 'user', user.id);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// POST sign a user out on every phone (lost phone, leaked token). Their next SOS still goes out.
router.post('/users/:userId/revoke-sessions', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.userId)) return res.status(404).json({ success: false, message: 'User not found' });
    const version = await sessions.revokeUser(req.params.userId);
    if (version == null) return res.status(404).json({ success: false, message: 'User not found' });
    console.log(`🔒 [SIGNED OUT EVERYWHERE] User ${req.params.userId} by admin ${req.admin?.username}`);
    track(req, 'revoke_user_sessions', 'user', req.params.userId);
    res.json({ success: true, message: 'The user is signed out on every device.' });
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

    const updated = await DashboardService.addIncidentNote(alertId, note);
    track(req, 'add_note', 'sos', alertId);
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
    const session = await SosService.resolveSosAlert(alertId, 'admin');
    track(req, 'resolve', 'sos', alertId);
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

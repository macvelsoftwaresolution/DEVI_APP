
import { Router } from 'express';
import { DashboardService } from '../services/dashboard.service.js';
import { SosService } from '../services/sos.service.js';
import { socketService } from '../services/socket.service.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateParam = (value) => (typeof value === 'string' && DATE_RE.test(value) ? value : undefined);
const textParam = (value) => (typeof value === 'string' ? value.slice(0, 100) : undefined);

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
    res.json({ success: true, user });
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

import { Router } from 'express';
import { health } from '../services/health.service.js';
import { safeEqual, decodeAdminToken } from '../middlewares/auth.middleware.js';

const router = Router();

// Public and shallow: the process answers. For load balancers and simple uptime checks.
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DEVI Women Safety Backend API is running smoothly',
    timestamp: new Date().toISOString(),
  });
});

// Whether this request may see the deep check: the X-Health-Key header (HEALTH_CHECK_KEY, for an
// uptime monitor) or an admin login. The report names balances and setup problems.
export const mayReadDeepHealth = (req, key = process.env.HEALTH_CHECK_KEY) => {
  if (key && safeEqual(req.get('x-health-key') || '', key)) return true;
  const auth = req.get('authorization') || '';
  return !!decodeAdminToken(auth.startsWith('Bearer ') ? auth.slice(7) : null);
};

// GET /api/health/deep - database, queue, worker, journal and providers (REL1).
// 503 when any check fails, so an uptime monitor alerts on the status code alone.
router.get('/deep', async (req, res, next) => {
  try {
    if (!mayReadDeepHealth(req)) return res.status(403).json({ success: false, message: 'Not allowed.' });
    const report = await health.run();
    res.setHeader('Cache-Control', 'no-store');
    res.status(report.status === 'fail' ? 503 : 200).json({ success: report.status !== 'fail', ...report });
  } catch (err) {
    next(err);
  }
});

export default router;

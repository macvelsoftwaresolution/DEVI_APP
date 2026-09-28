import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import sosRoutes from './sos.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import { authLimiter } from '../middlewares/rateLimiter.js';
import { verifyAdminKey } from '../middlewares/auth.middleware.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authLimiter, authRoutes);
router.use('/user', userRoutes);
router.use('/sos', sosRoutes);
router.use('/dashboard', verifyAdminKey, dashboardRoutes);

export default router;

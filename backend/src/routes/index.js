import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import sosRoutes from './sos.routes.js';
import dashboardRoutes from './dashboard.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/sos', sosRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;

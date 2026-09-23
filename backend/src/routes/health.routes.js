import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DEVI Women Safety Backend API is running smoothly',
    timestamp: new Date().toISOString(),
  });
});

export default router;

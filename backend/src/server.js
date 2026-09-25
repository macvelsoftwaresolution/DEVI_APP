import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

import { renderLiveTrackingHtml } from './views/track.view.js';
import { DataService } from './services/data.service.js';

// API Routes
app.use('/api', apiRoutes);

// Guardian Live Tracking Web View
app.get('/track/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    const session = await DataService.getLiveLocation(alertId);
    const html = renderLiveTrackingHtml({
      alertId,
      initialSession: session,
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'DEVI Women Safety Backend API',
    status: 'online',
    documentation: '/api/health',
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 DEVI Backend server running on port ${PORT}`);
  console.log(`📡 Health check available at: http://localhost:${PORT}/api/health`);
});

export default app;

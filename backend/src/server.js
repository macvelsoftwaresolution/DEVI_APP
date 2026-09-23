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

// API Routes
app.use('/api', apiRoutes);

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

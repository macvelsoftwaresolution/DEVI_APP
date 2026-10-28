import { IS_PRODUCTION } from '../config/security.js';

export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (err, req, res, next) => {
  console.error('Unhandled Error:', err);
  // Evidence file over the upload limit (multer): a client error, not a server error
  const statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || err.statusCode || 500;
  // Server errors can carry DB/internal details: keep them in the log, not in production responses
  const hideDetails = IS_PRODUCTION && statusCode >= 500;
  res.status(statusCode).json({
    success: false,
    message: hideDetails ? 'Internal Server Error' : err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

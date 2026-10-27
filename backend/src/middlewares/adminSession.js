import { AdminService } from '../services/admin.service.js';

/**
 * Middleware (after verifyAdmin): the operator's account must still exist and be active, so a
 * disabled account loses dashboard access right away instead of when its 12-hour token expires.
 * The x-admin-key path (server scripts) has no account and passes through.
 */
export const requireActiveAdmin = async (req, res, next) => {
  if (!req.admin?.adminId) {
    if (req.admin?.username === 'api-key') return next();
    // Token from before per-operator accounts: sign in again
    return res.status(401).json({ success: false, message: 'Admin login required. Please sign in again.' });
  }
  try {
    const admin = await AdminService.findById(req.admin.adminId);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ success: false, message: 'This admin account is disabled.' });
    }
    req.adminAccount = admin;
    next();
  } catch (err) {
    next(err);
  }
};

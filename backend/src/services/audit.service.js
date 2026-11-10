import { supabase } from '../config/supabase.js';

/**
 * Admin audit log (db/audit.sql): which operator opened, searched, exported or changed what.
 *
 * Each event is written to admin_audit and to the server log, without waiting: an audit write must
 * never slow down the dashboard or an SOS. If the database write fails the log line remains.
 * Only ids and the kind of action are kept, never a phone number, name, place or search text.
 */

const MISSING = new Set(['42P01', 'PGRST205']);

export const createAudit = ({ db = supabase, log = console } = {}) => {
  let missingLogged = false;

  return {
    /**
     * admin: req.admin ({ username, sub }) or a username string
     * action: e.g. 'login', 'login_failed', 'view_incident', 'resolve'
     * Returns the write, for tests; callers do not wait for it.
     */
    record({ admin, action, targetType = null, targetId = null, ip = null, detail = null }) {
      const name = typeof admin === 'string' ? admin : admin?.username || 'unknown';
      const adminId = typeof admin === 'object' && admin?.sub ? admin.sub : null;
      const row = {
        admin: String(name).slice(0, 100),
        admin_id: adminId,
        action,
        target_type: targetType,
        target_id: targetId == null ? null : String(targetId).slice(0, 100),
        ip: ip ? String(ip).slice(0, 64) : null,
        detail,
      };
      log.log(`🔎 [AUDIT] ${row.admin} ${action}${targetType ? ` ${targetType}:${row.target_id}` : ''}${ip ? ` from ${row.ip}` : ''}`);

      return Promise.resolve()
        .then(() => db.from('admin_audit').insert(row))
        .then(({ error } = {}) => {
          if (!error) return true;
          if (MISSING.has(error.code)) {
            if (!missingLogged) log.warn('⚠️ [AUDIT] Table admin_audit missing: actions are only in the server log. Run db/audit.sql.');
            missingLogged = true;
          } else {
            log.warn(`⚠️ [AUDIT] Not saved (${error.code || error.message}): ${row.admin} ${action}`);
          }
          return false;
        })
        .catch((e) => {
          log.warn(`⚠️ [AUDIT] Not saved (${e.message}): ${row.admin} ${action}`);
          return false;
        });
    },
  };
};

export const audit = createAudit();
export default audit;

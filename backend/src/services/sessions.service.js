import { supabase } from '../config/supabase.js';
import { encryptField as enc, decryptField as dec } from '../utils/encryption.js';

/**
 * Which login tokens are still good (db/login-security.sql).
 *
 * App users: a token carries the users.token_version it was signed with (tv). Raising the version
 * signs the user out everywhere. The version is cached for USER_CACHE_MS, so a sign-out reaches
 * other servers within that time and this one at once. When the database cannot be read the
 * token is accepted: an SOS must never wait on this check (L2).
 *
 * Admins: one admin_users row per operator. The list of ids, disabled flags and token versions is
 * small, so it is loaded every ADMIN_REFRESH_MS and checked from memory, which keeps the admin
 * token check synchronous. Until the first load, admin tokens are judged by their signature alone.
 */

const USER_CACHE_MS = 60 * 1000;
const ADMIN_REFRESH_MS = 60 * 1000;
const MISSING = new Set(['42703', '42P01', 'PGRST204', 'PGRST205']);

let missingLogged = false;
const logMissing = (e) => {
  if (!missingLogged) console.warn(`⚠️ [SESSIONS] Login security columns missing (${e.code}): tokens cannot be revoked and only the .env admin exists. Run db/login-security.sql.`);
  missingLogged = true;
};

export const createSessions = ({ db = supabase, now = Date.now } = {}) => {
  const userVersions = new Map(); // user id -> { v, at }
  let admins = null; // id -> { disabled, tv }, null until loaded
  let adminTimer = null;

  return {
    // The user's current token version, 0 before db/login-security.sql, null when unknown
    async userTokenVersion(userId) {
      if (!userId) return null;
      const hit = userVersions.get(userId);
      if (hit && now() - hit.at < USER_CACHE_MS) return hit.v;
      try {
        const { data, error } = await db.from('users').select('token_version').eq('id', userId).maybeSingle();
        if (error) {
          if (MISSING.has(error.code)) { logMissing(error); return 0; }
          return null;
        }
        if (!data) return null;
        const v = Number(data.token_version) || 0;
        userVersions.set(userId, { v, at: now() });
        if (userVersions.size > 50_000) userVersions.delete(userVersions.keys().next().value);
        return v;
      } catch (_) {
        return null;
      }
    },

    // Signs the user out on every device. Returns the new version, or throws.
    async revokeUser(userId) {
      const { data, error } = await db.from('users').select('token_version').eq('id', userId).maybeSingle();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      if (!data) return null;
      const v = (Number(data.token_version) || 0) + 1;
      const { error: uError } = await db.from('users').update({ token_version: v }).eq('id', userId);
      if (uError) throw Object.assign(new Error(uError.message), { code: uError.code });
      userVersions.set(userId, { v, at: now() });
      return v;
    },

    // --- Admin accounts ---

    async findAdmin(username) {
      const { data, error } = await db.from('admin_users').select('*').eq('username', String(username).trim().toLowerCase()).maybeSingle();
      if (error) {
        if (MISSING.has(error.code)) { logMissing(error); return null; }
        throw Object.assign(new Error(error.message), { code: error.code });
      }
      if (!data) return null;
      return { ...data, totpSecret: dec(data.totp_secret, 'admin_users.totp_secret', data.id) };
    },

    async adminLoggedIn(id) {
      await db.from('admin_users').update({ last_login_at: new Date(now()).toISOString() }).eq('id', id);
    },

    // Ends every session of this admin account
    async revokeAdmin(id) {
      const { data, error } = await db.from('admin_users').select('token_version').eq('id', id).maybeSingle();
      if (error || !data) throw new Error(error?.message || 'admin not found');
      const tv = (Number(data.token_version) || 0) + 1;
      const { error: uError } = await db.from('admin_users').update({ token_version: tv }).eq('id', id);
      if (uError) throw new Error(uError.message);
      if (admins?.has(id)) admins.get(id).tv = tv;
      return tv;
    },

    // True/false from the loaded list, null before it is loaded
    adminTokenValid(id, tv) {
      if (!admins) return null;
      const a = admins.get(id);
      return !!a && !a.disabled && a.tv === (Number(tv) || 0);
    },

    async refreshAdmins() {
      try {
        const { data, error } = await db.from('admin_users').select('id, disabled, token_version');
        if (error) {
          if (MISSING.has(error.code)) { logMissing(error); admins = new Map(); }
          return;
        }
        admins = new Map((data || []).map((r) => [r.id, { disabled: !!r.disabled, tv: Number(r.token_version) || 0 }]));
      } catch (_) { /* keep the last list */ }
    },

    startAdminRefresh() {
      this.refreshAdmins();
      adminTimer = setInterval(() => this.refreshAdmins(), ADMIN_REFRESH_MS);
      adminTimer.unref();
    },

    stop() {
      clearInterval(adminTimer);
    },
  };
};

// Encrypts a TOTP secret for an admin_users row (scripts/admin-user.js)
export const encryptTotpSecret = (secret, adminId) => enc(secret, 'admin_users.totp_secret', adminId);

export const sessions = createSessions();
export default sessions;

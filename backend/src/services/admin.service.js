import { supabase } from '../config/supabase.js';
import { encryptField as enc, decryptField as dec } from '../utils/encryption.js';

// Dashboard operator accounts (admins table) and their audit log (admin_audit). R4.

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

const toAdmin = (row) =>
  row && {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    totpSecret: row.totp_secret ? dec(row.totp_secret) : null,
    totpEnabled: !!row.totp_enabled,
    totpLastStep: Number(row.totp_last_step || 0),
    failedAttempts: row.failed_attempts || 0,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    isActive: !!row.is_active,
  };

const update = async (id, patch) => {
  const { error } = await supabase.from('admins').update(patch).eq('id', id);
  if (error) throw error;
};

export const AdminService = {
  async findByUsername(username) {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('username', String(username || '').trim().toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return toAdmin(data);
  },

  async findById(id) {
    const { data, error } = await supabase.from('admins').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return toAdmin(data);
  },

  async create({ username, passwordHash, role = 'operator' }) {
    const { data, error } = await supabase
      .from('admins')
      .insert([{ username: username.trim().toLowerCase(), password_hash: passwordHash, role }])
      .select()
      .single();
    if (error) throw error;
    return toAdmin(data);
  },

  // Wrong password: count it, and lock the account after MAX_FAILED_ATTEMPTS
  async recordFailedLogin(admin) {
    const attempts = admin.failedAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await update(admin.id, {
      failed_attempts: lock ? 0 : attempts,
      locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : admin.lockedUntil,
    });
    return lock;
  },

  async recordPasswordOk(admin) {
    await update(admin.id, { failed_attempts: 0, locked_until: null });
  },

  // A new authenticator secret, saved but not active until the first code confirms it
  async savePendingTotp(admin, secret) {
    await update(admin.id, { totp_secret: enc(secret), totp_enabled: false });
  },

  async recordTotpLogin(admin, step) {
    await update(admin.id, {
      totp_enabled: true,
      totp_last_step: step,
      last_login_at: new Date().toISOString(),
    });
  },

  async setPassword(admin, passwordHash, { resetTotp = false } = {}) {
    await update(admin.id, {
      password_hash: passwordHash,
      failed_attempts: 0,
      locked_until: null,
      ...(resetTotp && { totp_secret: null, totp_enabled: false, totp_last_step: 0 }),
    });
  },

  async setActive(admin, isActive) {
    await update(admin.id, { is_active: isActive });
  },

  // Never throws: a failed audit write must not block an emergency action
  async audit({ admin, username, action, alertId, ip }) {
    try {
      await supabase.from('admin_audit').insert([
        {
          admin_id: admin?.id || null,
          username: admin?.username || username || null,
          action,
          alert_id: alertId ? String(alertId) : null,
          ip: ip || null,
        },
      ]);
    } catch (e) {
      console.error('Admin audit write failed:', e.message);
    }
  },
};

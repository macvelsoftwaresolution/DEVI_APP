import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { encryptField as enc, decryptField as dec, blindIndex } from '../utils/encryption.js';

// Decrypted profile fields of a users row (each value is bound to its column and this row, E6)
const decryptUser = (row) => ({
  phone: dec(row.mobile_number, 'users.mobile_number', row.id),
  name: dec(row.full_name, 'users.full_name', row.id) || '',
  address1: dec(row.address_1, 'users.address_1', row.id) || '',
  address2: dec(row.address_2, 'users.address_2', row.id) || '',
});

// Users & guardians. Sensitive columns are stored AES-256-GCM encrypted, users.mobile_number too;
// users.mobile_hash (keyed HMAC of the number or guest ID) is what lookups search on.
export const UserService = {
  async findUserByPhone(phone) {
    if (!phone) return null;
    const cleanPhone = phone.trim();

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('mobile_hash', blindIndex(cleanPhone))
        .maybeSingle();

      if (error) {
        console.error('Supabase findUserByPhone error:', error.message);
        return null;
      }

      if (!user) return null;

      // Fetch guardians for this user
      const { data: guardians, error: gError } = await supabase
        .from('guardians')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (gError) {
        console.error('Supabase fetch guardians error:', gError.message);
      }

      return {
        id: user.id,
        ...decryptUser(user),
        isGuest: user.is_guest || false,
        guardians: (guardians || []).map((g) => ({
          id: g.id,
          name: dec(g.name, 'guardians.name', g.user_id),
          phone: dec(g.mobile_number, 'guardians.mobile_number', g.user_id),
        })),
        createdAt: user.created_at,
      };
    } catch (err) {
      console.error('Unexpected error in findUserByPhone:', err);
      return null;
    }
  },

  async createOrGetUser(phone) {
    if (!phone) return null;
    const cleanPhone = phone.trim();

    // Check if user already exists in DB
    const existing = await this.findUserByPhone(cleanPhone);
    if (existing) return existing;

    try {
      // Create new user in Supabase (id made here so the number is encrypted bound to this row, E6)
      const id = crypto.randomUUID();
      const { data: newUser, error } = await supabase
        .from('users')
        .insert([
          {
            id,
            mobile_number: enc(cleanPhone, 'users.mobile_number', id),
            mobile_hash: blindIndex(cleanPhone),
            full_name: '',
            address_1: '',
            address_2: '',
            is_guest: false,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('Supabase create user error:', error.message);
        throw error;
      }

      return {
        id: newUser.id,
        ...decryptUser(newUser),
        isGuest: newUser.is_guest || false,
        guardians: [],
        createdAt: newUser.created_at,
      };
    } catch (err) {
      console.error('Unexpected error in createOrGetUser:', err);
      throw err;
    }
  },

  async createOrGetGuestUser(guestIdentifier, guardians = []) {
    if (!guestIdentifier) return null;
    const cleanId = guestIdentifier.trim();

    try {
      // 1. Check if this guest user already exists in Supabase
      let user = await this.findUserByPhone(cleanId);

      if (!user) {
        // Insert new anonymous guest user into users table with is_guest = true
        const id = crypto.randomUUID();
        const { data: newUser, error } = await supabase
          .from('users')
          .insert([
            {
              id,
              mobile_number: enc(cleanId, 'users.mobile_number', id),
              mobile_hash: blindIndex(cleanId),
              full_name: enc('Guest User', 'users.full_name', id),
              address_1: enc('Guest Session', 'users.address_1', id),
              address_2: enc('Unregistered', 'users.address_2', id),
              is_guest: true,
            },
          ])
          .select()
          .single();

        if (error) {
          console.error('Supabase create guest user error:', error.message);
          throw error;
        }

        user = {
          id: newUser.id,
          ...decryptUser(newUser),
          isGuest: true,
          guardians: [],
          createdAt: newUser.created_at,
        };
      }

      // If guest provided guardians, sync them to guardians table
      if (Array.isArray(guardians) && guardians.length > 0) {
        await supabase.from('guardians').delete().eq('user_id', user.id);
        const rows = guardians
          .filter((g) => g.phone && g.phone.trim() !== '')
          .map((g) => ({
            user_id: user.id,
            name: enc(g.name || 'Guardian', 'guardians.name', user.id),
            mobile_number: enc(g.phone.trim(), 'guardians.mobile_number', user.id),
          }));
        if (rows.length > 0) {
          await supabase.from('guardians').insert(rows);
        }
        return await this.findUserByPhone(cleanId);
      }

      return user;
    } catch (err) {
      console.error('Unexpected error in createOrGetGuestUser:', err);
      throw err;
    }
  },

  async updateUserProfile(phone, { name, address1, address2, guardians }) {
    if (!phone) throw new Error('Phone is required');
    const cleanPhone = phone.trim();

    // Ensure user exists in Supabase
    let user = await this.findUserByPhone(cleanPhone);
    if (!user) {
      user = await this.createOrGetUser(cleanPhone);
    }

    try {
      // Update users table in Supabase
      const updatePayload = {
        is_guest: false,
      };
      if (name !== undefined) updatePayload.full_name = enc(name, 'users.full_name', user.id);
      if (address1 !== undefined) updatePayload.address_1 = enc(address1, 'users.address_1', user.id);
      if (address2 !== undefined) updatePayload.address_2 = enc(address2, 'users.address_2', user.id);

      const { data: updatedUser, error: uError } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', user.id)
        .select()
        .single();

      if (uError) {
        console.error('Supabase update user error:', uError.message);
        throw uError;
      }

      // If guardians are provided, update the guardians table
      if (Array.isArray(guardians)) {
        // Delete old guardians for this user
        const { error: delError } = await supabase
          .from('guardians')
          .delete()
          .eq('user_id', user.id);

        if (delError) {
          console.error('Supabase delete guardians error:', delError.message);
        }

        // Insert new guardians
        if (guardians.length > 0) {
          const rows = guardians
            .filter((g) => g.phone && g.phone.trim() !== '')
            .map((g) => ({
              user_id: user.id,
              name: enc(g.name || 'Guardian', 'guardians.name', user.id),
              mobile_number: enc(g.phone.trim(), 'guardians.mobile_number', user.id),
            }));

          if (rows.length > 0) {
            const { error: insError } = await supabase.from('guardians').insert(rows);
            if (insError) {
              console.error('Supabase insert guardians error:', insError.message);
            }
          }
        }
      }

      return await this.findUserByPhone(cleanPhone);
    } catch (err) {
      console.error('Unexpected error in updateUserProfile:', err);
      throw err;
    }
  },
};

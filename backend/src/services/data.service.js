import { supabase } from '../config/supabase.js';

export const DataService = {
  // --- USERS ---
  async findUserByPhone(phone) {
    if (!phone) return null;
    const cleanPhone = phone.trim();

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('mobile_number', cleanPhone)
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
        phone: user.mobile_number,
        name: user.full_name || '',
        address1: user.address_1 || '',
        address2: user.address_2 || '',
        isGuest: user.is_guest || false,
        guardians: (guardians || []).map((g) => ({
          id: g.id,
          name: g.name,
          phone: g.mobile_number,
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
      // Create new user in Supabase
      const { data: newUser, error } = await supabase
        .from('users')
        .insert([
          {
            mobile_number: cleanPhone,
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
        phone: newUser.mobile_number,
        name: newUser.full_name || '',
        address1: newUser.address_1 || '',
        address2: newUser.address_2 || '',
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
        const { data: newUser, error } = await supabase
          .from('users')
          .insert([
            {
              mobile_number: cleanId,
              full_name: 'Guest User',
              address_1: 'Guest Session',
              address_2: 'Unregistered',
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
          phone: newUser.mobile_number,
          name: newUser.full_name,
          address1: newUser.address_1,
          address2: newUser.address_2,
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
            name: g.name || 'Guardian',
            mobile_number: g.phone.trim(),
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
      if (name !== undefined) updatePayload.full_name = name;
      if (address1 !== undefined) updatePayload.address_1 = address1;
      if (address2 !== undefined) updatePayload.address_2 = address2;

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
              name: g.name || 'Guardian',
              mobile_number: g.phone.trim(),
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

  // --- SOS ALERTS & HISTORY ---
  async createSosAlert({ userPhone, location, latitude, longitude }) {
    let userId = null;
    if (userPhone) {
      const user = await this.findUserByPhone(userPhone);
      if (user) userId = user.id;
    }

    try {
      const alertPayload = {
        latitude: latitude ? parseFloat(latitude) : 13.0827,
        longitude: longitude ? parseFloat(longitude) : 80.2707,
        location_address: location || `GPS Location (${latitude || 13.0827}, ${longitude || 80.2707})`,
        status: 'DISPATCHED',
      };
      if (userId) {
        alertPayload.user_id = userId;
      }

      const { data: alert, error } = await supabase
        .from('sos_history')
        .insert([alertPayload])
        .select()
        .single();

      if (error) {
        console.error('Supabase createSosAlert error:', error.message);
        throw error;
      }

      const now = new Date(alert.created_at || Date.now());
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHour = hours % 12 || 12;

      const sessionData = {
        id: alert.id.toString(),
        userId: alert.user_id,
        userPhone: userPhone || '',
        timestamp: alert.created_at,
        displayTime: `Today, ${formattedHour}:${minutes} ${ampm}`,
        location: alert.location_address || `GPS: ${alert.latitude}, ${alert.longitude}`,
        latitude: alert.latitude,
        longitude: alert.longitude,
        status: alert.status || 'ACTIVE',
        lastUpdated: alert.created_at || new Date().toISOString(),
        breadcrumbs: [
          {
            latitude: alert.latitude,
            longitude: alert.longitude,
            timestamp: alert.created_at || new Date().toISOString(),
          },
        ],
      };

      liveTrackSessions.set(alert.id.toString(), sessionData);

      return sessionData;
    } catch (err) {
      console.error('Unexpected error in createSosAlert:', err);
      throw err;
    }
  },

  async getSosHistory(userPhone) {
    try {
      let query = supabase.from('sos_history').select('*').order('created_at', { ascending: false });

      if (userPhone) {
        const user = await this.findUserByPhone(userPhone);
        if (user) {
          query = query.eq('user_id', user.id);
        }
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase getSosHistory error:', error.message);
        return [];
      }

      return (data || []).map((alert) => {
        const d = new Date(alert.created_at);
        const hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHour = hours % 12 || 12;
        const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        return {
          id: alert.id,
          userId: alert.user_id,
          timestamp: alert.created_at,
          displayTime: `${dateStr}, ${formattedHour}:${minutes} ${ampm}`,
          location: alert.location_address || `GPS: ${alert.latitude}, ${alert.longitude}`,
          latitude: alert.latitude,
          longitude: alert.longitude,
          status: alert.status || 'DISPATCHED',
        };
      });
    } catch (err) {
      console.error('Unexpected error in getSosHistory:', err);
      return [];
    }
  },

  // --- LIVE LOCATION TRACKING ---
  async updateLiveLocation({ alertId, latitude, longitude, address, status = 'ACTIVE' }) {
    if (!alertId) return null;
    const key = alertId.toString();
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    let session = liveTrackSessions.get(key);
    const nowIso = new Date().toISOString();

    if (!session) {
      session = {
        id: key,
        latitude: lat,
        longitude: lng,
        status,
        lastUpdated: nowIso,
        breadcrumbs: [],
      };
      liveTrackSessions.set(key, session);
    } else {
      session.latitude = lat;
      session.longitude = lng;
      session.status = status;
      session.lastUpdated = nowIso;
    }

    if (!isNaN(lat) && !isNaN(lng)) {
      session.breadcrumbs.push({
        latitude: lat,
        longitude: lng,
        timestamp: nowIso,
      });
      // Keep last 100 breadcrumb points
      if (session.breadcrumbs.length > 100) {
        session.breadcrumbs.shift();
      }
    }

    // Also update supabase asynchronously if possible
    try {
      supabase
        .from('sos_history')
        .update({
          latitude: lat,
          longitude: lng,
          location_address: address || `GPS Location (${lat}, ${lng})`,
          status,
        })
        .eq('id', alertId)
        .then(() => {})
        .catch((e) => console.error('Supabase live update error:', e));
    } catch (e) {
      // ignore
    }

    return session;
  },

  async getLiveLocation(alertId) {
    if (!alertId) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);

    if (!session) {
      // Fallback query from supabase
      try {
        const { data, error } = await supabase
          .from('sos_history')
          .select('*')
          .eq('id', alertId)
          .maybeSingle();

        if (data && !error) {
          session = {
            id: data.id,
            latitude: data.latitude || 13.0827,
            longitude: data.longitude || 80.2707,
            status: data.status || 'ACTIVE',
            lastUpdated: data.created_at || new Date().toISOString(),
            breadcrumbs: [
              {
                latitude: data.latitude || 13.0827,
                longitude: data.longitude || 80.2707,
                timestamp: data.created_at || new Date().toISOString(),
              },
            ],
          };
          liveTrackSessions.set(key, session);
        }
      } catch (e) {
        console.error('Error fetching fallback live location:', e);
      }
    }

    return session;
  },

  async resolveSosAlert(alertId) {
    if (!alertId) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);
    const nowIso = new Date().toISOString();

    if (session) {
      session.status = 'RESOLVED';
      session.lastUpdated = nowIso;
    }

    try {
      await supabase
        .from('sos_history')
        .update({ status: 'RESOLVED' })
        .eq('id', alertId);
    } catch (e) {
      console.error('Supabase resolve alert error:', e);
    }

    return session || { id: key, status: 'RESOLVED', lastUpdated: nowIso };
  },
};

// Real-time live tracking sessions store
const liveTrackSessions = new Map();

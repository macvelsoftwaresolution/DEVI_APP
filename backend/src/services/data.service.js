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
        evidenceUrl: alert.evidence_url || null,
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
          evidenceUrl: alert.evidence_url || alert.audio_url || null,
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
            evidenceUrl: data.evidence_url || data.audio_url || null,
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

  async attachEvidenceUrl(alertId, evidenceUrl) {
    if (!alertId || !evidenceUrl) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);

    if (session) {
      session.evidenceUrl = evidenceUrl;
      session.lastUpdated = new Date().toISOString();
    }

    try {
      // Try updating both columns together
      const { error } = await supabase
        .from('sos_history')
        .update({
          evidence_url: evidenceUrl,
          audio_url: evidenceUrl,
        })
        .eq('id', alertId);

      // If one of the columns doesn't exist, try updating them individually
      if (error) {
        await supabase
          .from('sos_history')
          .update({ audio_url: evidenceUrl })
          .eq('id', alertId)
          .then(() => {})
          .catch(() => {});

        await supabase
          .from('sos_history')
          .update({ evidence_url: evidenceUrl })
          .eq('id', alertId)
          .then(() => {})
          .catch(() => {});
      }
    } catch (e) {
      console.error('Error updating evidence/audio URL in Supabase:', e);
    }

    return session || { id: key, evidenceUrl };
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

  // --- DASHBOARD: GET ALL INCIDENTS WITH USER & GUARDIAN DETAILS ---
  async getAllIncidentsForDashboard() {
    try {
      const { data: alerts, error } = await supabase
        .from('sos_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !alerts) {
        console.error('Supabase fetch incidents error:', error?.message);
        return [];
      }

      // Gather unique user IDs
      const userIds = [...new Set(alerts.map((a) => a.user_id).filter(Boolean))];

      let usersMap = new Map();
      let guardiansMap = new Map();

      if (userIds.length > 0) {
        // Fetch user profiles
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, mobile_number, address_1, address_2, is_guest')
          .in('id', userIds);

        if (users) {
          users.forEach((u) => usersMap.set(u.id, u));
        }

        // Fetch emergency guardians
        const { data: guardians } = await supabase
          .from('guardians')
          .select('id, user_id, name, mobile_number')
          .in('user_id', userIds);

        if (guardians) {
          guardians.forEach((g) => {
            if (!guardiansMap.has(g.user_id)) {
              guardiansMap.set(g.user_id, []);
            }
            guardiansMap.get(g.user_id).push({
              id: g.id,
              name: g.name,
              phone: g.mobile_number,
            });
          });
        }
      }

      const now = Date.now();

      return alerts.map((alert) => {
        const key = alert.id.toString();
        const liveSession = liveTrackSessions.get(key);

        const user = alert.user_id ? usersMap.get(alert.user_id) : null;
        const guardians = alert.user_id ? guardiansMap.get(alert.user_id) || [] : [];

        const createdDate = new Date(alert.created_at || now);
        const elapsedSec = Math.floor((now - createdDate.getTime()) / 1000);
        let timeAgo = 'Just now';
        if (elapsedSec > 86400) {
          timeAgo = `${Math.floor(elapsedSec / 86400)}d ago`;
        } else if (elapsedSec > 3600) {
          timeAgo = `${Math.floor(elapsedSec / 3600)}h ago`;
        } else if (elapsedSec > 60) {
          timeAgo = `${Math.floor(elapsedSec / 60)}m ago`;
        } else if (elapsedSec > 5) {
          timeAgo = `${elapsedSec}s ago`;
        }

        const hours = createdDate.getHours();
        const minutes = createdDate.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHour = hours % 12 || 12;
        const displayTime = `${createdDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${formattedHour}:${minutes} ${ampm}`;

        return {
          id: alert.id.toString(),
          userId: alert.user_id,
          createdAt: alert.created_at,
          displayTime,
          timeAgo,
          latitude: liveSession?.latitude ?? alert.latitude ?? 13.0827,
          longitude: liveSession?.longitude ?? alert.longitude ?? 80.2707,
          location: alert.location_address || `GPS (${alert.latitude}, ${alert.longitude})`,
          status: liveSession?.status || alert.status || 'DISPATCHED',
          evidenceUrl: alert.evidence_url || alert.audio_url || liveSession?.evidenceUrl || null,
          assignedAgent: alert.assigned_agent || liveSession?.assignedAgent || null,
          operatorNotes: alert.operator_notes || liveSession?.operatorNotes || '',
          user: {
            name: user?.full_name || (user?.is_guest ? 'Guest Victim' : 'DEVI User'),
            phone: user?.mobile_number || alert.user_id || '9500238347',
            address: user ? [user.address_1, user.address_2].filter(Boolean).join(', ') : 'Location on Map',
            isGuest: user?.is_guest || false,
          },
          guardians,
          breadcrumbs: liveSession?.breadcrumbs || [
            {
              latitude: alert.latitude || 13.0827,
              longitude: alert.longitude || 80.2707,
              timestamp: alert.created_at,
            },
          ],
        };
      });
    } catch (err) {
      console.error('Unexpected error in getAllIncidentsForDashboard:', err);
      return [];
    }
  },

  // --- DASHBOARD: ASSIGN AGENT TO INCIDENT (Step 8) ---
  async assignAgent(alertId, agentName) {
    if (!alertId || !agentName) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);

    if (session) {
      session.assignedAgent = agentName;
      session.status = 'ASSIGNED';
      session.lastUpdated = new Date().toISOString();
    }

    try {
      await supabase
        .from('sos_history')
        .update({
          assigned_agent: agentName,
          status: 'ASSIGNED',
        })
        .eq('id', alertId);
    } catch (e) {
      console.warn('Note updating assigned_agent in Supabase:', e.message);
    }

    return session || { id: key, assignedAgent: agentName, status: 'ASSIGNED' };
  },

  // --- DASHBOARD: ADD OPERATOR LOG NOTE (Step 9) ---
  async addIncidentNote(alertId, noteText) {
    if (!alertId || !noteText) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);
    const timeFormatted = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const formattedNote = `[${timeFormatted}] ${noteText}`;

    if (session) {
      session.operatorNotes = session.operatorNotes ? `${session.operatorNotes}\n${formattedNote}` : formattedNote;
    }

    try {
      const { data } = await supabase.from('sos_history').select('operator_notes').eq('id', alertId).maybeSingle();
      const existing = data?.operator_notes || '';
      const updatedNotes = existing ? `${existing}\n${formattedNote}` : formattedNote;
      await supabase.from('sos_history').update({ operator_notes: updatedNotes }).eq('id', alertId);
    } catch (e) {
      console.warn('Note updating operator_notes in Supabase:', e.message);
    }

    return session || { id: key, note: formattedNote };
  },
};

// Real-time live tracking sessions store
const liveTrackSessions = new Map();

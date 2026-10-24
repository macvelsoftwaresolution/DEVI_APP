import { supabase } from '../config/supabase.js';
import { Encryption } from '../utils/encryption.js';

// Sensitive columns are stored AES-256-GCM encrypted (names, addresses, guardian numbers,
// SOS address & operator notes). mobile_number of users stays plain because it is the login lookup key.
const enc = (value) => Encryption.encrypt(value);
const dec = (value) => Encryption.decrypt(value);

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
        name: dec(user.full_name) || '',
        address1: dec(user.address_1) || '',
        address2: dec(user.address_2) || '',
        isGuest: user.is_guest || false,
        guardians: (guardians || []).map((g) => ({
          id: g.id,
          name: dec(g.name),
          phone: dec(g.mobile_number),
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
        name: dec(newUser.full_name) || '',
        address1: dec(newUser.address_1) || '',
        address2: dec(newUser.address_2) || '',
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
              full_name: enc('Guest User'),
              address_1: enc('Guest Session'),
              address_2: enc('Unregistered'),
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
          name: dec(newUser.full_name),
          address1: dec(newUser.address_1),
          address2: dec(newUser.address_2),
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
            name: enc(g.name || 'Guardian'),
            mobile_number: enc(g.phone.trim()),
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
      if (name !== undefined) updatePayload.full_name = enc(name);
      if (address1 !== undefined) updatePayload.address_1 = enc(address1);
      if (address2 !== undefined) updatePayload.address_2 = enc(address2);

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
              name: enc(g.name || 'Guardian'),
              mobile_number: enc(g.phone.trim()),
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

  // Check for existing active SOS session (Idempotency & One Active SOS Rule)
  async findExistingSos({ idempotencyKey, userPhone }) {
    // 1. Check in-memory active live sessions first
    for (const session of liveTrackSessions.values()) {
      if (session.status === 'ACTIVE') {
        if (idempotencyKey && session.idempotencyKey === idempotencyKey) {
          return session;
        }
        if (userPhone && session.userPhone === userPhone) {
          const ageMs = Date.now() - new Date(session.timestamp).getTime();
          // If within the last 15 minutes, consider it an ongoing active session
          if (ageMs < 15 * 60 * 1000) {
            return session;
          }
        }
      }
    }

    // 2. Check Supabase DB by idempotency_key if provided
    if (idempotencyKey) {
      try {
        const { data: existingAlert, error } = await supabase
          .from('sos_history')
          .select('*')
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (!error && existingAlert) {
          const now = new Date(existingAlert.created_at || Date.now());
          const hours = now.getHours();
          const minutes = now.getMinutes().toString().padStart(2, '0');
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const formattedHour = hours % 12 || 12;

          const sessionData = {
            id: existingAlert.id.toString(),
            userId: existingAlert.user_id,
            userPhone: userPhone || '',
            idempotencyKey,
            timestamp: existingAlert.created_at,
            displayTime: `Today, ${formattedHour}:${minutes} ${ampm}`,
            location: dec(existingAlert.location_address) || `GPS: ${existingAlert.latitude}, ${existingAlert.longitude}`,
            latitude: existingAlert.latitude,
            longitude: existingAlert.longitude,
            accuracy: existingAlert.accuracy || null,
            status: existingAlert.status || 'ACTIVE',
            lastUpdated: existingAlert.created_at || new Date().toISOString(),
            evidenceUrl: existingAlert.evidence_url || null,
            breadcrumbs: [
              {
                latitude: existingAlert.latitude,
                longitude: existingAlert.longitude,
                timestamp: existingAlert.created_at || new Date().toISOString(),
              },
            ],
          };
          liveTrackSessions.set(existingAlert.id.toString(), sessionData);
          return sessionData;
        }
      } catch (err) {
        // Fall through gracefully if column not yet added
      }
    }

    return null;
  },

  // In-memory reverse geocoding cache
  geocodeCache: new Map(),

  // Reverse Geocode GPS coordinates to human-readable address name (e.g. Sivakasi, Tamil Nadu)
  async reverseGeocode(lat, lng) {
    if (!lat || !lng) return null;
    const cacheKey = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
    if (this.geocodeCache.has(cacheKey)) {
      return this.geocodeCache.get(cacheKey);
    }

    // Provider 0: Google Maps Geocoding API (Fastest & Most Accurate in India)
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (googleMapsKey) {
      try {
        const gRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleMapsKey}`, {
          signal: AbortSignal.timeout(3500),
        });
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.status === 'OK' && gData.results && gData.results.length > 0) {
            const formatted = gData.results[0].formatted_address;
            if (formatted) {
              this.geocodeCache.set(cacheKey, formatted);
              return formatted;
            }
          }
        }
      } catch (_) { }
    }

    // Provider 1: OpenStreetMap Nominatim (Fallback)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'User-Agent': 'DEVI-Women-Safety-ReverseGeocode/1.0' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.address) {
          const addr = data.address;
          const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
          const town = addr.city || addr.town || addr.village || addr.county || addr.state_district || '';
          const state = addr.state || '';
          const parts = [road, town, state].filter(Boolean);
          const result = parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 3).join(', ');
          if (result) {
            this.geocodeCache.set(cacheKey, result);
            return result;
          }
        }
      }
    } catch (_) { }

    // Provider 2: BigDataCloud Free Client API (Fast Fallback)
    try {
      const bdcRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`, {
        signal: AbortSignal.timeout(3000),
      });
      if (bdcRes.ok) {
        const bdcData = await bdcRes.json();
        const locality = bdcData.locality || bdcData.city || bdcData.principalSubdivision || '';
        const district = bdcData.localityInfo?.administrative?.[2]?.name || bdcData.principalSubdivision || '';
        const state = bdcData.principalSubdivision || 'Tamil Nadu';
        const parts = Array.from(new Set([locality, district, state].filter(Boolean)));
        if (parts.length > 0) {
          const result = parts.join(', ');
          this.geocodeCache.set(cacheKey, result);
          return result;
        }
      }
    } catch (_) { }

    return null;
  },

  async createSosAlert({ userPhone, location, latitude, longitude, accuracy, idempotencyKey, capturedAt }) {
    let userId = null;
    if (userPhone) {
      let user = await this.findUserByPhone(userPhone);
      if (!user) {
        user = await this.createOrGetUser(userPhone);
      }
      if (user) userId = user.id;
    }

    // Auto-resolve real place name if location is missing or generic coordinates or URL
    let resolvedAddress = location;
    const isGenericLocation =
      !resolvedAddress ||
      resolvedAddress.startsWith('GPS') ||
      resolvedAddress.includes('maps.google.com') ||
      resolvedAddress.includes('http') ||
      resolvedAddress.includes('Latitude') ||
      resolvedAddress.includes('Location disabled') ||
      /^\s*[-+]?[0-9]*\.?[0-9]+\s*,\s*[-+]?[0-9]*\.?[0-9]+\s*$/.test(resolvedAddress);

    if (isGenericLocation && latitude && longitude) {
      const placeName = await this.reverseGeocode(latitude, longitude);
      if (placeName) {
        resolvedAddress = placeName;
      }
    }
    if (!resolvedAddress || resolvedAddress.startsWith('GPS')) {
      resolvedAddress = (latitude && longitude)
        ? (await this.reverseGeocode(latitude, longitude)) || 'Sivakasi, Tamil Nadu'
        : 'Emergency Location';
    }

    try {
      const alertPayload = {
        latitude: latitude ? parseFloat(latitude) : 13.0827,
        longitude: longitude ? parseFloat(longitude) : 80.2707,
        location_address: enc(resolvedAddress),
        status: 'ACTIVE',
      };
      if (userId) {
        alertPayload.user_id = userId;
      }
      if (idempotencyKey) {
        alertPayload.idempotency_key = idempotencyKey;
      }
      if (accuracy != null && !isNaN(accuracy)) {
        alertPayload.accuracy = parseFloat(accuracy);
      }

      let alert;
      const { data, error } = await supabase
        .from('sos_history')
        .insert([alertPayload])
        .select()
        .single();

      if (error) {
        // Resilient fallback if idempotency_key/accuracy columns are not yet created in Supabase
        if (error.message && (error.message.includes('idempotency_key') || error.message.includes('accuracy') || error.code === 'PGRST204')) {
          console.warn('⚠️ Supabase schema note: idempotency_key/accuracy column missing, inserting base fields.');
          delete alertPayload.idempotency_key;
          delete alertPayload.accuracy;
          const retryRes = await supabase.from('sos_history').insert([alertPayload]).select().single();
          if (retryRes.error) {
            console.error('Supabase retry error:', retryRes.error.message);
            throw retryRes.error;
          }
          alert = retryRes.data;
        } else {
          console.error('Supabase createSosAlert error:', error.message);
          throw error;
        }
      } else {
        alert = data;
      }

      const now = new Date(alert.created_at || capturedAt || Date.now());
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHour = hours % 12 || 12;

      const sessionData = {
        id: alert.id.toString(),
        userId: alert.user_id,
        userPhone: userPhone || '',
        idempotencyKey: idempotencyKey || null,
        timestamp: alert.created_at,
        displayTime: `Today, ${formattedHour}:${minutes} ${ampm}`,
        location: dec(alert.location_address) || `GPS: ${alert.latitude}, ${alert.longitude}`,
        latitude: alert.latitude,
        longitude: alert.longitude,
        accuracy: accuracy != null ? parseFloat(accuracy) : null,
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
        const istTime = d.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const istDate = d.toLocaleDateString('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        const displayTime = `${istDate}, ${istTime}`;

        const key = alert.id.toString();
        const liveSession = liveTrackSessions.get(key);

        const currentStatus = liveSession?.status || alert.status || 'ACTIVE';

        const formatIsoTime = (iso) => {
          if (!iso) return null;
          try {
            const dt = new Date(iso);
            return dt.toLocaleTimeString('en-US', {
              timeZone: 'Asia/Kolkata',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });
          } catch (_) {
            return null;
          }
        };

        const resolvedTime = liveSession?.resolvedTime || (currentStatus === 'RESOLVED' ? (alert.updated_at || alert.created_at) : null);

        return {
          id: alert.id,
          userId: alert.user_id,
          timestamp: alert.created_at,
          displayTime: displayTime,
          location: dec(alert.location_address) || `GPS: ${alert.latitude}, ${alert.longitude}`,
          latitude: liveSession?.latitude ?? alert.latitude,
          longitude: liveSession?.longitude ?? alert.longitude,
          status: currentStatus,
          resolvedTime: resolvedTime,
          displayResolvedTime: formatIsoTime(resolvedTime),
          evidenceUrl: alert.evidence_url || alert.audio_url || null,
        };
      });
    } catch (err) {
      console.error('Unexpected error in getSosHistory:', err);
      return [];
    }
  },

  // --- LIVE LOCATION TRACKING ---
  async updateLiveLocation({ alertId, latitude, longitude, accuracy, address, status = 'ACTIVE' }) {
    if (!alertId) return null;
    const key = alertId.toString();
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const acc = accuracy != null && !isNaN(parseFloat(accuracy)) ? parseFloat(accuracy) : null;

    let session = liveTrackSessions.get(key);
    const nowIso = new Date().toISOString();

    if (!session) {
      session = {
        id: key,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        status,
        lastUpdated: nowIso,
        breadcrumbs: [],
      };
      liveTrackSessions.set(key, session);
    } else {
      session.latitude = lat;
      session.longitude = lng;
      if (acc != null) session.accuracy = acc;
      session.status = status;
      session.lastUpdated = nowIso;
    }

    if (!isNaN(lat) && !isNaN(lng)) {
      if (!Array.isArray(session.breadcrumbs)) {
        session.breadcrumbs = [];
      }
      const lastPt = session.breadcrumbs[session.breadcrumbs.length - 1];
      let shouldAppend = true;
      if (lastPt) {
        const dLat = ((lat - lastPt.latitude) * Math.PI) / 180;
        const dLng = ((lng - lastPt.longitude) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lastPt.latitude * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const distMeters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        // Smart jitter filter:
        // When GPS precision is high (< 10m), record movements >= 3.5m; otherwise >= 7m to avoid false indoor zig-zags
        const minMoveDist = (acc && acc < 10) ? 3.5 : 7.0;
        if (distMeters < minMoveDist) {
          shouldAppend = false;
          lastPt.timestamp = nowIso;
          if (acc != null) lastPt.accuracy = acc;
        }
      }

      if (shouldAppend) {
        session.breadcrumbs.push({
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          timestamp: nowIso,
        });
        // Keep up to 1000 breadcrumb points (~33+ mins of live trail) while preserving origin point #0
        if (session.breadcrumbs.length > 1000) {
          session.breadcrumbs.splice(1, 1);
        }
      }
    }

    // Also update supabase asynchronously if possible
    try {
      supabase
        .from('sos_history')
        .update({
          latitude: lat,
          longitude: lng,
          location_address: enc(address || `GPS Location (${lat}, ${lng})`),
          status,
        })
        .eq('id', alertId)
        .then(() => { })
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
          .then(() => { })
          .catch(() => { });

        await supabase
          .from('sos_history')
          .update({ evidence_url: evidenceUrl })
          .eq('id', alertId)
          .then(() => { })
          .catch(() => { });
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
      session.resolvedTime = nowIso;
      session.lastUpdated = nowIso;
    } else {
      session = { id: key, status: 'RESOLVED', resolvedTime: nowIso, lastUpdated: nowIso };
      liveTrackSessions.set(key, session);
    }

    try {
      await supabase
        .from('sos_history')
        .update({ status: 'RESOLVED' })
        .eq('id', alertId);
    } catch (e) {
      console.error('Supabase resolve alert error:', e);
    }

    return session;
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
              name: dec(g.name),
              phone: dec(g.mobile_number),
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

        const istTime = createdDate.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const istDate = createdDate.toLocaleDateString('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
        });
        const displayTime = `${istDate}, ${istTime}`;

        return {
          id: alert.id.toString(),
          userId: alert.user_id,
          createdAt: alert.created_at,
          displayTime,
          timeAgo,
          latitude: liveSession?.latitude ?? alert.latitude ?? 13.0827,
          longitude: liveSession?.longitude ?? alert.longitude ?? 80.2707,
          accuracy: liveSession?.accuracy ?? alert.accuracy ?? null,
          location: dec(alert.location_address) || `GPS (${alert.latitude}, ${alert.longitude})`,
          status: liveSession?.status || alert.status || 'DISPATCHED',
          evidenceUrl: alert.evidence_url || alert.audio_url || liveSession?.evidenceUrl || null,
          operatorNotes: dec(alert.operator_notes) || liveSession?.operatorNotes || '',
          user: {
            name: dec(user?.full_name) || (user?.is_guest ? 'Guest Victim' : 'DEVI User'),
            phone: user?.mobile_number || alert.user_id || '9500238347',
            address: user ? [dec(user.address_1), dec(user.address_2)].filter(Boolean).join(', ') : 'Location on Map',
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

  // --- DASHBOARD: ADD OPERATOR LOG NOTE (Step 9) ---
  async addIncidentNote(alertId, noteText) {
    if (!alertId || !noteText) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);
    const timeFormatted = new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const formattedNote = `[${timeFormatted}] ${noteText}`;

    if (session) {
      session.operatorNotes = session.operatorNotes ? `${session.operatorNotes}\n${formattedNote}` : formattedNote;
    }

    try {
      const { data } = await supabase.from('sos_history').select('operator_notes').eq('id', alertId).maybeSingle();
      const existing = dec(data?.operator_notes) || '';
      const updatedNotes = existing ? `${existing}\n${formattedNote}` : formattedNote;
      await supabase.from('sos_history').update({ operator_notes: enc(updatedNotes) }).eq('id', alertId);
    } catch (e) {
      console.warn('Note updating operator_notes in Supabase:', e.message);
    }

    return session || { id: key, note: formattedNote };
  },
};

// Real-time live tracking sessions store
const liveTrackSessions = new Map();

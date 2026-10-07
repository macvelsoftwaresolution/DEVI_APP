import fs from 'fs';
import path from 'path';
import { supabase } from '../config/supabase.js';
import { hashPin, verifyPin } from '../utils/pin.utils.js';

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
            location: existingAlert.location_address || `GPS: ${existingAlert.latitude}, ${existingAlert.longitude}`,
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
        location_address: resolvedAddress,
        status: 'DISPATCHED',
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
        location: alert.location_address || `GPS: ${alert.latitude}, ${alert.longitude}`,
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
        const hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHour = hours % 12 || 12;
        const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        const key = alert.id.toString();
        const liveSession = liveTrackSessions.get(key);

        return {
          id: alert.id,
          userId: alert.user_id,
          timestamp: alert.created_at,
          displayTime: `${dateStr}, ${formattedHour}:${minutes} ${ampm}`,
          location: alert.location_address || `GPS: ${alert.latitude}, ${alert.longitude}`,
          latitude: liveSession?.latitude ?? alert.latitude,
          longitude: liveSession?.longitude ?? alert.longitude,
          status: liveSession?.status || alert.status || 'ACTIVE',
          assignedAgent: liveSession?.assignedAgent || alert.assigned_agent || null,
          responderStatus: liveSession?.responderStatus || alert.responder_status || (liveSession?.assignedAgent ? 'EN_ROUTE' : null),
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
        // Ignore minor GPS drift < 12 meters to prevent zig-zags through buildings/schools
        if (distMeters < 12) {
          shouldAppend = false;
          lastPt.timestamp = nowIso;
        }
      }

      if (shouldAppend) {
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
          responderStatus: liveSession?.responderStatus || (alert.assigned_agent ? 'ASSIGNED' : null),
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
  async assignAgent(alertId, agentName, agentPhone = null) {
    if (!alertId || !agentName) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);

    const displayName = agentPhone ? `${agentName} (${agentPhone})` : agentName;

    if (!session) {
      session = {
        id: key,
        assignedAgent: displayName,
        status: 'DISPATCHED',
        responderStatus: 'ASSIGNED',
        lastUpdated: new Date().toISOString()
      };
    } else {
      session.assignedAgent = displayName;
      session.status = 'DISPATCHED';
      session.responderStatus = 'ASSIGNED';
      session.lastUpdated = new Date().toISOString();
    }
    liveTrackSessions.set(key, session);

    // Mark responder as ON_MISSION in memory
    const matched = respondersList.find(r => r.name.toLowerCase().includes(agentName.toLowerCase()) || r.id === agentName || (agentPhone && r.phone === agentPhone));
    if (matched) {
      matched.status = 'ON_MISSION';
      matched.duty_status = 'DISPATCHED';
    }

    try {
      const { error } = await supabase
        .from('sos_history')
        .update({
          assigned_agent: displayName,
          status: 'DISPATCHED',
        })
        .eq('id', alertId);

      if (error && error.code === '42703') {
        // Fallback if assigned_agent column does not exist yet
        await supabase
          .from('sos_history')
          .update({
            status: 'DISPATCHED',
          })
          .eq('id', alertId);
      }
    } catch (e) {
      console.warn('Note updating assigned_agent in Supabase:', e.message);
    }

    return session;
  },

  // --- AGENT ACCEPTS DISPATCH MISSION (Step 8.5) ---
  async acceptMission(alertId, agentId = null) {
    if (!alertId) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);

    if (session) {
      session.status = 'DISPATCHED';
      session.responderStatus = 'EN_ROUTE';
      session.lastUpdated = new Date().toISOString();
    } else {
      session = {
        id: key,
        status: 'DISPATCHED',
        responderStatus: 'EN_ROUTE',
        lastUpdated: new Date().toISOString()
      };
      liveTrackSessions.set(key, session);
    }

    if (agentId) {
      await this.setAgentDutyStatus(agentId, 'DISPATCHED');
    }

    try {
      await supabase
        .from('sos_history')
        .update({ status: 'DISPATCHED' })
        .eq('id', alertId);
    } catch (_) { }

    return session;
  },

  // --- DASHBOARD: RESPONDERS / FIELD AGENTS MANAGEMENT ---
  async getResponders() {
    try {
      const { data, error } = await supabase.from('agents').select('*').order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data.map(a => {
          let dutyStatus = a.duty_status || 'OFF_DUTY';
          return {
            ...a,
            duty_status: dutyStatus,
            is_live: a.is_live,
            status: dutyStatus === 'ON_DUTY' ? 'AVAILABLE' : dutyStatus
          };
        });
      }
    } catch (e) {
      console.warn('Error reading agents from Supabase:', e.message);
    }
    return respondersList.map(a => {
      let dutyStatus = a.duty_status || 'OFF_DUTY';
      return {
        ...a,
        duty_status: dutyStatus,
        is_live: a.is_live,
        status: dutyStatus === 'ON_DUTY' ? 'AVAILABLE' : dutyStatus
      };
    });
  },

  // --- RESPONDER AUTHENTICATION ---
  async authenticateResponder(phone, pin) {
    if (!phone || !pin) return { success: false, message: 'Mobile number and Security PIN are required' };
    const cleanPhone = phone.toString().replace(/\D/g, '');
    const phone10 = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;

    try {
      // Find agent by phone in Supabase agents table (match 10 digits or with 91 prefix)
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .or(`phone.eq.${phone10},phone.eq.91${phone10},phone.ilike.%${phone10}%`)
        .maybeSingle();

      if (!error && data) {
        if (data.is_active === false) {
          return { success: false, message: 'Your responder account is deactivated. Contact Dispatcher.' };
        }

        // Verify PIN hash (PBKDF2)
        const isMatch = verifyPin(pin, data.pin_hash);
        if (!isMatch) {
          return { success: false, message: 'Invalid 4-digit Security PIN' };
        }

        if (data.duty_status === 'PENDING_APPROVAL') {
          data.duty_status = 'ON_DUTY';
          data.is_live = true;
          try {
            await supabase.from('agents').update({ duty_status: 'ON_DUTY', is_live: true }).eq('id', data.id);
          } catch (_) {}
        }

        return {
          success: true,
          agent: {
            ...data,
            status: data.duty_status === 'ON_DUTY' ? 'AVAILABLE' : (data.duty_status || 'OFF_DUTY')
          }
        };
      }
    } catch (e) {
      console.warn('Error during Supabase agent auth:', e.message);
    }

    // In-memory fallback check
    const dynamicAgent = respondersList.find(a => a.phone && (a.phone === phone10 || a.phone.includes(phone10)));
    if (dynamicAgent) {
      if (dynamicAgent.is_active === false) {
        return { success: false, message: 'Your responder account is deactivated. Contact Dispatcher.' };
      }
      const isMatch = dynamicAgent.pin_hash ? verifyPin(pin, dynamicAgent.pin_hash) : (dynamicAgent.pin === pin);
      if (isMatch) {
        if (dynamicAgent.duty_status === 'PENDING_APPROVAL') {
          dynamicAgent.duty_status = 'ON_DUTY';
          dynamicAgent.is_live = true;
        }
        return {
          success: true,
          agent: {
            ...dynamicAgent,
            status: dynamicAgent.duty_status === 'ON_DUTY' ? 'AVAILABLE' : (dynamicAgent.duty_status || 'OFF_DUTY')
          }
        };
      }
      return { success: false, message: 'Invalid 4-digit Security PIN' };
    }

    return { success: false, message: 'No registered responder found with this mobile number' };
  },

  async addResponder({ name, phone, pin, area, latitude, longitude, vehicle }) {
    if (!phone) throw new Error('Phone number is required');
    const digitsOnly = phone.toString().replace(/\D/g, '');
    const cleanPhone = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
    const plainPin = (pin && pin.toString().trim().length >= 4)
      ? pin.toString().trim()
      : Math.floor(1000 + Math.random() * 9000).toString();
    const pinHash = hashPin(plainPin);
    const newAgent = {
      id: `agent-${Date.now()}`,
      name: (name || 'Field Responder').trim(),
      phone: cleanPhone,
      pin_hash: pinHash,
      area: (area || 'Assigned Area').trim(),
      latitude: (latitude !== undefined && latitude !== null && !isNaN(parseFloat(latitude))) ? parseFloat(latitude) : null,
      longitude: (longitude !== undefined && longitude !== null && !isNaN(parseFloat(longitude))) ? parseFloat(longitude) : null,
      heading: 0,
      speed: 0,
      vehicle: (vehicle || 'Patrol Unit').trim(),
      duty_status: 'PENDING_APPROVAL',
      is_live: false,
      is_active: true,
      created_at: new Date().toISOString()
    };

    try {
      // Upsert by unique phone so re-adding or updating credentials works smoothly
      const { data, error } = await supabase
        .from('agents')
        .upsert(newAgent, { onConflict: 'phone' })
        .select()
        .single();

      if (!error && data) {
        console.log(`✅ [AGENT CREATED IN SUPABASE] ID: ${data.id}, Name: ${data.name}, Phone: ${data.phone}`);
        return { ...data, status: data.duty_status, plainPin };
      }
      if (error) {
        console.error('❌ [SUPABASE AGENT INSERT ERROR]:', error.message || error);
      }
    } catch (e) {
      console.error('❌ [SUPABASE AGENT INSERT EXCEPTION]:', e.message);
    }

    respondersList.unshift(newAgent);
    return { ...newAgent, status: newAgent.duty_status, plainPin };
  },

  async deleteResponder(agentId) {
    try {
      await supabase.from('agents').delete().eq('id', agentId);
    } catch (_) { }
    respondersList = respondersList.filter(a => a.id !== agentId);
    return true;
  },

  async getAgentById(agentId) {
    if (!agentId) return null;
    try {
      const { data, error } = await supabase.from('agents').select('*').eq('id', agentId).maybeSingle();
      if (!error && data) {
        return {
          ...data,
          status: data.duty_status === 'ON_DUTY' ? 'AVAILABLE' : (data.duty_status || 'OFF_DUTY')
        };
      }
    } catch (e) {
      console.warn('Error fetching agent by id from Supabase:', e.message);
    }
    const list = await this.getResponders();
    return list.find(a => a.id === agentId || a.id.toString() === agentId.toString());
  },

  // --- Admin Configurable Duty Shift & GPS Settings ---
  getDutySettings() {
    try {
      const filePath = path.resolve(process.cwd(), 'duty_settings.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (_) { }
    return {
      shiftDurationHours: 8,
      gpsIntervalSeconds: 10,
      autoEndDuty: true,
    };
  },

  updateDutySettings(settings) {
    try {
      const current = this.getDutySettings();
      const updated = {
        ...current,
        shiftDurationHours: settings.shiftDurationHours ? Number(settings.shiftDurationHours) : current.shiftDurationHours,
        gpsIntervalSeconds: settings.gpsIntervalSeconds ? Number(settings.gpsIntervalSeconds) : current.gpsIntervalSeconds,
        autoEndDuty: settings.autoEndDuty !== undefined ? Boolean(settings.autoEndDuty) : current.autoEndDuty,
        updatedAt: new Date().toISOString(),
      };
      const filePath = path.resolve(process.cwd(), 'duty_settings.json');
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
      console.log(`⚙️ [DUTY SETTINGS UPDATED] Shift: ${updated.shiftDurationHours}h, GPS: ${updated.gpsIntervalSeconds}s`);
      return updated;
    } catch (e) {
      console.error('Error updating duty settings:', e);
      return this.getDutySettings();
    }
  },

  _ensureInvitesMap() {
    if (!global._deviAgentInvites) {
      global._deviAgentInvites = new Map();
      try {
        const filePath = path.resolve(process.cwd(), 'agent_invites.json');
        if (fs.existsSync(filePath)) {
          const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          for (const [k, v] of Object.entries(raw)) {
            global._deviAgentInvites.set(k, v);
          }
        }
      } catch (_) { }
    }
    return global._deviAgentInvites;
  },

  _persistInvites() {
    try {
      const map = this._ensureInvitesMap();
      const obj = {};
      for (const [k, v] of map.entries()) {
        obj[k] = v;
      }
      const filePath = path.resolve(process.cwd(), 'agent_invites.json');
      fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) { }
  },

  // --- Unique 1-Time Device-Locked Agent Invitations ---
  createAgentInvite({ agentId, token, phone, name, area, pin }) {
    const map = this._ensureInvitesMap();
    const invite = {
      agentId,
      token,
      phone,
      name,
      area,
      pin,
      claimed: false,
      claimedAt: null,
      deviceFingerprint: null,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    map.set(token, invite);
    this._persistInvites();
    console.log(`🎫 [AGENT 1-TIME INVITE CREATED] Token: ${token}, Agent: ${name} (${phone})`);
    return invite;
  },

  getAgentInvite(token) {
    if (!token) return null;
    const map = this._ensureInvitesMap();
    return map.get(token) || null;
  },

  async respondToAgentInvite(token, action, deviceFingerprint = null) {
    if (!token) {
      return { success: false, reason: 'NOT_FOUND', message: 'Invite token not found or expired.' };
    }
    const map = this._ensureInvitesMap();
    const invite = map.get(token);
    if (!invite) {
      return { success: false, reason: 'NOT_FOUND', message: 'Invite token not found or expired.' };
    }
    if (invite.claimed) {
      return { success: false, reason: 'ALREADY_CLAIMED', message: 'This invitation has already been claimed on another device. For security, links cannot be shared or reused.' };
    }
    if (invite.status === 'REJECTED') {
      return { success: false, reason: 'REJECTED', message: 'This duty assignment was previously declined.' };
    }

    if (action === 'APPROVE') {
      const dutyStartedAt = new Date().toISOString();

      invite.claimed = true;
      invite.claimedAt = dutyStartedAt;
      invite.deviceFingerprint = deviceFingerprint;
      invite.status = 'ACCEPTED';
      this._persistInvites();

      try {
        await supabase.from('agents').update({
          duty_status: 'ON_DUTY',
          is_live: true,
          is_active: true,
          duty_started_at: dutyStartedAt,
        }).eq('id', invite.agentId);
      } catch (_) { }

      const agent = respondersList.find(a => a.id === invite.agentId);
      if (agent) {
        agent.duty_status = 'ON_DUTY';
        agent.status = 'ON_DUTY';
        agent.is_live = true;
        agent.duty_started_at = dutyStartedAt;
      }

      console.log(`✅ [AGENT INVITE ACCEPTED & DUTY STARTED] Agent: ${invite.name}`);
      return {
        success: true,
        invite,
        agent: agent || {
          id: invite.agentId,
          name: invite.name,
          phone: invite.phone,
          area: invite.area,
          duty_status: 'ON_DUTY',
          is_live: true,
        }
      };
    } else {
      invite.status = 'REJECTED';
      this._persistInvites();
      try {
        await supabase.from('agents').update({ duty_status: 'REJECTED', is_active: false }).eq('id', invite.agentId);
      } catch (_) { }

      const agent = respondersList.find(a => a.id === invite.agentId);
      if (agent) {
        agent.duty_status = 'REJECTED';
        agent.status = 'REJECTED';
        agent.is_active = false;
      }

      console.log(`❌ [AGENT INVITE REJECTED] Agent: ${invite.name}, Token: ${token}`);
      return { success: true, invite, rejected: true };
    }
  },

  async updateAgentLiveLocation(agentId, { latitude, longitude, heading = null, speed = null }) {
    if (!agentId || !latitude || !longitude) return null;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const nowIso = new Date().toISOString();

    let agent = await this.getAgentById(agentId);
    const isCurrentlyOffDuty = agent && (agent.duty_status === 'OFF_DUTY' || agent.status === 'OFF_DUTY');

    if (agent) {
      agent.latitude = lat;
      agent.longitude = lng;
      agent.last_seen = nowIso;
      if (isCurrentlyOffDuty) {
        agent.is_live = false;
        agent.duty_status = 'OFF_DUTY';
      } else {
        agent.is_live = true;
      }
    }

    try {
      const updatePayload = {
        latitude: lat,
        longitude: lng,
        last_seen: nowIso,
      };
      if (isCurrentlyOffDuty) {
        updatePayload.duty_status = 'OFF_DUTY';
        updatePayload.is_live = false;
      }
      if (heading !== null && heading !== undefined) updatePayload.heading = parseFloat(heading);
      if (speed !== null && speed !== undefined) updatePayload.speed = parseFloat(speed);

      await supabase.from('agents').update(updatePayload).eq('id', agentId);
    } catch (e) {
      console.warn('Error updating agent live location in Supabase:', e.message);
    }

    return agent ? { ...agent, isOffDuty: isCurrentlyOffDuty } : { id: agentId, latitude: lat, longitude: lng, last_seen: nowIso, duty_status: isCurrentlyOffDuty ? 'OFF_DUTY' : 'ON_DUTY', isOffDuty: isCurrentlyOffDuty };
  },

  async setAgentDutyStatus(agentId, status) {
    let agent = await this.getAgentById(agentId);
    const isLive = status === 'ON_DUTY' || status === 'AVAILABLE';
    const nowIso = new Date().toISOString();

    if (agent) {
      agent.duty_status = status;
      agent.status = status;
      agent.is_live = isLive;
      agent.last_seen = nowIso;
      if (!isLive) {
        agent.shift_expires_at = null;
      }
    }

    const inList = respondersList.find(a => a.id === agentId || a.id.toString() === agentId.toString());
    if (inList) {
      inList.duty_status = status;
      inList.status = status;
      inList.is_live = isLive;
      inList.last_seen = nowIso;
      if (!isLive) inList.shift_expires_at = null;
    }

    try {
      const updateData = {
        duty_status: status,
        is_live: isLive,
        last_seen: nowIso,
      };
      const { error } = await supabase.from('agents').update(updateData).eq('id', agentId);
      if (error) {
        console.error('Error updating duty status in Supabase:', error.message);
      }
    } catch (e) {
      console.error('Error updating duty status in Supabase:', e.message);
    }
    return agent || { id: agentId, duty_status: status, status, is_live: isLive, last_seen: nowIso };
  },

  async getAgentActiveAssignment(agentId) {
    const agent = await this.getAgentById(agentId);
    if (!agent) return null;

    const incidents = await this.getAllIncidentsForDashboard();
    const cleanPhone10 = agent.phone ? agent.phone.toString().replace(/\D/g, '').slice(-10) : '';

    return incidents.find(i => {
      const isOngoing = i.status === 'ASSIGNED' || i.status === 'ACTIVE' || i.status === 'DISPATCHED';
      if (!isOngoing || !i.assignedAgent) return false;
      const assignedLower = i.assignedAgent.toLowerCase();
      const matchName = agent.name && assignedLower.includes(agent.name.toLowerCase());
      const matchPhone = cleanPhone10 && assignedLower.includes(cleanPhone10);
      return matchName || matchPhone;
    });
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

// Active Field Responders Registry (Dynamically registered agents only)
let respondersList = [];

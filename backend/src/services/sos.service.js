import { supabase } from '../config/supabase.js';
import { encryptField as enc, decryptField as dec } from '../utils/encryption.js';
import { liveTrackSessions } from './live-sessions.js';
import { UserService } from './user.service.js';
import { GeocodeService } from './geocode.service.js';
import { toLatLng, hasFix, initialBreadcrumbs, NO_FIX_PLACEHOLDER } from '../utils/coords.js';

const NO_LOCATION_TEXT = 'Location not yet available';

// SOS alerts: creation, idempotency, live tracking, evidence, history, signal state, resolve
export const SosService = {

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

          const coords = toLatLng(existingAlert.latitude, existingAlert.longitude);
          const sessionData = {
            id: existingAlert.id.toString(),
            userId: existingAlert.user_id,
            userPhone: userPhone || '',
            idempotencyKey,
            timestamp: existingAlert.created_at,
            displayTime: `Today, ${formattedHour}:${minutes} ${ampm}`,
            location: dec(existingAlert.location_address) || NO_LOCATION_TEXT,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: existingAlert.accuracy || null,
            status: existingAlert.status || 'ACTIVE',
            lastUpdated: existingAlert.created_at || new Date().toISOString(),
            evidenceUrl: existingAlert.evidence_url || null,
            breadcrumbs: initialBreadcrumbs(
              coords.latitude,
              coords.longitude,
              existingAlert.created_at || new Date().toISOString()
            ),
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

  async createSosAlert({ userPhone, location, latitude, longitude, accuracy, idempotencyKey, capturedAt }) {
    let userId = null;
    if (userPhone) {
      let user = await UserService.findUserByPhone(userPhone);
      if (!user) {
        user = await UserService.createOrGetUser(userPhone);
      }
      if (user) userId = user.id;
    }

    // Real GPS or nothing: never fall back to a default city
    const coords = toLatLng(latitude, longitude);
    latitude = coords.latitude;
    longitude = coords.longitude;

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

    if (isGenericLocation && hasFix(latitude, longitude)) {
      const placeName = await GeocodeService.reverseGeocode(latitude, longitude);
      if (placeName) {
        resolvedAddress = placeName;
      }
    }
    if (!hasFix(latitude, longitude)) {
      // Device text such as "Location disabled on device" is kept; anything else becomes the honest default
      resolvedAddress = (location && !isGenericLocation) ? location : NO_LOCATION_TEXT;
    } else if (!resolvedAddress || isGenericLocation) {
      resolvedAddress = `GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }

    try {
      const alertPayload = {
        latitude,
        longitude,
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
      let { data, error } = await supabase
        .from('sos_history')
        .insert([alertPayload])
        .select()
        .single();

      // If latitude/longitude columns are NOT NULL, store the 0,0 "no fix" placeholder.
      // An SOS must never be lost because GPS was unavailable; readers turn 0,0 back into null.
      if (error && error.code === '23502' && alertPayload.latitude === null) {
        console.warn('⚠️ sos_history latitude/longitude are NOT NULL; saving 0,0 placeholder for an SOS without GPS.');
        alertPayload.latitude = NO_FIX_PLACEHOLDER;
        alertPayload.longitude = NO_FIX_PLACEHOLDER;
        ({ data, error } = await supabase.from('sos_history').insert([alertPayload]).select().single());
      }

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
        location: dec(alert.location_address) || NO_LOCATION_TEXT,
        latitude,
        longitude,
        accuracy: latitude !== null && accuracy != null ? parseFloat(accuracy) : null,
        status: alert.status || 'ACTIVE',
        lastUpdated: alert.created_at || new Date().toISOString(),
        evidenceUrl: alert.evidence_url || null,
        breadcrumbs: initialBreadcrumbs(latitude, longitude, alert.created_at || new Date().toISOString()),
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
        const user = await UserService.findUserByPhone(userPhone);
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

        const coords = hasFix(liveSession?.latitude, liveSession?.longitude)
          ? toLatLng(liveSession.latitude, liveSession.longitude)
          : toLatLng(alert.latitude, alert.longitude);

        return {
          id: alert.id,
          userId: alert.user_id,
          timestamp: alert.created_at,
          displayTime: displayTime,
          location: dec(alert.location_address) || NO_LOCATION_TEXT,
          latitude: coords.latitude,
          longitude: coords.longitude,
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
          const coords = toLatLng(data.latitude, data.longitude);
          session = {
            id: data.id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            status: data.status || 'ACTIVE',
            lastUpdated: data.created_at || new Date().toISOString(),
            evidenceUrl: data.evidence_url || data.audio_url || null,
            breadcrumbs: initialBreadcrumbs(
              coords.latitude,
              coords.longitude,
              data.created_at || new Date().toISOString()
            ),
          };
          liveTrackSessions.set(key, session);
        }
      } catch (e) {
        console.error('Error fetching fallback live location:', e);
      }
    }

    return session;
  },

  // WhatsApp dispatch result for an alert (kept in memory with the live session)
  attachWhatsAppStatus(alertId, whatsapp) {
    const session = liveTrackSessions.get(String(alertId));
    if (!session) return null;
    session.whatsapp = whatsapp;
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

  // --- SIGNAL MONITORING (live tracking health) ---
  // Active in-memory sessions, used by the signal watchdog
  getActiveLiveSessions() {
    return [...liveTrackSessions.values()].filter((s) => s.status === 'ACTIVE');
  },

  // Marks an alert's live signal as lost ('NO_UPDATES' or 'APP_CLOSED') or restored (lost = false)
  setSignalState(alertId, { lost, reason = null }) {
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);
    if (!session) {
      session = { id: key, status: 'ACTIVE', lastUpdated: new Date().toISOString(), breadcrumbs: [] };
      liveTrackSessions.set(key, session);
    }
    session.signalLost = lost;
    session.signalReason = lost ? reason : null;
    session.signalLostAt = lost ? new Date().toISOString() : null;
    return session;
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
};

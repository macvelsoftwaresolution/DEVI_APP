import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { encryptField as enc, decryptField as dec } from '../utils/encryption.js';
import { liveTrackSessions } from './live-sessions.js';
import { UserService } from './user.service.js';
import { GeocodeService } from './geocode.service.js';
import { toLatLng, hasFix, NO_FIX_PLACEHOLDER } from '../utils/coords.js';

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
            location: dec(existingAlert.location_address, 'sos_history.location_address', existingAlert.id) || NO_LOCATION_TEXT,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: existingAlert.accuracy || null,
            status: existingAlert.status || 'ACTIVE',
            lastUpdated: existingAlert.created_at || new Date().toISOString(),
            evidenceUrl: existingAlert.evidence_url || null,
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
        // A guest ID must stay a guest record, so the alert can move to the account on sign in
        user = userPhone.startsWith('GUEST_')
          ? await UserService.createOrGetGuestUser(userPhone)
          : await UserService.createOrGetUser(userPhone);
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
      // Id made here, not by the database, so the location can be encrypted bound to this alert (E6)
      const alertId = crypto.randomUUID();
      const alertPayload = {
        id: alertId,
        latitude,
        longitude,
        location_address: enc(resolvedAddress, 'sos_history.location_address', alertId),
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
        location: dec(alert.location_address, 'sos_history.location_address', alert.id) || NO_LOCATION_TEXT,
        latitude,
        longitude,
        accuracy: latitude !== null && accuracy != null ? parseFloat(accuracy) : null,
        status: alert.status || 'ACTIVE',
        lastUpdated: alert.created_at || new Date().toISOString(),
        evidenceUrl: alert.evidence_url || null,
      };

      liveTrackSessions.set(alert.id.toString(), sessionData);

      return sessionData;
    } catch (err) {
      console.error('Unexpected error in createSosAlert:', err);
      throw err;
    }
  },

  // All alerts (admin), one user's alerts (userPhone), or only the given alert IDs (alertIds).
  // An unknown user or an empty ID list returns nothing, never every alert.
  async getSosHistory(userPhone, { alertIds } = {}) {
    try {
      let query = supabase.from('sos_history').select('*').order('created_at', { ascending: false });

      if (alertIds) {
        if (!alertIds.length) return [];
        query = query.in('id', alertIds);
      } else if (userPhone) {
        const user = await UserService.findUserByPhone(userPhone);
        if (!user) return [];
        query = query.eq('user_id', user.id);
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
          location: dec(alert.location_address, 'sos_history.location_address', alert.id) || NO_LOCATION_TEXT,
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

  // WhatsApp dispatch result for an alert (kept in memory with the live session)
  attachWhatsAppStatus(alertId, whatsapp) {
    const session = liveTrackSessions.get(String(alertId));
    if (!session) return null;
    session.whatsapp = whatsapp;
    return session;
  },

  // User ID that owns an alert (live session first, then the database)
  async getAlertOwnerId(alertId) {
    const session = liveTrackSessions.get(String(alertId));
    if (session?.userId) return session.userId;
    try {
      const { data } = await supabase.from('sos_history').select('user_id').eq('id', alertId).maybeSingle();
      return data?.user_id || null;
    } catch (e) {
      console.error('Error reading alert owner:', e);
      return null;
    }
  },

  // Moves alerts owned by guest sessions to a registered account (guest signed in after an
  // Instant SOS). Alerts of registered users are never moved. Returns the moved alert IDs.
  async claimGuestAlerts(alertIds, accountId, accountPhone) {
    if (!alertIds?.length || !accountId) return [];
    try {
      const { data: alerts, error } = await supabase
        .from('sos_history')
        .select('id, user_id')
        .in('id', alertIds);
      if (error || !alerts?.length) return [];

      const ownerIds = [...new Set(alerts.map((a) => a.user_id).filter(Boolean))];
      const { data: owners } = ownerIds.length
        ? await supabase.from('users').select('id, is_guest').in('id', ownerIds)
        : { data: [] };
      const guestOwners = new Set((owners || []).filter((u) => u.is_guest).map((u) => u.id));

      const claimable = alerts
        .filter((a) => !a.user_id || guestOwners.has(a.user_id))
        .map((a) => a.id);
      if (!claimable.length) return [];

      const { error: uError } = await supabase
        .from('sos_history')
        .update({ user_id: accountId })
        .in('id', claimable);
      if (uError) {
        console.error('Error claiming guest alerts:', uError.message);
        return [];
      }

      for (const id of claimable) {
        const session = liveTrackSessions.get(String(id));
        if (session) {
          session.userId = accountId;
          session.userPhone = accountPhone;
        }
      }
      return claimable.map(String);
    } catch (e) {
      console.error('Error claiming guest alerts:', e);
      return [];
    }
  },

  // Where the SOS was pressed, for the guardian link page (no live tracking: the saved location only)
  async getAlertLocation(alertId) {
    if (!alertId) return null;
    const session = liveTrackSessions.get(String(alertId));
    try {
      const { data, error } = await supabase
        .from('sos_history')
        .select('*')
        .eq('id', alertId)
        .maybeSingle();
      if (error || !data) return null;

      const status = String(session?.status || data.status || 'ACTIVE').toUpperCase();
      const coords = toLatLng(data.latitude, data.longitude);
      return {
        id: data.id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        location: dec(data.location_address, 'sos_history.location_address', data.id) || NO_LOCATION_TEXT,
        status,
        timestamp: data.created_at,
        // Without a stored resolve time created_at is used, so links expire sooner, not later
        resolvedTime: status === 'RESOLVED' ? (session?.resolvedTime || data.resolved_at || data.created_at) : null,
        // Unknown (older alerts) counts as not closed by her: never shown as SAFE
        resolvedBy: status === 'RESOLVED' ? (session?.resolvedBy || data.resolved_by || null) : null,
      };
    } catch (e) {
      console.error('Error reading alert location:', e);
      return null;
    }
  },

  // Stored evidence reference for an alert (live session first, then the database)
  async getEvidenceRef(alertId) {
    const session = liveTrackSessions.get(String(alertId));
    if (session?.evidenceUrl) return session.evidenceUrl;
    try {
      const { data } = await supabase.from('sos_history').select('*').eq('id', alertId).maybeSingle();
      return data?.evidence_url || data?.audio_url || null;
    } catch (e) {
      console.error('Error reading evidence reference:', e);
      return null;
    }
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

  // resolvedBy: 'user' (she marked herself safe) or 'admin' (closed on the dashboard)
  async resolveSosAlert(alertId, resolvedBy = 'admin') {
    if (!alertId) return null;
    const key = alertId.toString();
    let session = liveTrackSessions.get(key);
    const nowIso = new Date().toISOString();

    if (session) {
      session.status = 'RESOLVED';
      session.resolvedTime = nowIso;
      session.resolvedBy = resolvedBy;
      session.lastUpdated = nowIso;
    } else {
      session = { id: key, status: 'RESOLVED', resolvedTime: nowIso, resolvedBy, lastUpdated: nowIso };
      liveTrackSessions.set(key, session);
    }

    try {
      const { error } = await supabase
        .from('sos_history')
        .update({ status: 'RESOLVED', resolved_at: nowIso, resolved_by: resolvedBy })
        .eq('id', alertId);
      // Database without the resolved_at / resolved_by columns yet (db/resolved-by.sql not run)
      if (error) {
        await supabase.from('sos_history').update({ status: 'RESOLVED' }).eq('id', alertId);
      }
    } catch (e) {
      console.error('Supabase resolve alert error:', e);
    }

    return session;
  },
};

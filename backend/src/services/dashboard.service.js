import { supabase } from '../config/supabase.js';
import { encryptField as enc, decryptField as dec } from '../utils/encryption.js';
import { liveTrackSessions } from './live-sessions.js';
import { toLatLng, hasFix, initialBreadcrumbs } from '../utils/coords.js';
import { evidenceLink } from '../utils/evidence.js';

// Admin dashboard: incident list (with user & guardian details) and operator notes
export const DashboardService = {
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

        // Real GPS only: live session first, then the stored alert, else null ("GPS pending")
        const coords = hasFix(liveSession?.latitude, liveSession?.longitude)
          ? toLatLng(liveSession.latitude, liveSession.longitude)
          : toLatLng(alert.latitude, alert.longitude);

        return {
          id: alert.id.toString(),
          userId: alert.user_id,
          createdAt: alert.created_at,
          displayTime,
          timeAgo,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.latitude !== null ? (liveSession?.accuracy ?? alert.accuracy ?? null) : null,
          location: dec(alert.location_address) || 'Location not yet available',
          status: liveSession?.status || alert.status || 'DISPATCHED',
          signalLost: !!liveSession?.signalLost,
          whatsapp: liveSession?.whatsapp || null,
          signalReason: liveSession?.signalReason || null,
          lastSeen: liveSession?.lastUpdated || alert.created_at,
          evidenceUrl: evidenceLink(alert.id, alert.evidence_url || alert.audio_url || liveSession?.evidenceUrl || null),
          operatorNotes: dec(alert.operator_notes) || liveSession?.operatorNotes || '',
          user: {
            name: dec(user?.full_name) || (user?.is_guest ? 'Guest Victim' : 'DEVI User'),
            phone: user?.mobile_number || alert.user_id || '9500238347',
            address: user ? [dec(user.address_1), dec(user.address_2)].filter(Boolean).join(', ') : 'Location on Map',
            isGuest: user?.is_guest || false,
          },
          guardians,
          breadcrumbs: liveSession?.breadcrumbs || initialBreadcrumbs(coords.latitude, coords.longitude, alert.created_at),
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

import { supabase } from '../config/supabase.js';
import { encryptField as enc, decryptField as dec } from '../utils/encryption.js';
import { liveTrackSessions } from './live-sessions.js';
import { readCoords } from '../utils/coords.js';
import { evidenceLink } from '../utils/evidence.js';

// Supabase returns at most 1000 rows per request, so read big tables page by page
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;

async function fetchAll(table, columns, orderBy = 'created_at') {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase ${table} fetch error: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

const IST = 'Asia/Kolkata';

const formatIst = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
};

// YYYY-MM-DD of a timestamp in IST (used for "today" and the daily chart)
const istDayKey = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: IST });

// Older rows use DISPATCHED / lowercase 'active' for an open alert
const normalizeStatus = (raw) => {
  const s = String(raw || 'ACTIVE').toUpperCase();
  return s === 'RESOLVED' ? 'RESOLVED' : 'ACTIVE';
};

const includesText = (value, q) => (value || '').toLowerCase().includes(q);

const paginate = (list, page, limit) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 5000);
  const total = list.length;
  const pages = Math.max(Math.ceil(total / safeLimit), 1);
  const safePage = Math.min(Math.max(parseInt(page, 10) || 1, 1), pages);
  const start = (safePage - 1) * safeLimit;
  return { items: list.slice(start, start + safeLimit), total, page: safePage, pages, limit: safeLimit };
};

// Loads users, guardians and SOS rows once per request and decrypts them
async function loadData() {
  const [alerts, users, guardians] = await Promise.all([
    fetchAll('sos_history', '*'),
    fetchAll('users', 'id, full_name, mobile_number, address_1, address_2, is_guest, created_at'),
    fetchAll('guardians', 'id, user_id, name, mobile_number, created_at'),
  ]);

  const usersMap = new Map();
  users.forEach((u) => {
    usersMap.set(u.id, {
      id: u.id,
      name: dec(u.full_name, 'users.full_name', u.id) || (u.is_guest ? 'Guest User' : 'DEVI User'),
      phone: u.is_guest ? null : dec(u.mobile_number, 'users.mobile_number', u.id) || null,
      guestId: u.is_guest ? dec(u.mobile_number, 'users.mobile_number', u.id) || null : null,
      address: [dec(u.address_1, 'users.address_1', u.id), dec(u.address_2, 'users.address_2', u.id)].filter(Boolean).join(', '),
      isGuest: !!u.is_guest,
      createdAt: u.created_at,
      joinedOn: formatIst(u.created_at),
    });
  });

  const guardiansMap = new Map();
  guardians.forEach((g) => {
    if (!guardiansMap.has(g.user_id)) guardiansMap.set(g.user_id, []);
    guardiansMap.get(g.user_id).push({ id: g.id, name: dec(g.name, 'guardians.name', g.user_id), phone: dec(g.mobile_number, 'guardians.mobile_number', g.user_id) });
  });

  const incidents = alerts.map((alert) => {
    const id = alert.id.toString();
    const liveSession = liveTrackSessions.get(id);
    const user = usersMap.get(alert.user_id) || null;
    // The location sent with the SOS (no live tracking); null when the phone had no GPS fix
    const coords = readCoords(alert);
    const status = normalizeStatus(liveSession?.status || alert.status);
    const resolvedAt = alert.resolved_at || liveSession?.resolvedTime || null;

    return {
      id,
      userId: alert.user_id,
      createdAt: alert.created_at,
      displayTime: formatIst(alert.created_at),
      status,
      isTest: !!alert.is_test_mode,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.latitude !== null ? (alert.accuracy ?? null) : null,
      location: dec(alert.location_address, 'sos_history.location_address', alert.id) || 'Location not available',
      resolvedAt: status === 'RESOLVED' ? resolvedAt : null,
      resolvedTime: status === 'RESOLVED' ? formatIst(resolvedAt) : null,
      resolvedBy: status === 'RESOLVED' ? (alert.resolved_by || liveSession?.resolvedBy || null) : null,
      whatsapp: liveSession?.whatsapp || null,
      evidenceUrl: evidenceLink(alert.id, alert.evidence_url || alert.audio_url || liveSession?.evidenceUrl || null),
      operatorNotes: dec(alert.operator_notes, 'sos_history.operator_notes', alert.id) || liveSession?.operatorNotes || '',
      user: user
        ? { id: user.id, name: user.name, phone: user.phone || user.guestId, isGuest: user.isGuest, address: user.address }
        : { id: null, name: 'Unknown User', phone: null, isGuest: false, address: '' },
    };
  });

  return { incidents, usersMap, guardiansMap };
}

// Admin dashboard (view only): stats, SOS records and users
export const DashboardService = {
  async getStats({ days = 30 } = {}) {
    const { incidents, usersMap, guardiansMap } = await loadData();
    const todayKey = istDayKey(Date.now());
    const chartDays = Math.min(Math.max(parseInt(days, 10) || 30, 7), 90);

    // Daily SOS counts for the chart, oldest first
    const counts = new Map();
    for (let i = chartDays - 1; i >= 0; i -= 1) {
      counts.set(istDayKey(Date.now() - i * 86400000), 0);
    }
    incidents.forEach((inc) => {
      const key = istDayKey(inc.createdAt);
      if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    });

    const users = [...usersMap.values()];
    let guardianTotal = 0;
    guardiansMap.forEach((list) => { guardianTotal += list.length; });

    return {
      sos: {
        total: incidents.length,
        today: incidents.filter((i) => istDayKey(i.createdAt) === todayKey).length,
        active: incidents.filter((i) => i.status === 'ACTIVE').length,
        resolved: incidents.filter((i) => i.status === 'RESOLVED').length,
      },
      users: {
        total: users.length,
        registered: users.filter((u) => !u.isGuest).length,
        guests: users.filter((u) => u.isGuest).length,
        newToday: users.filter((u) => u.createdAt && istDayKey(u.createdAt) === todayKey).length,
      },
      guardians: { total: guardianTotal },
      daily: [...counts.entries()].map(([date, count]) => ({ date, count })),
      recent: incidents.slice(0, 6),
    };
  },

  // Filters: status (ALL | ACTIVE | RESOLVED), search (name, phone, location, id), from/to (YYYY-MM-DD, IST)
  async listIncidents({ page, limit, status, search, from, to, userId } = {}) {
    const { incidents } = await loadData();
    const q = String(search || '').trim().toLowerCase();
    const st = String(status || 'ALL').toUpperCase();

    const filtered = incidents.filter((inc) => {
      if (st !== 'ALL' && inc.status !== st) return false;
      if (userId && inc.userId !== userId) return false;
      const day = istDayKey(inc.createdAt);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      return (
        includesText(inc.user.name, q) ||
        includesText(inc.user.phone, q) ||
        includesText(inc.location, q) ||
        includesText(inc.id, q)
      );
    });

    return paginate(filtered, page, limit);
  },

  async getIncident(alertId) {
    const { incidents, guardiansMap } = await loadData();
    const incident = incidents.find((i) => i.id === String(alertId));
    if (!incident) return null;
    return { ...incident, guardians: guardiansMap.get(incident.userId) || [] };
  },

  // Filters: type (ALL | REGISTERED | GUEST), search (name, phone, address)
  async listUsers({ page, limit, type, search } = {}) {
    const { incidents, usersMap, guardiansMap } = await loadData();
    const q = String(search || '').trim().toLowerCase();
    const t = String(type || 'ALL').toUpperCase();

    const sosByUser = new Map();
    incidents.forEach((inc) => {
      const entry = sosByUser.get(inc.userId) || { count: 0, last: null };
      entry.count += 1;
      if (!entry.last) entry.last = inc.displayTime; // incidents are newest first
      sosByUser.set(inc.userId, entry);
    });

    const list = [...usersMap.values()]
      .filter((u) => {
        if (t === 'REGISTERED' && u.isGuest) return false;
        if (t === 'GUEST' && !u.isGuest) return false;
        if (!q) return true;
        return includesText(u.name, q) || includesText(u.phone, q) || includesText(u.guestId, q) || includesText(u.address, q);
      })
      .map((u) => ({
        ...u,
        guardiansCount: (guardiansMap.get(u.id) || []).length,
        sosCount: sosByUser.get(u.id)?.count || 0,
        lastSos: sosByUser.get(u.id)?.last || null,
      }));

    return paginate(list, page, limit);
  },

  async getUser(userId) {
    const { incidents, usersMap, guardiansMap } = await loadData();
    const user = usersMap.get(String(userId));
    if (!user) return null;
    return {
      ...user,
      guardians: guardiansMap.get(user.id) || [],
      sos: incidents.filter((i) => i.userId === user.id),
    };
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
      const existing = dec(data?.operator_notes, 'sos_history.operator_notes', alertId) || '';
      const updatedNotes = existing ? `${existing}\n${formattedNote}` : formattedNote;
      await supabase.from('sos_history').update({ operator_notes: enc(updatedNotes, 'sos_history.operator_notes', alertId) }).eq('id', alertId);
    } catch (e) {
      console.warn('Note updating operator_notes in Supabase:', e.message);
    }

    return session || { id: key, note: formattedNote };
  },
};

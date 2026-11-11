import { supabase } from '../config/supabase.js';
import { encryptField as enc, decryptField as dec } from '../utils/encryption.js';
import { liveTrackSessions } from './live-sessions.js';
import { readCoords } from '../utils/coords.js';
import { evidenceLink } from '../utils/evidence.js';

/**
 * Admin dashboard (view only): stats, SOS records and users (P3, S4).
 *
 * This runs in the same process that sends SOS, so it must never hold it up. Before, each request
 * loaded and decrypted every row of sos_history, users and guardians, and silently stopped at
 * 20,000 rows. Now:
 * - Lists are paged by the database, with count, status, date and user filters there. Only the
 *   rows on the page, and their users, are decrypted.
 * - Search has to read decrypted names, numbers and places, which the database cannot. It scans the
 *   newest SEARCH_SCAN_ROWS rows in batches, giving way to other requests between batches, and
 *   says searchLimited when older rows were not searched.
 * - The home page numbers are counted by the database (db/dashboard.sql), with no decryption.
 * - A detail page loads that one record.
 */

const BATCH = 1000; // Supabase returns at most 1000 rows per request
export const SEARCH_SCAN_ROWS = 10_000;
const MAX_LIMIT = 5000; // the CSV export asks for up to this many
const USER_COLUMNS = 'id, full_name, mobile_number, address_1, address_2, is_guest, created_at';
const IN_CHUNK = 200; // ids per .in() filter, to keep the URL short

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

// The first and last moment of IST days, for created_at filters
export const istRange = (from, to) => ({
  ...(from && { gte: `${from}T00:00:00+05:30` }),
  ...(to && { lte: `${to}T23:59:59.999+05:30` }),
});

// Older rows use DISPATCHED / lowercase 'active' for an open alert
const normalizeStatus = (raw) => {
  const s = String(raw || 'ACTIVE').toUpperCase();
  return s === 'RESOLVED' ? 'RESOLVED' : 'ACTIVE';
};

const includesText = (value, q) => (value || '').toLowerCase().includes(q);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lets other requests (an SOS) run between batches of decryption
const giveWay = () => new Promise((resolve) => setImmediate(resolve));

const pageOf = (page, limit) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), MAX_LIMIT);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  return { limit: safeLimit, page: safePage };
};

const paged = (list, page, limit, extra = {}) => {
  const total = list.length;
  const pages = Math.max(Math.ceil(total / limit), 1);
  const p = Math.min(page, pages);
  const start = (p - 1) * limit;
  return { items: list.slice(start, start + limit), total, page: p, pages, limit, ...extra };
};

const fail = (what, error) => {
  throw new Error(`Supabase ${what} error: ${error.message}`);
};

const chunks = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const toUser = (u) => ({
  id: u.id,
  name: dec(u.full_name, 'users.full_name', u.id) || (u.is_guest ? 'Guest User' : 'DEVI User'),
  phone: u.is_guest ? null : dec(u.mobile_number, 'users.mobile_number', u.id) || null,
  guestId: u.is_guest ? dec(u.mobile_number, 'users.mobile_number', u.id) || null : null,
  address: [dec(u.address_1, 'users.address_1', u.id), dec(u.address_2, 'users.address_2', u.id)].filter(Boolean).join(', '),
  isGuest: !!u.is_guest,
  createdAt: u.created_at,
  joinedOn: formatIst(u.created_at),
});

// The users with these ids, decrypted, by id
const loadUsers = async (ids) => {
  const map = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  for (const part of chunks(unique, IN_CHUNK)) {
    const { data, error } = await supabase.from('users').select(USER_COLUMNS).in('id', part);
    if (error) fail('users', error);
    (data || []).forEach((u) => map.set(u.id, toUser(u)));
  }
  return map;
};

const toIncident = (alert, user) => {
  const id = alert.id.toString();
  const liveSession = liveTrackSessions.get(id);
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
};

const toIncidents = async (alerts) => {
  const users = await loadUsers(alerts.map((a) => a.user_id));
  return alerts.map((a) => toIncident(a, users.get(a.user_id) || null));
};

// sos_history, newest first, with the filters the database can apply
const alertsQuery = ({ status, userId, from, to } = {}, { count = false } = {}) => {
  let q = supabase.from('sos_history').select('*', count ? { count: 'exact' } : undefined);
  const st = String(status || 'ALL').toUpperCase();
  if (st === 'RESOLVED') q = q.in('status', ['RESOLVED', 'resolved']);
  if (st === 'ACTIVE') q = q.or('status.is.null,status.not.in.(RESOLVED,resolved)');
  if (userId) q = q.eq('user_id', userId);
  const range = istRange(from, to);
  if (range.gte) q = q.gte('created_at', range.gte);
  if (range.lte) q = q.lte('created_at', range.lte);
  return q.order('created_at', { ascending: false });
};

export const matchesIncident = (inc, q) =>
  includesText(inc.user.name, q) || includesText(inc.user.phone, q) || includesText(inc.location, q) || includesText(inc.id, q);

export const matchesUser = (u, q) =>
  includesText(u.name, q) || includesText(u.phone, q) || includesText(u.guestId, q) || includesText(u.address, q);

// Reads a table newest first in batches up to SEARCH_SCAN_ROWS, keeping what keep() returns.
// Returns { found, limited }: limited when older rows were left unread.
const scan = async (query, keep) => {
  const found = [];
  for (let from = 0; from < SEARCH_SCAN_ROWS; from += BATCH) {
    const { data, error } = await query().range(from, from + BATCH - 1);
    if (error) fail('search', error);
    found.push(...(await keep(data || [])));
    if (!data || data.length < BATCH) return { found, limited: false };
    await giveWay();
  }
  return { found, limited: true };
};

// Per-user counts for a page of users: guardians, SOS and the last SOS time
const userCounts = async (ids) => {
  const guardians = new Map();
  const sos = new Map();
  for (const part of chunks(ids, IN_CHUNK)) {
    const [g, s] = await Promise.all([
      supabase.from('guardians').select('user_id').in('user_id', part),
      supabase.from('sos_history').select('user_id, created_at').in('user_id', part).order('created_at', { ascending: false }),
    ]);
    if (g.error) fail('guardians', g.error);
    if (s.error) fail('sos_history', s.error);
    (g.data || []).forEach((r) => guardians.set(r.user_id, (guardians.get(r.user_id) || 0) + 1));
    (s.data || []).forEach((r) => {
      const entry = sos.get(r.user_id) || { count: 0, last: null };
      entry.count += 1;
      if (!entry.last) entry.last = formatIst(r.created_at); // newest first
      sos.set(r.user_id, entry);
    });
  }
  return { guardians, sos };
};

let statsFunctionMissingLogged = false;

const countOf = async (query) => {
  const { count, error } = await query;
  if (error) fail('count', error);
  return count || 0;
};

// The home page numbers without db/dashboard.sql: counted with separate queries
const statsWithoutFunction = async (chartDays) => {
  const head = (table) => supabase.from(table).select('id', { count: 'exact', head: true });
  const todayStart = istRange(istDayKey(Date.now())).gte;
  const [total, resolved, today, users, guests, newToday, guardians] = await Promise.all([
    countOf(head('sos_history')),
    countOf(head('sos_history').in('status', ['RESOLVED', 'resolved'])),
    countOf(head('sos_history').gte('created_at', todayStart)),
    countOf(head('users')),
    countOf(head('users').eq('is_guest', true)),
    countOf(head('users').gte('created_at', todayStart)),
    countOf(head('guardians')),
  ]);

  const counts = new Map();
  for (let i = chartDays - 1; i >= 0; i -= 1) counts.set(istDayKey(Date.now() - i * 86400000), 0);
  const since = istRange([...counts.keys()][0]).gte;
  // Timestamps only, nothing to decrypt
  for (let from = 0; from < 50 * BATCH; from += BATCH) {
    const { data, error } = await supabase.from('sos_history').select('created_at').gte('created_at', since)
      .order('created_at', { ascending: false }).range(from, from + BATCH - 1);
    if (error) fail('sos_history', error);
    (data || []).forEach((r) => {
      const key = istDayKey(r.created_at);
      if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    });
    if (!data || data.length < BATCH) break;
  }

  return {
    sos: { total, today, active: total - resolved, resolved },
    users: { total: users, registered: users - guests, guests, newToday },
    guardians: { total: guardians },
    daily: [...counts.entries()].map(([date, count]) => ({ date, count })),
  };
};

export const DashboardService = {
  async getStats({ days = 30 } = {}) {
    const chartDays = Math.min(Math.max(parseInt(days, 10) || 30, 7), 90);

    const [{ data, error }, recentRows] = await Promise.all([
      supabase.rpc('dashboard_stats', { p_days: chartDays }),
      alertsQuery().range(0, 5),
    ]);
    if (recentRows.error) fail('sos_history', recentRows.error);

    let numbers = data;
    if (error) {
      if (!statsFunctionMissingLogged) console.warn(`⚠️ [DASHBOARD] dashboard_stats not available (${error.code || error.message}): counting with separate queries. Run db/dashboard.sql.`);
      statsFunctionMissingLogged = true;
      numbers = await statsWithoutFunction(chartDays);
    }

    return { ...numbers, recent: await toIncidents(recentRows.data || []) };
  },

  // Filters: status (ALL | ACTIVE | RESOLVED), search (name, phone, location, id), from/to (YYYY-MM-DD, IST)
  async listIncidents({ page, limit, status, search, from, to, userId } = {}) {
    const p = pageOf(page, limit);
    const filters = { status, userId, from, to };
    const q = String(search || '').trim().toLowerCase();

    if (!q) {
      const start = (p.page - 1) * p.limit;
      let { data, count, error } = await alertsQuery(filters, { count: true }).range(start, start + p.limit - 1);
      if (error) fail('sos_history', error);
      const pages = Math.max(Math.ceil((count || 0) / p.limit), 1);
      // Past the last page: show the last one, as before
      if (p.page > pages) {
        const last = (pages - 1) * p.limit;
        ({ data, error } = await alertsQuery(filters).range(last, last + p.limit - 1));
        if (error) fail('sos_history', error);
        p.page = pages;
      }
      return { items: await toIncidents(data || []), total: count || 0, page: p.page, pages, limit: p.limit };
    }

    // A whole alert id: one lookup, no scan
    if (UUID_RE.test(q)) {
      const { data, error } = await alertsQuery(filters).eq('id', q).limit(1);
      if (error) fail('sos_history', error);
      return paged(await toIncidents(data || []), 1, p.limit, { searchLimited: false });
    }

    const { found, limited } = await scan(
      () => alertsQuery(filters),
      async (rows) => (await toIncidents(rows)).filter((inc) => matchesIncident(inc, q)),
    );
    return paged(found, p.page, p.limit, { searchLimited: limited });
  },

  async getIncident(alertId) {
    if (!UUID_RE.test(String(alertId))) return null;
    const { data: alert, error } = await supabase.from('sos_history').select('*').eq('id', alertId).maybeSingle();
    if (error) fail('sos_history', error);
    if (!alert) return null;

    const [incident] = await toIncidents([alert]);
    const [g, a] = await Promise.all([
      incident.userId
        ? supabase.from('guardians').select('id, user_id, name, mobile_number, created_at').eq('user_id', incident.userId).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase.from('sos_guardian_acks').select('id, alert_id, phone, acknowledged_at').eq('alert_id', alert.id),
    ]);
    if (g.error) fail('guardians', g.error);
    // db/guardian-acks.sql not run yet must not take the page down
    if (a.error) console.warn('⚠️ Guardian acknowledgements not loaded:', a.error.message);

    const saved = (g.data || []).map((r) => ({ id: r.id, name: dec(r.name, 'guardians.name', r.user_id), phone: dec(r.mobile_number, 'guardians.mobile_number', r.user_id) }));
    const acks = (a.error ? [] : a.data || []).map((r) => ({ phone: dec(r.phone, 'sos_guardian_acks.phone', r.id), time: formatIst(r.acknowledged_at) }));
    return {
      ...incident,
      guardians: saved.map((s) => ({ ...s, ackTime: acks.find((x) => x.phone === s.phone)?.time || null })),
      // Numbers not on the saved list: guest SOS, control room, or a guardian removed since
      otherAcks: acks.filter((x) => !saved.some((s) => s.phone === x.phone)),
    };
  },

  // Filters: type (ALL | REGISTERED | GUEST), search (name, phone, address)
  async listUsers({ page, limit, type, search } = {}) {
    const p = pageOf(page, limit);
    const t = String(type || 'ALL').toUpperCase();
    const q = String(search || '').trim().toLowerCase();
    const usersQuery = (opts) => {
      let query = supabase.from('users').select(USER_COLUMNS, opts);
      if (t === 'REGISTERED') query = query.or('is_guest.is.null,is_guest.eq.false');
      if (t === 'GUEST') query = query.eq('is_guest', true);
      return query.order('created_at', { ascending: false });
    };

    let result;
    if (!q) {
      const start = (p.page - 1) * p.limit;
      let { data, count, error } = await usersQuery({ count: 'exact' }).range(start, start + p.limit - 1);
      if (error) fail('users', error);
      const pages = Math.max(Math.ceil((count || 0) / p.limit), 1);
      if (p.page > pages) {
        const last = (pages - 1) * p.limit;
        ({ data, error } = await usersQuery().range(last, last + p.limit - 1));
        if (error) fail('users', error);
        p.page = pages;
      }
      result = { items: (data || []).map(toUser), total: count || 0, page: p.page, pages, limit: p.limit };
    } else {
      const { found, limited } = await scan(() => usersQuery(), async (rows) => rows.map(toUser).filter((u) => matchesUser(u, q)));
      result = paged(found, p.page, p.limit, { searchLimited: limited });
    }

    const counts = await userCounts(result.items.map((u) => u.id));
    result.items = result.items.map((u) => ({
      ...u,
      guardiansCount: counts.guardians.get(u.id) || 0,
      sosCount: counts.sos.get(u.id)?.count || 0,
      lastSos: counts.sos.get(u.id)?.last || null,
    }));
    return result;
  },

  async getUser(userId) {
    if (!UUID_RE.test(String(userId))) return null;
    const { data: row, error } = await supabase.from('users').select(USER_COLUMNS).eq('id', userId).maybeSingle();
    if (error) fail('users', error);
    if (!row) return null;
    const user = toUser(row);

    const [g, s] = await Promise.all([
      supabase.from('guardians').select('id, user_id, name, mobile_number, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('sos_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(MAX_LIMIT),
    ]);
    if (g.error) fail('guardians', g.error);
    if (s.error) fail('sos_history', s.error);

    return {
      ...user,
      guardians: (g.data || []).map((r) => ({ id: r.id, name: dec(r.name, 'guardians.name', r.user_id), phone: dec(r.mobile_number, 'guardians.mobile_number', r.user_id) })),
      sos: (s.data || []).map((a) => toIncident(a, user)),
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

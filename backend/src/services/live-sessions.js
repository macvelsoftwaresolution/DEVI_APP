// Real-time live tracking sessions (in memory, keyed by alert ID).
// Shared by the SOS and dashboard services; rebuilt from the database when missing.
//
// Works like a Map, plus two things a plain Map could not do (P4):
// - findActive() looks an SOS up by idempotency key or phone through an index, so a new SOS does
//   not scan every session ever kept.
// - Sessions not touched for SESSION_TTL_MS are dropped, and at most MAX_SESSIONS are kept, so
//   memory does not grow until the next restart. Every reader falls back to the database, so a
//   dropped session only loses what lives in memory alone: the WhatsApp result shown on the
//   dashboard for that alert.
//
// The index is updated by set(). Code that changes a session's userPhone or idempotencyKey in
// place must call set() again with the same session.

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_SESSIONS = 50_000;
const PRUNE_EVERY_MS = 10 * 60 * 1000;

const addTo = (index, value, id) => {
  if (!value) return;
  if (!index.has(value)) index.set(value, new Set());
  index.get(value).add(id);
};

const removeFrom = (index, value, id) => {
  const ids = value && index.get(value);
  if (!ids) return;
  ids.delete(id);
  if (!ids.size) index.delete(value);
};

export class LiveSessions {
  #sessions = new Map();
  #byKey = new Map();
  #byPhone = new Map();
  #meta = new Map(); // id -> { key, phone, touchedAt }: what the index holds for it
  #lastPrune;

  constructor({ ttlMs = SESSION_TTL_MS, maxSessions = MAX_SESSIONS, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxSessions = maxSessions;
    this.now = now;
    this.#lastPrune = now();
  }

  get size() { return this.#sessions.size; }
  get(id) { return this.#sessions.get(id); }
  has(id) { return this.#sessions.has(id); }
  values() { return this.#sessions.values(); }
  keys() { return this.#sessions.keys(); }
  entries() { return this.#sessions.entries(); }
  [Symbol.iterator]() { return this.#sessions.entries(); }

  set(id, session) {
    this.#unindex(id);
    this.#sessions.set(id, session);
    const meta = { key: session?.idempotencyKey || null, phone: session?.userPhone || null, touchedAt: this.now() };
    this.#meta.set(id, meta);
    addTo(this.#byKey, meta.key, id);
    addTo(this.#byPhone, meta.phone, id);
    this.#pruneIfDue();
    return this;
  }

  delete(id) {
    this.#unindex(id);
    return this.#sessions.delete(id);
  }

  clear() {
    this.#sessions.clear();
    this.#byKey.clear();
    this.#byPhone.clear();
    this.#meta.clear();
  }

  // The ACTIVE session with this idempotency key, else the ACTIVE session of this phone started
  // within phoneWindowMs. Same rule the old full scan used.
  findActive({ idempotencyKey, userPhone }, phoneWindowMs) {
    for (const id of this.#byKey.get(idempotencyKey) || []) {
      const s = this.#sessions.get(id);
      if (s?.status === 'ACTIVE' && s.idempotencyKey === idempotencyKey) return s;
    }
    const now = this.now();
    for (const id of this.#byPhone.get(userPhone) || []) {
      const s = this.#sessions.get(id);
      if (s?.status === 'ACTIVE' && s.userPhone === userPhone && now - new Date(s.timestamp).getTime() < phoneWindowMs) return s;
    }
    return null;
  }

  // Drops sessions not touched for ttlMs, then the oldest ones over maxSessions
  prune() {
    const now = this.now();
    this.#lastPrune = now;
    for (const [id, session] of this.#sessions) {
      const updated = Date.parse(session?.lastUpdated) || 0;
      if (now - Math.max(this.#meta.get(id)?.touchedAt || 0, updated) > this.ttlMs) this.delete(id);
    }
    for (const id of this.#sessions.keys()) {
      if (this.#sessions.size <= this.maxSessions) break;
      this.delete(id);
    }
  }

  #pruneIfDue() {
    if (this.#sessions.size > this.maxSessions || this.now() - this.#lastPrune > PRUNE_EVERY_MS) this.prune();
  }

  #unindex(id) {
    const meta = this.#meta.get(id);
    if (!meta) return;
    removeFrom(this.#byKey, meta.key, id);
    removeFrom(this.#byPhone, meta.phone, id);
    this.#meta.delete(id);
  }
}

export const liveTrackSessions = new LiveSessions();

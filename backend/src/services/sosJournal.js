import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Encryption } from '../utils/encryption.js';

/**
 * A file on this server's disk for SOS alerts taken while the database was down (L2).
 * One record per line, each encrypted (field journal.sos, bound to its alert id), written with
 * fsync, so a record that was written survives a crash.
 *
 * Records:
 *   { type: 'alert', alertId, createdAt, userPhone, idempotencyKey, latitude, longitude, accuracy, location, plan }
 *   { type: 'sent', alertId, kind, phone, success }   the first result of each send
 *   { type: 'replayed', alertId }                      saved to the database, sends finished
 *
 * The folder is SOS_JOURNAL_DIR, or backend/data/sos-journal. It holds personal data (encrypted),
 * so it is not in git and must not be in a public folder.
 */

const FIELD = 'journal.sos';
const FILE = 'journal.jsonl';
const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'sos-journal');

export const createJournal = ({ dir = process.env.SOS_JOURNAL_DIR || DEFAULT_DIR } = {}) => {
  const file = path.join(dir, FILE);
  // Every write runs one at a time: lines never interleave, and a rewrite cannot drop an append
  let writing = Promise.resolve();
  const serial = (fn) => {
    const next = writing.then(fn);
    writing = next.catch(() => {});
    return next;
  };

  const line = (record) =>
    `${JSON.stringify({ a: record.alertId, d: Encryption.encrypt(JSON.stringify(record), FIELD, record.alertId) })}\n`;

  const writeSynced = async (target, text, flag) => {
    await fs.mkdir(dir, { recursive: true });
    const handle = await fs.open(target, flag, 0o600);
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
  };

  return {
    file,

    // Writes one record and waits until it is on disk. Throws if it could not be written.
    append(record) {
      return serial(() => writeSynced(file, line(record), 'a'));
    },

    // Every readable record, in order. A line that cannot be read is skipped and logged.
    async readAll() {
      let text;
      try {
        text = await fs.readFile(file, 'utf8');
      } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
      }
      const records = [];
      for (const raw of text.split('\n')) {
        if (!raw.trim()) continue;
        try {
          const { a, d } = JSON.parse(raw);
          if (!Encryption.isCurrent(d)) throw new Error('not encrypted');
          records.push(JSON.parse(Encryption.decrypt(d, FIELD, a)));
        } catch (e) {
          console.error('🚨 [SOS JOURNAL] Unreadable line skipped:', e.message);
        }
      }
      return records;
    },

    // Keeps only the records of these alerts. Written to a new file and renamed over the old one,
    // so a crash leaves either the old file or the new one, never half of one.
    keepOnly(alertIds) {
      return serial(async () => {
        const keep = new Set(alertIds);
        const records = (await this.readAll()).filter((r) => keep.has(r.alertId));
        const tmp = `${file}.tmp`;
        await writeSynced(tmp, records.map(line).join(''), 'w');
        await fs.rename(tmp, file);
      });
    },
  };
};

export const sosJournal = createJournal();
export default sosJournal;

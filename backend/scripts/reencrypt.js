/**
 * Re-encrypts every encrypted column with the CURRENT key in the newest format, and refreshes
 * users.mobile_hash with the current lookup key.
 *
 *   npm run rotate:key            # dry run: only shows what would change
 *   npm run rotate:key -- --apply # writes the re-encrypted values
 *
 * Use it for:
 *  - key rotation (E3): move ENCRYPTION_KEY to ENCRYPTION_OLD_KEYS as "<old id>:<old secret>", put the
 *    new secret in ENCRYPTION_KEY with a new ENCRYPTION_KEY_ID, restart the server, then run this.
 *    When it reports 0 left, remove the old key from ENCRYPTION_OLD_KEYS and restart.
 *  - older formats (enc:v1 / enc:v2 / plain text) → enc:v3 bound to column + row (E6).
 *  - older SOS rows with plain latitude / longitude → encrypted sos_history.coords (E5).
 *    (`npm run migrate:aad` runs this same script.)
 *
 * Safe to run more than once: values already in the current format and key are only checked.
 * Run it with the SAME .env as the live server.
 */
import { supabase } from '../src/config/supabase.js';
import { ENCRYPTION_ALLOW_V1 } from '../src/config/security.js';
import { Encryption, ENCRYPTED_COLUMNS, rowKeyFor, blindIndex, CURRENT_KEY_ID } from '../src/utils/encryption.js';
import { hasFix, encryptCoords } from '../src/utils/coords.js';

const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 1000;

// Decrypt without the console warning; null when the value cannot be read
const quietDecrypt = (value, field, rowKey) => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const plain = Encryption.decrypt(value, field, rowKey);
    return plain === '' ? null : plain;
  } finally {
    console.warn = warn;
  }
};

async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

console.log(`${APPLY ? '🔐 Re-encrypting' : '🔎 Dry run (add --apply to write changes):'} with current key "${CURRENT_KEY_ID}"`);
let totalChanged = 0;
let totalUnreadable = 0;
let totalFailed = 0;

for (const [table, columns] of Object.entries(ENCRYPTED_COLUMNS)) {
  let rows;
  try {
    rows = await readAll(table);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    totalFailed++;
    continue;
  }

  let changed = 0;
  let current = 0;
  for (const row of rows) {
    const rowKey = rowKeyFor(table, row);
    const patch = {};
    for (const col of columns) {
      const value = row[col];
      if (typeof value !== 'string' || value.trim() === '') continue;
      const field = `${table}.${col}`;
      const plain = Encryption.isEncrypted(value) ? quietDecrypt(value, field, rowKey) : value;

      if (plain === null) {
        totalUnreadable++;
        const hint = value.startsWith('enc:v1:') && !ENCRYPTION_ALLOW_V1 ? ' (enc:v1: run with ENCRYPTION_ALLOW_V1=true)' : '';
        console.warn(`  ⚠️ ${table} #${row.id}.${col}: cannot be read with the configured keys${hint} (left unchanged)`);
        continue;
      }
      if (Encryption.isCurrent(value)) {
        current++;
      } else {
        patch[col] = Encryption.encrypt(plain, field, rowKey);
      }
      // The lookup hash follows the current key too
      if (table === 'users' && col === 'mobile_number' && row.mobile_hash !== blindIndex(plain)) {
        patch.mobile_hash = blindIndex(plain);
      }
    }
    // Older SOS rows: plain GPS columns move into encrypted coords (E5)
    if (table === 'sos_history' && !row.coords && hasFix(row.latitude, row.longitude)) {
      patch.coords = encryptCoords(row.latitude, row.longitude, row.id);
      patch.latitude = null;
      patch.longitude = null;
    }
    if (Object.keys(patch).length === 0) continue;

    changed += Object.keys(patch).length;
    if (!APPLY) continue;

    const { error } = await supabase.from(table).update(patch).eq('id', row.id);
    if (error) {
      totalFailed++;
      console.error(`  ❌ ${table} #${row.id}: ${error.message}`);
    }
  }
  totalChanged += changed;
  console.log(`${table.padEnd(12)} rows: ${rows.length}  up to date: ${current}  ${APPLY ? 'changed' : 'to change'}: ${changed} values`);
}

console.log(`\nTotal ${APPLY ? 'changed' : 'to change'}: ${totalChanged}  unreadable: ${totalUnreadable}  failed: ${totalFailed}`);
if (!APPLY && totalChanged === 0 && totalUnreadable === 0 && totalFailed === 0) {
  console.log('✅ Everything uses the current key and format. Retired keys can be removed from ENCRYPTION_OLD_KEYS.');
}
if (APPLY && totalChanged > 0 && totalUnreadable === 0 && totalFailed === 0) {
  console.log('✅ Done. Run once more without --apply to confirm 0 to change.');
}
process.exit(totalFailed > 0 ? 1 : 0);

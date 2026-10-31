/**
 * E6 migration: re-encrypts older values (enc:v1 and plain text) as enc:v2, bound to their
 * column and row, so a value copied to another column or row no longer decrypts.
 *
 *   npm run migrate:aad            # dry run: only shows what would change
 *   npm run migrate:aad -- --apply # writes the re-encrypted values
 *
 * Safe to run more than once: enc:v2 values are only checked, never rewritten.
 * Run it with the SAME ENCRYPTION_KEY the live server uses, after the server runs the v2 code.
 * When it reports nothing left to migrate, set ENCRYPTION_ALLOW_V1=false on the server and restart.
 */
import { supabase } from '../src/config/supabase.js';
import { ENCRYPTION_ALLOW_V1 } from '../src/config/security.js';
import { Encryption, ENCRYPTED_COLUMNS, rowKeyFor } from '../src/utils/encryption.js';

const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 1000;

if (!ENCRYPTION_ALLOW_V1) {
  console.error('❌ ENCRYPTION_ALLOW_V1=false: enc:v1 values cannot be read. Run with ENCRYPTION_ALLOW_V1=true.');
  process.exit(1);
}

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

console.log(APPLY ? '🔐 Re-encrypting older values as enc:v2...' : '🔎 Dry run (add --apply to write changes)');
let totalMigrated = 0;
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

  let migrated = 0;
  let current = 0;
  for (const row of rows) {
    const rowKey = rowKeyFor(table, row);
    const patch = {};
    for (const col of columns) {
      const value = row[col];
      if (typeof value !== 'string' || value.trim() === '') continue;
      const field = `${table}.${col}`;

      if (Encryption.isCurrent(value)) {
        if (quietDecrypt(value, field, rowKey) === null) {
          totalUnreadable++;
          console.warn(`  ⚠️ ${table} #${row.id}.${col}: enc:v2 value does not decrypt here (left unchanged)`);
        } else {
          current++;
        }
        continue;
      }

      // enc:v1 or plain text
      const plain = Encryption.isEncrypted(value) ? quietDecrypt(value, field, rowKey) : value;
      if (plain === null) {
        totalUnreadable++;
        console.warn(`  ⚠️ ${table} #${row.id}.${col}: enc:v1 value cannot be read with this key (left unchanged)`);
        continue;
      }
      patch[col] = Encryption.encrypt(plain, field, rowKey);
    }
    if (Object.keys(patch).length === 0) continue;

    migrated += Object.keys(patch).length;
    if (!APPLY) continue;

    const { error } = await supabase.from(table).update(patch).eq('id', row.id);
    if (error) {
      totalFailed++;
      console.error(`  ❌ ${table} #${row.id}: ${error.message}`);
    }
  }
  totalMigrated += migrated;
  console.log(`${table.padEnd(12)} rows: ${rows.length}  already v2: ${current}  ${APPLY ? 'migrated' : 'to migrate'}: ${migrated} values`);
}

console.log(`\nTotal ${APPLY ? 'migrated' : 'to migrate'}: ${totalMigrated}  unreadable: ${totalUnreadable}  failed: ${totalFailed}`);
if (APPLY && totalMigrated > 0 && totalUnreadable === 0 && totalFailed === 0) {
  console.log('✅ Done. Run once more to confirm 0 to migrate, then set ENCRYPTION_ALLOW_V1=false and restart.');
}
process.exit(totalFailed > 0 ? 1 : 0);

/**
 * One-time migration: encrypts existing plain-text sensitive columns with the current ENCRYPTION_KEY.
 *
 *   npm run migrate:encrypt            # dry run: only shows what would change
 *   npm run migrate:encrypt -- --apply # writes the encrypted values
 *
 * Safe to run more than once: values that are already encrypted are skipped.
 * Run it with the SAME ENCRYPTION_KEY the live server uses, or the server will not be able to read the data.
 */
import { supabase } from '../src/config/supabase.js';
import { Encryption } from '../src/utils/encryption.js';

const APPLY = process.argv.includes('--apply');

const TABLES = [
  { table: 'users', columns: ['full_name', 'address_1', 'address_2'] },
  { table: 'guardians', columns: ['name', 'mobile_number'] },
  { table: 'sos_history', columns: ['location_address', 'operator_notes'] },
];

const needsEncryption = (value) =>
  typeof value === 'string' && value.trim() !== '' && !Encryption.isEncrypted(value);

async function migrateTable({ table, columns }) {
  // select('*') so a column that does not exist yet (e.g. operator_notes) is simply skipped
  const { data: rows, error } = await supabase.from(table).select('*');
  if (error) {
    console.error(`❌ ${table}: ${error.message}`);
    return { table, rows: 0, updated: 0, failed: 1 };
  }

  let updated = 0;
  let failed = 0;
  for (const row of rows || []) {
    const patch = {};
    for (const col of columns) {
      if (needsEncryption(row[col])) patch[col] = Encryption.encrypt(row[col]);
    }
    if (Object.keys(patch).length === 0) continue;

    updated++;
    if (!APPLY) continue;

    const { error: updateError } = await supabase.from(table).update(patch).eq('id', row.id);
    if (updateError) {
      failed++;
      console.error(`❌ ${table} #${row.id}: ${updateError.message}`);
    }
  }
  return { table, rows: (rows || []).length, updated, failed };
}

console.log(APPLY ? '🔐 Encrypting existing data...' : '🔎 Dry run (add --apply to write changes)');
for (const spec of TABLES) {
  const r = await migrateTable(spec);
  console.log(`${r.table.padEnd(12)} rows: ${r.rows}  ${APPLY ? 'encrypted' : 'to encrypt'}: ${r.updated}  failed: ${r.failed}`);
}
process.exit(0);

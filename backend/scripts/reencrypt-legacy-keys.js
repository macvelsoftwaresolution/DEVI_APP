/**
 * One-time repair: re-encrypts values that were written with a WRONG key
 * (the old public app key or the dev default) using the current ENCRYPTION_KEY.
 *
 *   npm run migrate:rekey            # dry run: only shows what would change
 *   npm run migrate:rekey -- --apply # writes the re-encrypted values
 *
 * Values the current key already reads are skipped, so it is safe to run more than once.
 * Values that no known key can read are listed and left untouched.
 * Run it with the SAME ENCRYPTION_KEY the live server uses.
 */
import crypto from 'crypto';
import { supabase } from '../src/config/supabase.js';
import { Encryption } from '../src/utils/encryption.js';
import { WEAK_ENCRYPTION_KEYS } from '../src/config/security.js';

const APPLY = process.argv.includes('--apply');
const PREFIX = 'enc:v1:';

const TABLES = [
  { table: 'users', columns: ['full_name', 'address_1', 'address_2'] },
  { table: 'guardians', columns: ['name', 'mobile_number'] },
  { table: 'sos_history', columns: ['location_address', 'operator_notes'] },
];

// Same derivation as src/utils/encryption.js, for the old keys
const deriveKey = (secret) =>
  Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'devi-db-field-v1', 32));
const OLD_KEYS = WEAK_ENCRYPTION_KEYS.map(deriveKey);

const decryptWith = (key, value) => {
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};

const readsWithCurrentKey = (value) => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return Encryption.decrypt(value) !== '';
  } finally {
    console.warn = warn;
  }
};

console.log(APPLY ? '🔐 Re-encrypting values written with old keys...' : '🔎 Dry run (add --apply to write changes)');
let totalFixed = 0;
let totalUnreadable = 0;

for (const { table, columns } of TABLES) {
  const { data: rows, error } = await supabase.from(table).select('*');
  if (error) {
    console.error(`❌ ${table}: ${error.message}`);
    continue;
  }

  let fixed = 0;
  let failed = 0;
  for (const row of rows || []) {
    const patch = {};
    for (const col of columns) {
      const value = row[col];
      if (!Encryption.isEncrypted(value) || readsWithCurrentKey(value)) continue;

      const plain = OLD_KEYS.map((k) => decryptWith(k, value)).find((p) => p !== null);
      if (plain === undefined) {
        totalUnreadable++;
        console.warn(`  ⚠️ ${table} #${row.id}.${col}: no known key can read it (left unchanged)`);
        continue;
      }
      patch[col] = Encryption.encrypt(plain);
    }
    if (Object.keys(patch).length === 0) continue;

    fixed += Object.keys(patch).length;
    console.log(`• ${table} #${row.id}: ${Object.keys(patch).join(', ')}`);
    if (!APPLY) continue;

    const { error: updateError } = await supabase.from(table).update(patch).eq('id', row.id);
    if (updateError) {
      failed++;
      console.error(`  ❌ ${table} #${row.id}: ${updateError.message}`);
    }
  }
  totalFixed += fixed;
  console.log(`${table.padEnd(12)} rows: ${(rows || []).length}  ${APPLY ? 're-encrypted' : 'to re-encrypt'}: ${fixed} values  failed rows: ${failed}`);
}

console.log(`\nTotal ${APPLY ? 're-encrypted' : 'to re-encrypt'}: ${totalFixed}  unreadable: ${totalUnreadable}`);
process.exit(0);

/**
 * Moves stored numbers to E.164 ("9876543210" → "+919876543210"): users.mobile_number with its
 * users.mobile_hash, and guardians.mobile_number.
 *
 *   npm run migrate:phone            # dry run: only shows what would change
 *   npm run migrate:phone -- --apply # writes the new values
 *
 * Run --apply straight after deploying the backend that uses E.164: until then logins are not found.
 * Safe to run more than once. Guest IDs are left as they are.
 * Run it with the SAME .env as the live server.
 */
import { supabase } from '../src/config/supabase.js';
import { Encryption, blindIndex } from '../src/utils/encryption.js';
import { canonicalPhone } from '../src/utils/phone.js';

const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 1000;

async function readAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

let changed = 0;
let unchanged = 0;
let unreadable = 0;
let failed = 0;

// patchFor(e164) gives the columns to write for one row
async function migrate(table, rows, rowKey, patchFor) {
  for (const row of rows) {
    const field = `${table}.mobile_number`;
    const plain = Encryption.decrypt(row.mobile_number, field, rowKey(row));
    const e164 = canonicalPhone(plain);
    if (!plain || !e164.startsWith('+')) {
      unreadable++;
      console.warn(`  ⚠️ ${table} #${row.id}: not a valid mobile number (left unchanged)`);
      continue;
    }
    if (e164 === plain) {
      unchanged++;
      continue;
    }
    changed++;
    if (!APPLY) continue;
    const { error } = await supabase.from(table).update(patchFor(row, e164)).eq('id', row.id);
    if (error) {
      failed++;
      console.error(`  ❌ ${table} #${row.id}: ${error.message}`);
    }
  }
}

console.log(APPLY ? '📞 Moving stored numbers to E.164' : '🔎 Dry run (add --apply to write changes)');

const users = (await readAll('users', 'id, mobile_number, is_guest')).filter((u) => !u.is_guest);
await migrate('users', users, (u) => u.id, (u, e164) => ({
  mobile_number: Encryption.encrypt(e164, 'users.mobile_number', u.id),
  mobile_hash: blindIndex(e164),
}));

const guardians = await readAll('guardians', 'id, user_id, mobile_number');
await migrate('guardians', guardians, (g) => g.user_id, (g, e164) => ({
  mobile_number: Encryption.encrypt(e164, 'guardians.mobile_number', g.user_id),
}));

console.log(`\nUsers: ${users.length}  guardians: ${guardians.length}`);
console.log(`${APPLY ? 'Changed' : 'To change'}: ${changed}  already E.164: ${unchanged}  not valid: ${unreadable}  failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);

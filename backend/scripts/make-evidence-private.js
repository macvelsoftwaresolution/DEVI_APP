/**
 * One-time migration: makes evidence uploaded before the secure-link change PRIVATE.
 *
 *   npm run migrate:evidence            # dry run: only lists what would change
 *   npm run migrate:evidence -- --apply # moves the files to private and updates the database
 *
 * For each sos_history row whose evidence_url / audio_url is a public https://res.cloudinary.com
 * URL, the Cloudinary file is switched from "upload" (public) to "authenticated" (private) and the
 * row is updated to the private reference. After this, the old public URL stops working.
 * Safe to run more than once: rows that are already private are skipped.
 */
import cloudinary from '../src/config/cloudinary.js';
import { supabase } from '../src/config/supabase.js';
import { parseEvidenceRef, toEvidenceRef } from '../src/utils/evidence.js';

const APPLY = process.argv.includes('--apply');

const { data: rows, error } = await supabase.from('sos_history').select('*');
if (error) {
  console.error(`❌ sos_history: ${error.message}`);
  process.exit(1);
}

let toMigrate = 0;
let migrated = 0;
let failed = 0;

console.log(APPLY ? '🔒 Making public evidence private...' : '🔎 Dry run (add --apply to write changes)');

for (const row of rows || []) {
  const stored = row.evidence_url || row.audio_url;
  if (!stored || !stored.startsWith('https://res.cloudinary.com/')) continue;

  const ref = parseEvidenceRef(stored);
  if (!ref || ref.type !== 'upload') continue;

  toMigrate++;
  console.log(`• Alert #${row.id}: ${ref.resourceType}/${ref.publicId}`);
  if (!APPLY) continue;

  try {
    const moved = await cloudinary.uploader.rename(ref.publicId, ref.publicId, {
      resource_type: ref.resourceType,
      type: 'upload',
      to_type: 'authenticated',
      overwrite: false,
    });
    const newRef = toEvidenceRef({ ...moved, format: moved.format || ref.format });

    const patch = {};
    if (row.evidence_url) patch.evidence_url = newRef;
    if (row.audio_url) patch.audio_url = newRef;
    const { error: updateError } = await supabase.from('sos_history').update(patch).eq('id', row.id);
    if (updateError) throw new Error(`database update: ${updateError.message}`);

    migrated++;
  } catch (e) {
    failed++;
    console.error(`  ❌ Alert #${row.id}: ${e.message || e.error?.message || e}`);
  }
}

console.log(`\nRows checked: ${(rows || []).length}  ${APPLY ? `made private: ${migrated}` : `to make private: ${toMigrate}`}  failed: ${failed}`);
process.exit(failed ? 1 : 0);

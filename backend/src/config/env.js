import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load backend/.env by absolute path, so it is found whatever folder pm2/systemd starts node from.
// Without it NODE_ENV is unset, the app thinks it is in dev and skips the production secret checks.
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error && !process.env.NODE_ENV) {
  console.warn(`⚠️ [ENV] ${envPath} not found and NODE_ENV is not set. Starting with development defaults.`);
}

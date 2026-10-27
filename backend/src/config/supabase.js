import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { supabaseKeyKind } from './security.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY missing in environment variables');
} else if (supabaseKeyKind(supabaseKey) === 'public') {
  // Warn instead of exiting so SOS keeps running; with RLS on, every database call will fail
  console.error(
    '❌ [SECURITY] SUPABASE_KEY is a public (publishable/anon) key. Use the secret key ' +
    '(Supabase → Project Settings → API Keys → sb_secret_…). With RLS enabled, database calls fail with this key.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

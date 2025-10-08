import dotenv from 'dotenv';
dotenv.config(); // ensure .env is loaded even when imported early

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;                  // e.g. https://<project-ref>.supabase.co
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;  // server-only key from Settings → API

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

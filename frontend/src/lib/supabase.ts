import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase env is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env',
  );
}

/**
 * Singleton Supabase client.
 * Session is persisted automatically in localStorage by the SDK.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

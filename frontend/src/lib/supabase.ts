import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Singleton Supabase client.
 * Session is persisted automatically in localStorage by the SDK.
 */
export const supabase = createClient(supabaseUrl, supabaseKey);

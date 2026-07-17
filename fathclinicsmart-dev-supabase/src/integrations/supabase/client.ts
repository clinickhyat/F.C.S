import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// استخدم المسار النسبي للوكيل (ليس رابطاً كاملاً)
const SUPABASE_URL = '/supabase';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_KEY) {
  console.warn('Supabase Anon Key is missing.');
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

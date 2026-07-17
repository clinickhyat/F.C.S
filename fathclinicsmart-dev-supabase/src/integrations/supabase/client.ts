import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// استخدام القيم الصحيحة مباشرة لضمان الاتصال
const SUPABASE_URL = "https://ebuumyqofptnjjaujlyd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVidXVteXFvZnB0bmpqYXVqbHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDM1MjcsImV4cCI6MjA5OTE3OTUyN30.2cbgowu9hhqdNl5eOS-9VqykaR270-7BDnwtHvOcY9k";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Supabase URL or Key is missing.');
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});


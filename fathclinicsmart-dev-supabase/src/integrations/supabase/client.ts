import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// عنوان Supabase الحقيقي
const SUPABASE_URL = 'https://ebuumyqofptnjjaujlyd.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_KEY) {
  console.warn('Supabase Anon Key is missing.');
}

// دالة وكيل بسيطة: تحويل الطلبات إلى النطاق المحلي ثم إعادة توجيهها
const proxyFetch = (url: string, options: RequestInit) => {
  // إذا كان الطلب إلى Supabase، غيّر المسار ليمر عبر وكيل Vercel
  if (url.startsWith(SUPABASE_URL)) {
    const path = url.replace(SUPABASE_URL, '');
    const proxyUrl = `/supabase${path}`;
    return fetch(proxyUrl, options);
  }
  return fetch(url, options);
};

// تهيئة عميل Supabase مع وكيل مخصص
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  // استخدم وكيل الطلبات المخصص
  fetch: proxyFetch as any,
});

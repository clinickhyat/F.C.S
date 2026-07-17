import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// استخدم الرابط الكامل (لتهيئة العميل بشكل صحيح)
const SUPABASE_URL = 'https://ebuumyqofptnjjaujlyd.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_KEY) {
  console.warn('Supabase Anon Key is missing.');
}

// دالة وكيل مخصصة: تعترض الطلبات وتغير مسارها إلى /supabase
const customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  
  // إذا كان الطلب موجهًا إلى Supabase، استخدم المسار النسبي للوكيل
  if (url.includes(SUPABASE_URL)) {
    const path = url.replace(SUPABASE_URL, '');
    const proxyUrl = `/supabase${path.startsWith('/') ? path : '/' + path}`;
    console.log('🔄 Proxy request:', proxyUrl); // للتأكد من أن الوكيل يعمل
    return fetch(proxyUrl, init);
  }
  
  // الطلبات الأخرى (مثل الصور أو الروابط الخارجية) تمر عادية
  return fetch(input, init);
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  // هذه هي النقطة السحرية: استخدم fetch المخصص
  fetch: customFetch as any,
});

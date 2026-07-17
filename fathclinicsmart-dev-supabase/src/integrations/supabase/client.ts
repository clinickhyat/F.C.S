import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// 1. الرابط الكامل (لإرضاء المكتبة ومنع الصفحة البيضاء)
const REAL_URL = 'https://ebuumyqofptnjjaujlyd.supabase.co';
const PROXY_PATH = '/supabase';

// 2. المفتاح من متغيرات البيئة (تأكد من وجوده في Vercel)
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_KEY) {
  console.warn('⚠️ Supabase Anon Key is missing.');
}

// 3. وكيل قوي يعترض الطلبات ويغير مسارها إلى /supabase
const proxyFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    // استخرج الرابط كـ string
    let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input.toString());
    
    // إذا كان الطلب موجهاً إلى Supabase، غيّر مساره إلى الوكيل المحلي
    if (url.startsWith(REAL_URL)) {
      const path = url.slice(REAL_URL.length);
      const proxyUrl = `${PROXY_PATH}${path}`;
      console.log('🔄 Proxy request:', proxyUrl); // للتأكد من عمل الوكيل
      return fetch(proxyUrl, init);
    }
    
    // الطلبات الأخرى (نادرة) تمر طبيعية
    return fetch(input, init);
  } catch (error) {
    console.error('❌ Proxy error, falling back to direct fetch:', error);
    return fetch(input, init);
  }
};

// 4. تهيئة العميل مع خيار fetch المخصص
export const supabase = createClient<Database>(REAL_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  fetch: proxyFetch,
});

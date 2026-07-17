import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// الرابط الأصلي (مثبت داخل الكود)
const REAL_URL = 'https://ebuumyqofptnjjaujlyd.supabase.co';
const PROXY_PATH = '/supabase';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_KEY) {
  console.warn('⚠️ Supabase Anon Key is missing.');
}

// وكيل احترافي يعترض جميع الطلبات
const proxyFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    // احصل على الرابط كاملًا (حتى لو كان نسبيًا)
    const url = new URL(input.toString(), window.location.origin);
    
    // إذا كان الطلب إلى Supabase الأصلي (حتى لو كان المسار نسبيًا)، حوّله إلى الوكيل
    if (url.hostname === 'ebuumyqofptnjjaujlyd.supabase.co') {
      // أضف المسار الكامل (مثل /auth/v1/... أو /rest/v1/...)
      const fullPath = url.pathname + url.search;
      const proxyUrl = `${PROXY_PATH}${fullPath}`;
      console.log('🔄 Proxy request:', proxyUrl);
      return fetch(proxyUrl, init);
    }
    
    // الطلبات الأخرى (مثل الصور الخارجية) تمر عادية
    return fetch(input, init);
  } catch (error) {
    console.error('❌ Proxy error:', error);
    return fetch(input, init);
  }
};

export const supabase = createClient<Database>(REAL_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  fetch: proxyFetch,
});

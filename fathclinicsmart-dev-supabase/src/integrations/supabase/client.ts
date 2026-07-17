import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// 1. الرابط الكامل (لإرضاء المكتبة ومنع الصفحة البيضاء)
const REAL_URL = 'https://ebuumyqofptnjjaujlyd.supabase.co';
const PROXY_PATH = '/supabase';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_KEY) {
  console.warn('⚠️ Supabase Anon Key is missing.');
}

// 2. وكيل قوي جداً يستخدم URL API لبناء المسار الصحيح
const proxyFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    // أنشئ كائن URL كامل (حتى لو كان الإدخال نسبياً)
    const url = new URL(input.toString(), window.location.origin);
    
    // إذا كان الطلب إلى Supabase الأصلي (نفس المضيف)، حوّله إلى الوكيل
    if (url.hostname === 'ebuumyqofptnjjaujlyd.supabase.co') {
      // احتفظ بالمسار الكامل ومعلمات الاستعلام (query string)
      const fullPath = url.pathname + url.search;
      const proxyUrl = `${PROXY_PATH}${fullPath}`;
      console.log('🔄 Proxy request:', proxyUrl); // للتشخيص
      return fetch(proxyUrl, init);
    }
    
    // الطلبات الأخرى (مثل صور خارجية) تمر عادية
    return fetch(input, init);
  } catch (error) {
    console.error('❌ Proxy error:', error);
    // في حال فشل الوكيل، حاول مباشرة (كحل أخير)
    return fetch(input, init);
  }
};

// 3. تهيئة العميل مع خيار fetch المخصص
export const supabase = createClient<Database>(REAL_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  fetch: proxyFetch,
});

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// 1. الرابط الكامل (لإرضاء المكتبة ومنع الصفحة البيضاء)
const SUPABASE_URL = 'https://ebuumyqofptnjjaujlyd.supabase.co';

// 2. المفتاح - استخدمه ثابتاً الآن للتأكد من أن المشكلة ليست في متغيرات البيئة
//    (انسخ المفتاح الحقيقي من Supabase > Settings > API > anon public)
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVidXVteXFvZnB0bmpqYXVqbHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDM1MjcsImV4cCI6MjA5OTE3OTUyN30.2cbgowu9hhqdNl5eOS-9VqykaR270-7BDnwtHvOcY9k';

// 3. دالة الوكيل السحرية (تعترض الطلبات وتوجهها إلى /supabase)
const customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    let url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith(SUPABASE_URL)) {
      const path = url.slice(SUPABASE_URL.length);
      const proxyUrl = `/supabase${path}`;
      console.log('🔄 Proxy to:', proxyUrl); // للتأكد
      return fetch(proxyUrl, init);
    }
    return fetch(input, init);
  } catch (e) {
    console.error('Proxy fallback:', e);
    return fetch(input, init);
  }
};

// 4. تهيئة العميل - مع خيار fetch المخصص
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  fetch: customFetch,
});

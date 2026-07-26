import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.4.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// معرف المطور المخصص للاستثناء من حدود الحجوزات
const DEV_TELEGRAM_ID = "1303830148";

const AVAILABLE_HOURS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30'];
const CLOSING_HOUR = 15;
const CLOSING_MINUTE = 30;

let wasmInitialized = false;

async function ensureWasm() {
  if (!wasmInitialized) {
    try {
      await initWasm("https://unpkg.com/@resvg/resvg-wasm@2.4.1/index_bg.wasm");
      wasmInitialized = true;
    } catch (_) {
      wasmInitialized = true;
    }
  }
}

// دالة تنظيف الرموز الخاصة لتجنب تلف ترميز الـ SVG
function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function validateGulfPhone(raw: string): { ok: boolean; normalized?: string } {
  const s = raw.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  if (/^\+?[1-9]\d{7,14}$/.test(s)) {
    return { ok: true, normalized: s.startsWith('+') ? s : '+' + s };
  }
  return { ok: false };
}

function isPastTime(dateStr: string, timeStr: string): boolean {
  const now = new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const selected = new Date(year, month - 1, day, hour, minute);
  return selected < now;
}

function isWithinWorkingHours(timeStr: string): boolean {
  const [hour, minute] = timeStr.split(':').map(Number);
  if (hour > CLOSING_HOUR) return false;
  if (hour === CLOSING_HOUR && minute >= CLOSING_MINUTE) return false;
  return true;
}

function isPastDate(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr < today;
}

function getAvailableTimes(dateStr: string, bookedTimes: Set<string>): string[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  return AVAILABLE_HOURS.filter((time) => {
    if (bookedTimes.has(time)) return false;
    if (!isWithinWorkingHours(time)) return false;
    if (dateStr === todayStr) {
      const [hour, minute] = time.split(':').map(Number);
      const timeDate = new Date(now);
      timeDate.setHours(hour, minute, 0, 0);
      if (timeDate <= now) return false;
    }
    return true;
  });
}

async function fetchWithTimeout(url: string, options: any, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function stripEmojis(text: string): string {
  if (!text) return text;
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{2300}-\u{23FF}]/gu, '')
    .replace(/[\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[\u{1F300}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[•●◆■□▪▫★☆※♦♣♥♠✦✧✪✩◉○◎◇◈]/g, '')
    .replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

// ============================================================
// ===== توليد بطاقة الحجز الطبية الفاخرة المحسّنة والقابلة للرسم =====
// ============================================================
async function generateLuxuryBookingCard(booking: {
  clinicName: string;
  doctorName?: string;
  logoUrl?: string;
  patientName: string;
  patientPhone: string;
  serviceName: string;
  date: string;
  time: string;
  code: string;
}): Promise<Uint8Array | null> {
  try {
    await ensureWasm();

    const clinicName = escapeXml(booking.clinicName);
    const doctorName = escapeXml(booking.doctorName || '');
    const patientName = escapeXml(booking.patientName);
    const patientPhone = escapeXml(booking.patientPhone);
    const serviceName = escapeXml(booking.serviceName);
    const bookingDate = escapeXml(booking.date);
    const bookingTime = escapeXml(booking.time);
    const bookingCode = escapeXml(booking.code);

    const qrData = `RESERVATION:${bookingCode}|CLINIC:${clinicName}|PATIENT:${patientName}|DATE:${bookingDate} ${bookingTime}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`;

    let qrBase64 = "";
    try {
      const qrRes = await fetchWithTimeout(qrApiUrl, {}, 5000);
      if (qrRes.ok) {
        const qrBuf = await qrRes.arrayBuffer();
        qrBase64 = `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(qrBuf)))}`;
      }
    } catch (_) {}

    let logoBase64 = "";
    if (booking.logoUrl) {
      try {
        const lRes = await fetchWithTimeout(booking.logoUrl, {}, 5000);
        if (lRes.ok) {
          const lBuf = await lRes.arrayBuffer();
          logoBase64 = `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(lBuf)))}`;
        }
      } catch (_) {}
    }

    // تصميم SVG القياسي الخالي من المعاملات غير المدعومة مثل direction="rtl"
    const svg = `
    <svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <linearGradient id="cardHeaderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#059669"/>
          <stop offset="50%" stop-color="#0d9488"/>
          <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
        <filter id="glassShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.4"/>
        </filter>
      </defs>

      <rect width="800" height="1000" fill="url(#bgGrad)"/>
      <circle cx="700" cy="100" r="300" fill="#059669" opacity="0.12"/>
      <circle cx="100" cy="900" r="250" fill="#0284c7" opacity="0.12"/>

      <g filter="url(#glassShadow)">
        <rect x="50" y="60" width="700" height="820" rx="32" fill="#ffffff"/>
      </g>

      <path d="M 50 92 C 50 74.327 64.327 60 82 60 L 718 60 C 735.673 60 750 74.327 750 92 L 750 200 L 50 200 Z" fill="url(#cardHeaderGrad)"/>

      ${logoBase64 ? `
        <image x="80" y="85" width="90" height="90" href="${logoBase64}" preserveAspectRatio="xMidYMid slice"/>
      ` : `
        <rect x="80" y="85" width="90" height="90" rx="20" fill="rgba(255,255,255,0.2)"/>
        <text x="125" y="142" font-family="Arial, sans-serif" font-size="42" fill="#ffffff" text-anchor="middle">🏥</text>
      `}

      <text x="195" y="118" font-family="Arial, Tahoma, sans-serif" font-size="28" font-weight="bold" fill="#ffffff">${clinicName}</text>
      <text x="195" y="152" font-family="Arial, Tahoma, sans-serif" font-size="18" fill="rgba(255,255,255,0.85)">
        ${doctorName ? `تحت إشراف: د. ${doctorName}` : 'بطاقة حجز موعد طبي مؤكد'}
      </text>

      <rect x="580" y="95" width="130" height="42" rx="21" fill="rgba(255,255,255,0.25)"/>
      <text x="645" y="122" font-family="Arial, Tahoma, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">مؤكد ✓</text>

      <text x="700" y="270" font-family="Arial, Tahoma, sans-serif" font-size="16" fill="#64748b" text-anchor="end">اسم المريض الصريح</text>
      <text x="700" y="305" font-family="Arial, Tahoma, sans-serif" font-size="26" font-weight="bold" fill="#0f172a" text-anchor="end">${patientName}</text>

      <line x1="100" y1="330" x2="700" y2="330" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6,6"/>

      <text x="700" y="370" font-family="Arial, Tahoma, sans-serif" font-size="16" fill="#64748b" text-anchor="end">رقم الهاتف التواصل</text>
      <text x="700" y="405" font-family="Arial, Tahoma, sans-serif" font-size="22" font-weight="bold" fill="#0f172a" text-anchor="end">${patientPhone}</text>

      <line x1="100" y1="430" x2="700" y2="430" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6,6"/>

      <text x="700" y="470" font-family="Arial, Tahoma, sans-serif" font-size="16" fill="#64748b" text-anchor="end">الخدمة الطبية المطلوبة</text>
      <text x="700" y="505" font-family="Arial, Tahoma, sans-serif" font-size="22" font-weight="bold" fill="#059669" text-anchor="end">${serviceName}</text>

      <line x1="100" y1="530" x2="700" y2="530" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6,6"/>

      <g>
        <rect x="410" y="560" width="290" height="85" rx="16" fill="#f8fafc"/>
        <text x="680" y="590" font-family="Arial, Tahoma, sans-serif" font-size="14" fill="#64748b" text-anchor="end">📅 تاريخ الموعد</text>
        <text x="680" y="625" font-family="Arial, Tahoma, sans-serif" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="end">${bookingDate}</text>

        <rect x="100" y="560" width="290" height="85" rx="16" fill="#f8fafc"/>
        <text x="370" y="590" font-family="Arial, Tahoma, sans-serif" font-size="14" fill="#64748b" text-anchor="end">⏰ الوقت المكتمل</text>
        <text x="370" y="625" font-family="Arial, Tahoma, sans-serif" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="end">${bookingTime}</text>
      </g>

      <rect x="100" y="670" width="600" height="65" rx="20" fill="url(#goldGrad)"/>
      <text x="400" y="711" font-family="Arial, Tahoma, sans-serif" font-size="26" font-weight="bold" fill="#ffffff" text-anchor="middle">
        كود الحجز المباشر: ${bookingCode}
      </text>

      ${qrBase64 ? `
        <g>
          <rect x="300" y="750" width="200" height="110" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
          <image x="350" y="755" width="100" height="100" href="${qrBase64}"/>
        </g>
      ` : ''}

      <text x="400" y="930" font-family="Arial, Tahoma, sans-serif" font-size="16" font-weight="bold" fill="#94a3b8" text-anchor="middle">
        Smart Clinic System — نظام إدارة العيادات الذكي
      </text>
      <text x="400" y="958" font-family="Monospace, Arial, sans-serif" font-size="14" fill="#38bdf8" text-anchor="middle">
        alkhyatalkhyat79@gmail.com
      </text>
    </svg>
    `;

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 800 },
    });
    const pngData = resvg.render();
    return pngData.asPng();
  } catch (e) {
    console.error('Error generating luxury card:', e);
    return null;
  }
}

// ============================================================
// ===== الدالة الرئيسية والتعامل مع طلبات الكاشير والبوت =====
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    let rawBody: any = null;
    try { rawBody = await req.json(); } catch { rawBody = null; }

    const action = url.searchParams.get('action') || rawBody?.action || null;

    // 📩 إجراء إرسال سند الدفع المالي تلقائياً للمريض عبر البوت الموحد
    if (action === 'send_receipt') {
      const chatId = rawBody?.chat_id;
      const receiptImage = rawBody?.receipt_image;
      const clinicId = rawBody?.clinic_id;

      if (!chatId || !receiptImage) {
        return jsonResponse({ ok: false, error: 'بيانات غير مكتملة لإرسال السند' }, 400);
      }

      const botToken = await getBotTokenForClinic(supabase, clinicId);
      if (!botToken) {
        return jsonResponse({ ok: false, error: 'تعذر الوصول لتوكن البوت الموحد' }, 500);
      }

      const base64Data = receiptImage.replace(/^data:image\/\w+;base64,/, "");
      const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      const caption = 
        `🧾 <b>سند دفع رسمي مؤكد — ${rawBody?.clinic_name || "العيادة الطبية"}</b>\n\n` +
        `👤 المريض: <b>${rawBody?.patient_name || "المريض"}</b>\n` +
        `🔖 كود الحجز: <code>${rawBody?.reservation_code || ""}</code>\n` +
        `💊 الخدمة: <b>${rawBody?.service_name || "فحص طبي"}</b>\n` +
        `💰 الصافي المدفوع: <b>${rawBody?.amount || 0} ر.ي</b>\n` +
        `📅 التاريخ: <b>${new Date().toLocaleDateString('ar-EG')}</b>\n\n` +
        `شكراً لتسديدكم، نتمنى لكم دوام الصحة والعافية 🌷`;

      const fd = new FormData();
      fd.append("chat_id", String(chatId));
      fd.append("photo", new Blob([imageBytes], { type: 'image/png' }), `receipt_${rawBody?.reservation_code}.png`);
      fd.append("caption", caption);
      fd.append("parse_mode", "HTML");

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        body: fd,
      });

      const resJson = await tgRes.json();
      if (resJson.ok) {
        return jsonResponse({ ok: true, result: resJson.result });
      } else {
        return jsonResponse({ ok: false, error: resJson.description }, 400);
      }
    }

    if (action === 'set-webhook' || action === 'webhook-info' || action === 'bot-info') {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace('Bearer ', '');
      let botToken: string | null = null;
      let clinicIdForCache: string | null = null;
      let ownerInfo = 'env';

      if (jwt) {
        const { data: userData } = await supabase.auth.getUser(jwt);
        const uid = userData?.user?.id;
        if (uid) {
          const { data: c } = await supabase.from('clinics').select('id, bot_token').eq('owner_id', uid).maybeSingle();
          if (c?.bot_token) { botToken = c.bot_token; ownerInfo = uid; clinicIdForCache = c.id; }
        }
      }

      if (!botToken) botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || null;
      if (!botToken) return jsonResponse({ ok: false, error: 'لا يوجد توكن بوت محفوظ' }, 400);

      if (action === 'webhook-info') {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        return jsonResponse({ ok: true, info: await res.json(), owner: ownerInfo });
      }

      if (action === 'bot-info') {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const me = await res.json();
        const username = me?.result?.username || null;
        if (username && clinicIdForCache) {
          await supabase.from('clinics').update({ bot_username: username }).eq('id', clinicIdForCache);
        }
        return jsonResponse({ ok: !!me?.ok, username, raw: me });
      }

      const webhookUrl = clinicIdForCache
        ? `${supabaseUrl}/functions/v1/telegram-bot?clinic_id=${clinicIdForCache}`
        : `${supabaseUrl}/functions/v1/telegram-bot`;

      const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }),
      });
      const tgResult = await res.json();

      return jsonResponse({ ok: !!tgResult?.ok, webhook: tgResult, webhookUrl, owner: ownerInfo });
    }

    const update = rawBody;
    if (!update) return jsonResponse({ ok: true });

    const requestClinicId = extractClinicId(url.searchParams.get('clinic_id'));

    if (update.callback_query) {
      await handleCallbackQuery(supabase, update.callback_query, requestClinicId);
      return jsonResponse({ ok: true });
    }

    const message = update.message;
    if (!message) return jsonResponse({ ok: true });

    const chatId = message.chat.id;
    let text = (message.text || '').trim();
    const telegramUserId = String(message.from.id);
    const firstName = message.from.first_name || 'عميل';

    const botToken = await getBotTokenForClinic(supabase, requestClinicId);
    if (!botToken) return jsonResponse({ ok: true });

    const send = (cId: number, txt: string, markup?: any) => sendMessage(botToken, cId, txt, markup);

    const linkedClinicId = await getUserClinicId(supabase, telegramUserId);

    const isMainMenu = isBookingIntent(text) || isServicesIntent(text) || isAppointmentsIntent(text) || isCancelIntent(text);

    const session = await getSession(supabase, telegramUserId);
    const looksLikeReCode = /^RE-\d{4}$/i.test(text.trim());

    if (session && session.step && session.step !== 'idle'
        && !text.startsWith('/') && !isMainMenu && !looksLikeReCode) {
      const handled = await progressSession(supabase, send, chatId, telegramUserId, firstName, session, text, botToken);
      if (handled) return jsonResponse({ ok: true });
    }

    if (isMainMenu && session && session.step !== 'idle') {
      await clearSession(supabase, telegramUserId);
    }

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const param = parts.length > 1 ? parts[1] : null;

      const clinicId = extractClinicId(param);
      if (clinicId) {
        const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', clinicId).single();
        if (!clinic) { await send(chatId, '❌ رابط العيادة غير صحيح.'); return jsonResponse({ ok: true }); }

        const { data: existing } = await supabase.from('patients').select('id').eq('clinic_id', clinicId).eq('telegram_user_id', telegramUserId).maybeSingle();
        if (!existing) {
          await supabase.from('patients').insert({ clinic_id: clinicId, name: firstName, phone: `tg:${telegramUserId}`, telegram_user_id: telegramUserId });
        }

        await clearSession(supabase, telegramUserId);
        await send(chatId,
          `🏥 <b>مرحباً ${firstName} في ${clinic.name}</b>\n\n` +
          (clinic.description ? `${clinic.description}\n\n` : '') +
          `للحجز اضغط زر «📅 حجز موعد» أو زر «🔍 الخدمات» لعرض الخدمات والأسعار.`,
          defaultKeyboard()
        );
        return jsonResponse({ ok: true });
      }

      if (linkedClinicId) {
        const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', linkedClinicId).single();
        if (clinic) {
          await send(chatId,
            `🏥 <b>مرحباً ${firstName} في ${clinic.name}</b>\n\n` +
            `للحجز اضغط زر «📅 حجز موعد» أو زر «🔍 الخدمات» لعرض الخدمات والأسعار.`,
            defaultKeyboard()
          );
          return jsonResponse({ ok: true });
        }
      }

      await send(chatId,
        `🏥 <b>مرحباً ${firstName} في Smart Clinic</b>\n\n` +
        `للحجز افتح رابط العيادة المخصص لكم.`,
        defaultKeyboard()
      );
      return jsonResponse({ ok: true });
    }

    if (isBookingIntent(text) || isServicesIntent(text)) {
      if (!linkedClinicId) {
        await send(chatId, '⚠️ افتح رابط الحجز الخاص بالعيادة أولاً، ثم اختر الخدمة.');
        return jsonResponse({ ok: true });
      }
      const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', linkedClinicId).single();
      if (clinic) await sendServicesMenu(supabase, send, chatId, clinic, linkedClinicId, firstName);
      return jsonResponse({ ok: true });
    }

    if (isAppointmentsIntent(text)) {
      const { data: appointments } = await supabase.from('appointments')
        .select('id, date, time, status, reservation_code, services(name)')
        .eq('customer_telegram_id', telegramUserId)
        .in('status', ['pending', 'confirmed'])
        .order('date', { ascending: true }).limit(10);

      if (appointments && appointments.length > 0) {
        let msg = '📅 <b>مواعيدك القادمة:</b>\n\n';
        appointments.forEach((a: any, i: number) => {
          msg += `${i + 1}. ${a.status === 'confirmed' ? '✅' : '⏳'} <b>${a.date}</b> الساعة ${a.time}\n`;
          if (a.services?.name) msg += `🏷 ${a.services.name}\n`;
          msg += `🔖 كود: <code>${a.reservation_code}</code>\n\n`;
        });
        await send(chatId, msg);
      } else await send(chatId, '📭 لا توجد لديك مواعيد قادمة.');
      return jsonResponse({ ok: true });
    }

    if (isCancelIntent(text)) {
      const { data: appointments } = await supabase.from('appointments')
        .select('id, date, time, reservation_code')
        .eq('customer_telegram_id', telegramUserId)
        .in('status', ['pending', 'confirmed'])
        .order('date', { ascending: true }).limit(5);

      if (appointments && appointments.length > 0) {
        let msg = '❌ <b>اختر الموعد لإلغائه:</b>\n\n';
        const buttons: any[][] = [];
        appointments.forEach((a: any) => {
          msg += `📅 ${a.date} - ⏰ ${a.time}\n🔖 <code>${a.reservation_code}</code>\n\n`;
          buttons.push([{ text: `❌ إلغاء ${a.reservation_code}`, callback_data: `cancel_${a.reservation_code}` }]);
        });
        await send(chatId, msg, { inline_keyboard: buttons });
      } else await send(chatId, '📭 لا توجد لديك مواعيد يمكن إلغاؤها.');
      return jsonResponse({ ok: true });
    }

    await send(chatId, `🤖 كيف يمكنني مساعدتك؟ استخدم الأزرار أدناه للبدء.`, defaultKeyboard());
    return jsonResponse({ ok: true });

  } catch (error) {
    console.error('Telegram bot error:', error);
    return jsonResponse({ ok: true });
  }
});

async function getSession(supabase: any, tgId: string) {
  const { data } = await supabase.from('bot_sessions').select('*').eq('telegram_user_id', tgId).maybeSingle();
  return data;
}

async function upsertSession(supabase: any, tgId: string, patch: Record<string, any>) {
  await supabase.from('bot_sessions').upsert({ telegram_user_id: tgId, updated_at: new Date().toISOString(), ...patch }, { onConflict: 'telegram_user_id' });
}

async function clearSession(supabase: any, tgId: string) {
  await supabase.from('bot_sessions').delete().eq('telegram_user_id', tgId);
}

async function sendServicesMenu(supabase: any, send: any, chatId: number, clinic: any, clinicId: string, firstName: string) {
  const { data: services } = await supabase.from('services')
    .select('id, name, price, duration_minutes')
    .eq('clinic_id', clinicId).eq('is_active', true).order('name');

  const doctorLine = clinic.doctor_name ? `تحت إشراف د. <b>${clinic.doctor_name}</b>\n` : '';
  let msg = `🏥 أهلاً وسهلاً ${firstName} في <b>${clinic.name}</b>\n${doctorLine}`;
  if (clinic.description) msg += `📝 ${clinic.description}\n`;

  if (services && services.length > 0) {
    msg += `\n📋 <b>اختر الخدمة التي تريد حجزها:</b>\n\n`;
    const buttons: any[][] = [];
    services.forEach((s: any, i: number) => {
      msg += `${i + 1}. ${s.name} (${s.duration_minutes || 30} دقيقة)\n`;
      buttons.push([{ text: `📅 ${s.name}`, callback_data: `book:${s.id}` }]);
    });
    await send(chatId, msg, { inline_keyboard: buttons });
  } else {
    await send(chatId, msg + `\nلا توجد خدمات متاحة حالياً، تواصل مع العيادة لاحقاً.`, defaultKeyboard());
  }
}

async function progressSession(supabase: any, send: any, chatId: number, tgId: string, firstName: string, session: any, text: string, botToken: string): Promise<boolean> {
  if (/^(إلغاء|الغاء|cancel|stop)$/i.test(text.trim())) {
    await clearSession(supabase, tgId);
    await send(chatId, '✅ تم إلغاء الحجز. يمكنك البدء من جديد متى شئت.', defaultKeyboard());
    return true;
  }

  if (session.step === 'ask_name') {
    const name = text.trim();
    if (name.length < 2 || name.length > 80) {
      await send(chatId, '⚠️ الاسم قصير جداً أو طويل جداً. أرسل اسمك الكامل من فضلك.');
      return true;
    }
    await upsertSession(supabase, tgId, { full_name: name, step: 'ask_phone' });
    await send(chatId, `أهلاً بك ${name} 🌷\n\n📱 يرجى إدخال رقم هاتفك للتواصل:`);
    return true;
  }

  if (session.step === 'ask_phone') {
    const v = validateGulfPhone(text);
    if (!v.ok) {
      const attempts = (session.phone_attempts || 0) + 1;
      await upsertSession(supabase, tgId, { phone_attempts: attempts });
      if (attempts >= 3) {
        const { data: clinicRow } = await supabase.from('clinics').select('phone, name, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
        const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
        const waBtn = waNum ? [[{ text: '💬 تواصل عبر واتساب', url: `https://wa.me/${waNum}` }]] : [];
        await clearSession(supabase, tgId);
        await send(chatId,
          '⚠️ تعذّر التحقق من رقم هاتفك. يمكنك التواصل مع موظف الاستقبال مباشرة عبر الواتساب أدناه لإكمال الحجز.',
          waBtn.length ? { inline_keyboard: waBtn } : undefined);
        return true;
      }
      await send(chatId, `⚠️ يرجى إدخال رقم هاتف صحيح للتواصل.\n(المحاولة ${attempts}/3)`);
      return true;
    }

    await upsertSession(supabase, tgId, { phone: v.normalized, phone_attempts: 0, step: 'ask_date' });
    const today = new Date();
    const buttons: any[][] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const label = i === 0 ? `اليوم (${iso})` : i === 1 ? `غداً (${iso})` : iso;
      buttons.push([{ text: `📅 ${label}`, callback_data: `date_${iso}` }]);
    }
    await send(chatId, `✅ تم حفظ الرقم.\n\n📅 اختر تاريخ الموعد:`, { inline_keyboard: buttons });
    return true;
  }

  if (session.step === 'ask_date') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) {
      return await handleDateChoice(supabase, send, chatId, tgId, session, text.trim());
    }
    await send(chatId, '⚠️ استخدم زر التاريخ بالأعلى أو اكتب التاريخ بصيغة YYYY-MM-DD.');
    return true;
  }

  if (session.step === 'ask_time') {
    const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const hh = m[1].padStart(2, '0');
      const time = `${hh}:${m[2]}`;
      return await finalizeBooking(supabase, send, chatId, tgId, firstName, session, time, botToken);
    }
    await send(chatId, '⚠️ اختر وقتاً من الأزرار أو اكتبه بصيغة HH:MM.');
    return true;
  }

  return false;
}

async function handleDateChoice(supabase: any, send: any, chatId: number, tgId: string, session: any, dateStr: string): Promise<boolean> {
  if (isPastDate(dateStr)) {
    await send(chatId, '⚠️ لا يمكن الحجز في تاريخ مضى. اختر تاريخاً مستقبلياً:');
    return true;
  }

  const { data: existing } = await supabase.from('appointments').select('time')
    .eq('clinic_id', session.clinic_id).eq('date', dateStr).in('status', ['pending', 'confirmed']);
  const booked = new Set((existing || []).map((a: any) => String(a.time).slice(0, 5)));
  const free = getAvailableTimes(dateStr, booked);

  if (free.length === 0) {
    const { data: clinicRow } = await supabase.from('clinics').select('phone, name, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
    const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
    const waText = encodeURIComponent(`مرحباً، أريد استفسار عن مواعيد متاحة في ${clinicRow?.name || 'العيادة'}`);
    const waBtn = waNum ? [[{ text: '💬 تواصل مع موظف الاستقبال', url: `https://wa.me/${waNum}?text=${waText}` }]] : [];
    await send(chatId,
      `⚠️ <b>لا توجد أوقات متاحة في هذا اليوم</b>\n\nجميع الأوقات محجوزة.`,
      waBtn.length ? { inline_keyboard: waBtn } : undefined
    );
    return true;
  }

  await upsertSession(supabase, tgId, { preferred_date: dateStr, step: 'ask_time' });
  const buttons: any[][] = [];
  for (let i = 0; i < free.length; i += 3) {
    buttons.push(free.slice(i, i + 3).map((t) => ({ text: `⏰ ${t}`, callback_data: `time_${t.replace(':', '')}` })));
  }
  await send(chatId, `✅ التاريخ: <b>${dateStr}</b>\n\n⏰ اختر الوقت المناسب:`, { inline_keyboard: buttons });
  return true;
}

function normalizedText(text: string) {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[📅🔍📋❌🔎🗓️]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isBookingIntent(text: string) {
  const n = normalizedText(text);
  return n === '/book' || n === '/booking' || n.includes('حجز موعد') || n.includes('احجز موعد');
}

function isServicesIntent(text: string) {
  const n = normalizedText(text);
  return n === '/services' || n === 'الخدمات' || n === 'خدمات' || n === 'خدماتي' || n.includes('الخدمات');
}

function isAppointmentsIntent(text: string) {
  const n = normalizedText(text);
  return n === '/appointments' || n.includes('مواعيدي');
}

function isCancelIntent(text: string) {
  const n = normalizedText(text);
  return n === '/cancel' || n.includes('الغاء موعد');
}

async function finalizeBooking(supabase: any, send: any, chatId: number, tgId: string, firstName: string, session: any, time: string, botToken: string): Promise<boolean> {
  if (isPastTime(session.preferred_date, time)) {
    await send(chatId, `⚠️ الوقت <b>${time}</b> فائت. اختر وقتاً آخر.`);
    return true;
  }

  // فحص الحد الأقصى للحجوزات اليومية (3 مواعيد كحد أقصى) مع استثناء معرف المطور 1303830148
  const todayStr = new Date().toISOString().slice(0, 10);
  const { count: todayCount } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('customer_telegram_id', tgId)
    .eq('date', todayStr)
    .not('status', 'in', '(cancelled)');

  if (tgId !== DEV_TELEGRAM_ID && (todayCount ?? 0) >= 3) {
    const { data: clinicRow } = await supabase.from('clinics').select('phone, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
    const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
    const waBtn = waNum ? [[{ text: '💬 تواصل مع الاستقبال لإضافة حجز', url: `https://wa.me/${waNum}` }]] : [];
    await send(chatId,
      '⚠️ لقد وصلت للحد الأقصى للحجوزات المتاحة تلقائياً اليوم (3 مواعيد).',
      waBtn.length ? { inline_keyboard: waBtn } : undefined
    );
    await clearSession(supabase, tgId);
    return true;
  }

  let patientId: string;
  let storedName = session.full_name;
  let storedPhone = session.phone;

  const { data: existingPatient } = await supabase.from('patients').select('id, name, phone')
    .eq('clinic_id', session.clinic_id).eq('telegram_user_id', tgId).maybeSingle();

  // تحديث بيانات المريض دائماً بالاسم والأن رقم الهاتف المباشر الحقيقي ليظهر بجدول المواعيد
  if (existingPatient) {
    patientId = existingPatient.id;
    await supabase.from('patients').update({ name: storedName, phone: storedPhone }).eq('id', patientId);
  } else {
    const { data: np } = await supabase.from('patients')
      .insert({ clinic_id: session.clinic_id, name: storedName, phone: storedPhone, telegram_user_id: tgId })
      .select('id').single();
    patientId = np!.id;
  }

  const { data: service } = await supabase.from('services').select('name, price').eq('id', session.service_id).single();
  const { data: clinicInfo } = await supabase.from('clinics').select('name, doctor_name, logo_url').eq('id', session.clinic_id).single();

  const code = `RE-${String(Math.floor(1000 + Math.random() * 9000))}`;

  const { error } = await supabase.from('appointments').insert({
    clinic_id: session.clinic_id,
    patient_id: patientId,
    service_id: session.service_id,
    date: session.preferred_date,
    time: time + ':00',
    status: 'pending',
    reservation_code: code,
    customer_telegram_id: tgId,
    notes: `حجز عبر تليجرام - المريض: ${storedName} (${storedPhone})`,
  });

  if (error) {
    await send(chatId, '❌ تعذّر إكمال الحجز. حاول مرة أخرى.');
    return true;
  }

  await clearSession(supabase, tgId);

  const { data: clinicRow } = await supabase.from('clinics').select('phone, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
  const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
  const waTextOther = encodeURIComponent(`مرحباً، أريد حجز موعد باسم شخص آخر في ${clinicInfo?.name || 'العيادة'} - خدمة: ${service?.name || ''}`);

  const successMarkup = {
    inline_keyboard: waNum ? [[{ text: '👥 حجز موعد باسم شخص آخر (واتساب)', url: `https://wa.me/${waNum}?text=${waTextOther}` }]] : [],
  };

  const confirmMsg =
    `✅ <b>تم تأكيد حجزك بنجاح!</b>\n\n` +
    `👤 المريض: ${storedName}\n` +
    `📱 الهاتف: ${storedPhone}\n` +
    `🏷 الخدمة: ${service?.name || ''}\n` +
    `📅 التاريخ: ${session.preferred_date}\n` +
    `⏰ الوقت: ${time}\n` +
    `🔖 كود الحجز: <code>${code}</code>\n\n` +
    `أتمنى لك دوام الصحة والعافية 🌷`;

  await send(chatId, confirmMsg, successMarkup);

  const cardPng = await generateLuxuryBookingCard({
    clinicName: clinicInfo?.name || 'العيادة الطبية',
    doctorName: clinicInfo?.doctor_name || '',
    logoUrl: clinicInfo?.logo_url || '',
    patientName: storedName,
    patientPhone: storedPhone,
    serviceName: service?.name || 'فحص طبي',
    date: session.preferred_date,
    time: time,
    code: code,
  });

  if (cardPng) {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('photo', new Blob([cardPng], { type: 'image/png' }), 'booking_card.png');
    fd.append('caption', `📋 بطاقة حجز موعد رسمي — ${clinicInfo?.name || ''}\nبرجاء إبراز الكود عند الوصول إلى الاستقبال.`);
    fd.append('parse_mode', 'HTML');

    await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: fd }, 15000);
  }

  return true;
}

async function handleCallbackQuery(supabase: any, query: any, requestClinicId: string | null = null) {
  const chatId = query.message.chat.id;
  const data = query.data;
  const tgId = String(query.from.id);
  const firstName = query.from.first_name || 'عميل';

  const botToken = await getBotTokenForClinic(supabase, requestClinicId);
  if (!botToken) return jsonResponse({ ok: true });

  const send = (cId: number, txt: string, markup?: any) => sendMessage(botToken, cId, txt, markup);

  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: query.id }),
  });

  if (data.startsWith('book:') || data.startsWith('book_')) {
    const serviceId = data.startsWith('book:') ? data.replace('book:', '') : data.split('_')[2];
    const { data: service } = await supabase.from('services').select('id, name, clinic_id').eq('id', serviceId).single();
    if (!service) { await send(chatId, '❌ الخدمة غير متوفرة.'); return jsonResponse({ ok: true }); }

    const { data: existingPatient } = await supabase.from('patients')
      .select('id, name, phone').eq('clinic_id', service.clinic_id).eq('telegram_user_id', tgId).maybeSingle();

    const hasRealRegistration = existingPatient && existingPatient.phone && !String(existingPatient.phone).startsWith('tg:');

    if (hasRealRegistration) {
      await upsertSession(supabase, tgId, {
        clinic_id: service.clinic_id, service_id: service.id, step: 'ask_date',
        full_name: existingPatient!.name, phone: existingPatient!.phone,
        preferred_date: null, preferred_time: null,
        is_third_party: false, booked_by_chat_id: null, phone_attempts: 0,
      });

      const today = new Date();
      const buttons: any[][] = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const iso = d.toISOString().split('T')[0];
        const label = i === 0 ? `اليوم (${iso})` : i === 1 ? `غداً (${iso})` : iso;
        buttons.push([{ text: `📅 ${label}`, callback_data: `date_${iso}` }]);
      }

      await send(chatId,
        `أهلاً بعودتك ${existingPatient!.name} 🌷\n\nسنحجز لك خدمة <b>${service.name}</b> باسمك المسجَّل سابقاً.\n📱 الهاتف: <code>${existingPatient!.phone}</code>\n\n📅 اختر تاريخ الموعد:`,
        { inline_keyboard: buttons });
      return jsonResponse({ ok: true });
    }

    await upsertSession(supabase, tgId, { clinic_id: service.clinic_id, service_id: service.id, step: 'ask_name', full_name: null, phone: null, preferred_date: null, preferred_time: null, is_third_party: false, booked_by_chat_id: null, phone_attempts: 0 });
    await send(chatId, `📋 لحجز <b>${service.name}</b>:\n\nأرسل أولاً <b>اسمك الصريح الكامل</b> من فضلك.`);
    return jsonResponse({ ok: true });
  }

  if (data.startsWith('date_')) {
    const dateStr = data.replace('date_', '');
    const session = await getSession(supabase, tgId);
    if (!session || session.step !== 'ask_date') {
      await send(chatId, '⚠️ ابدأ الحجز من زر الخدمة أولاً.');
      return jsonResponse({ ok: true });
    }
    await handleDateChoice(supabase, send, chatId, tgId, session, dateStr);
    return jsonResponse({ ok: true });
  }

  if (data.startsWith('time_')) {
    const raw = data.replace('time_', '');
    const time = `${raw.slice(0, 2)}:${raw.slice(2)}`;
    const session = await getSession(supabase, tgId);
    if (!session || session.step !== 'ask_time') {
      await send(chatId, '⚠️ ابدأ الحجز من زر الخدمة أولاً.');
      return jsonResponse({ ok: true });
    }
    await finalizeBooking(supabase, send, chatId, tgId, firstName, session, time, botToken);
    return jsonResponse({ ok: true });
  }

  if (data.startsWith('cancel_')) {
    const resCode = data.replace('cancel_', '');
    const { data: appointment } = await supabase.from('appointments').update({ status: 'cancelled' })
      .eq('reservation_code', resCode).eq('customer_telegram_id', tgId)
      .in('status', ['pending', 'confirmed']).select('date, time, reservation_code, clinic_id').single();

    if (appointment) {
      await send(chatId, `✅ <b>تم إلغاء الموعد</b>\n📅 ${appointment.date} ⏰ ${appointment.time}\n🔖 ${appointment.reservation_code}`);
    } else await send(chatId, '⚠️ لم يتم العثور على الموعد.');
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: true });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function defaultKeyboard() {
  return {
    keyboard: [
      [{ text: '📅 حجز موعد' }, { text: '📋 مواعيدي' }],
      [{ text: '🔍 الخدمات' }, { text: '❌ إلغاء موعد' }],
    ],
    resize_keyboard: true,
  };
}

function extractClinicId(param: string | null): string | null {
  if (!param) return null;
  const cleaned = decodeURIComponent(param).trim();
  const direct = cleaned.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (direct) return direct;
  const prefixed = cleaned.replace(/^(clinic|c|عيادة)[_-]/i, '');
  return prefixed.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? prefixed : null;
}

async function getBotTokenFromDB(supabase: any): Promise<string | null> {
  const { data } = await supabase.from('system_settings').select('telegram_bot_token').eq('id', 1).single();
  return data?.telegram_bot_token || null;
}

async function getBotTokenForClinic(supabase: any, clinicId: string | null): Promise<string | null> {
  if (clinicId) {
    const { data } = await supabase.from('clinics').select('bot_token').eq('id', clinicId).maybeSingle();
    if (data?.bot_token) return data.bot_token;
  }
  return Deno.env.get('TELEGRAM_BOT_TOKEN') || await getBotTokenFromDB(supabase);
}

async function sendMessage(botToken: string, chatId: number, text: string, replyMarkup?: any) {
  const body: any = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return await res.json();
}

async function getUserClinicId(supabase: any, tgId: string): Promise<string | null> {
  const { data } = await supabase.from('patients').select('clinic_id')
    .or(`telegram_user_id.eq.${tgId},phone.eq.tg:${tgId}`)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data?.clinic_id || null;
}

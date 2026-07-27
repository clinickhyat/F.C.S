import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.4.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ============================================================
// ===== المعرفات الخاصة =====
// ============================================================

// ✅ معرف المطور (يستثنى من حدود الحجوزات ومن ساعات الدوام)
const DEV_TELEGRAM_ID = "1303830148";

// ============================================================
// ===== ساعات الدوام (افتراضية، سيتم جلبها من قاعدة البيانات) =====
// ============================================================

const DEFAULT_AVAILABLE_HOURS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30'];
const DEFAULT_CLOSING_HOUR = 15;
const DEFAULT_CLOSING_MINUTE = 30;

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

// ============================================================
// ===== دوال مساعدة وتنظيف =====
// ============================================================

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

function isPastDate(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr < today;
}

// ✅ دوال ساعات الدوام الديناميكية (تقرأ من قاعدة البيانات)
async function getClinicWorkingHours(supabase: any, clinicId: string) {
  try {
    const { data: clinic } = await supabase
      .from('clinics')
      .select('working_hours')
      .eq('id', clinicId)
      .maybeSingle();
    
    if (clinic?.working_hours) {
      const wh = typeof clinic.working_hours === 'string' 
        ? JSON.parse(clinic.working_hours) 
        : clinic.working_hours;
      
      // استخراج أيام العمل وساعات العمل من كائن working_hours
      // نتوقع هيكل: { "sunday": { "open": "08:00", "close": "16:00" }, ... }
      // أو { "open": "08:00", "close": "16:00" } (لكل الأيام)
      let openTime = "08:00";
      let closeTime = "16:00";
      
      // إذا كان هناك أيام محددة، نأخذ أول يوم متاح
      if (wh && typeof wh === 'object') {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (const day of days) {
          if (wh[day]?.open && wh[day]?.close) {
            openTime = wh[day].open;
            closeTime = wh[day].close;
            break;
          }
        }
        // إذا لم نجد أي يوم، نأخذ القيم المباشرة
        if (!openTime && wh.open) openTime = wh.open;
        if (!closeTime && wh.close) closeTime = wh.close;
      }
      
      const [openH, openM] = openTime.split(':').map(Number);
      const [closeH, closeM] = closeTime.split(':').map(Number);
      
      // توليد الأوقات المتاحة كل 30 دقيقة من open إلى close
      const hours: string[] = [];
      let currentH = openH;
      let currentM = openM;
      while (currentH < closeH || (currentH === closeH && currentM < closeM)) {
        hours.push(`${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`);
        currentM += 30;
        if (currentM >= 60) {
          currentM = 0;
          currentH += 1;
        }
      }
      
      return { 
        availableHours: hours.length > 0 ? hours : DEFAULT_AVAILABLE_HOURS,
        closingHour: closeH,
        closingMinute: closeM,
        openTime,
        closeTime
      };
    }
  } catch (e) {
    console.warn('Error parsing working_hours, using defaults:', e);
  }
  
  return { 
    availableHours: DEFAULT_AVAILABLE_HOURS, 
    closingHour: DEFAULT_CLOSING_HOUR, 
    closingMinute: DEFAULT_CLOSING_MINUTE,
    openTime: '08:00',
    closeTime: '16:00'
  };
}

function isWithinWorkingHours(timeStr: string, closingHour: number, closingMinute: number): boolean {
  const [hour, minute] = timeStr.split(':').map(Number);
  if (hour > closingHour) return false;
  if (hour === closingHour && minute >= closingMinute) return false;
  return true;
}

function getAvailableTimes(dateStr: string, bookedTimes: Set<string>, availableHours: string[], closingHour: number, closingMinute: number): string[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  
  // ✅ إذا كان المستخدم هو المطور، يظهر له جميع الأوقات المتاحة (لا يخضع للوقت الفائت)
  // لكن لا يزال يخضع للحجوزات المحجوزة
  return availableHours.filter((time) => {
    if (bookedTimes.has(time)) return false;
    if (!isWithinWorkingHours(time, closingHour, closingMinute)) return false;
    // للمستخدمين العاديين فقط: منع الأوقات الفائتة
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
// ===== توليد بطاقة الحجز الفاخرة (SVG -> PNG) =====
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

    const qrData = `RESERVATION:${booking.code}|CLINIC:${booking.clinicName}|PATIENT:${booking.patientName}|DATE:${booking.date} ${booking.time}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrData)}`;

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

    // ✅ تصميم بطاقة احترافي مستوحى من سند الدفع
    const svg = `
    <svg width="800" height="950" viewBox="0 0 800 950" xmlns="http://www.w3.org/2000/svg" xml:lang="ar">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#059669"/>
          <stop offset="50%" stop-color="#0d9488"/>
          <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.3"/>
        </filter>
      </defs>

      <rect width="800" height="950" fill="url(#bgGrad)"/>
      <circle cx="700" cy="100" r="250" fill="#059669" opacity="0.08"/>
      <circle cx="100" cy="850" r="200" fill="#0284c7" opacity="0.08"/>

      <g filter="url(#shadow)">
        <rect x="40" y="50" width="720" height="830" rx="28" fill="#ffffff"/>
      </g>

      <!-- Header -->
      <path d="M 40 78 C 40 62.538 52.538 50 68 50 L 732 50 C 747.462 50 760 62.538 760 78 L 760 180 L 40 180 Z" fill="url(#headerGrad)"/>

      ${logoBase64 ? `
        <image x="70" y="75" width="80" height="80" href="${logoBase64}" preserveAspectRatio="xMidYMid slice" style="border-radius:12px;"/>
      ` : `
        <rect x="70" y="75" width="80" height="80" rx="16" fill="rgba(255,255,255,0.2)"/>
        <text x="110" y="130" font-family="Cairo, Arial, sans-serif" font-size="40" fill="#ffffff" text-anchor="middle">🏥</text>
      `}

      <text x="175" y="110" font-family="Cairo, Arial, sans-serif" font-size="26" font-weight="bold" fill="#ffffff" text-anchor="start">${booking.clinicName}</text>
      <text x="175" y="145" font-family="Cairo, Arial, sans-serif" font-size="16" fill="rgba(255,255,255,0.85)" text-anchor="start">
        ${booking.doctorName ? `تحت إشراف د. ${booking.doctorName}` : 'بطاقة حجز موعد طبي مؤكد'}
      </text>

      <rect x="570" y="85" width="140" height="40" rx="20" fill="rgba(255,255,255,0.25)"/>
      <text x="640" y="111" font-family="Cairo, Arial, sans-serif" font-size="15" font-weight="bold" fill="#ffffff" text-anchor="middle">مؤكد ✓</text>

      <!-- تفاصيل البطاقة -->
      <g font-family="Cairo, Arial, sans-serif">
        <text x="720" y="235" font-size="14" fill="#64748b" text-anchor="end">اسم المريض الصريح</text>
        <text x="720" y="270" font-size="24" font-weight="bold" fill="#0f172a" text-anchor="end">${booking.patientName}</text>
        <line x1="80" y1="295" x2="720" y2="295" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6,6"/>

        <text x="720" y="330" font-size="14" fill="#64748b" text-anchor="end">رقم الهاتف للتواصل</text>
        <text x="720" y="365" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="end" direction="ltr">${booking.patientPhone}</text>
        <line x1="80" y1="390" x2="720" y2="390" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6,6"/>

        <text x="720" y="425" font-size="14" fill="#64748b" text-anchor="end">الخدمة الطبية المطلوبة</text>
        <text x="720" y="460" font-size="22" font-weight="bold" fill="#059669" text-anchor="end">${booking.serviceName}</text>
        <line x1="80" y1="485" x2="720" y2="485" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6,6"/>

        <!-- التاريخ والوقت -->
        <g>
          <rect x="420" y="510" width="300" height="80" rx="14" fill="#f8fafc"/>
          <text x="700" y="540" font-size="13" fill="#64748b" text-anchor="end">📅 تاريخ الموعد</text>
          <text x="700" y="572" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="end">${booking.date}</text>

          <rect x="80" y="510" width="300" height="80" rx="14" fill="#f8fafc"/>
          <text x="360" y="540" font-size="13" fill="#64748b" text-anchor="end">⏰ الوقت المكتمل</text>
          <text x="360" y="572" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="end">${booking.time}</text>
        </g>

        <!-- كود الحجز (بارز) -->
        <rect x="80" y="615" width="640" height="60" rx="16" fill="url(#goldGrad)"/>
        <text x="400" y="653" font-size="24" font-weight="bold" fill="#ffffff" text-anchor="middle">
          كود الحجز المباشر: ${booking.code}
        </text>

        <!-- QR Code -->
        ${qrBase64 ? `
          <g>
            <rect x="300" y="695" width="200" height="100" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
            <image x="340" y="700" width="120" height="90" href="${qrBase64}"/>
          </g>
        ` : ''}
      </g>

      <!-- تذييل -->
      <text x="400" y="840" font-family="Cairo, Arial, sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" text-anchor="middle">
        Smart Clinic System — نظام إدارة العيادات الذكي
      </text>
      <text x="400" y="868" font-family="Cairo, Arial, sans-serif" font-size="12" fill="#38bdf8" text-anchor="middle">
        alkhyatalkhyat79@gmail.com
      </text>
    </svg>
    `;

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 800 } });
    const pngData = resvg.render();
    return pngData.asPng();
  } catch (e) {
    console.error('Error generating luxury card:', e);
    return null;
  }
}

// ============================================================
// ===== نظام TTS متعدد المستويات =====
// ============================================================

async function generateSpeech(text: string): Promise<{ audio: Uint8Array; source: string } | null> {
  const cleanText = stripEmojis(text).trim();
  if (!cleanText) return null;

  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (ELEVENLABS_API_KEY) {
    try {
      const result = await generateWithElevenLabs(cleanText, ELEVENLABS_API_KEY);
      if (result) return { audio: result, source: 'ElevenLabs' };
    } catch (e) { console.error('ElevenLabs failed:', e); }
  }

  const GOOGLE_TTS_API_KEY = Deno.env.get('GOOGLE_TTS_API_KEY');
  if (GOOGLE_TTS_API_KEY) {
    try {
      const result = await generateWithGoogleTTS(cleanText, GOOGLE_TTS_API_KEY);
      if (result) return { audio: result, source: 'Google Cloud TTS' };
    } catch (e) { console.error('Google Cloud TTS failed:', e); }
  }

  try {
    const result = await generateWithGTTS(cleanText);
    if (result) return { audio: result, source: 'gTTS (Free)' };
  } catch (e) { console.error('gTTS failed:', e); }

  return null;
}

async function generateWithElevenLabs(text: string, apiKey: string): Promise<Uint8Array | null> {
  const response = await fetchWithTimeout('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  }, 15000);

  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

async function generateWithGoogleTTS(text: string, apiKey: string): Promise<Uint8Array | null> {
  const response = await fetchWithTimeout(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: text },
        voice: { languageCode: 'ar-XA', name: 'ar-XA-Wavenet-D', ssmlGender: 'FEMALE' },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    },
    15000
  );

  if (!response.ok) return null;
  const result = await response.json();
  if (!result?.audioContent) return null;
  return Uint8Array.from(atob(result.audioContent), c => c.charCodeAt(0));
}

async function generateWithGTTS(text: string): Promise<Uint8Array | null> {
  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.match(/[^.!؟\n]+[.!؟\n]*/g) || [text];
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > 100) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  if (chunks.length === 0) return null;

  try {
    const audioParts: Uint8Array[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(chunk)}&textlen=${chunk.length}&idx=${i}&total=${chunks.length}`;
      const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://translate.google.com/' } }, 10000);
      if (!response.ok) continue;
      audioParts.push(new Uint8Array(await response.arrayBuffer()));
    }
    if (audioParts.length === 0) return null;
    const totalLength = audioParts.reduce((sum, part) => sum + part.length, 0);
    const mergedAudio = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of audioParts) {
      mergedAudio.set(part, offset);
      offset += part.length;
    }
    return mergedAudio;
  } catch (e) {
    return null;
  }
}

// ============================================================
// ===== دوال الذكاء الاصطناعي =====
// ============================================================

async function callAI(userMessage: string, userName: string, clinicContext: string, tone = 'ودود ومحترم'): Promise<string | null> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) return null;

  const isEnglish = /[a-zA-Z]/.test(userMessage) && !/[\u0600-\u06FF]/.test(userMessage);

  try {
    const systemPrompt = isEnglish ? `
You are a warm, polite, and professional medical receptionist at a clinic.
${clinicContext}
Strict rules:
- Be natural, friendly, and human-like. Never mention you are an AI.
- Do NOT mention prices or fees unless explicitly asked by the patient.
- Do NOT use emojis or special symbol decorations.
- Keep replies concise (2 to 4 sentences).
- End by inviting the user to use the action buttons: "Book Appointment", "Services", "My Appointments", or "Cancel Appointment".
- Never give medical diagnoses or prescriptions.
- Patient Name: ${userName}.
` : `
أنت مساعد شخصي ودود ومحترم، تعمل كموظف استقبال في عيادة طبية.
${clinicContext}
تعليمات مهمة جداً (التزم بها 100%):
- أسلوبك: طبيعي وإنساني ودافئ جداً. لا تذكر أنك بوت أو روبوت.
- لا تذكر الأسعار أو التكاليف أو العملات أبداً إلا إذا سألك المريض مباشرة عن السعر.
- لا تستخدم أي رموز تعبيرية (إيموجي) أو علامات زخرفية.
- لا تستخدم التنوين أو علامات التشكيل.
- ردودك مختصرة ومفيدة (جملتين إلى أربع جمل).
- في نهاية الرد، ادعُ المستخدم لاستخدام الأزرار: «حجز موعد» أو «الخدمات» أو «مواعيدي» أو «إلغاء موعد».
- لا تقدم تشخيصاً طبياً أو وصفات دواء.
- اسم المستخدم: ${userName}.`;

    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    }, 10000);

    if (!response.ok) return null;
    const result = await response.json();
    return result?.choices?.[0]?.message?.content || null;
  } catch (e) {
    return null;
  }
}

// ============================================================
// ===== دوال الصوت (تحويل الصوت إلى نص) =====
// ============================================================

async function transcribeTelegramVoice(botToken: string, fileId: string): Promise<string | null> {
  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
  if (GROQ_API_KEY) {
    try {
      const result = await transcribeWithGroq(botToken, fileId, GROQ_API_KEY);
      if (result) return result;
    } catch (_) {}
  }

  const HF_API_KEY = Deno.env.get('HUGGINGFACE_API_KEY');
  if (HF_API_KEY) {
    try {
      return await transcribeWithHuggingFace(botToken, fileId, HF_API_KEY);
    } catch (_) {}
  }

  return null;
}

async function transcribeWithGroq(botToken: string, fileId: string, apiKey: string): Promise<string | null> {
  try {
    const fileRes = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    }, 5000);
    const fileData = await fileRes.json();
    const filePath = fileData?.result?.file_path;
    if (!filePath) return null;

    const audioRes = await fetchWithTimeout(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {}, 5000);
    if (!audioRes.ok) return null;
    const audioBlob = await audioRes.blob();

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'json');

    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    }, 15000);

    if (!response.ok) return null;
    const result = await response.json();
    return result?.text?.trim() || null;
  } catch (_) {
    return null;
  }
}

async function transcribeWithHuggingFace(botToken: string, fileId: string, apiKey: string): Promise<string | null> {
  try {
    const fileRes = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    }, 5000);
    const fileData = await fileRes.json();
    const filePath = fileData?.result?.file_path;
    if (!filePath) return null;

    const audioRes = await fetchWithTimeout(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {}, 5000);
    if (!audioRes.ok) return null;
    const audioBuffer = await audioRes.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    const response = await fetchWithTimeout('https://api-inference.huggingface.co/models/openai/whisper-small', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: Array.from(audioBytes) }),
    }, 15000);

    if (!response.ok) return null;
    const result = await response.json();
    return result?.text?.trim() || null;
  } catch (_) {
    return null;
  }
}

async function sendVoiceReply(botToken: string, chatId: number, htmlText: string): Promise<boolean> {
  const cleanText = stripEmojis(htmlText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')).trim();
  if (!cleanText) return false;

  const result = await generateSpeech(cleanText);
  if (!result) return false;

  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('title', 'رد صوتي من العيادة');
  fd.append('audio', new Blob([result.audio], { type: 'audio/mpeg' }), 'reply.mp3');

  const res = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendAudio`, {
    method: 'POST',
    body: fd,
  }, 15000);

  const j = await res.json();
  return !!j?.ok;
}

// ============================================================
// ===== الدالة الرئيسية =====
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

    // ─── معالجة إرسال السند من الكاشير ───
    if (action === 'send_receipt') {
      const { clinic_id, chat_id, receipt_image, reservation_code, patient_name, service_name, amount, clinic_name } = rawBody;
      
      if (!chat_id || !receipt_image) {
        return jsonResponse({ ok: false, error: 'بيانات غير مكتملة' }, 400);
      }

      try {
        const base64Data = receipt_image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        const botToken = await getBotTokenForClinic(supabase, clinic_id);
        if (!botToken) {
          return jsonResponse({ ok: false, error: 'البوت غير مهيأ' }, 400);
        }

        const fd = new FormData();
        fd.append('chat_id', String(chat_id));
        fd.append('photo', new Blob([imageBuffer], { type: 'image/png' }), `receipt_${reservation_code}.png`);
        fd.append('caption', 
          `🧾 <b>سند دفع رسمي</b>\n` +
          `━━━━━━━━━━━━━━━\n` +
          `🏥 ${clinic_name || 'العيادة الطبية'}\n` +
          `👤 المريض: ${patient_name || 'غير محدد'}\n` +
          `💊 الخدمة: ${service_name || 'فحص طبي'}\n` +
          `💰 المبلغ: ${amount || 0} ر.ي\n` +
          `🔖 كود الحجز: ${reservation_code || '—'}\n` +
          `━━━━━━━━━━━━━━━\n` +
          `✅ تم الدفع بنجاح\n` +
          `📅 ${new Date().toLocaleDateString('ar-SA')}`
        );
        fd.append('parse_mode', 'HTML');

        const res = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          body: fd,
        }, 15000);

        const result = await res.json();
        if (result?.ok) {
          return jsonResponse({ ok: true, result });
        } else {
          return jsonResponse({ ok: false, error: result?.description }, 400);
        }
      } catch (error) {
        console.error('send_receipt error:', error);
        return jsonResponse({ ok: false, error: String(error) }, 500);
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
      try {
        const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const me = await meRes.json();
        const username = me?.result?.username;
        if (username && clinicIdForCache) {
          await supabase.from('clinics').update({ bot_username: username }).eq('id', clinicIdForCache);
        }
      } catch (_) {}
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
    const messageType = message.voice ? 'voice' : 'text';
    let transcript: string | null = null;

    const botToken = await getBotTokenForClinic(supabase, requestClinicId);
    if (!botToken) return jsonResponse({ ok: true });
    const send = (cId: number, txt: string, markup?: any) => sendMessage(botToken, cId, txt, markup);

    if (message.voice) {
      transcript = await transcribeTelegramVoice(botToken, message.voice.file_id);
      text = (transcript || '').trim();
      if (!text) {
        await send(chatId, '⚠️ لم أتمكن من فهم الرسالة الصوتية. أرسلها مرة أخرى أو اكتب طلبك نصياً.');
        return jsonResponse({ ok: true });
      }
    }

    const linkedClinicId = await getUserClinicId(supabase, telegramUserId);
    await logConversation(supabase, linkedClinicId, telegramUserId, String(chatId), 'incoming', messageType, message.text || null, transcript, null, 'ok', update);

    const isMainMenu = isBookingIntent(text) || isServicesIntent(text) || isAppointmentsIntent(text) || isCancelIntent(text);

    if (linkedClinicId && text && !text.startsWith('/') && detectEmergency(text)) {
      await clearSession(supabase, telegramUserId);
      await handleEmergency(supabase, botToken, linkedClinicId, telegramUserId, String(chatId), firstName, text);
      await send(chatId, '🚨 تم تصنيف رسالتك كحالة طارئة وتم إرسال تنبيه فوري للطبيب. إذا كانت الحالة حرجة اتصل بالإسعاف.');
      return jsonResponse({ ok: true });
    }

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

      if (param && param.startsWith('link_')) {
        const ownerId = param.replace('link_', '');
        const { data: clinicOwned } = await supabase.from('clinics').select('id, name').eq('owner_id', ownerId).maybeSingle();
        if (!clinicOwned) { await send(chatId, '❌ رابط الربط غير صالح.'); return jsonResponse({ ok: true }); }
        const { error: upErr } = await supabase.from('profiles').update({ phone: `tg:${telegramUserId}` }).eq('user_id', ownerId);
        await send(chatId, upErr ? '⚠️ حدث خطأ أثناء الربط.' :
          `✅ <b>تم ربط حسابك بنجاح!</b>\n\n🏥 العيادة: ${clinicOwned.name}\n\n🔔 ستصلك الآن إشعارات فورية بكل حجز جديد.`);
        return jsonResponse({ ok: true });
      }

      const clinicId = extractClinicId(param);
      if (clinicId) {
        const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', clinicId).single();
        if (!clinic) { await send(chatId, '❌ رابط العيادة غير صحيح.'); return jsonResponse({ ok: true }); }
        const { data: sub } = await supabase.from('subscriptions').select('status, is_active, trial_ends_at').eq('clinic_id', clinicId).single();
        if (!isSubscriptionUsable(sub)) { await send(chatId, '⚠️ هذه العيادة غير نشطة حالياً.'); return jsonResponse({ ok: true }); }

        const { data: existing } = await supabase.from('patients').select('id').eq('clinic_id', clinicId).eq('telegram_user_id', telegramUserId).maybeSingle();
        if (!existing) {
          await supabase.from('patients').insert({ clinic_id: clinicId, name: firstName, phone: `tg:${telegramUserId}`, telegram_user_id: telegramUserId });
        } else {
          await supabase.from('patients').update({ created_at: new Date().toISOString() }).eq('id', existing.id);
        }
        await clearSession(supabase, telegramUserId);
        await send(chatId,
          `🏥 <b>مرحباً ${firstName} في ${clinic.name}</b>\n\n` +
          (clinic.description ? `${clinic.description}\n\n` : '') +
          `للحجز اضغط زر «📅 حجز موعد» أو زر «🔍 الخدمات».`,
          defaultKeyboard()
        );
        return jsonResponse({ ok: true });
      }

      if (param && !clinicId) {
        await send(chatId, '⚠️ رابط العيادة غير معروف.');
        return jsonResponse({ ok: true });
      }

      if (linkedClinicId) {
        const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', linkedClinicId).single();
        if (clinic) {
          await send(chatId,
            `🏥 <b>مرحباً ${firstName} في ${clinic.name}</b>\n\n` +
            `للحجز اضغط زر «📅 حجز موعد» أو زر «🔍 الخخدمات».`,
            defaultKeyboard()
          );
          return jsonResponse({ ok: true });
        }
      }
      await send(chatId,
        `🏥 <b>مرحباً ${firstName} في Smart Clinic</b>\n\n` +
        `للحجز افتح رابط العيادة الذي أرسلته لك.`,
        defaultKeyboard()
      );
      return jsonResponse({ ok: true });
    }

    if (isBookingIntent(text) || isServicesIntent(text)) {
      if (!linkedClinicId) {
        await send(chatId, '⚠️ افتح رابط الحجز الخاص بالعيادة أولاً.');
        return jsonResponse({ ok: true });
      }
      const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', linkedClinicId).single();
      if (clinic) await sendServicesMenu(supabase, send, chatId, clinic, linkedClinicId, firstName);
      else await send(chatId, '❌ العيادة غير موجودة.');
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
          if (a.services?.name) msg += `   🏷 ${a.services.name}\n`;
          msg += `   🔖 كود: <code>${a.reservation_code}</code>\n\n`;
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
      } else await send(chatId, '📭 لا توجد مواعيد لإلغائها.');
      return jsonResponse({ ok: true });
    }

    if (text.match(/^RE-\d{4}$/i)) {
      const { data: appointment } = await supabase.from('appointments').update({ status: 'cancelled' })
        .eq('reservation_code', text.toUpperCase()).eq('customer_telegram_id', telegramUserId)
        .in('status', ['pending', 'confirmed']).select().single();
      await send(chatId, appointment ?
        `✅ <b>تم إلغاء الموعد</b>\n📅 ${appointment.date} ⏰ ${appointment.time}\n🔖 ${appointment.reservation_code}` :
        '⚠️ لم يتم العثور على الموعد.');
      return jsonResponse({ ok: true });
    }

    if (linkedClinicId) {
      const { data: clinic } = await supabase.from('clinics').select('name, type, description, doctor_name, working_hours, voice_agent_enabled, voice_tone, voice_mode').eq('id', linkedClinicId).single();
      const { data: services } = await supabase.from('services').select('name, price, duration_minutes').eq('clinic_id', linkedClinicId).eq('is_active', true);
      let ctx = '';
      if (clinic) {
        ctx = `\nاسم العيادة: ${clinic.name}`;
        if (clinic.doctor_name) ctx += `\nالطبيب المشرف: د. ${clinic.doctor_name}`;
        if (clinic.description) ctx += `\nالوصف: ${clinic.description}`;
        if (services?.length) ctx += `\nالخدمات المتاحة: ${services.map((s: any) => `${s.name}`).join('، ')}`;
      }
      const tone = (clinic as any)?.voice_tone || 'ودود ومحترم';
      const aiResponse = await callAI(text, firstName, ctx, tone);
      if (aiResponse) {
        const cleanResponse = stripEmojis(aiResponse);
        const mode = (clinic as any)?.voice_mode || 'auto';
        const useVoice = (clinic as any)?.voice_agent_enabled && mode !== 'text' && (mode === 'voice' || Math.random() < 0.5);
        let voiceOk = false;
        if (useVoice) {
          voiceOk = await sendVoiceReply(botToken, chatId, cleanResponse);
        }
        if (!useVoice || !voiceOk) {
          await send(chatId, cleanResponse, defaultKeyboard());
        }
        await logConversation(supabase, linkedClinicId, telegramUserId, String(chatId), 'outgoing', useVoice && voiceOk ? 'ai_voice' : 'ai_response', null, null, cleanResponse, 'ok', null);
        return jsonResponse({ ok: true });
      }
    }

    await send(chatId, `🤖 كيف يمكنني مساعدتك؟ استخدم الأزرار أدناه للبدء.`, defaultKeyboard());
    return jsonResponse({ ok: true });

  } catch (error) {
    console.error('Telegram bot error:', error);
    return jsonResponse({ ok: true });
  }
});

// ============================================================
// ===== دوال جلسات الحجز وإدارة التدفق =====
// ============================================================

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

// ✅ دوال خاصة بساعات الدوام والمطور
async function getClinicHours(supabase: any, clinicId: string, tgId: string) {
  const isDev = tgId === DEV_TELEGRAM_ID;
  const hours = await getClinicWorkingHours(supabase, clinicId);
  
  // إذا كان المطور، نضيف جميع الأوقات الممكنة (بدون قيود)
  if (isDev) {
    const allHours: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        allHours.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return {
      availableHours: allHours,
      closingHour: 23,
      closingMinute: 59,
      isDev: true,
      openTime: '00:00',
      closeTime: '23:59'
    };
  }
  
  return {
    ...hours,
    isDev: false
  };
}

async function sendServicesMenu(supabase: any, send: any, chatId: number, clinic: any, clinicId: string, firstName: string, tgId: string) {
  const { data: services } = await supabase.from('services')
    .select('id, name, price, duration_minutes')
    .eq('clinic_id', clinicId).eq('is_active', true).order('name');

  const doctorLine = clinic.doctor_name ? `تحت إشراف د. <b>${clinic.doctor_name}</b>\n` : '';
  let msg = `🏥 أهلاً وسهلاً ${firstName} في <b>${clinic.name}</b>\n${doctorLine}`;
  if (clinic.description) msg += `📝 ${clinic.description}\n`;

  // إضافة معلومات ساعات الدوام للمستخدم العادي
  const isDev = tgId === DEV_TELEGRAM_ID;
  if (!isDev) {
    const hours = await getClinicWorkingHours(supabase, clinicId);
    msg += `\n🕐 ساعات العمل: ${hours.openTime} - ${hours.closeTime}\n`;
  } else {
    msg += `\n🛠️ وضع التطوير: جميع الأوقات متاحة\n`;
  }

  if (services && services.length > 0) {
    msg += `\n📋 <b>اختر الخدمة التي تريد حجزها:</b>\n\n`;
    const buttons: any[][] = [];
    services.forEach((s: any, i: number) => {
      const priceLabel = (s.price === null || s.price === undefined) ? 'حسب الفحص' : `${s.price} ر.ي`;
      msg += `${i + 1}. ${s.name} — ${priceLabel} (${s.duration_minutes || 30} دقيقة)\n`;
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
    const { availableHours, closeTime } = await getClinicHours(supabase, session.clinic_id, tgId);
    const today = new Date();
    const buttons: any[][] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('ar-SA', { weekday: 'long' });
      const label = i === 0 ? `اليوم (${iso})` : i === 1 ? `غداً (${iso})` : `${dayName} (${iso})`;
      buttons.push([{ text: `📅 ${label}`, callback_data: `date_${iso}` }]);
    }
    await send(chatId, `✅ تم حفظ الرقم.\n\n📅 اختر تاريخ الموعد (حتى 10 أيام قادمة):`, { inline_keyboard: buttons });
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
    await send(chatId, '⚠️ لا يمكن الحجز في تاريخ مضى. اختر تاريخاً مستقبلياً:', { inline_keyboard: nextDaysButtons() });
    return true;
  }

  const { availableHours, closingHour, closingMinute, isDev } = await getClinicHours(supabase, session.clinic_id, tgId);

  // جلب الحجوزات المحجوزة
  const { data: existing } = await supabase.from('appointments').select('time')
    .eq('clinic_id', session.clinic_id).eq('date', dateStr).in('status', ['pending', 'confirmed']);
  const booked = new Set((existing || []).map((a: any) => String(a.time).slice(0, 5)));

  // حساب الأوقات المتاحة
  let free = getAvailableTimes(dateStr, booked, availableHours, closingHour, closingMinute);

  // ✅ استثناء المطور: إذا كان مطوراً وليس هناك أوقات متاحة، نعرض جميع الأوقات المتاحة (حتى المحجوزة للتجريب)
  if (isDev && free.length === 0) {
    free = availableHours;
  }

  if (free.length === 0) {
    const { data: clinicRow } = await supabase.from('clinics').select('phone, name, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
    const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
    const waText = encodeURIComponent(`مرحباً، أريد استفسار عن مواعيد متاحة في ${clinicRow?.name || 'العيادة'}`);
    const waBtn = waNum ? [[{ text: '💬 تواصل مع موظف الاستقبال', url: `https://wa.me/${waNum}?text=${waText}` }]] : [];

    await send(chatId,
      `⚠️ <b>لا توجد أوقات متاحة في هذا اليوم</b>\n\n` +
      `جميع الأوقات محجوزة أو انتهى الدوام الرسمي.\n` +
      (waNum ? `يمكنك التواصل مع موظف الاستقبال لحجز موعد استثنائي عبر الواتساب:\n` : ''),
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

function nextDaysButtons() {
  const buttons: any[][] = [];
  const today = new Date();
  let daysAdded = 0;
  let i = 0;
  while (daysAdded < 5 && i < 30) {
    i++;
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    if (!isPastDate(iso)) {
      const label = i === 1 ? `غداً (${iso})` : iso;
      buttons.push([{ text: `📅 ${label}`, callback_data: `date_${iso}` }]);
      daysAdded++;
    }
  }
  return buttons;
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
  return n === '/services' || n === 'الخدمات' || n === 'خدمات' || n === 'خدماتي' || n.includes('الخدمات') || n.includes('خدماتي');
}

function isAppointmentsIntent(text: string) {
  const n = normalizedText(text);
  return n === '/appointments' || n.includes('مواعيدي');
}

function isCancelIntent(text: string) {
  const n = normalizedText(text);
  return n === '/cancel' || n.includes('الغاء موعد');
}

function isSubscriptionUsable(sub: any) {
  if (!sub?.is_active) return false;
  if (sub.status === 'trial' && sub.trial_ends_at) {
    return new Date(sub.trial_ends_at).getTime() >= Date.now();
  }
  return sub.status !== 'expired';
}

async function finalizeBooking(supabase: any, send: any, chatId: number, tgId: string, firstName: string, session: any, time: string, botToken: string): Promise<boolean> {
  const isDev = tgId === DEV_TELEGRAM_ID;
  
  // ✅ استثناء المطور: لا يخضع لفحص الوقت الفائت
  if (!isDev && isPastTime(session.preferred_date, time)) {
    const { data: clinicRow } = await supabase.from('clinics').select('phone, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
    const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
    const waBtn = waNum ? [[{ text: '💬 تواصل مع موظف الاستقبال', url: `https://wa.me/${waNum}` }]] : [];
    await send(chatId,
      `⚠️ الوقت <b>${time}</b> فائت. اختر وقتاً آخر أو تواصل مع الاستقبال عبر الواتساب:`,
      waBtn.length ? { inline_keyboard: waBtn } : undefined
    );
    return true;
  }

  // فحص الحد الأقصى للحجوزات اليومية (3 مواعيد كحد أقصى) مع استثناء المطور
  const todayStr = new Date().toISOString().slice(0, 10);
  const { count: todayCount } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('customer_telegram_id', tgId)
    .eq('date', todayStr)
    .not('status', 'in', '(cancelled)');

  if (!isDev && (todayCount ?? 0) >= 3) {
    const { data: clinicRow } = await supabase.from('clinics').select('phone, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
    const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
    const waBtn = waNum ? [[{ text: '💬 تواصل مع الاستقبال لإضافة حجز', url: `https://wa.me/${waNum}` }]] : [];

    await send(chatId,
      '⚠️ لقد وصلت للحد الأقصى للحجوزات المتاحة تلقائياً اليوم (3 مواعيد).\n\nإذا كنت ترغب بحجز إضافي، يمكنك التواصل مباشرة مع موظف الاستقبال عبر الواتساب:',
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

  if (existingPatient) {
    patientId = existingPatient.id;
    await supabase.from('patients').update({ name: session.full_name, phone: session.phone }).eq('id', patientId);
  } else {
    const { data: np } = await supabase.from('patients')
      .insert({ clinic_id: session.clinic_id, name: session.full_name, phone: session.phone, telegram_user_id: tgId })
      .select('id').single();
    patientId = np!.id;
  }

  const { data: service } = await supabase.from('services').select('name, price').eq('id', session.service_id).single();
  const { data: clinicInfo } = await supabase.from('clinics').select('name, doctor_name, logo_url, receptionist_whatsapp, phone').eq('id', session.clinic_id).single();

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

  const waNum = (clinicInfo?.receptionist_whatsapp || clinicInfo?.phone || '').replace(/[^\d]/g, '');
  const waTextOther = encodeURIComponent(`مرحباً، أريد حجز موعد باسم شخص آخر في ${clinicInfo?.name || 'العيادة'} - خدمة: ${service?.name || ''}`);

  // ✅ زر "حجز باسم شخص آخر"
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

  // ✅ توليد بطاقة الحجز الفاخرة
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
    fd.append('caption', `📋 <b>بطاقة حجز موعد رسمي</b>\n🏥 ${clinicInfo?.name || ''}\n👤 ${storedName}\n🔖 ${code}\nبرجاء إبراز الكود عند الوصول إلى الاستقبال.`);
    fd.append('parse_mode', 'HTML');

    await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: fd }, 15000);
  }

  await notifyDoctor(supabase, botToken, session.clinic_id,
    `👤 ${storedName}\n📱 ${storedPhone}\n🏷 ${service?.name || ''}\n📅 ${session.preferred_date} ⏰ ${time}\n🔖 ${code}`);

  return true;
}

// ============================================================
// ===== معالجة Callback Queries (الأزرار التفاعلية) =====
// ============================================================

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

  // ✅ زر "سأحضر"
  if (data.startsWith('confirm_')) {
    const resCode = data.replace('confirm_', '');
    const { data: appointment, error } = await supabase
      .from('appointments')
      .update({ 
        status: 'confirmed', 
        confirmed_at: new Date().toISOString(),
        reminder_sent: true
      })
      .eq('reservation_code', resCode)
      .eq('customer_telegram_id', tgId)
      .in('status', ['pending', 'confirmed'])
      .select('date, time, reservation_code, clinic_id, patient_id')
      .single();

    if (appointment) {
      await send(chatId, 
        `✅ <b>تم تأكيد حضورك بنجاح!</b>\n\n` +
        `📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n` +
        `🔖 ${appointment.reservation_code}\n\n` +
        `بانتظارك في موعدك 🌷`
      );
      
      await notifyDoctor(supabase, botToken, appointment.clinic_id,
        `✅ <b>تأكيد حضور</b>\n👤 ${firstName}\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}`
      );
    } else {
      await send(chatId, '⚠️ لم يتم العثور على الموعد أو تم إلغاؤه مسبقاً.');
    }
    return jsonResponse({ ok: true });
  }

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
      for (let i = 0; i < 10; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const iso = d.toISOString().split('T')[0];
        const dayName = d.toLocaleDateString('ar-SA', { weekday: 'long' });
        const label = i === 0 ? `اليوم (${iso})` : i === 1 ? `غداً (${iso})` : `${dayName} (${iso})`;
        buttons.push([{ text: `📅 ${label}`, callback_data: `date_${iso}` }]);
      }
      await send(chatId,
        `أهلاً بعودتك ${existingPatient!.name} 🌷\n\nسنحجز لك خدمة <b>${service.name}</b> باسمك المسجَّل سابقاً.\n📱 الهاتف: <code>${existingPatient!.phone}</code>\n\n📅 اختر تاريخ الموعد (أو اكتب: إلغاء للإيقاف):`,
        { inline_keyboard: buttons });
      return jsonResponse({ ok: true });
    }

    await upsertSession(supabase, tgId, { clinic_id: service.clinic_id, service_id: service.id, step: 'ask_name', full_name: null, phone: null, preferred_date: null, preferred_time: null, is_third_party: false, booked_by_chat_id: null, phone_attempts: 0 });
    await send(chatId, `📋 لحجز <b>${service.name}</b>:\n\nأرسل أولاً <b>اسمك الصريح الكامل</b> من فضلك.\n\n(لإلغاء العملية في أي وقت اكتب: إلغاء)`);
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
      await notifyDoctor(supabase, botToken, appointment.clinic_id,
        `❌ <b>إلغاء موعد</b>\n👤 ${firstName}\n📅 ${appointment.date} ⏰ ${appointment.time}\n🔖 ${appointment.reservation_code}`);
    } else await send(chatId, '⚠️ لم يتم العثور على الموعد.');
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: true });
}

// ============================================================
// ===== دوال مساعدة عامة =====
// ============================================================

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

// ✅ إصلاح: قراءة التوكن من system_settings أولاً
async function getBotTokenForClinic(supabase: any, clinicId: string | null): Promise<string | null> {
  // 1. أولوية قصوى للتوكن الموحد من system_settings
  const { data: systemSettings } = await supabase
    .from('system_settings')
    .select('telegram_bot_token')
    .limit(1)
    .maybeSingle();
  
  if (systemSettings?.telegram_bot_token) {
    return systemSettings.telegram_bot_token;
  }

  // 2. محاولة قراءة من global_settings
  const { data: globalSettings } = await supabase
    .from('global_settings')
    .select('telegram_bot_token')
    .limit(1)
    .maybeSingle();
  
  if (globalSettings?.telegram_bot_token) {
    return globalSettings.telegram_bot_token;
  }

  // 3. توكن العيادة القديم
  if (clinicId) {
    const { data } = await supabase.from('clinics').select('bot_token').eq('id', clinicId).maybeSingle();
    if (data?.bot_token) return data.bot_token;
  }
  
  return Deno.env.get('TELEGRAM_BOT_TOKEN') || null;
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

async function notifyDoctor(supabase: any, botToken: string, clinicId: string, info: string, notificationType = 'booking', title = 'إشعار جديد') {
  try {
    const { data: clinic } = await supabase.from('clinics').select('owner_id, name').eq('id', clinicId).single();
    if (!clinic) return null;
    const { data: ownerProfile } = await supabase.from('profiles').select('phone').eq('user_id', clinic.owner_id).single();
    const { data: notification } = await supabase.from('telegram_notifications').insert({
      clinic_id: clinicId,
      recipient_chat_id: ownerProfile?.phone?.startsWith('tg:') ? ownerProfile.phone.replace('tg:', '') : null,
      notification_type: notificationType, title, message: info, status: 'pending',
    }).select('id').single();

    if (ownerProfile?.phone?.startsWith('tg:')) {
      const ownerTgId = ownerProfile.phone.replace('tg:', '');
      const result = await sendMessage(botToken, Number(ownerTgId), `🔔 <b>${title} - ${clinic.name}</b>\n\n${info}`);
      await supabase.from('telegram_notifications').update({
        status: result?.ok ? 'sent' : 'failed',
        telegram_message_id: result?.result?.message_id ? String(result.result.message_id) : null,
        error_message: result?.ok ? null : JSON.stringify(result),
        sent_at: result?.ok ? new Date().toISOString() : null,
      }).eq('id', notification?.id);
    }
    return notification?.id || null;
  } catch (e) { return null; }
}

function detectEmergency(text: string): boolean {
  const n = text.toLowerCase();
  const kw = ['طوارئ','اسعاف','إسعاف','نزيف','اختناق','لا يتنفس','ألم شديد','الم شديد','جلطة','إغماء','فقدان وعي','تشنج','تسمم'];
  return kw.some((k) => n.includes(k.toLowerCase()));
}

async function handleEmergency(supabase: any, botToken: string, clinicId: string, tgId: string, chatId: string, name: string, msg: string) {
  const notificationId = await notifyDoctor(supabase, botToken, clinicId,
    `🚨 <b>حالة طارئة محتملة</b>\n👤 ${name}\n💬 ${msg}\n📞 Telegram ID: ${tgId}`, 'emergency', 'تنبيه طوارئ عاجل');
  await supabase.from('emergency_events').insert({
    clinic_id: clinicId, telegram_user_id: tgId, chat_id: chatId, patient_name: name,
    message_text: msg, severity: 'urgent', status: 'notified', notification_id: notificationId,
  });
}

async function logConversation(supabase: any, clinicId: string | null, tgId: string, chatId: string, direction: string, messageType: string, messageText: string | null, transcript: string | null, aiResponse: string | null, status: string, rawUpdate: any) {
  if (!clinicId) return;
  await supabase.from('bot_conversations').insert({
    clinic_id: clinicId, telegram_user_id: tgId, chat_id: chatId, direction, message_type: messageType,
    message_text: messageText, transcript, ai_response: aiResponse, status,
    raw_update: rawUpdate || null,
  });
}

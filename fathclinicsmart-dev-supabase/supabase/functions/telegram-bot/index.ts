// 
// ============================================================
// Telegram Bot — SmartClinicFath (V6 - النسخة النهائية الشاملة)
// إصلاح جذري لمشكلة اسم المريض في كل الصفحات
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.4.1";
import satori from "https://esm.sh/satori@0.10.13";
import { html } from "https://esm.sh/satori-html@0.3.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEV_TELEGRAM_ID = "1303830148";
const SUPPORT_EMAIL = "alkhyatalkhyat79@gmail.com";

const AVAILABLE_HOURS = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'
];

let wasmInitialized = false;
async function ensureWasm() {
  if (!wasmInitialized) {
    try {
      await initWasm("https://unpkg.com/@resvg/resvg-wasm@2.4.1/index_bg.wasm");
      wasmInitialized = true;
    } catch (_) { wasmInitialized = true; }
  }
}

let cachedCairoFont: ArrayBuffer | null = null;
let cachedCairoRegularFont: ArrayBuffer | null = null;
let cachedRobotoFont: ArrayBuffer | null = null;
let cachedRobotoBoldFont: ArrayBuffer | null = null;

async function getCairoFont(): Promise<ArrayBuffer | null> {
  if (cachedCairoFont && cachedCairoFont.byteLength > 10000) return cachedCairoFont;
  const urls = [
    "https://cdn.jsdelivr.net/fontsource/fonts/cairo@latest/arabic-700-normal.ttf",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/static/Cairo-Bold.ttf"
  ];
  for (const u of urls) {
    try {
      const res = await fetchWithTimeout(u, {}, 8000);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 10000) { cachedCairoFont = buf; return cachedCairoFont; }
      }
    } catch (_) {}
  }
  return null;
}

async function getCairoRegularFont(): Promise<ArrayBuffer | null> {
  if (cachedCairoRegularFont && cachedCairoRegularFont.byteLength > 10000) return cachedCairoRegularFont;
  const urls = [
    "https://cdn.jsdelivr.net/fontsource/fonts/cairo@latest/arabic-400-normal.ttf",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/static/Cairo-Regular.ttf"
  ];
  for (const u of urls) {
    try {
      const res = await fetchWithTimeout(u, {}, 8000);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 10000) { cachedCairoRegularFont = buf; return cachedCairoRegularFont; }
      }
    } catch (_) {}
  }
  return null;
}

async function getRobotoFont(): Promise<ArrayBuffer | null> {
  if (cachedRobotoFont && cachedRobotoFont.byteLength > 5000) return cachedRobotoFont;
  try {
    const res = await fetchWithTimeout("https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-500-normal.ttf", {}, 8000);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 5000) { cachedRobotoFont = buf; return cachedRobotoFont; }
    }
  } catch (_) {}
  return null;
}

async function getRobotoBoldFont(): Promise<ArrayBuffer | null> {
  if (cachedRobotoBoldFont && cachedRobotoBoldFont.byteLength > 5000) return cachedRobotoBoldFont;
  try {
    const res = await fetchWithTimeout("https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-normal.ttf", {}, 8000);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 5000) { cachedRobotoBoldFont = buf; return cachedRobotoBoldFont; }
    }
  } catch (_) {}
  return null;
}

// ════════════════════════════════════════════════════════════
// ترجمة (للبطاقة فقط)
// ════════════════════════════════════════════════════════════

async function translateToEnglish(arabicText: string): Promise<string> {
  if (!arabicText) return arabicText;
  if (!/[\u0600-\u06FF]/.test(arabicText)) return arabicText;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(arabicText)}`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (res.ok) {
      const data = await res.json();
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        return String(data[0][0][0]).trim();
      }
    }
  } catch (_) {}
  return arabicText;
}

// ════════════════════════════════════════════════════════════
// التحقق من الأرقام
// ════════════════════════════════════════════════════════════

interface CountryRule {
  prefix: string;
  localLengths: number[];
  mobilePatterns: RegExp[];
}

const COUNTRY_RULES: Record<string, CountryRule> = {
  sa: { prefix: '966', localLengths: [9], mobilePatterns: [/^5\d{8}$/] },
  ye: { prefix: '967', localLengths: [9], mobilePatterns: [/^7[01378]\d{7}$/] },
  ae: { prefix: '971', localLengths: [9], mobilePatterns: [/^5\d{8}$/] },
  eg: { prefix: '20', localLengths: [10], mobilePatterns: [/^1[0125]\d{8}$/] },
  jo: { prefix: '962', localLengths: [9], mobilePatterns: [/^7[7-9]\d{7}$/] },
  lb: { prefix: '961', localLengths: [7, 8], mobilePatterns: [/^(3|70|71|76|78|79|81)\d{6,7}$/] },
  kw: { prefix: '965', localLengths: [8], mobilePatterns: [/^[569]\d{7}$/] },
  qa: { prefix: '974', localLengths: [8], mobilePatterns: [/^[3567]\d{7}$/] },
  bh: { prefix: '973', localLengths: [8], mobilePatterns: [/^[36]\d{7}$/] },
  om: { prefix: '968', localLengths: [8], mobilePatterns: [/^[79]\d{7}$/] },
  iq: { prefix: '964', localLengths: [10], mobilePatterns: [/^7[3-9]\d{8}$/] },
  sy: { prefix: '963', localLengths: [9], mobilePatterns: [/^9\d{8}$/] },
  ps: { prefix: '970', localLengths: [9], mobilePatterns: [/^5\d{8}$/] },
  dz: { prefix: '213', localLengths: [9], mobilePatterns: [/^[567]\d{8}$/] },
  ma: { prefix: '212', localLengths: [9], mobilePatterns: [/^[67]\d{8}$/] },
  tn: { prefix: '216', localLengths: [8], mobilePatterns: [/^[2459]\d{7}$/] },
  ly: { prefix: '218', localLengths: [9], mobilePatterns: [/^9\d{8}$/] },
  sd: { prefix: '249', localLengths: [9], mobilePatterns: [/^[19]\d{8}$/] },
  so: { prefix: '252', localLengths: [8, 9], mobilePatterns: [/^[679]\d{7,8}$/] },
  dj: { prefix: '253', localLengths: [8], mobilePatterns: [/^7\d{7}$/] },
  mr: { prefix: '222', localLengths: [8], mobilePatterns: [/^[234]\d{7}$/] },
};

function detectCountryAndValidate(raw: string): { ok: boolean; normalized?: string; error?: string } {
  if (!raw) return { ok: false, error: 'رقم فارغ' };
  let s = raw.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  const hasPlus = s.startsWith('+');
  const digitsOnly = s.replace(/[^0-9]/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return { ok: false, error: 'طول الرقم غير صحيح' };

  for (const [country, rule] of Object.entries(COUNTRY_RULES)) {
    if (digitsOnly.startsWith(rule.prefix)) {
      let localPart = digitsOnly.slice(rule.prefix.length);
      if (localPart.startsWith('0')) localPart = localPart.slice(1);
      if (rule.localLengths.includes(localPart.length)) {
        if (rule.mobilePatterns.some(pat => pat.test(localPart))) {
          return { ok: true, normalized: '+' + rule.prefix + localPart };
        }
      }
    }
  }

  if (!hasPlus) {
    let localCandidate = digitsOnly;
    if (localCandidate.startsWith('0')) localCandidate = localCandidate.slice(1);
    const matches: { country: string; prefix: string; local: string }[] = [];
    for (const [country, rule] of Object.entries(COUNTRY_RULES)) {
      if (rule.localLengths.includes(localCandidate.length)) {
        if (rule.mobilePatterns.some(pat => pat.test(localCandidate))) {
          matches.push({ country, prefix: rule.prefix, local: localCandidate });
        }
      }
    }
    if (matches.length >= 1) {
      const priority = ['sa', 'ye', 'ae', 'eg', 'jo', 'kw', 'qa', 'bh', 'om', 'iq'];
      for (const p of priority) {
        const found = matches.find(m => m.country === p);
        if (found) return { ok: true, normalized: '+' + found.prefix + found.local };
      }
      const first = matches[0];
      return { ok: true, normalized: '+' + first.prefix + first.local };
    }
  }

  return { ok: false, error: 'الرجاء إدخال رقم هاتف صحيح.' };
}

// ════════════════════════════════════════════════════════════
// دوال مساعدة
// ════════════════════════════════════════════════════════════

function isPastDate(dateStr: string): boolean {
  return dateStr < new Date().toISOString().slice(0, 10);
}

function isPastTime(dateStr: string, timeStr: string): boolean {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (dateStr < todayStr) return true;
  if (dateStr > todayStr) return false;
  const [h, m] = timeStr.split(':').map(Number);
  const td = new Date(now);
  td.setHours(h, m, 0, 0);
  return td <= now;
}

function isWithinWorkingHours(timeStr: string, start: string, end: string): boolean {
  const parseTime = (t: string) => {
    const parts = t.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  };
  const timeMin = parseTime(timeStr);
  const startMin = parseTime(start);
  const endMin = parseTime(end);
  return timeMin >= startMin && timeMin <= endMin;
}

function getAvailableTimes(dateStr: string, bookedTimes: Set<string>, start: string, end: string): string[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  return AVAILABLE_HOURS.filter(time => {
    if (bookedTimes.has(time)) return false;
    if (!isWithinWorkingHours(time, start, end)) return false;
    if (dateStr === todayStr) {
      const [hour, minute] = time.split(':').map(Number);
      const td = new Date(now);
      td.setHours(hour, minute, 0, 0);
      if (td <= now) return false;
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

// ════════════════════════════════════════════════════════════
// ✨ بطاقة الحجز الفاخرة (Satori + Fallback SVG)
// ════════════════════════════════════════════════════════════

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
    const cairoFont = await getCairoFont();
    const cairoRegular = await getCairoRegularFont();
    const robotoFont = await getRobotoFont();
    const robotoBoldFont = await getRobotoBoldFont();

    if (!robotoFont && !cairoFont) return null;

    let clinicNameEn = booking.clinicName;
    let doctorNameEn = booking.doctorName || '';
    let patientNameEn = booking.patientName;
    let serviceNameEn = booking.serviceName;
    try {
      const [c, d, p, s] = await Promise.all([
        translateToEnglish(booking.clinicName),
        booking.doctorName ? translateToEnglish(booking.doctorName) : Promise.resolve(''),
        translateToEnglish(booking.patientName),
        translateToEnglish(booking.serviceName),
      ]);
      clinicNameEn = c || booking.clinicName;
      doctorNameEn = d || (booking.doctorName || '');
      patientNameEn = p || booking.patientName;
      serviceNameEn = s || booking.serviceName;
    } catch (_) {}

    let formattedDate = booking.date;
    try {
      const d = new Date(booking.date);
      formattedDate = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) {}

    const qrData = `BOOKING:${booking.code}|CLINIC:${clinicNameEn}|PATIENT:${patientNameEn}|DATE:${booking.date} ${booking.time}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&color=0F172A&bgcolor=FFFFFF&margin=1&qzone=1`;
    let qrBase64 = "";
    try {
      const qrRes = await fetchWithTimeout(qrApiUrl, {}, 8000);
      if (qrRes.ok) {
        const qrBuf = await qrRes.arrayBuffer();
        qrBase64 = `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(qrBuf)))}`;
      }
    } catch (_) {}

    const qrImgHtml = qrBase64
      ? `<img src="${qrBase64}" width="130" height="130" style="border-radius: 10px; background: #ffffff; padding: 6px;" />`
      : `<div style="display: flex; background: #ffffff; width: 130px; height: 130px; border-radius: 10px; justify-content: center; align-items: center; color: #64748b; font-size: 12px; font-weight: 700;">QR</div>`;

    const subTitle = doctorNameEn ? `Under Supervision of Dr. ${doctorNameEn}` : 'Official Medical Appointment';

    const htmlTemplate = `
      <div style="display: flex; flex-direction: column; width: 900px; height: 1300px; background: linear-gradient(135deg, #0a1628 0%, #1a2b47 50%, #0a1628 100%); padding: 40px; font-family: 'Roboto'; box-sizing: border-box; justify-content: center; align-items: center;">
        <div style="display: flex; flex-direction: column; width: 820px; height: 1220px; background: linear-gradient(180deg, rgba(15,42,60,0.98) 0%, rgba(20,50,70,0.98) 100%); border-radius: 24px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.7); box-sizing: border-box; border: 1px solid rgba(255,255,255,0.08);">
          <div style="display: flex; flex-direction: column; background: linear-gradient(135deg, #065f46 0%, #047857 40%, #059669 100%); padding: 32px 40px; width: 100%; box-sizing: border-box;">
            <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%;">
              <div style="display: flex; flex-direction: row; align-items: center;">
                <div style="display: flex; background: rgba(255,255,255,0.95); width: 68px; height: 68px; border-radius: 14px; justify-content: center; align-items: center; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
                  <span style="font-size: 40px; color: #047857; font-weight: 900; line-height: 1;">+</span>
                </div>
                <div style="display: flex; flex-direction: column; margin-left: 18px;">
                  <span style="font-size: 10px; color: rgba(255,255,255,0.9); font-weight: 700; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 6px;">OFFICIAL BOOKING</span>
                  <span style="font-size: 30px; font-weight: 700; color: #ffffff; line-height: 1;">${clinicNameEn}</span>
                  <span style="font-size: 12px; color: rgba(255,255,255,0.85); font-weight: 500; margin-top: 6px;">${subTitle}</span>
                </div>
              </div>
              <div style="display: flex; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 100px; padding: 10px 20px; align-items: center;">
                <div style="display: flex; background: #10ff90; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px;"></div>
                <span style="font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 1px;">CONFIRMED</span>
              </div>
            </div>
          </div>

          <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; background: linear-gradient(90deg, rgba(30,50,70,0.6), rgba(40,60,80,0.6)); padding: 20px 40px; width: 100%; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 10px; color: rgba(255,255,255,0.6); font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Booking Reference</span>
              <span style="font-size: 12px; color: rgba(255,255,255,0.5); font-weight: 500; margin-top: 2px;">Keep this code safe</span>
            </div>
            <div style="display: flex; background: linear-gradient(135deg, #1e293b, #0f172a); padding: 10px 22px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
              <span style="font-size: 24px; font-weight: 700; color: #10ff90; letter-spacing: 3px; font-family: 'Roboto';">${booking.code}</span>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; padding: 30px 40px; flex: 1; width: 100%; box-sizing: border-box;">
            <div style="display: flex; flex-direction: column; margin-bottom: 20px;">
              <span style="font-size: 10px; color: #10ff90; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;">— PATIENT INFORMATION</span>
              <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; padding: 16px 22px; background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); border-radius: 12px; border-left: 3px solid #10ff90; margin-bottom: 8px;">
                <span style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.6);">Full Name</span>
                <span style="font-size: 19px; font-weight: 700; color: #ffffff;">${patientNameEn}</span>
              </div>
              <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; padding: 16px 22px; background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); border-radius: 12px; border-left: 3px solid #10ff90;">
                <span style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.6);">Phone Number</span>
                <span style="font-size: 17px; font-weight: 700; color: #ffffff; font-family: 'Roboto';">${booking.patientPhone}</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; margin-bottom: 20px;">
              <span style="font-size: 10px; color: #10ff90; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;">— MEDICAL SERVICE</span>
              <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; padding: 18px 22px; background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1)); border-radius: 12px; border-left: 3px solid #10ff90;">
                <span style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7);">Service</span>
                <span style="font-size: 19px; font-weight: 700; color: #10ff90;">${serviceNameEn}</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; margin-bottom: 22px;">
              <span style="font-size: 10px; color: #fbbf24; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;">— APPOINTMENT SCHEDULE</span>
              <div style="display: flex; flex-direction: column; padding: 22px 26px; background: linear-gradient(135deg, #78350f 0%, #a16207 50%, #ca8a04 100%); border-radius: 14px; border: 1px solid rgba(251,191,36,0.4); box-shadow: 0 8px 24px rgba(202,138,4,0.35);">
                <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <span style="font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.9); letter-spacing: 1px;">DATE</span>
                  <span style="font-size: 20px; font-weight: 700; color: #ffffff; font-family: 'Roboto';">${formattedDate}</span>
                </div>
                <div style="display: flex; width: 100%; height: 1px; background: rgba(255,255,255,0.2); margin: 4px 0 10px 0;"></div>
                <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
                  <span style="font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.9); letter-spacing: 1px;">TIME</span>
                  <span style="font-size: 34px; font-weight: 700; color: #fef3c7; font-family: 'Roboto'; letter-spacing: 2px;">${booking.time}</span>
                </div>
              </div>
            </div>

            <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; padding: 18px 22px; background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)); border-radius: 14px; border: 1px solid rgba(255,255,255,0.1);">
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 12px; font-weight: 700; color: #ffffff; letter-spacing: 1px; margin-bottom: 4px;">SCAN TO VERIFY</span>
                <span style="font-size: 10px; color: rgba(255,255,255,0.6); font-weight: 500; margin-bottom: 3px;">Digital verification code</span>
                <span style="font-size: 9px; color: rgba(255,255,255,0.5); font-weight: 600; font-family: 'Roboto';">${booking.code} | ${booking.patientPhone}</span>
                <span style="font-size: 11px; color: #10ff90; font-weight: 700; margin-top: 6px;">Present at reception</span>
              </div>
              ${qrImgHtml}
            </div>
          </div>

          <div style="display: flex; flex-direction: column; background: linear-gradient(90deg, #0a1628, #1a2b47); padding: 14px 40px; width: 100%; box-sizing: border-box; border-top: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 500;">${clinicNameEn} System 2026</span>
              <span style="font-size: 10px; color: rgba(16,255,144,0.7); font-weight: 700; letter-spacing: 1px;">DIGITALLY VERIFIED</span>
            </div>
            <div style="display: flex; flex-direction: row; justify-content: center; align-items: center; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.05);">
              <span style="font-size: 9px; color: rgba(255,255,255,0.4); font-weight: 500;">Technical Support: </span>
              <span style="font-size: 10px; color: #10ff90; font-weight: 700; font-family: 'Roboto'; margin-left: 4px;">${SUPPORT_EMAIL}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const fontList: any[] = [];
    if (robotoFont) fontList.push({ name: 'Roboto', data: robotoFont, weight: 500, style: 'normal' });
    if (robotoBoldFont) fontList.push({ name: 'Roboto', data: robotoBoldFont, weight: 700, style: 'normal' });
    if (cairoFont) fontList.push({ name: 'Cairo', data: cairoFont, weight: 700, style: 'normal' });
    if (cairoRegular) fontList.push({ name: 'Cairo', data: cairoRegular, weight: 400, style: 'normal' });

    if (fontList.length === 0) return null;

    const svg = await satori(html(htmlTemplate), { width: 900, height: 1300, fonts: fontList });
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 900 } });
    return resvg.render().asPng();
  } catch (e) {
    console.error('❌ خطأ توليد البطاقة:', e);
    return null;
  }
}

async function generateFallbackCard(booking: any): Promise<Uint8Array | null> {
  try {
    let clinicNameEn = booking.clinicName;
    let patientNameEn = booking.patientName;
    let serviceNameEn = booking.serviceName;
    try {
      const [c, p, s] = await Promise.all([
        translateToEnglish(booking.clinicName),
        translateToEnglish(booking.patientName),
        translateToEnglish(booking.serviceName),
      ]);
      clinicNameEn = c;
      patientNameEn = p;
      serviceNameEn = s;
    } catch (_) {}

    await ensureWasm();
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1300" viewBox="0 0 900 1300">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a1628"/><stop offset="100%" stop-color="#1a2b47"/>
    </linearGradient>
    <linearGradient id="header" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#065f46"/><stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#78350f"/><stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1300" fill="url(#bg)"/>
  <rect x="40" y="40" width="820" height="1220" rx="24" fill="#0f2a3c"/>
  <rect x="40" y="40" width="820" height="180" rx="24" fill="url(#header)"/>
  <rect x="40" y="180" width="820" height="40" fill="url(#header)"/>
  <rect x="80" y="80" width="68" height="68" rx="14" fill="white"/>
  <text x="114" y="128" font-family="sans-serif" font-size="44" font-weight="900" fill="#047857" text-anchor="middle">+</text>
  <text x="170" y="98" font-family="sans-serif" font-size="10" font-weight="700" fill="rgba(255,255,255,0.9)" letter-spacing="4">OFFICIAL BOOKING</text>
  <text x="170" y="130" font-family="sans-serif" font-size="28" font-weight="700" fill="white">${escapeXml(clinicNameEn)}</text>
  <text x="170" y="152" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.85)">Official Medical Appointment</text>
  <rect x="680" y="95" width="140" height="38" rx="19" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)"/>
  <circle cx="705" cy="114" r="4" fill="#10ff90"/>
  <text x="720" y="119" font-family="sans-serif" font-size="13" font-weight="700" fill="white">CONFIRMED</text>
  <rect x="40" y="240" width="820" height="70" fill="rgba(30,50,70,0.6)"/>
  <text x="80" y="270" font-family="sans-serif" font-size="10" font-weight="700" fill="rgba(255,255,255,0.6)" letter-spacing="2">BOOKING REFERENCE</text>
  <text x="80" y="290" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.5)">Keep this code safe</text>
  <rect x="640" y="255" width="180" height="42" rx="10" fill="#0f172a"/>
  <text x="730" y="284" font-family="monospace" font-size="24" font-weight="700" fill="#10ff90" text-anchor="middle" letter-spacing="3">${escapeXml(booking.code)}</text>
  <text x="80" y="360" font-family="sans-serif" font-size="10" font-weight="700" fill="#10ff90" letter-spacing="2">— PATIENT INFORMATION</text>
  <rect x="80" y="378" width="740" height="60" rx="12" fill="rgba(255,255,255,0.06)"/>
  <rect x="80" y="378" width="3" height="60" fill="#10ff90"/>
  <text x="102" y="415" font-family="sans-serif" font-size="13" font-weight="600" fill="rgba(255,255,255,0.6)">Full Name</text>
  <text x="800" y="415" font-family="sans-serif" font-size="19" font-weight="700" fill="white" text-anchor="end">${escapeXml(patientNameEn)}</text>
  <rect x="80" y="448" width="740" height="60" rx="12" fill="rgba(255,255,255,0.06)"/>
  <rect x="80" y="448" width="3" height="60" fill="#10ff90"/>
  <text x="102" y="485" font-family="sans-serif" font-size="13" font-weight="600" fill="rgba(255,255,255,0.6)">Phone Number</text>
  <text x="800" y="485" font-family="monospace" font-size="17" font-weight="700" fill="white" text-anchor="end">${escapeXml(booking.patientPhone)}</text>
  <text x="80" y="548" font-family="sans-serif" font-size="10" font-weight="700" fill="#10ff90" letter-spacing="2">— MEDICAL SERVICE</text>
  <rect x="80" y="566" width="740" height="65" rx="12" fill="rgba(16,185,129,0.15)"/>
  <rect x="80" y="566" width="3" height="65" fill="#10ff90"/>
  <text x="102" y="605" font-family="sans-serif" font-size="13" font-weight="600" fill="rgba(255,255,255,0.7)">Service</text>
  <text x="800" y="605" font-family="sans-serif" font-size="19" font-weight="700" fill="#10ff90" text-anchor="end">${escapeXml(serviceNameEn)}</text>
  <text x="80" y="671" font-family="sans-serif" font-size="10" font-weight="700" fill="#fbbf24" letter-spacing="2">— APPOINTMENT SCHEDULE</text>
  <rect x="80" y="689" width="740" height="140" rx="14" fill="url(#gold)"/>
  <text x="102" y="720" font-family="sans-serif" font-size="12" font-weight="700" fill="rgba(255,255,255,0.9)" letter-spacing="1">DATE</text>
  <text x="800" y="720" font-family="sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="end">${escapeXml(booking.date)}</text>
  <line x1="102" y1="745" x2="800" y2="745" stroke="rgba(255,255,255,0.2)"/>
  <text x="102" y="785" font-family="sans-serif" font-size="12" font-weight="700" fill="rgba(255,255,255,0.9)" letter-spacing="1">TIME</text>
  <text x="800" y="800" font-family="monospace" font-size="36" font-weight="700" fill="#fef3c7" text-anchor="end" letter-spacing="2">${escapeXml(booking.time)}</text>
  <rect x="80" y="860" width="740" height="180" rx="14" fill="rgba(255,255,255,0.06)"/>
  <text x="102" y="895" font-family="sans-serif" font-size="12" font-weight="700" fill="white" letter-spacing="1">SCAN TO VERIFY</text>
  <text x="102" y="915" font-family="sans-serif" font-size="10" fill="rgba(255,255,255,0.6)">Digital verification code</text>
  <text x="102" y="935" font-family="monospace" font-size="9" fill="rgba(255,255,255,0.5)">${escapeXml(booking.code)} | ${escapeXml(booking.patientPhone)}</text>
  <text x="102" y="960" font-family="sans-serif" font-size="11" font-weight="700" fill="#10ff90">Present at reception</text>
  <rect x="40" y="1180" width="820" height="80" fill="#0a1628"/>
  <text x="80" y="1215" font-family="sans-serif" font-size="10" fill="rgba(255,255,255,0.5)">${escapeXml(clinicNameEn)} System 2026</text>
  <text x="820" y="1215" font-family="sans-serif" font-size="10" font-weight="700" fill="rgba(16,255,144,0.7)" text-anchor="end" letter-spacing="1">DIGITALLY VERIFIED</text>
  <line x1="80" y1="1225" x2="820" y2="1225" stroke="rgba(255,255,255,0.05)"/>
  <text x="450" y="1250" font-family="sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">Technical Support: <tspan fill="#10ff90" font-weight="700">${escapeXml(SUPPORT_EMAIL)}</tspan></text>
</svg>`;
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 900 } });
    return resvg.render().asPng();
  } catch (e) {
    console.error('❌ فشل البطاقة البديلة:', e);
    return null;
  }
}

function escapeXml(text: string): string {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ════════════════════════════════════════════════════════════
// نظام الصوت
// ════════════════════════════════════════════════════════════

async function generateSpeech(text: string): Promise<{ audio: Uint8Array; source: string } | null> {
  const cleanText = stripEmojis(text).trim();
  if (!cleanText) return null;
  try {
    const chunks: string[] = [];
    let currentChunk = '';
    const sentences = cleanText.match(/[^.!؟\n]+[.!؟\n]*/g) || [cleanText];
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > 100) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else currentChunk += ' ' + sentence;
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    if (chunks.length === 0) return null;
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
    for (const part of audioParts) { mergedAudio.set(part, offset); offset += part.length; }
    return { audio: mergedAudio, source: 'gTTS' };
  } catch (_) { return null; }
}

async function sendVoiceReply(botToken: string, chatId: number, htmlText: string, title = 'رسالة صوتية'): Promise<boolean> {
  const cleanText = stripEmojis(htmlText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')).trim();
  if (!cleanText) return false;
  const result = await generateSpeech(cleanText);
  if (!result) return false;
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('title', title);
  fd.append('audio', new Blob([result.audio], { type: 'audio/mpeg' }), 'voice.mp3');
  const res = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendAudio`, { method: 'POST', body: fd }, 15000);
  const j = await res.json();
  return !!j?.ok;
}

// ════════════════════════════════════════════════════════════
// AI + Voice
// ════════════════════════════════════════════════════════════

async function callAI(userMessage: string, userName: string, clinicContext: string, tone = 'ودود ومحترم'): Promise<string | null> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) return null;
  try {
    const systemPrompt = `أنت مساعد شخصي ودود ومحترم، تعمل كموظف استقبال في عيادة طبية.
${clinicContext}
تعليمات: أسلوبك طبيعي وإنساني ودافئ. لا تذكر الأسعار إلا إذا سُئلت. لا إيموجي. ردود مختصرة. ادعُ لاستخدام الأزرار.
اسم المستخدم: ${userName}.`;
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        temperature: 0.7, max_tokens: 500,
      }),
    }, 10000);
    if (!response.ok) return null;
    const result = await response.json();
    return result?.choices?.[0]?.message?.content || null;
  } catch (_) { return null; }
}

async function transcribeTelegramVoice(botToken: string, fileId: string): Promise<string | null> {
  try {
    const fileRes = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    }, 5000);
    const fileData = await fileRes.json();
    const filePath = fileData?.result?.file_path;
    if (!filePath) return null;
    const audioRes = await fetchWithTimeout(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {}, 5000);
    if (!audioRes.ok) return null;
    const audioBlob = await audioRes.blob();
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (GROQ_API_KEY) {
      try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.ogg');
        formData.append('model', 'whisper-large-v3');
        formData.append('response_format', 'json');
        const response = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST', headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: formData,
        }, 15000);
        if (response.ok) {
          const result = await response.json();
          return result?.text?.trim() || null;
        }
      } catch (_) {}
    }
    return null;
  } catch (_) { return null; }
}

async function sendEmailNotification(supabase: any, clinicId: string, subject: string, message: string, recipientEmail?: string): Promise<boolean> {
  try {
    let email = recipientEmail;
    if (!email) {
      const { data: clinic } = await supabase.from('clinics').select('owner_id').eq('id', clinicId).single();
      if (clinic) {
        const { data: profile } = await supabase.from('profiles').select('email').eq('user_id', clinic.owner_id).single();
        if (profile?.email) email = profile.email;
      }
    }
    if (!email) return false;
    await supabase.from('email_notifications').insert({
      clinic_id: clinicId, recipient_email: email, subject, message,
      status: 'pending', created_at: new Date().toISOString(),
    });
    return true;
  } catch (_) { return false; }
}

// ════════════════════════════════════════════════════════════
// ✅ دالة مساعدة: تحديد أعمدة الجدول المتاحة (اكتشاف تلقائي)
// ════════════════════════════════════════════════════════════

async function detectTableColumns(supabase: any, tableName: string): Promise<Set<string>> {
  const cols = new Set<string>();
  try {
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    if (!error && data && data.length > 0) {
      Object.keys(data[0]).forEach(k => cols.add(k));
    }
  } catch (_) {}
  return cols;
}

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════

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

    if (action === 'send_receipt') {
      const { clinic_id, chat_id, receipt_image, reservation_code, patient_name, service_name, amount, clinic_name } = rawBody;
      if (!chat_id || !receipt_image) return jsonResponse({ ok: false, error: 'بيانات غير مكتملة' }, 400);
      try {
        const base64Data = receipt_image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const botToken = await getBotToken(supabase, clinic_id);
        if (!botToken) return jsonResponse({ ok: false, error: 'البوت غير مهيأ' }, 400);
        const fd = new FormData();
        fd.append('chat_id', String(chat_id));
        fd.append('photo', new Blob([imageBuffer], { type: 'image/png' }), `receipt_${reservation_code}.png`);
        fd.append('caption',
          `🧾 <b>سند دفع رسمي</b>\n━━━━━━━━━━━━━━━\n🏥 ${clinic_name || 'العيادة'}\n👤 المريض: ${patient_name || '—'}\n💊 الخدمة: ${service_name || '—'}\n💰 المبلغ: ${amount || 0} ر.ي\n🔖 كود: ${reservation_code || '—'}\n━━━━━━━━━━━━━━━\n✅ تم الدفع بنجاح\n📅 ${new Date().toLocaleDateString('ar-SA')}`
        );
        fd.append('parse_mode', 'HTML');
        const res = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: fd }, 15000);
        const result = await res.json();
        return result?.ok ? jsonResponse({ ok: true, result }) : jsonResponse({ ok: false, error: result?.description }, 400);
      } catch (error) {
        return jsonResponse({ ok: false, error: String(error) }, 500);
      }
    }

    if (action === 'set-webhook' || action === 'webhook-info' || action === 'bot-info') {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace('Bearer ', '');
      let botToken: string | null = null;
      let clinicIdForCache: string | null = null;
      if (jwt) {
        const { data: userData } = await supabase.auth.getUser(jwt);
        const uid = userData?.user?.id;
        if (uid) {
          const { data: c } = await supabase.from('clinics').select('id, bot_token').eq('owner_id', uid).maybeSingle();
          if (c?.bot_token) { botToken = c.bot_token; clinicIdForCache = c.id; }
        }
      }
      if (!botToken) botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || null;
      if (!botToken) return jsonResponse({ ok: false, error: 'لا يوجد توكن' }, 400);

      if (action === 'webhook-info') {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        return jsonResponse({ ok: true, info: await res.json() });
      }
      if (action === 'bot-info') {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const me = await res.json();
        const username = me?.result?.username || null;
        if (username && clinicIdForCache) await supabase.from('clinics').update({ bot_username: username }).eq('id', clinicIdForCache);
        return jsonResponse({ ok: !!me?.ok, username, raw: me });
      }
      const webhookUrl = `${supabaseUrl}/functions/v1/telegram-bot`;
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }),
      });
      const tgResult = await res.json();
      try {
        const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const me = await meRes.json();
        if (me?.result?.username && clinicIdForCache) await supabase.from('clinics').update({ bot_username: me.result.username }).eq('id', clinicIdForCache);
      } catch (_) {}
      return jsonResponse({ ok: !!tgResult?.ok, webhook: tgResult, webhookUrl });
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

    const botToken = await getBotToken(supabase, requestClinicId);
    if (!botToken) return jsonResponse({ ok: true });
    const send = (cId: number, txt: string, markup?: any) => sendMessage(botToken, cId, txt, markup);

    if (message.voice) {
      transcript = await transcribeTelegramVoice(botToken, message.voice.file_id);
      text = (transcript || '').trim();
      if (!text) {
        await send(chatId, '⚠️ لم أتمكن من فهم الرسالة الصوتية. أرسلها مرة أخرى.');
        return jsonResponse({ ok: true });
      }
    }

    const linkedClinicId = await getUserClinicId(supabase, telegramUserId);
    await logConversation(supabase, linkedClinicId, telegramUserId, String(chatId), 'incoming', messageType, message.text || null, transcript, null, 'ok', update);

    const isMainMenu = isBookingIntent(text) || isServicesIntent(text) || isAppointmentsIntent(text) || isCancelIntent(text);

    if (linkedClinicId && text && !text.startsWith('/') && detectEmergency(text)) {
      await clearSession(supabase, telegramUserId);
      await handleEmergency(supabase, botToken, linkedClinicId, telegramUserId, String(chatId), firstName, text);
      await send(chatId, '🚨 تم تصنيف رسالتك كحالة طارئة وتم إرسال تنبيه فوري للطبيب.');
      return jsonResponse({ ok: true });
    }

    const session = await getSession(supabase, telegramUserId);
    const looksLikeReCode = /^RE-\d{4}$/i.test(text.trim());
    if (session && session.step && session.step !== 'idle' && !text.startsWith('/') && !isMainMenu && !looksLikeReCode) {
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
        if (!clinicOwned) { await send(chatId, '❌ رابط غير صالح.'); return jsonResponse({ ok: true }); }
        const { error: upErr } = await supabase.from('profiles').update({ phone: `tg:${telegramUserId}` }).eq('user_id', ownerId);
        await send(chatId, upErr ? '⚠️ خطأ أثناء الربط.' :
          `✅ <b>تم ربط حسابك بنجاح!</b>\n\n🏥 ${clinicOwned.name}\n🔔 ستصلك إشعارات فورية.`);
        return jsonResponse({ ok: true });
      }

      const clinicId = extractClinicId(param);
      if (clinicId) {
        const { data: clinic } = await supabase.from('clinics').select(
          'id, name, type, description, doctor_name, working_hours_start, working_hours_end, receptionist_whatsapp, logo_url'
        ).eq('id', clinicId).single();
        if (!clinic) { await send(chatId, '❌ رابط غير صحيح.'); return jsonResponse({ ok: true }); }

        const { data: sub } = await supabase.from('subscriptions').select('status, is_active, trial_ends_at').eq('clinic_id', clinicId).single();
        if (!isSubscriptionUsable(sub)) {
          await send(chatId, '⚠️ الاشتراك منتهي. يرجى التواصل مع العيادة.');
          return jsonResponse({ ok: true });
        }

        // ✅ لا نُنشئ مريض هنا - سيتم إنشاؤه لاحقاً عند الحجز بالاسم الصحيح
        // فقط نحفظ ربط أولي
        const { data: existing } = await supabase.from('patients').select('id, name').eq('clinic_id', clinicId).eq('telegram_user_id', telegramUserId).maybeSingle();
        if (!existing) {
          // مريض مؤقت باسم تليجرام
          await supabase.from('patients').insert({
            clinic_id: clinicId,
            name: firstName,
            phone: `tg:${telegramUserId}`,
            telegram_user_id: telegramUserId
          });
        }
        await clearSession(supabase, telegramUserId);

        await send(chatId,
          `🏥 <b>مرحباً ${firstName} في ${clinic.name}</b>\n\n` +
          (clinic.description ? `${clinic.description}\n\n` : '') +
          `للحجز اضغط زر «📅 حجز موعد» أو «🔍 الخدمات».`,
          defaultKeyboard()
        );
        return jsonResponse({ ok: true });
      }

      if (linkedClinicId) {
        const { data: clinic } = await supabase.from('clinics').select('id, name, description').eq('id', linkedClinicId).single();
        if (clinic) {
          await send(chatId, `🏥 <b>مرحباً ${firstName} في ${clinic.name}</b>\n\nللحجز اضغط «📅 حجز موعد» أو «🔍 الخدمات».`, defaultKeyboard());
          return jsonResponse({ ok: true });
        }
      }
      await send(chatId, `🏥 <b>مرحباً ${firstName} في Smart Clinic</b>\n\nافتح رابط العيادة للحجز.`, defaultKeyboard());
      return jsonResponse({ ok: true });
    }

    if (isBookingIntent(text) || isServicesIntent(text)) {
      if (!linkedClinicId) {
        await send(chatId, '⚠️ افتح رابط الحجز الخاص بالعيادة أولاً.');
        return jsonResponse({ ok: true });
      }
      const { data: clinic } = await supabase.from('clinics').select(
        'id, name, type, description, doctor_name, working_hours_start, working_hours_end, receptionist_whatsapp'
      ).eq('id', linkedClinicId).single();
      if (clinic) await sendServicesMenu(supabase, send, chatId, clinic, linkedClinicId, firstName);
      else await send(chatId, '❌ العيادة غير موجودة.');
      return jsonResponse({ ok: true });
    }

    if (isAppointmentsIntent(text)) {
      const { data: appointments } = await supabase.from('appointments')
        .select('id, date, time, status, reservation_code, services(name), patients(name, phone)')
        .eq('customer_telegram_id', telegramUserId)
        .in('status', ['pending', 'confirmed'])
        .order('date', { ascending: true }).limit(10);
      if (appointments && appointments.length > 0) {
        let msg = '📅 <b>مواعيدك القادمة:</b>\n\n';
        appointments.forEach((a: any, i: number) => {
          msg += `${i + 1}. ${a.status === 'confirmed' ? '✅' : '⏳'} <b>${a.date}</b> ${String(a.time).slice(0,5)}\n`;
          if (a.patients?.name) msg += `   👤 ${a.patients.name}\n`;
          if (a.services?.name) msg += `   🏷 ${a.services.name}\n`;
          msg += `   🔖 <code>${a.reservation_code}</code>\n\n`;
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
          msg += `📅 ${a.date} - ⏰ ${String(a.time).slice(0,5)}\n🔖 <code>${a.reservation_code}</code>\n\n`;
          buttons.push([{ text: `❌ إلغاء ${a.reservation_code}`, callback_data: `cancel_${a.reservation_code}` }]);
        });
        await send(chatId, msg, { inline_keyboard: buttons });
      } else await send(chatId, '📭 لا توجد مواعيد.');
      return jsonResponse({ ok: true });
    }

    if (text.match(/^RE-\d{4}$/i)) {
      const { data: appointment } = await supabase.from('appointments').update({ status: 'cancelled' })
        .eq('reservation_code', text.toUpperCase()).eq('customer_telegram_id', telegramUserId)
        .in('status', ['pending', 'confirmed']).select().single();
      await send(chatId, appointment ?
        `✅ <b>تم إلغاء الموعد</b>\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}` :
        '⚠️ لم يتم العثور على الموعد.');
      return jsonResponse({ ok: true });
    }

    if (linkedClinicId) {
      const { data: clinic } = await supabase.from('clinics').select(
        'name, type, description, doctor_name, working_hours_start, working_hours_end, voice_agent_enabled, voice_tone, voice_mode'
      ).eq('id', linkedClinicId).single();
      const { data: services } = await supabase.from('services').select('name, price, duration_minutes').eq('clinic_id', linkedClinicId).eq('is_active', true);
      let ctx = '';
      if (clinic) {
        ctx = `\nاسم العيادة: ${clinic.name}`;
        if (clinic.doctor_name) ctx += `\nالطبيب: د. ${clinic.doctor_name}`;
        if (clinic.description) ctx += `\nالوصف: ${clinic.description}`;
        if (services?.length) ctx += `\nالخدمات: ${services.map((s: any) => s.name).join('، ')}`;
      }
      const tone = (clinic as any)?.voice_tone || 'ودود ومحترم';
      const aiResponse = await callAI(text, firstName, ctx, tone);
      if (aiResponse) {
        const cleanResponse = stripEmojis(aiResponse);
        const mode = (clinic as any)?.voice_mode || 'auto';
        const useVoice = (clinic as any)?.voice_agent_enabled && mode !== 'text' && (mode === 'voice' || Math.random() < 0.5);
        let voiceOk = false;
        if (useVoice) voiceOk = await sendVoiceReply(botToken, chatId, cleanResponse);
        if (!useVoice || !voiceOk) await send(chatId, cleanResponse, defaultKeyboard());
        await logConversation(supabase, linkedClinicId, telegramUserId, String(chatId), 'outgoing', useVoice && voiceOk ? 'ai_voice' : 'ai_response', null, null, cleanResponse, 'ok', null);
        return jsonResponse({ ok: true });
      }
    }

    await send(chatId, `🤖 كيف يمكنني مساعدتك؟ استخدم الأزرار أدناه.`, defaultKeyboard());
    return jsonResponse({ ok: true });

  } catch (error) {
    console.error('Telegram bot error:', error);
    return jsonResponse({ ok: true });
  }
});

// ════════════════════════════════════════════════════════════
// جلسات
// ════════════════════════════════════════════════════════════

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
  let msg = `🏥 أهلاً ${firstName} في <b>${clinic.name}</b>\n${doctorLine}`;
  if (clinic.description) msg += `📝 ${clinic.description}\n`;

  if (services && services.length > 0) {
    msg += `\n📋 <b>اختر الخدمة:</b>\n\n`;
    const buttons: any[][] = [];
    services.forEach((s: any, i: number) => {
      const priceLabel = (s.price === null || s.price === undefined) ? '' : ` (${s.price} ر.ي)`;
      msg += `${i + 1}. ${s.name}${priceLabel} — ${s.duration_minutes || 30} دقيقة\n`;
      buttons.push([{ text: `📅 ${s.name}`, callback_data: `book:${s.id}` }]);
    });
    await send(chatId, msg, { inline_keyboard: buttons });
  } else {
    await send(chatId, msg + `\nلا توجد خدمات متاحة حالياً.`, defaultKeyboard());
  }
}

async function progressSession(supabase: any, send: any, chatId: number, tgId: string, firstName: string, session: any, text: string, botToken: string): Promise<boolean> {
  if (/^(إلغاء|الغاء|cancel|stop)$/i.test(text.trim())) {
    await clearSession(supabase, tgId);
    await send(chatId, '✅ تم إلغاء الحجز.', defaultKeyboard());
    return true;
  }

  if (session.step === 'ask_name') {
    const name = text.trim();
    if (name.length < 2 || name.length > 80) {
      await send(chatId, '⚠️ الاسم قصير أو طويل. أرسل اسمك الكامل.');
      return true;
    }
    await upsertSession(supabase, tgId, { full_name: name, step: 'ask_phone', phone_attempts: 0 });
    await send(chatId, `أهلاً بك ${name} 🌷\n\n📱 يرجى إدخال رقم هاتفك:`);
    return true;
  }

  if (session.step === 'ask_phone') {
    const v = detectCountryAndValidate(text);
    if (!v.ok) {
      const attempts = (session.phone_attempts || 0) + 1;
      await upsertSession(supabase, tgId, { phone_attempts: attempts });
      if (attempts >= 3) {
        const { data: clinicRow } = await supabase.from('clinics').select('phone, name, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
        const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
        const waText = encodeURIComponent(`السلام عليكم، أريد حجز موعد في ${clinicRow?.name || 'العيادة'}`);
        const waBtn = waNum ? [[{ text: '💬 تواصل مع الاستقبال عبر واتساب', url: `https://wa.me/${waNum}?text=${waText}` }]] : [];
        await clearSession(supabase, tgId);
        await send(chatId,
          `⚠️ <b>تعذّر التحقق من رقم هاتفك بعد 3 محاولات</b>\n\nتم إلغاء عملية الحجز.\nيرجى التواصل مباشرة مع موظف الاستقبال:`,
          waBtn.length ? { inline_keyboard: waBtn } : undefined
        );
        return true;
      }
      await send(chatId, `⚠️ الرقم غير صحيح. تأكد من الرقم.\n(المحاولة ${attempts}/3)`);
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
    await send(chatId, `✅ تم حفظ الرقم: <code>${v.normalized}</code>\n\n📅 اختر تاريخ الموعد:`, { inline_keyboard: buttons });
    return true;
  }

  if (session.step === 'ask_date') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) {
      return await handleDateChoice(supabase, send, chatId, tgId, session, text.trim());
    }
    await send(chatId, '⚠️ استخدم زر التاريخ أو اكتبه بصيغة YYYY-MM-DD.');
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
  if (tgId !== DEV_TELEGRAM_ID && isPastDate(dateStr)) {
    await send(chatId, '⚠️ لا يمكن الحجز في تاريخ مضى.', { inline_keyboard: nextDaysButtons() });
    return true;
  }
  const { data: clinicRow } = await supabase.from('clinics').select('working_hours_start, working_hours_end').eq('id', session.clinic_id).single();
  const start = clinicRow?.working_hours_start || '08:00';
  const end = clinicRow?.working_hours_end || '16:00';
  const { data: existing } = await supabase.from('appointments').select('time')
    .eq('clinic_id', session.clinic_id).eq('date', dateStr).in('status', ['pending', 'confirmed']);
  const booked = new Set((existing || []).map((a: any) => String(a.time).slice(0, 5)));
  const free = getAvailableTimes(dateStr, booked, start, end);
  if (free.length === 0) {
    const { data: clinicRow2 } = await supabase.from('clinics').select('phone, name, receptionist_whatsapp').eq('id', session.clinic_id).maybeSingle();
    const waNum = (clinicRow2?.receptionist_whatsapp || clinicRow2?.phone || '').replace(/[^\d]/g, '');
    const waText = encodeURIComponent(`مرحباً، استفسار عن مواعيد في ${clinicRow2?.name || 'العيادة'}`);
    const waBtn = waNum ? [[{ text: '💬 تواصل مع الاستقبال', url: `https://wa.me/${waNum}?text=${waText}` }]] : [];
    await send(chatId, `⚠️ <b>لا توجد أوقات متاحة</b>\nجميع الأوقات محجوزة.`, waBtn.length ? { inline_keyboard: waBtn } : undefined);
    return true;
  }
  await upsertSession(supabase, tgId, { preferred_date: dateStr, step: 'ask_time' });
  const buttons: any[][] = [];
  for (let i = 0; i < free.length; i += 3) {
    buttons.push(free.slice(i, i + 3).map(t => ({ text: `⏰ ${t}`, callback_data: `time_${t.replace(':', '')}` })));
  }
  await send(chatId, `✅ التاريخ: <b>${dateStr}</b>\n\n⏰ اختر الوقت:`, { inline_keyboard: buttons });
  return true;
}

function nextDaysButtons() {
  const buttons: any[][] = [];
  const today = new Date();
  let daysAdded = 0, i = 0;
  while (daysAdded < 5 && i < 30) {
    i++;
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    if (!isPastDate(iso)) {
      buttons.push([{ text: `📅 ${i === 1 ? `غداً (${iso})` : iso}`, callback_data: `date_${iso}` }]);
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
    .trim().toLowerCase();
}

function isBookingIntent(text: string) {
  const n = normalizedText(text);
  return n === '/book' || n === '/booking' || n.includes('حجز موعد') || n.includes('احجز موعد');
}
function isServicesIntent(text: string) {
  const n = normalizedText(text);
  return n === '/services' || n === 'الخدمات' || n === 'خدمات' || n.includes('الخدمات') || n.includes('خدماتي');
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
  if (sub.status === 'trial' && sub.trial_ends_at) return new Date(sub.trial_ends_at).getTime() >= Date.now();
  return sub.status !== 'expired';
}

// ════════════════════════════════════════════════════════════
// ✅ [الحل الجذري] إكمال الحجز مع ضمان حفظ الاسم في كل مكان
// ════════════════════════════════════════════════════════════

async function finalizeBooking(supabase: any, send: any, chatId: number, tgId: string, firstName: string, session: any, time: string, botToken: string): Promise<boolean> {
  const { data: clinicRow } = await supabase.from('clinics').select(
    'working_hours_start, working_hours_end, receptionist_whatsapp, name, phone, doctor_name, logo_url'
  ).eq('id', session.clinic_id).single();
  
  const start = clinicRow?.working_hours_start || '08:00';
  const end = clinicRow?.working_hours_end || '16:00';

  // [1] فحص وقت الدوام صارم
  if (tgId !== DEV_TELEGRAM_ID && !isWithinWorkingHours(time, start, end)) {
    const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
    const waText = encodeURIComponent(
      `السلام عليكم،\nأرغب في حجز موعد خارج أوقات الدوام الرسمي في ${clinicRow?.name || 'العيادة'}.\n\n` +
      `📅 التاريخ المطلوب: ${session.preferred_date}\n⏰ الوقت المطلوب: ${time}\n\nهل يمكنكم مساعدتي؟`
    );
    const msg =
      `⏰ <b>عذراً، أوقات الدوام الرسمية قد انتهت</b>\n\n` +
      `🏥 العيادة: ${clinicRow?.name || 'العيادة'}\n` +
      `🕐 ساعات العمل الرسمية: من <b>${start}</b> إلى <b>${end}</b>\n` +
      `⛔ الوقت المطلوب (<b>${time}</b>) خارج أوقات الدوام\n\n` +
      `💡 يمكنك التواصل مع موظف الاستقبال عبر الواتساب:`;
    const markup = waNum
      ? { inline_keyboard: [[{ text: '💬 تواصل مع الاستقبال عبر واتساب', url: `https://wa.me/${waNum}?text=${waText}` }]] }
      : undefined;
    await send(chatId, msg, markup);
    await clearSession(supabase, tgId);
    return true;
  }

  // [2] فحص الوقت الفائت
  if (tgId !== DEV_TELEGRAM_ID && isPastTime(session.preferred_date, time)) {
    await send(chatId, `⚠️ الوقت <b>${time}</b> فائت. اختر وقتاً آخر.`);
    return true;
  }

  // [3] فحص التكرار
  const { data: duplicate } = await supabase.from('appointments').select('id')
    .eq('clinic_id', session.clinic_id).eq('date', session.preferred_date)
    .eq('time', time + ':00').in('status', ['pending', 'confirmed']).maybeSingle();

  if (duplicate) {
    await send(chatId, `⚠️ هذا الوقت محجوز. اختر وقتاً آخر.`);
    const { data: existing } = await supabase.from('appointments').select('time')
      .eq('clinic_id', session.clinic_id).eq('date', session.preferred_date).in('status', ['pending', 'confirmed']);
    const booked = new Set((existing || []).map((a: any) => String(a.time).slice(0, 5)));
    const free = getAvailableTimes(session.preferred_date, booked, start, end);
    if (free.length > 0) {
      const buttons: any[][] = [];
      for (let i = 0; i < free.length; i += 3) {
        buttons.push(free.slice(i, i + 3).map(t => ({ text: `⏰ ${t}`, callback_data: `time_${t.replace(':', '')}` })));
      }
      await upsertSession(supabase, tgId, { preferred_date: session.preferred_date, step: 'ask_time' });
      await send(chatId, `📅 <b>${session.preferred_date}</b>\n\n⏰ اختر وقتاً آخر:`, { inline_keyboard: buttons });
    } else {
      await send(chatId, `⚠️ لا توجد أوقات. اختر تاريخاً آخر.`);
      await clearSession(supabase, tgId);
    }
    return true;
  }

  // [4] الحد الأقصى
  const todayStr = new Date().toISOString().slice(0, 10);
  const { count: todayCount } = await supabase.from('appointments').select('id', { count: 'exact', head: true })
    .eq('customer_telegram_id', tgId).eq('date', todayStr).not('status', 'in', '(cancelled)');
  if (tgId !== DEV_TELEGRAM_ID && (todayCount ?? 0) >= 3) {
    await send(chatId, '⚠️ وصلت للحد الأقصى (3 مواعيد اليوم).');
    await clearSession(supabase, tgId);
    return true;
  }

  // ✅ [5] الاسم والهاتف - نضمن أنها ليست فارغة
  const storedName = (session.full_name && String(session.full_name).trim().length > 0) 
    ? String(session.full_name).trim() 
    : firstName;
  const storedPhone = (session.phone && String(session.phone).trim().length > 0) 
    ? String(session.phone).trim() 
    : `tg:${tgId}`;

  console.log(`📝 [حجز جديد] الاسم="${storedName}" | الهاتف="${storedPhone}" | TG=${tgId}`);

  // ✅ [6] المريض - نُنشئ أو نحدّث بحيث الاسم يكون العربي دائماً
  let patientId: string | null = null;
  
  // البحث عن مريض موجود
  const { data: existingPatients } = await supabase.from('patients')
    .select('id, name, phone')
    .eq('clinic_id', session.clinic_id)
    .eq('telegram_user_id', tgId);

  if (existingPatients && existingPatients.length > 0) {
    // مريض موجود - نحدّث اسمه بالعربي وهاتفه
    patientId = existingPatients[0].id;
    console.log(`♻️ تحديث مريض موجود: ${patientId}`);
    const { error: upErr } = await supabase.from('patients')
      .update({ 
        name: storedName,
        phone: storedPhone,
      })
      .eq('id', patientId);
    if (upErr) console.error('❌ خطأ تحديث المريض:', upErr);
    else console.log(`✅ تم تحديث المريض بـ: الاسم="${storedName}"`);
  } else {
    // مريض جديد
    console.log(`➕ إنشاء مريض جديد بـ: الاسم="${storedName}"`);
    const { data: np, error: insErr } = await supabase.from('patients')
      .insert({
        clinic_id: session.clinic_id,
        name: storedName,
        phone: storedPhone,
        telegram_user_id: tgId,
      })
      .select('id').single();
    if (insErr) {
      console.error('❌ خطأ إنشاء المريض:', insErr);
      await send(chatId, '❌ تعذّر حفظ بياناتك. حاول مرة أخرى.');
      return true;
    }
    patientId = np!.id;
    console.log(`✅ تم إنشاء المريض: ${patientId}`);
  }

  // ✅ التأكد بجولة قراءة أن الاسم محفوظ صحيحاً
  const { data: verifyPatient } = await supabase.from('patients')
    .select('id, name, phone')
    .eq('id', patientId)
    .single();
  console.log(`🔍 تأكيد المريض في DB: ${JSON.stringify(verifyPatient)}`);

  // إذا لسبب ما الاسم مش محفوظ، نحاول تحديث قسري
  if (!verifyPatient?.name || verifyPatient.name === 'مريض غير محدد' || verifyPatient.name.trim().length === 0) {
    console.warn(`⚠️ الاسم لم يُحفظ! محاولة قسرية...`);
    await supabase.from('patients').update({ name: storedName }).eq('id', patientId);
  }

  const { data: service } = await supabase.from('services').select('name, price').eq('id', session.service_id).single();
  const code = `RE-${String(Math.floor(1000 + Math.random() * 9000))}`;

  // ✅ [7] الحجز - نكتشف الأعمدة المتاحة ونحفظ الاسم في كل مكان ممكن
  const appointmentCols = await detectTableColumns(supabase, 'appointments');
  console.log(`📋 أعمدة جدول appointments: ${Array.from(appointmentCols).join(', ')}`);

  const appointmentData: any = {
    clinic_id: session.clinic_id,
    patient_id: patientId,
    service_id: session.service_id,
    date: session.preferred_date,
    time: time + ':00',
    status: 'pending',
    reservation_code: code,
    customer_telegram_id: tgId,
    notes: `حجز تليجرام - ${storedName} (${storedPhone})`,
  };

  // ✅ نُضيف كل عمود ممكن للاسم والهاتف بشكل ذكي
  const possibleNameColumns = ['patient_name', 'customer_name', 'name', 'full_name', 'client_name'];
  const possiblePhoneColumns = ['patient_phone', 'customer_phone', 'phone', 'mobile', 'client_phone'];

  for (const col of possibleNameColumns) {
    if (appointmentCols.has(col)) {
      appointmentData[col] = storedName;
      console.log(`➕ إضافة ${col} = "${storedName}"`);
    }
  }
  for (const col of possiblePhoneColumns) {
    if (appointmentCols.has(col)) {
      appointmentData[col] = storedPhone;
      console.log(`➕ إضافة ${col} = "${storedPhone}"`);
    }
  }

  const { error: insertErr } = await supabase.from('appointments').insert(appointmentData);

  if (insertErr) {
    console.error('❌ فشل إدخال الحجز:', insertErr);
    // Fallback: أعمدة أساسية فقط
    const basic = {
      clinic_id: session.clinic_id,
      patient_id: patientId,
      service_id: session.service_id,
      date: session.preferred_date,
      time: time + ':00',
      status: 'pending',
      reservation_code: code,
      customer_telegram_id: tgId,
      notes: `حجز تليجرام - ${storedName} (${storedPhone})`,
    };
    const retry = await supabase.from('appointments').insert(basic);
    if (retry.error) {
      console.error('❌ فشل نهائي:', retry.error);
      await send(chatId, '❌ تعذّر إكمال الحجز.');
      return true;
    }
  }

  console.log(`✅ تم حفظ الحجز ${code} بنجاح`);

  await clearSession(supabase, tgId);

  const waNum = (clinicRow?.receptionist_whatsapp || clinicRow?.phone || '').replace(/[^\d]/g, '');
  const waTextOther = encodeURIComponent(`مرحباً، أريد حجز باسم شخص آخر في ${clinicRow?.name || 'العيادة'}`);
  const successMarkup = {
    inline_keyboard: waNum ? [[{ text: '👥 حجز باسم شخص آخر', url: `https://wa.me/${waNum}?text=${waTextOther}` }]] : [],
  };

  // ✅ [8] رسالة التأكيد النصية
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

  // ✅ [9] بطاقة الحجز - مضمونة
  let cardPng: Uint8Array | null = null;
  try {
    cardPng = await generateLuxuryBookingCard({
      clinicName: clinicRow?.name || 'Smart Clinic',
      doctorName: clinicRow?.doctor_name || '',
      logoUrl: clinicRow?.logo_url || '',
      patientName: storedName,
      patientPhone: storedPhone,
      serviceName: service?.name || 'Medical Consultation',
      date: session.preferred_date,
      time: time,
      code: code,
    });
  } catch (e) { console.error('❌ خطأ satori:', e); }

  if (!cardPng) {
    try {
      cardPng = await generateFallbackCard({
        clinicName: clinicRow?.name || 'Smart Clinic',
        doctorName: clinicRow?.doctor_name || '',
        patientName: storedName,
        patientPhone: storedPhone,
        serviceName: service?.name || 'Medical Consultation',
        date: session.preferred_date,
        time: time,
        code: code,
      });
    } catch (e) { console.error('❌ خطأ fallback:', e); }
  }

  if (cardPng) {
    try {
      const fd = new FormData();
      fd.append('chat_id', String(chatId));
      fd.append('photo', new Blob([cardPng], { type: 'image/png' }), 'booking_card.png');
      fd.append('caption', `📋 <b>بطاقة حجز رسمي</b> — ${clinicRow?.name || ''}\nبرجاء إبراز الكود عند الوصول.`);
      fd.append('parse_mode', 'HTML');
      await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: fd }, 25000);
    } catch (e) { console.error('❌ إرسال البطاقة:', e); }
  }

  // ✅ [10] الرسالة الصوتية الاحترافية
  try {
    const voiceMessage = 
      `مرحباً ${storedName}. ` +
      `تم تأكيد حجزك بنجاح في ${clinicRow?.name || 'العيادة'} ` +
      `يوم ${session.preferred_date} في تمام الساعة ${time}. ` +
      `نتمنى لك دوام الصحة والعافية وراحة البال. ` +
      `فريقنا الطبي في انتظارك لتقديم أفضل خدمة ممكنة. ` +
      `نراك قريباً، مع أطيب التمنيات.`;
    await sendVoiceReply(botToken, chatId, voiceMessage, 'رسالة تأكيد الحجز');
  } catch (_) {}

  // ✅ [11] إشعار الطبيب
  const doctorMessage =
    `🔔 <b>حجز جديد</b>\n👤 ${storedName}\n📱 ${storedPhone}\n🏷 ${service?.name || ''}\n📅 ${session.preferred_date} ⏰ ${time}\n🔖 ${code}`;
  await notifyDoctor(supabase, botToken, session.clinic_id, doctorMessage);
  await sendEmailNotification(supabase, session.clinic_id, `حجز جديد - ${clinicRow?.name || ''}`, doctorMessage);

  return true;
}

// ════════════════════════════════════════════════════════════
// Callback Queries
// ════════════════════════════════════════════════════════════

async function handleCallbackQuery(supabase: any, query: any, requestClinicId: string | null = null) {
  const chatId = query.message.chat.id;
  const data = query.data;
  const tgId = String(query.from.id);
  const firstName = query.from.first_name || 'عميل';

  const botToken = await getBotToken(supabase, requestClinicId);
  if (!botToken) return;
  const send = (cId: number, txt: string, markup?: any) => sendMessage(botToken, cId, txt, markup);

  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: query.id }),
  });

  if (data.startsWith('confirm_')) {
    const resCode = data.replace('confirm_', '');
    const { data: appointment } = await supabase.from('appointments')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), reminder_sent: true })
      .eq('reservation_code', resCode).eq('customer_telegram_id', tgId)
      .in('status', ['pending', 'confirmed'])
      .select('date, time, reservation_code, clinic_id').single();
    if (appointment) {
      await send(chatId, `✅ <b>تم تأكيد حضورك!</b>\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}`);
      await notifyDoctor(supabase, botToken, appointment.clinic_id,
        `✅ <b>تأكيد حضور</b>\n👤 ${firstName}\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}`);
    } else await send(chatId, '⚠️ لم يتم العثور على الموعد.');
    return;
  }

  if (data.startsWith('book:') || data.startsWith('book_')) {
    const serviceId = data.startsWith('book:') ? data.replace('book:', '') : data.split('_')[2];
    const { data: service } = await supabase.from('services').select('id, name, clinic_id').eq('id', serviceId).single();
    if (!service) { await send(chatId, '❌ الخدمة غير متوفرة.'); return; }

    // ✅ نبحث عن مريض له اسم حقيقي عربي (ليس اسم تليجرام)
    const { data: existingPatient } = await supabase.from('patients')
      .select('id, name, phone')
      .eq('clinic_id', service.clinic_id)
      .eq('telegram_user_id', tgId)
      .maybeSingle();

    // مريض مكتمل التسجيل = له هاتف حقيقي (ليس tg:) واسم عربي كامل (أكثر من كلمة أو له مسافة)
    const hasRealRegistration = existingPatient && 
      existingPatient.phone && 
      !String(existingPatient.phone).startsWith('tg:') &&
      existingPatient.name &&
      existingPatient.name.trim().length >= 2 &&
      existingPatient.name !== firstName; // ليس مجرد اسم تليجرام

    if (hasRealRegistration) {
      await upsertSession(supabase, tgId, {
        clinic_id: service.clinic_id, service_id: service.id, step: 'ask_date',
        full_name: existingPatient!.name, phone: existingPatient!.phone,
        preferred_date: null, preferred_time: null, phone_attempts: 0,
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
        `أهلاً بعودتك ${existingPatient!.name} 🌷\n\nخدمة: <b>${service.name}</b>\n📱 <code>${existingPatient!.phone}</code>\n\n📅 اختر التاريخ:`,
        { inline_keyboard: buttons });
      return;
    }

    // مريض جديد أو غير مكتمل - نطلب الاسم
    await upsertSession(supabase, tgId, {
      clinic_id: service.clinic_id, service_id: service.id, step: 'ask_name',
      full_name: null, phone: null, preferred_date: null, preferred_time: null, phone_attempts: 0
    });
    await send(chatId, `📋 لحجز <b>${service.name}</b>:\n\nأرسل <b>اسمك الكامل</b>.\n(للإلغاء اكتب: إلغاء)`);
    return;
  }

  if (data.startsWith('date_')) {
    const dateStr = data.replace('date_', '');
    const session = await getSession(supabase, tgId);
    if (!session || session.step !== 'ask_date') {
      await send(chatId, '⚠️ ابدأ الحجز من زر الخدمة أولاً.');
      return;
    }
    await handleDateChoice(supabase, send, chatId, tgId, session, dateStr);
    return;
  }

  if (data.startsWith('time_')) {
    const raw = data.replace('time_', '');
    const time = `${raw.slice(0, 2)}:${raw.slice(2)}`;
    const session = await getSession(supabase, tgId);
    if (!session || session.step !== 'ask_time') {
      await send(chatId, '⚠️ ابدأ الحجز من زر الخدمة أولاً.');
      return;
    }
    await finalizeBooking(supabase, send, chatId, tgId, firstName, session, time, botToken);
    return;
  }

  if (data.startsWith('cancel_')) {
    const resCode = data.replace('cancel_', '');
    const { data: appointment } = await supabase.from('appointments').update({ status: 'cancelled' })
      .eq('reservation_code', resCode).eq('customer_telegram_id', tgId)
      .in('status', ['pending', 'confirmed']).select('date, time, reservation_code, clinic_id').single();
    if (appointment) {
      await send(chatId, `✅ <b>تم إلغاء الموعد</b>\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}`);
      await notifyDoctor(supabase, botToken, appointment.clinic_id,
        `❌ <b>إلغاء</b>\n👤 ${firstName}\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}`);
    } else await send(chatId, '⚠️ لم يتم العثور على الموعد.');
    return;
  }
}

// ════════════════════════════════════════════════════════════
// دوال عامة
// ════════════════════════════════════════════════════════════

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

async function getBotToken(supabase: any, clinicId: string | null): Promise<string | null> {
  const { data: globalToken } = await supabase.from('global_settings').select('telegram_bot_token').limit(1).maybeSingle();
  if (globalToken?.telegram_bot_token) return globalToken.telegram_bot_token;
  const { data: systemSettings } = await supabase.from('system_settings').select('telegram_bot_token').limit(1).maybeSingle();
  if (systemSettings?.telegram_bot_token) return systemSettings.telegram_bot_token;
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
  } catch (_) { return null; }
}

function detectEmergency(text: string): boolean {
  const n = text.toLowerCase();
  const kw = ['طوارئ','اسعاف','نزيف','اختناق','لا يتنفس','ألم شديد','جلطة','إغماء','فقدان وعي','تشنج','تسمم'];
  return kw.some(k => n.includes(k.toLowerCase()));
}

async function handleEmergency(supabase: any, botToken: string, clinicId: string, tgId: string, chatId: string, name: string, msg: string) {
  const notificationId = await notifyDoctor(supabase, botToken, clinicId,
    `🚨 <b>حالة طارئة</b>\n👤 ${name}\n💬 ${msg}\n📞 TG: ${tgId}`, 'emergency', 'تنبيه طوارئ');
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

import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { SubscriptionLock } from "@/components/SubscriptionLock";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Footer } from "@/components/layout/Footer";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Stethoscope, LogOut, ArrowRight, Save, Copy, Check, Link2, Key, Plus, Trash2, Loader2,
  Bot, Building2, CreditCard, Shield, Clock, Activity, Sparkles, Upload, Image, QrCode,
  Download, CalendarClock, Tag, Gift, BadgePercent, ImagePlus, X, Edit, Eye, Mail, Lock
} from "lucide-react";

// ============================================================
// MEDICAL TRANSLATION DICTIONARY (V39)
// ============================================================
const MEDICAL_DICT_AR_EN: Record<string, string> = {
  "معاينة":"Examination","كشف":"Consultation","كشف عام":"General Consultation",
  "كشف طبي":"Medical Consultation","استشارة":"Consultation","فحص":"Check-up",
  "فحص عام":"General Check-up","فحص طبي":"Medical Check-up","فحص شامل":"Comprehensive Check-up",
  "متابعة":"Follow-up","مراجعة":"Review","طوارئ":"Emergency","إسعاف":"First Aid",
  "تحليل":"Lab Test","تحليل دم":"Blood Test","تحليل دم شامل":"Complete Blood Count",
  "صورة دم كاملة":"CBC","CBC":"CBC","فحص السكر":"Blood Sugar Test",
  "فحص السكري":"Diabetes Test","سكر صائم":"Fasting Blood Sugar",
  "سكر تراكمي":"HbA1c","فحص الحمل":"Pregnancy Test","اختبار الحمل":"Pregnancy Test",
  "فحص البول":"Urine Test","فحص البراز":"Stool Test","فحص الكوليسترول":"Cholesterol Test",
  "فحص وظائف الكلى":"Kidney Function Test","فحص وظائف الكبد":"Liver Function Test",
  "فحص الغدة الدرقية":"Thyroid Function Test","فحص هرمونات":"Hormone Panel",
  "فحص فيتامين د":"Vitamin D Test","فحص فيتامين ب12":"Vitamin B12 Test",
  "فحص الحديد":"Iron Test","فحص الكالسيوم":"Calcium Test","فحص الحساسية":"Allergy Test",
  "مزرعة بول":"Urine Culture","مزرعة دم":"Blood Culture","سرعة الترسيب":"ESR Test",
  "CRP":"CRP Test","سي آر بي":"CRP Test","بروتين سي التفاعلي":"C-Reactive Protein Test",
  "تنظيف أسنان":"Dental Cleaning","تنظيف وتلميع الأسنان":"Dental Cleaning & Polishing",
  "إزالة الجير":"Tartar Removal","حشو":"Filling","حشو أسنان":"Dental Filling",
  "حشوة مؤقتة":"Temporary Filling","حشوة دائمة":"Permanent Filling",
  "خلع سن":"Tooth Extraction","خلع ضرس العقل":"Wisdom Tooth Extraction",
  "تقويم أسنان":"Dental Braces","تقويم":"Orthodontics","زراعة أسنان":"Dental Implant",
  "تركيبة أسنان":"Dental Crown","تاج":"Crown","جسر أسنان":"Dental Bridge",
  "علاج عصب":"Root Canal Treatment","تبييض الأسنان":"Teeth Whitening",
  "عدسات أسنان":"Dental Veneers","فينير":"Veneer","ابتسامة هوليوود":"Hollywood Smile",
  "أشعة أسنان":"Dental X-Ray","أشعة بانوراما":"Panoramic X-Ray",
  "ليزر إزالة الشعر":"Laser Hair Removal","فيلر":"Dermal Filler","بوتوكس":"Botox",
  "تقشير البشرة":"Skin Peeling","تنظيف البشرة":"Facial Cleansing",
  "علاج حب الشباب":"Acne Treatment","ميزوثيرابي":"Mesotherapy",
  "بلازما للشعر":"PRP Hair Treatment","تكبير الشفايف":"Lip Augmentation",
  "نضارة البشرة":"Skin Rejuvenation","هايفو":"HIFU","كربوكسي":"Carboxy Therapy",
  "سونار الحمل":"Pregnancy Ultrasound","متابعة الحمل":"Prenatal Care",
  "سونار مهبلي":"Transvaginal Ultrasound","سونار بطن":"Abdominal Ultrasound",
  "تركيب لولب":"IUD Insertion","إزالة لولب":"IUD Removal","مسحة عنق الرحم":"Pap Smear",
  "ولادة طبيعية":"Natural Delivery","ولادة قيصرية":"Cesarean Section",
  "فحص النظر":"Vision Test","قياس ضغط العين":"Eye Pressure Test",
  "فحص قاع العين":"Fundus Examination","قياس النظر للعدسات":"Contact Lens Fitting",
  "عملية الليزك":"LASIK Surgery","عملية المياه البيضاء":"Cataract Surgery",
  "أشعة سينية":"X-Ray","أشعة مقطعية":"CT Scan","رنين مغناطيسي":"MRI",
  "إيكو":"Echocardiography","تخطيط قلب":"ECG","هولتر":"Holter Monitor",
  "ماموجرام":"Mammogram","كثافة العظام":"Bone Density Test",
  "قياس ضغط الدم":"Blood Pressure Measurement","متابعة ضغط":"Hypertension Follow-up",
  "متابعة سكر":"Diabetes Follow-up","متابعة كوليسترول":"Cholesterol Follow-up",
  "تطعيم":"Vaccination","متابعة نمو":"Growth Follow-up","فحص حديثي الولادة":"Newborn Screening",
  "حقنة":"Injection","إبرة":"Injection","محلول وريدي":"IV Fluids",
  "جبس":"Cast","تضميد":"Bandage","خياطة جرح":"Wound Suturing","غيار":"Wound Dressing",
};

function translateMedicalToEnglish(input: string): string {
  if (!input || !/[\u0600-\u06FF]/.test(input)) return input || "";
  const clean = input.trim().replace(/[\u064B-\u065F\u0670]/g, "");
  if (MEDICAL_DICT_AR_EN[clean]) return MEDICAL_DICT_AR_EN[clean];
  const noAl = clean.replace(/^ال/, "");
  if (MEDICAL_DICT_AR_EN[noAl]) return MEDICAL_DICT_AR_EN[noAl];
  const parts = clean.split(/\s+/);
  const out: string[] = [];
  let allFound = true;
  for (const w of parts) {
    const w2 = w.replace(/^ال/, "");
    if (MEDICAL_DICT_AR_EN[w]) out.push(MEDICAL_DICT_AR_EN[w]);
    else if (MEDICAL_DICT_AR_EN[w2]) out.push(MEDICAL_DICT_AR_EN[w2]);
    else { allFound = false; break; }
  }
  if (allFound && out.length) return out.join(" ");
  const arMap: Record<string,string> = {ا:"a",أ:"a",إ:"e",آ:"a",ب:"b",ت:"t",ث:"th",ج:"j",ح:"h",خ:"kh",د:"d",ذ:"dh",ر:"r",ز:"z",س:"s",ش:"sh",ص:"s",ض:"d",ط:"t",ظ:"z",ع:"a",غ:"gh",ف:"f",ق:"q",ك:"k",ل:"l",م:"m",ن:"n",ه:"h",و:"o",ي:"i",ى:"a",ة:"a",ئ:"e",ؤ:"o",ء:""," ":" "};
  const tr = (s:string) => s.split("").map(c => arMap[c] ?? "").join("").replace(/[\u0600-\u06FF]/g,"").trim();
  const words = parts.map(w => {
    const w2 = w.replace(/^ال/, "");
    if (MEDICAL_DICT_AR_EN[w]) return MEDICAL_DICT_AR_EN[w];
    if (MEDICAL_DICT_AR_EN[w2]) return MEDICAL_DICT_AR_EN[w2];
    const t = tr(w2);
    return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : w;
  });
  return words.filter(Boolean).join(" ") || tr(clean);
}

// ============================================================
// Interfaces
// ============================================================
interface Service {
  id: string;
  name: string;
  name_en?: string | null;
  name_en_edited_by_user?: boolean;
  price: number | null;
}

interface Promotion {
  id: string;
  title: string;
  description?: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  code?: string;
  start_date?: string;
  end_date?: string;
  usage_limit?: number;
  per_user_limit?: number;
  is_active: boolean;
  image_url?: string;
  template?: string;
  items?: string;
  phone_text?: string;
  location?: string;
  created_at: string;
  service_ids?: string[];
}

// ============================================================
// EXTENDED SPECIALTY THEMES (LUXURY & PREMIUM)
// ============================================================
const SPECIALTY_THEMES: Record<string, any> = {
  dental: {
    bg1: "#E0F2FE", bg2: "#BAE6FD", bg3: "#0369A1",
    darkColor: "#0C4A6E", textColor: "#FFFFFF",
    accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.85)",
    chipBg: "#FFFFFF", chipBorder: "#3B82F6", chipText: "#1E3A8A",
    icon: "🦷", label: "طب الأسنان", labelEn: "Dental Care",
    heroImages: [
      "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=85&auto=format&fit=crop",
    ],
  },
  lab: {
    bg1: "#F0F9FF", bg2: "#E0F2FE", bg3: "#38BDF8",
    darkColor: "#0C4A6E", textColor: "#FFFFFF",
    accent: "#10B981", accentDark: "#047857",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#0284C7", chipText: "#0C4A6E",
    icon: "🧪", label: "المختبر", labelEn: "Laboratory",
    heroImages: [
      "https://images.unsplash.com/photo-1579154204601-01588f351e67?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=1200&q=85&auto=format&fit=crop",
    ],
  },
  general: {
    bg1: "#ECFDF5", bg2: "#D1FAE5", bg3: "#047857",
    darkColor: "#064E3B", textColor: "#FFFFFF",
    accent: "#FDE68A", accentDark: "#D97706",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#059669", chipText: "#064E3B",
    icon: "🏥", label: "الطب العام", labelEn: "General Medicine",
    heroImages: [
      "https://images.unsplash.com/photo-1631815589968-fdb09a223b1e?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=85&auto=format&fit=crop",
    ],
  },
  dermatology: {
    bg1: "#FDF2F8", bg2: "#FCE7F3", bg3: "#BE185D",
    darkColor: "#831843", textColor: "#FFFFFF", accent: "#FDE68A", accentDark: "#D97706",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#DB2777", chipText: "#831843",
    icon: "✨", label: "الجلدية والتجميل", labelEn: "Dermatology",
    heroImages: ["https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&q=85&auto=format&fit=crop"],
  },
  gynecology: {
    bg1: "#FDF2F8", bg2: "#FBCFE8", bg3: "#9F1239",
    darkColor: "#500724", textColor: "#FFFFFF", accent: "#FDE68A", accentDark: "#D97706",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#BE185D", chipText: "#500724",
    icon: "🌸", label: "النساء والولادة", labelEn: "Gynecology",
    heroImages: ["https://images.unsplash.com/photo-1584515933487-779824d29309?w=1200&q=85&auto=format&fit=crop"],
  },
  ophthalmology: {
    bg1: "#ECFEFF", bg2: "#CFFAFE", bg3: "#0E7490",
    darkColor: "#164E63", textColor: "#FFFFFF", accent: "#FDE68A", accentDark: "#D97706",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#0891B2", chipText: "#164E63",
    icon: "👁️", label: "طب العيون", labelEn: "Ophthalmology",
    heroImages: ["https://images.unsplash.com/photo-1587613757226-c22d09e4bd23?w=1200&q=85&auto=format&fit=crop"],
  },
  orthopedics: {
    bg1: "#F8FAFC", bg2: "#F1F5F9", bg3: "#475569",
    darkColor: "#0F172A", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#64748B", chipText: "#0F172A",
    icon: "🦴", label: "العظام والمفاصل", labelEn: "Orthopedics",
    heroImages: ["https://images.unsplash.com/photo-1595003500447-88ce9a901a9c?w=1200&q=85&auto=format&fit=crop"],
  },
  pediatrics: {
    bg1: "#FFFBEB", bg2: "#FEF3C7", bg3: "#D97706",
    darkColor: "#78350F", textColor: "#FFFFFF", accent: "#10B981", accentDark: "#047857",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#F59E0B", chipText: "#78350F",
    icon: "🧸", label: "طب الأطفال", labelEn: "Pediatrics",
    heroImages: ["https://images.unsplash.com/photo-1502740479091-635887520276?w=1200&q=85&auto=format&fit=crop"],
  },
  internal: {
    bg1: "#EEF2FF", bg2: "#E0E7FF", bg3: "#4338CA",
    darkColor: "#312E81", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#6366F1", chipText: "#312E81",
    icon: "🩺", label: "الباطنية", labelEn: "Internal Medicine",
    heroImages: ["https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=1200&q=85&auto=format&fit=crop"],
  },
  surgery: {
    bg1: "#FEF2F2", bg2: "#FEE2E2", bg3: "#DC2626",
    darkColor: "#7F1D1D", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#EF4444", chipText: "#7F1D1D",
    icon: "🔪", label: "الجراحة العامة", labelEn: "General Surgery",
    heroImages: ["https://images.unsplash.com/photo-1551076805-e1869033e561?w=1200&q=85&auto=format&fit=crop"],
  },
  cardiology: {
    bg1: "#FEF2F2", bg2: "#FEE2E2", bg3: "#B91C1C",
    darkColor: "#7F1D1D", textColor: "#FFFFFF", accent: "#FDE68A", accentDark: "#D97706",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#DC2626", chipText: "#7F1D1D",
    icon: "💔", label: "أمراض القلب", labelEn: "Cardiology",
    heroImages: ["https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?w=1200&q=85&auto=format&fit=crop"],
  },
  neurology: {
    bg1: "#FAF5FF", bg2: "#F3E8FF", bg3: "#7E22CE",
    darkColor: "#4C1D95", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#9333EA", chipText: "#4C1D95",
    icon: "🧠", label: "المخ والأعصاب", labelEn: "Neurology",
    heroImages: ["https://images.unsplash.com/photo-1559757175-5700dde675bc?w=1200&q=85&auto=format&fit=crop"],
  },
  ent: {
    bg1: "#FFFBEB", bg2: "#FEF3C7", bg3: "#D97706",
    darkColor: "#78350F", textColor: "#FFFFFF", accent: "#10B981", accentDark: "#047857",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#F59E0B", chipText: "#78350F",
    icon: "👂", label: "أنف وأذن وحنجرة", labelEn: "ENT",
    heroImages: ["https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=85&auto=format&fit=crop"],
  },
  pharmacy: {
    bg1: "#F0FDF4", bg2: "#DCFCE7", bg3: "#16A34A",
    darkColor: "#14532D", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#22C55E", chipText: "#14532D",
    icon: "💊", label: "الصيدلية", labelEn: "Pharmacy",
    heroImages: ["https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1200&q=85&auto=format&fit=crop"],
  },
  radiology: {
    bg1: "#F9FAFB", bg2: "#F3F4F6", bg3: "#4B5563",
    darkColor: "#1F2937", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#6B7280", chipText: "#1F2937",
    icon: "🩻", label: "الأشعة", labelEn: "Radiology",
    heroImages: ["https://images.unsplash.com/photo-1516069677018-378515003435?w=1200&q=85&auto=format&fit=crop"],
  },
  physiotherapy: {
    bg1: "#F0F9FF", bg2: "#E0F2FE", bg3: "#0284C7",
    darkColor: "#0C4A6E", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#38BDF8", chipText: "#0C4A6E",
    icon: "🦵", label: "العلاج الطبيعي", labelEn: "Physiotherapy",
    heroImages: ["https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=85&auto=format&fit=crop"],
  },
  nutrition: {
    bg1: "#FFFBEB", bg2: "#FEF3C7", bg3: "#D97706",
    darkColor: "#78350F", textColor: "#FFFFFF", accent: "#10B981", accentDark: "#047857",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#F59E0B", chipText: "#78350F",
    icon: "🥗", label: "التغذية", labelEn: "Nutrition",
    heroImages: ["https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=85&auto=format&fit=crop"],
  },
  psychiatry: {
    bg1: "#FAF5FF", bg2: "#F3E8FF", bg3: "#9333EA",
    darkColor: "#4C1D95", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#A855F7", chipText: "#4C1D95",
    icon: "🧘", label: "الطب النفسي", labelEn: "Psychiatry",
    heroImages: ["https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&q=85&auto=format&fit=crop"],
  },
  other: {
    bg1: "#F9FAFB", bg2: "#F3F4F6", bg3: "#6B7280",
    darkColor: "#1F2937", textColor: "#FFFFFF", accent: "#F59E0B", accentDark: "#B45309",
    glassBg: "rgba(255, 255, 255, 0.9)",
    chipBg: "#FFFFFF", chipBorder: "#9CA3AF", chipText: "#1F2937",
    icon: "🏥", label: "عيادة", labelEn: "Clinic",
    heroImages: ["https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=85&auto=format&fit=crop"],
  },
};

// ============================================================
// PROMO CONTENT TEMPLATES
// ============================================================
const PROMO_TEMPLATES: Record<string, { title: string; description: string; items: string }> = {
  dental: { title: "ابتسم بثقة.. عرض حصري لصحة أسنانك", description: "احصل على أسنان أكثر بياضاً وإشراقاً، وعلاج آمن لأسنانك بأحدث التقنيات.", items: "خصم يصل إلى 30%\nكشف مجاني\nعروض لفترة محدودة" },
  dermatology: { title: "جمال بلا شوائب.. عرض تجميل متكامل", description: "نضارة وحيوية لبشرتك وشعرك مع أحدث أجهزة الليزر والفيلر والبوتوكس.", items: "خصم يصل إلى 25%\nاستشارة مجانية\nنتائج مضمونة" },
  gynecology: { title: "رعاية شاملة لصحة المرأة والولادة", description: "متابعة الحمل، السونار، والفحوصات النسائية الدقيقة بأيدي طبيبات متميزات.", items: "خصم يصل إلى 20%\nمتابعة مستمرة\nأحدث الأجهزة" },
  ophthalmology: { title: "أبصر الحياة بوضوح.. عروض العيون", description: "فحص دقيق للنظر، وعلاج قصر النظر، والمياه البيضاء بأحدث أجهزة الليزر.", items: "خصم يصل إلى 35%\nفحص مجاني\nتقنيات متطورة" },
  orthopedics: { title: "رجوع للحركة بلا ألم.. عروض العظام", description: "علاج خشونة المفاصل، تثبيت الكسور، وحقن المفاصل مع برامج تأهيل متكاملة.", items: "خصم يصل إلى 20%\nاستشارة مجانية\nتأهيل شامل" },
  pediatrics: { title: "صحة طفلك أولويتنا.. عروض الأطفال", description: "متابعة نمو وتطور طفلك، التطعيمات، وعلاج نزلات البرد والحساسية.", items: "خصم يصل إلى 25%\nكشف مجاني\nعناية متكاملة" },
  internal: { title: "صحتك الداخلية بأيدٍ أمينة", description: "فحوصات شاملة، ومتابعة الضغط والسكر والكوليسترول بأحدث التحاليل.", items: "خصم يصل إلى 20%\nفحص شامل\nمتابعة دورية" },
  general: { title: "رعاية طبية شاملة لكل أفراد العائلة", description: "استشارات عامة، فحوصات دورية، ومتابعة الأمراض المزمنة بأسعار مناسبة.", items: "خصم يصل إلى 20%\nكشف مجاني\nخدمات متميزة" },
  lab: { title: "دقة في التحاليل.. نتائج مضمونة", description: "نقدم جميع التحاليل الطبية بأحدث الأجهزة وبأسعار تنافسية ونتائج سريعة.", items: "خصم يصل إلى 40%\nنتائج سريعة\nعروض لفترة محدودة" },
  surgery: { title: "جراحة آمنة.. وأيدٍ خبيرة", description: "إجراء العمليات الجراحية الدقيقة بأحدث تقنيات المناظير وضمان أفضل النتائج.", items: "خصم يصل إلى 20%\nاستشارة مجانية\nرعاية متكاملة" },
  cardiology: { title: "قلبك بأمان.. رعاية متخصصة", description: "تخطيط القلب، الإيكو، ومتابعة الضغط وعلاج أمراض القلب بأحدث الأجهزة.", items: "خصم يصل إلى 25%\nفحص مجاني\nأجهزة حديثة" },
  neurology: { title: "صحة أعصابك تبدأ بالعناية", description: "علاج الصداع النصفي، التشنجات، وآلام الأعصاب، والتقييم العصبي الشامل.", items: "خصم يصل إلى 20%\nاستشارة مجانية\nتقييم شامل" },
  ent: { title: "تنفس بسهولة واسمع بوضوح", description: "علاج مشاكل الأنف والأذن والحنجرة، الجيوب الأنفية، وضعف السمع.", items: "خصم يصل إلى 25%\nكشف مجاني\nتقنيات متطورة" },
  pharmacy: { title: "دواءك.. بأسعار موفرة", description: "نقدم جميع الأدوية والمستلزمات الطبية مع خصومات وعروض حصرية.", items: "خصم يصل إلى 15%\nعروض حصرية\nخدمة سريعة" },
  radiology: { title: "تشخيص دقيق.. بجودة عالية", description: "أحدث أجهزة الأشعة السينية، المقطعية، والرنين المغناطيسي مع قراءة دقيقة.", items: "خصم يصل إلى 20%\nدقة عالية\nنتائج سريعة" },
  physiotherapy: { title: "استعد لياقتك وحركتك", description: "علاج طبيعي متكامل لإصابات الملاعب، آلام الظهر، وتأهيل ما بعد الجراحة.", items: "خصم يصل إلى 25%\nجلسات مخصصة\nتأهيل شامل" },
  nutrition: { title: "نحو حياة صحية.. بوزن مثالي", description: "برامج غذائية مخصصة، وعلاج السمنة والنحافة بأيدي أخصائيي تغذية.", items: "خصم يصل إلى 30%\nاستشارة مجانية\nبرامج مخصصة" },
  psychiatry: { title: "لنكن بخير نفسياً", description: "استشارات نفسية، علاج القلق والاكتئاب، والتأهيل النفسي بأحدث المناهج.", items: "خصم يصل إلى 20%\nاستشارة مجانية\nخصوصية تامة" },
  other: { title: "عيادتنا.. جودة ورعاية", description: "خدمات طبية متكاملة بأحدث الأجهزة وأيدي أطباء متخصصين.", items: "خصم يصل إلى 20%\nخدمة متميزة\nمتابعة دورية" },
};

// ============================================================
// V44: PREMIUM 3D MEDICAL ICONS
// ============================================================
const SERVICE_THUMBNAILS: Record<string, string> = {
  sugar: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png",
  blood: "https://cdn-icons-png.flaticon.com/512/2965/2965450.png",
  kidney: "https://cdn-icons-png.flaticon.com/512/3063/3063818.png",
  liver: "https://cdn-icons-png.flaticon.com/512/3063/3063820.png",
  vitamin: "https://cdn-icons-png.flaticon.com/512/2929/2929909.png",
  hormone: "https://cdn-icons-png.flaticon.com/512/3468/3468377.png",
  stool: "https://cdn-icons-png.flaticon.com/512/3063/3063826.png",
  urine: "https://cdn-icons-png.flaticon.com/512/3063/3063815.png",
  dental: "https://cdn-icons-png.flaticon.com/512/3063/3063832.png",
  cardiology: "https://cdn-icons-png.flaticon.com/512/3063/3063824.png",
  ophthalmology: "https://cdn-icons-png.flaticon.com/512/3063/3063828.png",
  orthopedics: "https://cdn-icons-png.flaticon.com/512/2966/2966326.png",
  dermatology: "https://cdn-icons-png.flaticon.com/512/2966/2966339.png",
  pediatrics: "https://cdn-icons-png.flaticon.com/512/3063/3063835.png",
  gynecology: "https://cdn-icons-png.flaticon.com/512/3063/3063830.png",
  general: "https://cdn-icons-png.flaticon.com/512/3063/3063834.png"
};

function getServiceCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('سكر') || n.includes('انسولين') || n.includes('تراكمي')) return 'sugar';
  if (n.includes('صورة دم') || n.includes('هيموجلوبين') || n.includes('صفائح') || n.includes('كريات') || n.includes('cbc')) return 'blood';
  if (n.includes('كلى') || n.includes('بول') || n.includes('بروتين')) return 'kidney';
  if (n.includes('كبد') || n.includes('انزيمات') || n.includes('صفار')) return 'liver';
  if (n.includes('فيتامين') || n.includes('كالسيوم') || n.includes('حديد') || n.includes('زنك')) return 'vitamin';
  if (n.includes('هرمون') || n.includes('غدة') || n.includes('درقية') || n.includes('تستوستيرون')) return 'hormone';
  if (n.includes('براز') || n.includes('دم خفي')) return 'stool';
  if (n.includes('بول')) return 'urine';
  if (n.includes('أسنان') || n.includes('حشو') || n.includes('تقويم') || n.includes('تبييض') || n.includes('خلع')) return 'dental';
  if (n.includes('قلب') || n.includes('إيكو') || n.includes('تخطيط') || n.includes('ضغط')) return 'cardiology';
  if (n.includes('عيون') || n.includes('نظر') || n.includes('ليزك')) return 'ophthalmology';
  if (n.includes('عظام') || n.includes('مفاصل') || n.includes('ركبة')) return 'orthopedics';
  if (n.includes('جلد') || n.includes('بشرة') || n.includes('ليزر') || n.includes('فيلر')) return 'dermatology';
  if (n.includes('أطفال') || n.includes('طفل')) return 'pediatrics';
  if (n.includes('نساء') || n.includes('حمل') || n.includes('ولادة') || n.includes('سونار')) return 'gynecology';
  return 'general';
}

function getServiceIcon(name: string): string {
  const cat = getServiceCategory(name);
  const icons: Record<string, string> = {
    sugar: '🩸', blood: '🩸', kidney: '🧪', liver: '🫀', vitamin: '💊', hormone: '⚗️', stool: '🧫', urine: '🧪',
    dental: '🦷', cardiology: '❤️', ophthalmology: '👁️',
    orthopedics: '🦴', dermatology: '✨', pediatrics: '🧸', gynecology: '🤰', general: '🩺'
  };
  return icons[cat] || '🩺';
}

function getServiceDescription(name: string): string {
  const cat = getServiceCategory(name);
  const descs: Record<string, string> = {
    sugar: "متابعة دقيقة لمستويات السكر",
    blood: "تحليل شامل لصورة الدم",
    kidney: "تقييم شامل لوظائف الكلى",
    liver: "فحص دقيق لوظائف الكبد",
    vitamin: "متابعة مستويات الفيتامينات",
    hormone: "تحليل شامل للهرمونات",
    stool: "فحص مخبري دقيق",
    urine: "تحليل شامل للبول",
    dental: "عناية متكاملة بالأسنان",
    cardiology: "رعاية متخصصة للقلب",
    ophthalmology: "فحص دقيق للنظر",
    orthopedics: "علاج فعال للعظام والمفاصل",
    dermatology: "عناية فائقة بالبشرة",
    pediatrics: "رعاية شاملة لصحة طفلك",
    gynecology: "متابعة دقيقة لصحة المرأة",
    general: "خدمة طبية متميزة"
  };
  return descs[cat] || "خدمة طبية متميزة";
}

function calcFinalPrice(original: number | null, discountValue: number, discountType: string): number | null {
  if (original === null) return null;
  const out = discountType === "percentage" ? original * (1 - discountValue / 100) : original - discountValue;
  return Math.max(0, Math.round(out * 100) / 100);
}

const SERVICE_KEYWORD_IMAGES: Array<{ keywords: string[]; images: string[] }> = [
  {
    keywords: ["تبييض", "بلانش", "ابتسامة", "فينير", "عدسات"],
    images: [
      "https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1598256989800-fe5f95da9787?w=1200&q=85&auto=format&fit=crop",
    ],
  },
  {
    keywords: ["زراعة", "تقويم", "حشو", "خلع", "عصب"],
    images: [
      "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=1200&q=85&auto=format&fit=crop",
    ],
  },
  {
    keywords: ["ليزر", "فيلر", "بوتوكس", "بشرة", "تجاعيد"],
    images: [
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=1200&q=85&auto=format&fit=crop",
    ],
  },
  {
    keywords: ["سونار", "حمل", "ولادة", "نساء", "رحم"],
    images: [
      "https://images.unsplash.com/photo-1584515933487-779824d29309?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=85&auto=format&fit=crop",
    ],
  },
  {
    keywords: ["نظر", "عيون", "ليزك", "مياه بيضاء", "قرنية"],
    images: [
      "https://images.unsplash.com/photo-1587613757226-c22d09e4bd23?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=1200&q=85&auto=format&fit=crop",
    ],
  },
  {
    keywords: ["تحليل", "مختبر", "دم", "فحص", "سكر", "كلى", "كبد", "هرمون", "فيتامين"],
    images: [
      "https://images.unsplash.com/photo-1579154204601-01588f351e67?w=1200&q=85&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=1200&q=85&auto=format&fit=crop",
    ],
  },
];

function pickHeroImage(theme: any, promo: Promotion, items: string[]): string {
  const randomSeed = Math.floor(Math.random() * 100000).toString();
  const seed = (promo.id || "") + randomSeed;
  
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const searchText = `${promo.title} ${promo.description || ""} ${items.join(" ")}`.toLowerCase();
  for (const entry of SERVICE_KEYWORD_IMAGES) {
    if (entry.keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
      return entry.images[hash % entry.images.length];
    }
  }
  const heros = theme.heroImages || [];
  if (heros.length === 0) return "";
  return heros[hash % heros.length];
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, updateClinic } = useClinic();
  const { toast } = useToast();

  const promoImageInputRef = useRef<HTMLInputElement>(null);

  const [clinicName, setClinicName] = useState("");
  const [clinicSpecialty, setClinicSpecialty] = useState("general");
  const [otherSpecialty, setOtherSpecialty] = useState("");
  const [botToken, setBotToken] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [loadingBotInfo, setLoadingBotInfo] = useState(false);
  const [voiceAgentEnabled, setVoiceAgentEnabled] = useState(false);
  const [voiceTone, setVoiceTone] = useState("ودود ومحترم");
  const [voiceMode, setVoiceMode] = useState("auto");
  const [staffList, setStaffList] = useState<Array<{ id: string; email: string; role: string; approved: boolean; created_at: string }>>([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"reception" | "cashier">("reception");
  const [staffBusy, setStaffBusy] = useState(false);
  const [receptionistWhatsapp, setReceptionistWhatsapp] = useState("");
  const [workingHoursStart, setWorkingHoursStart] = useState("08:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("16:00");

  const [clinicNameEn, setClinicNameEn] = useState("");
  const [clinicNameEnEdited, setClinicNameEnEdited] = useState(false);
  const [receptionistEmail, setReceptionistEmail] = useState("");
  const [qrPosterUrl, setQrPosterUrl] = useState<string | null>(null);
  const [generatingQrPoster, setGeneratingQrPoster] = useState(false);
  const [newServiceNameEn, setNewServiceNameEn] = useState("");
  const [newServiceNameEnEdited, setNewServiceNameEnEdited] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingServiceNameEn, setEditingServiceNameEn] = useState("");
  const [editingServicePrice, setEditingServicePrice] = useState("");

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  
  const [promoForm, setPromoForm] = useState<Partial<Promotion>>({
    discount_type: "percentage",
    is_active: true,
    per_user_limit: 1,
    template: "auto",
    items: "",
    phone_text: "",
    location: "",
    service_ids: [],
  });
  
  const [promoImageFile, setPromoImageFile] = useState<File | null>(null);
  const [promoImagePreview, setPromoImagePreview] = useState<string | null>(null);
  const [generatingPromoImage, setGeneratingPromoImage] = useState(false);
  const [uploadingPromoImage, setUploadingPromoImage] = useState(false);

  // Account Settings
  const [ownerEmail, setOwnerEmail] = useState(user?.email || "");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [updatingAccount, setUpdatingAccount] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user]);

  useEffect(() => {
    if (clinic) {
      setClinicName(clinic.name || "");
      const dbSpecialty = (clinic as any).specialty;
      const lsSpecialty = typeof window !== "undefined" ? localStorage.getItem(`clinic_specialty_${clinic.id}`) : null;
      setClinicSpecialty(dbSpecialty || lsSpecialty || "general");
      if (dbSpecialty === "other" || lsSpecialty === "other") {
        setOtherSpecialty((clinic as any).specialty_label || "");
      }
      setBotToken((clinic as any).bot_token || "");
      setLogoUrl(clinic.logo_url || null);
      setBotUsername((clinic as any).bot_username || null);
      setVoiceAgentEnabled(!!(clinic as any).voice_agent_enabled);
      setVoiceTone((clinic as any).voice_tone || "ودود ومحترم");
      setVoiceMode((clinic as any).voice_mode || "auto");
      setReceptionistWhatsapp((clinic as any).receptionist_whatsapp || "");
      setWorkingHoursStart((clinic as any).working_hours_start || "08:00");
      setWorkingHoursEnd((clinic as any).working_hours_end || "16:00");
      setClinicNameEn((clinic as any).name_en || "");
      setReceptionistEmail((clinic as any).receptionist_email || "");
      setQrPosterUrl((clinic as any).qr_image_url || null);
      setClinicNameEnEdited(!!(clinic as any).name_en);
      fetchServices();
      fetchStaff();
      fetchPromotions();
    }
  }, [clinic]);

  useEffect(() => {
    if (clinicNameEnEdited) return;
    if (!clinicName) { setClinicNameEn(""); return; }
    setClinicNameEn(translateMedicalToEnglish(clinicName));
  }, [clinicName, clinicNameEnEdited]);

  useEffect(() => {
    if (newServiceNameEnEdited) return;
    if (!newServiceName) { setNewServiceNameEn(""); return; }
    setNewServiceNameEn(translateMedicalToEnglish(newServiceName));
  }, [newServiceName, newServiceNameEnEdited]);

  useEffect(() => {
    if (user?.email) setOwnerEmail(user.email);
  }, [user]);

  const fetchStaff = async () => {
    if (!clinic) return;
    const { data } = await supabase
      .from("clinic_staff")
      .select("id,email,role,approved,created_at")
      .eq("clinic_id", clinic.id)
      .order("created_at", { ascending: false });
    setStaffList((data || []) as any);
  };

  const addStaff = async () => {
    if (!newStaffEmail.trim() || !newStaffPassword.trim()) {
      toast({ title: "بيانات ناقصة", description: "أدخل البريد وكلمة المرور", variant: "destructive" });
      return;
    }
    setStaffBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch(`${supabaseUrl}/functions/v1/owner-create-staff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          email: newStaffEmail.trim(),
          password: newStaffPassword,
          role: newStaffRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast({ title: "تعذّر الإضافة", description: data?.error || "خطأ غير معروف", variant: "destructive" });
        return;
      }
      toast({ title: "تمت إضافة الموظف ✓", description: "يمكنه تسجيل الدخول فوراً بالبريد وكلمة المرور" });
      setNewStaffEmail("");
      setNewStaffPassword("");
      fetchStaff();
    } finally {
      setStaffBusy(false);
    }
  };

  const approveStaff = async (id: string) => {
    await supabase.rpc("approve_clinic_staff", { _staff_id: id } as any);
    toast({ title: "تم الاعتماد ✓" });
    fetchStaff();
  };

  const revokeStaff = async (id: string) => {
    await supabase.rpc("revoke_clinic_staff", { _staff_id: id } as any);
    toast({ title: "تم التعليق" });
    fetchStaff();
  };

  const removeStaff = async (id: string) => {
    await supabase.rpc("remove_clinic_staff", { _staff_id: id } as any);
    toast({ title: "تم الحذف" });
    fetchStaff();
  };

  const refreshBotUsername = async () => {
    setLoadingBotInfo(true);
    const r = await invokeBotAction("bot-info");
    setLoadingBotInfo(false);
    if (r.ok && r.data?.username) {
      setBotUsername(r.data.username);
      toast({ title: "تم جلب اسم الموظف الآلي ✓", description: `@${r.data.username}` });
    } else {
      toast({ title: "تعذّر جلب اسم الموظف الآلي", description: r.error || "احفظ التوكن أولاً", variant: "destructive" });
    }
  };

  const fetchServices = async () => {
    if (!clinic) return;
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("clinic_id", clinic.id)
      .order("created_at", { ascending: true });
    setServices(data || []);
  };

  const fetchPromotions = async () => {
    if (!clinic) return;
    const { data } = await supabase
      .from("promotions")
      .select("*")
      .eq("clinic_id", clinic.id)
      .order("created_at", { ascending: false });
    setPromotions(data || []);
  };

  const handleSaveClinic = async () => {
    if (!clinic) {
      toast({ title: "تعذر تحميل العيادة", description: "أعد تحميل الصفحة.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await supabase.rpc("save_clinic_vault", { _bot_token: botToken || null } as any);
    } catch (e) {
      console.warn("vault save failed", e);
    }

    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(`clinic_specialty_${clinic.id}`, clinicSpecialty);
      }
    } catch (e) {}

    const fullPayload: any = {
      name: clinicName,
      name_en: clinicNameEn || null,
      specialty: clinicSpecialty,
      specialty_label: otherSpecialty || null,
      bot_token: botToken,
      voice_agent_enabled: voiceAgentEnabled,
      voice_tone: voiceTone,
      voice_mode: voiceMode,
      receptionist_whatsapp: receptionistWhatsapp || null,
      receptionist_email: receptionistEmail || null,
      working_hours_start: workingHoursStart,
      working_hours_end: workingHoursEnd,
    };

    let { error } = await updateClinic(fullPayload);

    if (error && String(error.message || "").toLowerCase().includes("specialty")) {
      console.warn("specialty column missing, retrying without it");
      const { specialty, specialty_label, ...safePayload } = fullPayload;
      const retry = await updateClinic(safePayload);
      error = retry.error;
    }

    if (error) {
      setSaving(false);
      toast({ title: "خطأ", description: error.message || "فشل في حفظ الإعدادات", variant: "destructive" });
      return;
    }
    if (botToken && botToken.trim().length > 10) {
      const hookResult = await invokeBotAction("set-webhook");
      if (!hookResult.ok) {
        toast({ title: "تم الحفظ - تنبيه", description: "تم حفظ التوكن لكن فشل ضبط webhook", variant: "destructive" });
      } else {
        toast({ title: "تم الحفظ ✓", description: "تم حفظ الإعدادات وربط الموظف الآلي بنجاح" });
      }
    } else {
      toast({ title: "تم الحفظ ✓", description: "تم حفظ إعدادات العيادة بنجاح" });
    }
    setSaving(false);
  };

  const handleUpdateAccount = async () => {
    setUpdatingAccount(true);
    try {
      const updates: any = {};
      if (ownerEmail && ownerEmail !== user?.email) {
        updates.email = ownerEmail;
      }
      if (ownerPassword && ownerPassword.length >= 6) {
        updates.password = ownerPassword;
      }

      if (Object.keys(updates).length === 0) {
        toast({ title: "تنبيه", description: "لم تقم بتغيير أي بيانات", variant: "default" });
        setUpdatingAccount(false);
        return;
      }

      const { error } = await supabase.auth.updateUser(updates);
      if (error) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "تم التحديث ✓", description: "تم تحديث بيانات الحساب بنجاح. يرجى مراجعة بريدك إذا غيرت الإيميل." });
        setOwnerPassword("");
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل تحديث الحساب", variant: "destructive" });
    } finally {
      setUpdatingAccount(false);
    }
  };

  const invokeBotAction = async (
    action: "set-webhook" | "webhook-info" | "bot-info"
  ): Promise<{ ok: boolean; data?: any; error?: string }> => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch(`${supabaseUrl}/functions/v1/telegram-bot?action=${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        return { ok: false, error: data?.error || data?.webhook?.description || `HTTP ${res.status}` };
      }
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e?.message || "خطأ في الاتصال" };
    }
  };

  const handleCheckWebhook = async () => {
    const r = await invokeBotAction("webhook-info");
    if (!r.ok) {
      toast({ title: "تعذّر فحص الـ Webhook", description: r.error, variant: "destructive" });
      return;
    }
    const info = r.data?.info?.result || {};
    const desc = info.url
      ? `✓ مرتبط بـ: ${info.url}\nآخر خطأ: ${info.last_error_message || "لا يوجد"}\nمعلق: ${info.pending_update_count ?? 0}`
      : "⚠️ لم يُضبط webhook بعد. احفظ التوكن أو اضغط 'إعادة ضبط الـ Webhook'.";
    toast({ title: info.url ? "حالة الـ Webhook" : "تنبيه", description: desc });
  };

  const handleResetWebhook = async () => {
    const r = await invokeBotAction("set-webhook");
    toast({
      title: r.ok ? "تم ضبط الـ Webhook ✓" : "فشل الضبط",
      description: r.ok ? "الموظف الآلي جاهز لاستقبال الرسائل" : (r.error || ""),
      variant: r.ok ? "default" : "destructive",
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !clinic) return;
    setUploadingLogo(true);
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/logo.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from("clinic-logos")
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast({ title: "خطأ", description: "فشل في رفع الشعار", variant: "destructive" });
      setUploadingLogo(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("clinic-logos").getPublicUrl(filePath);
    const { error: updateError } = await supabase
      .from("clinics")
      .update({ logo_url: publicUrl })
      .eq("id", clinic.id)
      .eq("owner_id", user.id);
    if (updateError) {
      toast({ title: "خطأ", description: "فشل في حفظ رابط الشعار", variant: "destructive" });
    } else {
      setLogoUrl(publicUrl);
      toast({ title: "تم الرفع ✓", description: "تم رفع شعار العيادة بنجاح" });
    }
    setUploadingLogo(false);
  };

  const handleAddService = async () => {
    if (!clinic || !newServiceName.trim()) return;
    const trimmedPrice = newServicePrice.trim();
    const priceValue = trimmedPrice === "" ? null : parseFloat(trimmedPrice);
    if (trimmedPrice !== "" && (Number.isNaN(priceValue) || (priceValue as number) < 0)) {
      toast({ title: "خطأ", description: "السعر غير صالح", variant: "destructive" });
      return;
    }
    const nameEn = newServiceNameEn.trim() || translateMedicalToEnglish(newServiceName.trim());
    const { error } = await supabase.from("services").insert({
      clinic_id: clinic.id,
      name: newServiceName.trim(),
      name_en: nameEn || null,
      name_en_edited_by_user: newServiceNameEnEdited,
      price: priceValue,
    });
    if (error) {
      toast({ title: "خطأ", description: error.message || "فشل في إضافة الخدمة", variant: "destructive" });
    } else {
      setNewServiceName("");
      setNewServicePrice("");
      setNewServiceNameEn("");
      setNewServiceNameEnEdited(false);
      fetchServices();
      toast({ title: "تمت الإضافة ✓", description: "تمت إضافة الخدمة بنجاح" });
    }
  };

  const handleUpdateService = async (id: string) => {
    const priceNum = parseFloat(editingServicePrice);
    const { error } = await supabase.from("services").update({
      name_en: editingServiceNameEn.trim() || null,
      name_en_edited_by_user: true,
      price: isNaN(priceNum) ? null : priceNum,
    }).eq("id", id).eq("clinic_id", clinic?.id || "");
    if (error) {
      toast({ title: "خطأ", description: "فشل تحديث بيانات الخدمة", variant: "destructive" });
    } else {
      toast({ title: "تم التحديث ✓" });
      setEditingServiceId(null);
      setEditingServiceNameEn("");
      setEditingServicePrice("");
      fetchServices();
    }
  };

  const handleDeleteService = async (id: string) => {
    const { error } = await supabase.from("services").delete().eq("id", id).eq("clinic_id", clinic?.id || "");
    if (error) {
      toast({ title: "خطأ", description: "فشل في حذف الخدمة", variant: "destructive" });
    } else {
      fetchServices();
      toast({ title: "تم الحذف", description: "تم حذف الخدمة بنجاح" });
    }
  };

  // ============================================================
  // QR POSTER GENERATOR (Client-side Canvas)
  // ============================================================
  const generateQrPoster = async (force = false): Promise<string | null> => {
    if (!clinic?.id) {
      toast({ title: "خطأ", description: "لم يتم تحميل العيادة", variant: "destructive" });
      return null;
    }
    if (qrPosterUrl && !force) return qrPosterUrl;

    setGeneratingQrPoster(true);
    try {
      const effectiveBotUsername = botUsername || "SmartClinc_bot";
      const tgLink = `https://t.me/${effectiveBotUsername}?start=clinic_${clinic.id}`;
      const spec = SPECIALTY_THEMES[clinicSpecialty] || SPECIALTY_THEMES.general;

      const W = 1240, H = 1754;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const loadImg = (url: string): Promise<HTMLImageElement | null> =>
        new Promise((resolve) => {
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          const t = setTimeout(() => resolve(null), 12000);
          img.onload = () => { clearTimeout(t); resolve(img); };
          img.onerror = () => { clearTimeout(t); resolve(null); };
          img.src = url;
        });

      const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0B1F3A");
      bg.addColorStop(0.5, "#13294D");
      bg.addColorStop(1, "#0B1F3A");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.fillStyle = "rgba(212,175,55,0.06)";
      for (let x = 40; x < W; x += 60) {
        for (let y = 40; y < H; y += 60) {
          ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();

      ctx.strokeStyle = "#D4AF37";
      ctx.lineWidth = 6;
      roundRect(34, 34, W - 68, H - 68, 28); ctx.stroke();
      ctx.strokeStyle = "rgba(244,229,177,0.35)";
      ctx.lineWidth = 1.5;
      roundRect(52, 52, W - 104, H - 104, 20); ctx.stroke();

      const logoSize = 260;
      const logoY = 150;
      let logoImg: HTMLImageElement | null = null;
      if (clinic.logo_url) logoImg = await loadImg(clinic.logo_url);

      ctx.save();
      ctx.shadowColor = "rgba(212,175,55,0.55)";
      ctx.shadowBlur = 35;
      ctx.fillStyle = "#D4AF37";
      ctx.beginPath(); ctx.arc(W / 2, logoY + logoSize / 2, logoSize / 2 + 14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.arc(W / 2, logoY + logoSize / 2, logoSize / 2 + 4, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      ctx.beginPath(); ctx.arc(W / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2); ctx.clip();
      if (logoImg) {
        ctx.drawImage(logoImg, W / 2 - logoSize / 2, logoY, logoSize, logoSize);
      } else {
        ctx.fillStyle = "#0B1F3A";
        ctx.fillRect(W / 2 - logoSize / 2, logoY, logoSize, logoSize);
        ctx.fillStyle = "#D4AF37";
        ctx.font = "900 150px 'Segoe UI', Arial";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("+", W / 2, logoY + logoSize / 2 + 8);
      }
      ctx.restore();

      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.direction = "rtl";
      const nameAr = (clinic.name || "").trim();
      let nameFontSize = 84;
      ctx.font = `900 ${nameFontSize}px 'Cairo','Tajawal',Arial`;
      while (ctx.measureText(nameAr).width > W - 260 && nameFontSize > 48) {
        nameFontSize -= 4;
        ctx.font = `900 ${nameFontSize}px 'Cairo','Tajawal',Arial`;
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 12;
      ctx.fillText(nameAr, W / 2, logoY + logoSize + 70);
      ctx.shadowColor = "transparent";

      ctx.direction = "ltr";
      ctx.fillStyle = "#D4AF37";
      ctx.font = "600 40px 'Cairo','Segoe UI',Arial";
      const nameEn = (clinicNameEn || "").trim();
      if (nameEn) ctx.fillText(nameEn, W / 2, logoY + logoSize + 175);

      const divY = logoY + logoSize + 250;
      ctx.strokeStyle = "#D4AF37";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 240, divY); ctx.lineTo(W / 2 - 50, divY);
      ctx.moveTo(W / 2 + 50, divY); ctx.lineTo(W / 2 + 240, divY);
      ctx.stroke();
      ctx.fillStyle = "#D4AF37";
      ctx.beginPath();
      ctx.moveTo(W / 2, divY - 12); ctx.lineTo(W / 2 + 12, divY);
      ctx.lineTo(W / 2, divY + 12); ctx.lineTo(W / 2 - 12, divY);
      ctx.closePath(); ctx.fill();

      const specText = `${spec.icon}  ${spec.label}`;
      ctx.font = "700 30px 'Cairo','Segoe UI Emoji',Arial";
      const specW = ctx.measureText(specText).width + 70;
      const specH = 60;
      const specX = W / 2 - specW / 2;
      const specY = divY + 55;
      ctx.fillStyle = "rgba(212,175,55,0.15)";
      roundRect(specX, specY, specW, specH, 30); ctx.fill();
      ctx.strokeStyle = "rgba(212,175,55,0.65)";
      ctx.lineWidth = 2;
      roundRect(specX, specY, specW, specH, 30); ctx.stroke();
      ctx.fillStyle = "#F4E5B1";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.direction = "rtl";
      ctx.fillText(specText, W / 2, specY + specH / 2 + 2);

      ctx.direction = "rtl";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 52px 'Cairo','Tajawal',Arial";
      ctx.fillText("امسح الرمز واحجز موعدك", W / 2, specY + specH + 65);

      ctx.fillStyle = "#F4E5B1";
      ctx.font = "600 28px 'Cairo',Arial";
      ctx.fillText("بدون انتظار — في ثوانٍ فقط", W / 2, specY + specH + 140);

      const qrBoxSize = 640;
      const qrBoxX = W / 2 - qrBoxSize / 2;
      const qrBoxY = specY + specH + 215;

      ctx.save();
      ctx.shadowColor = "rgba(212,175,55,0.55)";
      ctx.shadowBlur = 45;
      ctx.fillStyle = "#FFFFFF";
      roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 42);
      ctx.fill();
      ctx.restore();

      const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=520x520&data=${encodeURIComponent(tgLink)}&color=0B1F3A&bgcolor=FFFFFF&margin=0&qzone=1`;
      const qrImg = await loadImg(qrApi);
      if (qrImg) {
        ctx.drawImage(qrImg, qrBoxX + 60, qrBoxY + 60, qrBoxSize - 120, qrBoxSize - 120);
      } else {
        ctx.fillStyle = "#0B1F3A";
        ctx.font = "600 20px 'Courier New', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.direction = "ltr";
        const parts = tgLink.match(/.{1,34}/g) || [tgLink];
        parts.forEach((p, i) => ctx.fillText(p, W / 2, qrBoxY + qrBoxSize / 2 + (i - parts.length / 2) * 26));
      }

      const contactY = qrBoxY + qrBoxSize + 55;
      ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.direction = "rtl";
      const contacts: string[] = [];
      const phone = (clinic as any).phone || "";
      if (phone) contacts.push(`📞  ${phone}`);
      if (receptionistEmail) contacts.push(`✉️  ${receptionistEmail}`);

      ctx.font = "600 28px 'Cairo','Segoe UI Emoji',Arial";
      ctx.fillStyle = "#F4E5B1";
      contacts.forEach((c, i) => ctx.fillText(c, W / 2, contactY + i * 46));

      ctx.fillStyle = "rgba(244,229,177,0.45)";
      ctx.font = "500 20px 'Cairo',Arial";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("Smart Clinic System  •  2026", W / 2, H - 72);

      const blob: Blob = await new Promise((res, rej) => {
        canvas.toBlob((b) => b ? res(b) : rej(new Error("toBlob failed")), "image/png", 0.95);
      });

      const path = `${clinic.id}/qr-poster.png`;
      let uploaded = false;
      try {
        const { error: upErr } = await supabase.storage
          .from("clinic-qr-posters")
          .upload(path, blob, { upsert: true, contentType: "image/png" });
        uploaded = !upErr;
        if (upErr) console.warn("QR upload failed:", upErr);
      } catch (e) { console.warn(e); }

      let publicUrl = "";
      if (uploaded) {
        const { data: urlData } = supabase.storage.from("clinic-qr-posters").getPublicUrl(path);
        publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        await supabase.from("clinics").update({
          qr_image_url: publicUrl,
          qr_generated_at: new Date().toISOString(),
        }).eq("id", clinic.id);
        setQrPosterUrl(publicUrl);
      } else {
        publicUrl = URL.createObjectURL(blob);
        setQrPosterUrl(publicUrl);
      }

      toast({ title: "✅ تم توليد الملصق الفاخر", description: "جاهز للطباعة بحجم A5" });
      return publicUrl;
    } catch (e: any) {
      console.error(e);
      toast({
        title: "❌ فشل توليد الملصق",
        description: e?.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
      return null;
    } finally {
      setGeneratingQrPoster(false);
    }
  };

  const downloadQrPoster = async () => {
    let url = qrPosterUrl;
    if (!url) url = await generateQrPoster(true);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR-${clinic?.name || "clinic"}.png`;
    a.target = "_blank";
    a.click();
  };

  const resetPromoForm = () => {
    const template = PROMO_TEMPLATES[clinicSpecialty] || PROMO_TEMPLATES.general;
    setPromoForm({
      discount_type: "percentage",
      is_active: true,
      per_user_limit: 1,
      template: "auto",
      items: template.items,
      phone_text: "",
      location: "",
      service_ids: [],
      title: template.title,
      description: template.description,
    });
    setPromoImageFile(null);
    setPromoImagePreview(null);
    setEditingPromo(null);
  };

  const openPromoDialog = (promo?: Promotion) => {
    if (promo) {
      setEditingPromo(promo);
      setPromoForm({
        title: promo.title,
        description: promo.description || "",
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        code: promo.code || "",
        start_date: promo.start_date || "",
        end_date: promo.end_date || "",
        usage_limit: promo.usage_limit || undefined,
        per_user_limit: promo.per_user_limit || 1,
        is_active: promo.is_active,
        image_url: promo.image_url || "",
        template: promo.template || "auto",
        items: promo.items || "",
        phone_text: promo.phone_text || "",
        location: promo.location || "",
        service_ids: promo.service_ids || [],
      });
      if (promo.image_url) setPromoImagePreview(promo.image_url);
    } else {
      resetPromoForm();
    }
    setPromoDialogOpen(true);
  };

  const handlePromoImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPromoImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPromoImagePreview(ev.target?.result as string);
    reader.onerror = () => toast({ title: "خطأ", description: "فشل قراءة الصورة", variant: "destructive" });
    reader.readAsDataURL(file);
    if (promoImageInputRef.current) promoImageInputRef.current.value = "";
  };

  const handlePromoImageUploadClick = () => {
    if (promoImageInputRef.current) promoImageInputRef.current.click();
    else toast({ title: "خطأ", description: "حدث خطأ في تهيئة رفع الصورة", variant: "destructive" });
  };

  const handleAutoFillTemplate = () => {
    const template = PROMO_TEMPLATES[clinicSpecialty] || PROMO_TEMPLATES.general;
    setPromoForm(prev => ({
      ...prev,
      title: template.title,
      description: template.description,
      items: template.items,
    }));
    toast({ title: "✨ تم توليد النصوص التلقائية", description: "يمكنك تعديلها كما تشاء" });
  };

  const handlePromoSubmit = async () => {
    if (!clinic) return;
    if (!promoForm.title || !promoForm.discount_type || !promoForm.discount_value) {
      toast({ title: "بيانات ناقصة", description: "يرجى ملء جميع الحقول الأساسية", variant: "destructive" });
      return;
    }
    if (!promoForm.service_ids || promoForm.service_ids.length === 0) {
      toast({
        title: "⚠️ يجب اختيار خدمة واحدة على الأقل",
        description: "العرض يحتاج خدمة واحدة على الأقل ليظهر للعملاء بشكل صحيح.",
        variant: "destructive",
      });
      return;
    }
    setUploadingPromoImage(true);
    let imageUrl = promoForm.image_url || null;
    if (promoImageFile) {
      try {
        const fileExt = promoImageFile.name.split(".").pop();
        const filePath = `${clinic.id}/promo_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("promo-images")
          .upload(filePath, promoImageFile, { upsert: true });
        if (uploadError) {
          toast({ title: "خطأ في رفع الصورة", description: uploadError.message, variant: "destructive" });
          setUploadingPromoImage(false);
          return;
        }
        const { data: { publicUrl } } = supabase.storage.from("promo-images").getPublicUrl(filePath);
        imageUrl = publicUrl;
      } catch (err: any) {
        toast({ title: "خطأ", description: err.message || "فشل رفع الصورة", variant: "destructive" });
        setUploadingPromoImage(false);
        return;
      }
    }
    const payload = {
      clinic_id: clinic.id,
      title: promoForm.title,
      description: promoForm.description || null,
      discount_type: promoForm.discount_type,
      discount_value: promoForm.discount_value,
      code: promoForm.code || null,
      start_date: promoForm.start_date || null,
      end_date: promoForm.end_date || null,
      usage_limit: promoForm.usage_limit || null,
      per_user_limit: promoForm.per_user_limit || 1,
      is_active: promoForm.is_active !== undefined ? promoForm.is_active : true,
      image_url: imageUrl,
      template: promoForm.template || "auto",
      items: promoForm.items || null,
      phone_text: promoForm.phone_text || null,
      location: promoForm.location || null,
      service_ids: promoForm.service_ids || [],
    };
    let error;
    if (editingPromo) {
      const { error: e } = await supabase.from("promotions").update(payload).eq("id", editingPromo.id);
      error = e;
    } else {
      const { error: e } = await supabase.from("promotions").insert(payload);
      error = e;
    }
    setUploadingPromoImage(false);
    if (error) {
      toast({ title: "خطأ", description: "فشل حفظ العرض: " + error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الحفظ ✓", description: "تم حفظ العرض بنجاح" });
      setPromoDialogOpen(false);
      resetPromoForm();
      fetchPromotions();
    }
  };

  // ============================================================
  // V45: LUXURY GLASSMORPHISM PROMO IMAGE GENERATOR
  // ============================================================
  const generatePromoImage = async (promo: Promotion, forceRegenerate: boolean = false) => {
    if (!clinic) {
      toast({ title: "خطأ", description: "لم يتم تحميل بيانات العيادة", variant: "destructive" });
      return;
    }

    if (!forceRegenerate && promo.image_url) {
      const confirmRegen = window.confirm(
        "✅ توجد صورة مرفوعة مسبقاً لهذا العرض.\n\nهل تريد توليد تصميم إعلاني جديد يحل محل القديم؟"
      );
      if (!confirmRegen) {
        toast({
          title: "ℹ️ الصورة موجودة",
          description: "الصورة الحالية جاهزة. يمكنك حذفها من زر 🗑 على الصورة ثم إعادة التوليد.",
        });
        return;
      }
    }

    setGeneratingPromoImage(true);
    toast({ title: "🎨 جاري التصميم الفاخر", description: "جاري إنشاء الإعلان بأعلى معايير الجودة..." });

    try {
      const specialty = clinicSpecialty || "general";
      const theme = SPECIALTY_THEMES[specialty] || SPECIALTY_THEMES.general;

      const itemsList = (promo as any).items
        ? String((promo as any).items)
            .split(/[,،\n]/)
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

      const selectedServices = services.filter(s => (promo.service_ids || []).includes(s.id));
      const servicesToDraw = selectedServices.slice(0, 6);

      const W = 1200;
      const H = 1600; 
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const loadImage = (url: string): Promise<HTMLImageElement | null> => {
        return new Promise((resolve) => {
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          const timer = setTimeout(() => resolve(null), 15000);
          img.onload = () => { clearTimeout(timer); resolve(img); };
          img.onerror = () => { clearTimeout(timer); resolve(null); };
          img.src = url;
        });
      };

      const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      // 1. Premium Dark Mesh Background
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, "#0B1F3A"); // Deep Navy
      bgGrad.addColorStop(0.5, "#1E3A8A"); // Royal Blue
      bgGrad.addColorStop(1, "#0B1F3A");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Add glowing Orbs for Mesh effect
      const drawOrb = (x: number, y: number, r: number, color: string) => {
        const radGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
        radGrad.addColorStop(0, color);
        radGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      };
      drawOrb(W * 0.8, H * 0.1, 400, "rgba(212, 175, 55, 0.15)"); // Gold glow top right
      drawOrb(W * 0.2, H * 0.9, 500, "rgba(56, 189, 248, 0.15)"); // Cyan glow bottom left

      // 2. Top Badges (Glassmorphism Pills)
      const badgeY = 50;
      const badgeH = 40;

      if (promo.end_date) {
        ctx.save();
        const badgeW = 220;
        const badgeX = 40;
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        roundRect(badgeX, badgeY, badgeW, badgeH, 20);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        roundRect(badgeX, badgeY, badgeW, badgeH, 20);
        ctx.stroke();
        
        ctx.font = "bold 18px 'Cairo', Arial";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = "rtl";
        ctx.fillText(`⏰ حتى ${promo.end_date}`, badgeX + badgeW/2, badgeY + badgeH/2);
        ctx.restore();
      }

      if (promo.location) {
        ctx.save();
        const locW = 240;
        const locX = W - 40 - locW;
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        roundRect(locX, badgeY, locW, badgeH, 20);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        roundRect(locX, badgeY, locW, badgeH, 20);
        ctx.stroke();
        
        ctx.font = "bold 18px 'Cairo', Arial";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = "rtl";
        ctx.fillText(`📍 ${promo.location}`, locX + locW/2, badgeY + badgeH/2);
        ctx.restore();
      }

      // 3. Header (Logo + Names)
      const logoSize = 110;
      const logoX = W / 2 - logoSize / 2;
      const logoY = 120;
      
      // Glass Logo Frame
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      roundRect(logoX - 15, logoY - 15, logoSize + 30, logoSize + 30, 25);
      ctx.fill();
      ctx.strokeStyle = "#D4AF37"; // Gold Border
      ctx.lineWidth = 3;
      roundRect(logoX - 15, logoY - 15, logoSize + 30, logoSize + 30, 25);
      ctx.stroke();
      ctx.restore();

      let logoImg: HTMLImageElement | null = null;
      if (clinic.logo_url) {
        logoImg = await loadImage(clinic.logo_url);
      }

      if (logoImg) {
        ctx.save();
        roundRect(logoX, logoY, logoSize, logoSize, 15);
        ctx.clip();
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      } else {
        ctx.save();
        roundRect(logoX, logoY, logoSize, logoSize, 15);
        ctx.fillStyle = "#D4AF37";
        ctx.fill();
        ctx.font = "bold 50px 'Cairo', Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0B1F3A";
        ctx.fillText((clinic.name || "ع").charAt(0), logoX + logoSize/2, logoY + logoSize/2 + 5);
        ctx.restore();
      }

      // Clinic Name
      const clinicNameY = logoY + logoSize + 40;
      ctx.save();
      ctx.font = "900 52px 'Cairo', 'Tajawal', Arial";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 10;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.direction = "rtl";
      ctx.fillText(clinic.name, W / 2, clinicNameY);
      ctx.restore();

      // Specialty
      const specY = clinicNameY + 75;
      ctx.save();
      ctx.font = "600 24px 'Cairo', Arial";
      ctx.fillStyle = "#D4AF37";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.direction = "rtl";
      const specLabel = specialty === "other" && otherSpecialty ? otherSpecialty : `${theme.label} • ${theme.labelEn}`;
      ctx.fillText(specLabel, W / 2, specY);
      ctx.restore();

      // 4. Hero Image (Premium Glass Frame)
      const heroW = W - 160;
      const heroH = 380;
      const heroX = 80;
      const heroY = specY + 70;

      // Frame Shadow & Background
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 15;
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      roundRect(heroX - 10, heroY - 10, heroW + 20, heroH + 20, 35);
      ctx.fill();
      ctx.strokeStyle = "rgba(212, 175, 55, 0.5)";
      ctx.lineWidth = 2;
      roundRect(heroX - 10, heroY - 10, heroW + 20, heroH + 20, 35);
      ctx.stroke();
      ctx.restore();

      const heroImgUrl = pickHeroImage(theme, promo, itemsList);
      const heroImg = await loadImage(heroImgUrl);

      if (heroImg) {
        ctx.save();
        roundRect(heroX, heroY, heroW, heroH, 25);
        ctx.clip();
        // Draw image covering the area
        const imgRatio = heroImg.width / heroImg.height;
        const boxRatio = heroW / heroH;
        let drawW, drawH, drawX, drawY;
        if (imgRatio > boxRatio) {
          drawH = heroH;
          drawW = heroH * imgRatio;
          drawX = heroX - (drawW - heroW) / 2;
          drawY = heroY;
        } else {
          drawW = heroW;
          drawH = heroW / imgRatio;
          drawX = heroX;
          drawY = heroY - (drawH - heroH) / 2;
        }
        ctx.drawImage(heroImg, drawX, drawY, drawW, drawH);
        ctx.restore();
      } else {
        ctx.save();
        roundRect(heroX, heroY, heroW, heroH, 25);
        const fallGrad = ctx.createLinearGradient(heroX, heroY, heroX, heroY + heroH);
        fallGrad.addColorStop(0, "#1E3A8A");
        fallGrad.addColorStop(1, "#0B1F3A");
        ctx.fillStyle = fallGrad;
        ctx.fill();
        ctx.font = "120px 'Segoe UI Emoji', Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText(theme.icon, heroX + heroW/2, heroY + heroH/2);
        ctx.restore();
      }

      // 5. Premium 3D Gold Discount Badge
      const discountW = 300;
      const discountH = 90;
      const discountX = W/2 - discountW/2;
      const discountY = heroY + heroH - discountH/2;

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 10;
      
      // Gold Metallic Gradient
      const discountGrad = ctx.createLinearGradient(discountX, discountY, discountX, discountY + discountH);
      discountGrad.addColorStop(0, "#FDE68A"); // Light Gold
      discountGrad.addColorStop(0.3, "#F59E0B"); // Mid Gold
      discountGrad.addColorStop(1, "#B45309"); // Dark Bronze
      
      ctx.fillStyle = discountGrad;
      roundRect(discountX, discountY, discountW, discountH, 45);
      ctx.fill();
      
      // Inner Border for 3D effect
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 4;
      roundRect(discountX + 6, discountY + 6, discountW - 12, discountH - 12, 40);
      ctx.stroke();
      ctx.restore();

      // Discount Text
      ctx.save();
      ctx.font = "900 46px 'Cairo', Arial";
      ctx.fillStyle = "#4A1500"; // Dark Brown for contrast
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = "rtl";
      const discountText = promo.discount_type === "percentage" ? `خصم ${promo.discount_value}%` : `خصم ${promo.discount_value} ريال`;
      ctx.fillText(discountText, W/2, discountY + discountH/2 + 2);
      ctx.restore();

      // 6. Title & Description
      const titleY = discountY + discountH + 40;
      ctx.save();
      ctx.font = "900 46px 'Cairo', Arial";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 8;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.direction = "rtl";
      const titleLines = wrapText(ctx, promo.title, W - 160);
      titleLines.slice(0, 2).forEach((line, idx) => {
        ctx.fillText(line, W/2, titleY + idx * 60);
      });
      ctx.restore();

      let currentY = titleY + (titleLines.length * 60) + 15;

      if (promo.description) {
        ctx.save();
        ctx.font = "600 24px 'Cairo', Arial";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.direction = "rtl";
        const descLines = wrapText(ctx, promo.description, W - 200);
        descLines.slice(0, 2).forEach((line, idx) => {
          ctx.fillText(line, W/2, currentY + idx * 36);
        });
        ctx.restore();
        currentY += (descLines.length * 36) + 20;
      }

      // 7. Ad Items (Pills)
      if (itemsList.length > 0) {
        ctx.save();
        ctx.font = "bold 22px 'Cairo', Arial";
        ctx.fillStyle = "#FDE68A"; // Light gold text
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.direction = "rtl";
        
        const itemsText = itemsList.join("  •  ");
        const textW = ctx.measureText(itemsText).width;
        if (textW < W - 120) {
          ctx.fillText(itemsText, W/2, currentY);
          currentY += 45;
        } else {
          const itemsTextShort = itemsList.slice(0, 4).join("  •  ");
          ctx.fillText(itemsTextShort, W/2, currentY);
          currentY += 45;
        }
        ctx.restore();
      }

      // 8. Services Grid (Luxury Glass Cards)
      const servicesStartY = currentY + 20;
      const servicesPerRow = 2;
      const gridGap = 25;
      const cardW = (W - 120 - gridGap) / 2; 
      const cardH = 150;

      if (servicesToDraw.length > 0) {
        for (let i = 0; i < servicesToDraw.length; i++) {
          const svc = servicesToDraw[i];
          const row = Math.floor(i / servicesPerRow);
          const col = i % servicesPerRow;
          
          let cx;
          if (servicesToDraw.length === 1) {
             cx = (W - cardW) / 2; 
          } else if (servicesToDraw.length % 2 !== 0 && i === servicesToDraw.length - 1) {
             cx = (W - cardW) / 2; 
          } else {
             cx = 60 + col * (cardW + gridGap);
          }
          
          const cy = servicesStartY + row * (cardH + gridGap);
          
          // Glass Card Background
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.3)";
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 10;
          ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; // True Glassmorphism
          roundRect(cx, cy, cardW, cardH, 25);
          ctx.fill();
          
          // Gold Border
          ctx.strokeStyle = "rgba(212, 175, 55, 0.6)";
          ctx.lineWidth = 2;
          roundRect(cx, cy, cardW, cardH, 25);
          ctx.stroke();
          ctx.restore();
          
          // 3D Icon (Image)
          const thumbSize = 110;
          const thumbX = cx + 20;
          const thumbY = cy + (cardH - thumbSize)/2;
          
          const cat = getServiceCategory(svc.name);
          const thumbUrl = SERVICE_THUMBNAILS[cat];
          const thumbImg = await loadImage(thumbUrl);
          
          if (thumbImg) {
            ctx.save();
            // Draw white circular background for contrast
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.beginPath();
            ctx.arc(thumbX + thumbSize/2, thumbY + thumbSize/2, thumbSize/2, 0, Math.PI*2);
            ctx.fill();
            
            // Clip to circle and draw icon
            ctx.beginPath();
            ctx.arc(thumbX + thumbSize/2, thumbY + thumbSize/2, thumbSize/2, 0, Math.PI*2);
            ctx.clip();
            ctx.drawImage(thumbImg, thumbX + 10, thumbY + 10, thumbSize - 20, thumbSize - 20);
            ctx.restore();
          } else {
            ctx.save();
            ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            ctx.beginPath();
            ctx.arc(thumbX + thumbSize/2, thumbY + thumbSize/2, thumbSize/2, 0, Math.PI*2);
            ctx.fill();
            ctx.font = "60px 'Segoe UI Emoji', Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(getServiceIcon(svc.name), thumbX + thumbSize/2, thumbY + thumbSize/2 + 5);
            ctx.restore();
          }
          
          // Text
          ctx.save();
          ctx.textAlign = "right";
          ctx.textBaseline = "top";
          ctx.direction = "rtl";
          
          ctx.font = "900 26px 'Cairo', Arial";
          ctx.fillStyle = "#FFFFFF";
          const nameText = truncateText(ctx, svc.name, cardW - 150);
          ctx.fillText(nameText, cx + cardW - 20, cy + 25);
          
          ctx.font = "600 18px 'Cairo', Arial";
          ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
          const desc = getServiceDescription(svc.name);
          const descLines = wrapText(ctx, desc, cardW - 150);
          descLines.slice(0, 1).forEach((line, idx) => {
            ctx.fillText(line, cx + cardW - 20, cy + 65);
          });
          
          if (svc.price) {
            const finalPrice = calcFinalPrice(svc.price, promo.discount_value, promo.discount_type);
            if (finalPrice !== null && finalPrice < svc.price) {
              ctx.font = "900 24px 'Cairo', Arial";
              ctx.fillStyle = "#FDE68A"; // Gold price
              ctx.fillText(`${finalPrice} ريال`, cx + cardW - 20, cy + 100);
              
              ctx.font = "16px 'Cairo', Arial";
              ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
              const origText = `${svc.price}`;
              const origX = cx + cardW - 20 - ctx.measureText(`${finalPrice} ريال`).width - 10;
              ctx.fillText(origText, origX, cy + 105);
              
              // Strikethrough
              const origW = ctx.measureText(origText).width;
              ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(origX, cy + 115);
              ctx.lineTo(origX - origW, cy + 115);
              ctx.stroke();
            } else {
              ctx.font = "900 24px 'Cairo', Arial";
              ctx.fillStyle = "#FDE68A";
              ctx.fillText(`${svc.price} ريال`, cx + cardW - 20, cy + 100);
            }
          }
          ctx.restore();
        }
      }

      // 9. Footer (QR + Phone + CTA)
      const footerY = H - 140;
      
      // QR Code in Footer (Glass Box)
      const tgLink = `https://t.me/${botUsername || "SmartClinc_bot"}?start=clinic_${clinic.id}`;
      const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(tgLink)}&color=0B1F3A&bgcolor=FFFFFF&margin=0&qzone=1`;
      const qrImg = await loadImage(qrApi);
      
      if (qrImg) {
        ctx.save();
        const qrBoxSize = 110;
        const qrX = 60;
        const qrY = footerY + 10;
        
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 15;
        ctx.fillStyle = "#FFFFFF";
        roundRect(qrX, qrY, qrBoxSize, qrBoxSize, 16);
        ctx.fill();
        
        ctx.drawImage(qrImg, qrX + 10, qrY + 10, qrBoxSize - 20, qrBoxSize - 20);
        ctx.restore();
      }

      const phoneText = promo.phone_text || "";
      if (phoneText) {
        ctx.save();
        const phoneCircleX = W - 120;
        const phoneGrad = ctx.createLinearGradient(phoneCircleX - 25, footerY, phoneCircleX + 25, footerY + 50);
        phoneGrad.addColorStop(0, "#34D399");
        phoneGrad.addColorStop(1, "#059669");
        ctx.fillStyle = phoneGrad;
        ctx.beginPath();
        ctx.arc(phoneCircleX, footerY + 25, 30, 0, Math.PI*2);
        ctx.fill();
        
        ctx.font = "32px 'Segoe UI Emoji', Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📞", phoneCircleX, footerY + 27);
        
        ctx.font = "900 34px 'Cairo', Arial";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.direction = "ltr";
        ctx.fillText(phoneText, 190, footerY + 25);
        ctx.restore();
      }
      
      // CTA Button (Luxury Gold Gradient)
      ctx.save();
      const ctaW = 340;
      const ctaH = 70;
      const ctaX = W/2 - ctaW/2;
      const ctaY = H - 70;
      
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      const ctaGrad = ctx.createLinearGradient(0, ctaY, 0, ctaY + ctaH);
      ctaGrad.addColorStop(0, "#FDE68A");
      ctaGrad.addColorStop(0.5, "#F59E0B");
      ctaGrad.addColorStop(1, "#B45309");
      ctx.fillStyle = ctaGrad;
      roundRect(ctaX, ctaY, ctaW, ctaH, 35);
      ctx.fill();
      
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 3;
      roundRect(ctaX + 4, ctaY + 4, ctaW - 8, ctaH - 8, 31);
      ctx.stroke();
      
      ctx.font = "900 28px 'Cairo', Arial";
      ctx.fillStyle = "#4A1500"; // Dark text on gold
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = "rtl";
      ctx.fillText("احجز الآن 🤖", W/2, ctaY + ctaH/2 + 2);
      ctx.restore();

      // Upload logic
      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.9); 
      const base64Data = imageDataUrl.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const filePath = `${clinic.id}/promo_${promo.id}_${Date.now()}.jpg`;
      const supabaseUrl2 = import.meta.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

      let uploadSuccess = false;

      if (supabaseServiceKey) {
        try {
          const uploadResponse = await fetch(`${supabaseUrl2}/storage/v1/object/promo-images/${filePath}`, {
            method: "POST",
            headers: {
              "Content-Type": "image/jpeg",
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "x-upsert": "true",
            },
            body: bytes,
          });
          if (uploadResponse.ok) uploadSuccess = true;
        } catch (e) { console.log("Service role upload failed", e); }
      }

      if (!uploadSuccess) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            const formData = new FormData();
            formData.append("file", new Blob([bytes], { type: "image/jpeg" }), filePath);
            const uploadResponse = await fetch(`${supabaseUrl2}/storage/v1/object/promo-images/${filePath}`, {
              method: "POST",
              headers: {
                "apikey": supabaseAnonKey,
                "Authorization": `Bearer ${token}`,
                "x-upsert": "true",
              },
              body: formData,
            });
            if (uploadResponse.ok) uploadSuccess = true;
          }
        } catch (e) { console.log("Session upload failed", e); }
      }

      if (!uploadSuccess) {
        try {
          const { error: uploadError } = await supabase.storage
            .from("promo-images")
            .upload(filePath, bytes, { contentType: "image/jpeg", upsert: true });
          if (!uploadError) uploadSuccess = true;
        } catch (e) { console.log("Client upload failed", e); }
      }

      if (!uploadSuccess) {
        throw new Error("فشل رفع الصورة. تأكد من bucket 'promo-images' موجود ومفعل.");
      }

      const { data: urlData } = supabase.storage.from("promo-images").getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from("promotions").update({ image_url: publicUrl }).eq("id", promo.id);

      toast({
        title: "✅ اكتمل التصميم الفاخر",
        description: "إذا لم يناسبك هذا العرض، يرجى التواصل مع الإدارة لتوليد عرض مناسب آخر.",
        duration: 6000,
      });
      fetchPromotions();

    } catch (error: any) {
      console.error("❌ خطأ:", error);
      toast({
        title: "❌ فشل توليد الصورة",
        description: error.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setGeneratingPromoImage(false);
    }
  };

  const togglePromoStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from("promotions").update({ is_active: !currentStatus }).eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: "فشل تغيير حالة العرض", variant: "destructive" });
    } else {
      toast({ title: "تم التحديث", description: `تم ${!currentStatus ? "تفعيل" : "إيقاف"} العرض` });
      fetchPromotions();
    }
  };

  const deletePromoImage = async (promo: Promotion) => {
    if (!promo.image_url) return;
    if (!confirm("هل تريد حذف الصورة الحالية؟ ستحتاج إلى توليد صورة جديدة بعد الحذف.")) return;
    try {
      const url = new URL(promo.image_url.split("?")[0]);
      const pathMatch = url.pathname.match(/\/promo-images\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        await supabase.storage.from("promo-images").remove([pathMatch[1]]);
      }
      await supabase.from("promotions").update({ image_url: null }).eq("id", promo.id);
      toast({ title: "✓ تم الحذف", description: "تم حذف الصورة. يمكنك توليد صورة جديدة الآن" });
      fetchPromotions();
    } catch (e: any) {
      await supabase.from("promotions").update({ image_url: null }).eq("id", promo.id);
      toast({ title: "✓ تم الحذف", description: "تم حذف الصورة" });
      fetchPromotions();
    }
  };

  const deletePromo = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا العرض؟")) return;
    const { error } = await supabase.from("promotions").delete().eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: "فشل حذف العرض", variant: "destructive" });
    } else {
      toast({ title: "تم الحذف", description: "تم حذف العرض بنجاح" });
      fetchPromotions();
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "تم النسخ ✓", description: "تم نسخ النص إلى الحافظة" });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (authLoading || clinicLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      <SubscriptionLock />
      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-18 py-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="شعار العيادة" className="w-full h-full object-cover" />
                ) : (
                  <Stethoscope className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{clinic?.name || "عيادتي"}</h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="w-3 h-3 text-primary" />
                  الإعدادات
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* CLINIC SETTINGS */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">إعدادات العيادة</h2>
                <p className="text-sm text-muted-foreground">معلومات العيادة الأساسية</p>
              </div>
            </div>
            <div className="grid gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  شعار العيادة
                </Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-muted/50 border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img src={logoUrl} alt="شعار العيادة" className="w-full h-full object-cover" />
                    ) : (
                      <Image className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                        disabled={uploadingLogo}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploadingLogo}
                        className="pointer-events-none"
                      >
                        {uploadingLogo ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {uploadingLogo ? "جاري الرفع..." : "رفع شعار"}
                      </Button>
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">يُفضل صورة مربعة بحجم 200x200 بكسل أو أكبر</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clinicName" className="text-sm font-medium">اسم العيادة (عربي)</Label>
                <Input
                  id="clinicName"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="أدخل اسم العيادة"
                  className="input-modern"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clinicNameEn" className="text-sm font-medium flex items-center justify-between">
                  <span>اسم العيادة (إنجليزي)</span>
                  <span className="text-[10px] text-primary font-normal">
                    {clinicNameEnEdited ? "✏️ معدّل يدوياً" : "🤖 مترجم تلقائياً — يمكنك تعديله"}
                  </span>
                </Label>
                <Input
                  id="clinicNameEn"
                  value={clinicNameEn}
                  onChange={(e) => { setClinicNameEn(e.target.value); setClinicNameEnEdited(true); }}
                  placeholder="Clinic Name In English"
                  className="input-modern"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  يظهر في بطاقة الحجز وفي ملصق QR. تأكد من صحته طبياً.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receptionistEmail" className="text-sm font-medium">📧 بريد موظف الاستقبال</Label>
                <Input
                  id="receptionistEmail"
                  type="email"
                  value={receptionistEmail}
                  onChange={(e) => setReceptionistEmail(e.target.value)}
                  placeholder="reception@clinic.com"
                  className="input-modern"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  تصل إليه إشعارات الحجز الجديدة (نصّية فقط — بدون صور توفيراً للموارد).
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">تخصص العيادة</Label>
                <Select value={clinicSpecialty} onValueChange={setClinicSpecialty}>
                  <SelectTrigger className="input-modern">
                    <SelectValue placeholder="اختر تخصص العيادة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dental">🦷 أسنان</SelectItem>
                    <SelectItem value="dermatology">✨ جلدية وتجميل</SelectItem>
                    <SelectItem value="gynecology">👩‍⚕️ نساء وولادة</SelectItem>
                    <SelectItem value="ophthalmology">👁️ عيون</SelectItem>
                    <SelectItem value="orthopedics">🦴 عظام ومفاصل</SelectItem>
                    <SelectItem value="pediatrics">🧸 أطفال</SelectItem>
                    <SelectItem value="internal">🩺 باطنية</SelectItem>
                    <SelectItem value="general">🏥 طب عام</SelectItem>
                    <SelectItem value="lab">🧪 مختبر تحاليل</SelectItem>
                    <SelectItem value="surgery">🔪 جراحة عامة</SelectItem>
                    <SelectItem value="cardiology">💔 القلب</SelectItem>
                    <SelectItem value="neurology">🧠 المخ والأعصاب</SelectItem>
                    <SelectItem value="ent">👂 أنف وأذن وحنجرة</SelectItem>
                    <SelectItem value="pharmacy">💊 صيدلية</SelectItem>
                    <SelectItem value="radiology">🩻 أشعة</SelectItem>
                    <SelectItem value="physiotherapy">🦵 علاج طبيعي</SelectItem>
                    <SelectItem value="nutrition">🥗 تغذية</SelectItem>
                    <SelectItem value="psychiatry">🧘 نفسية</SelectItem>
                    <SelectItem value="other">➕ أخرى</SelectItem>
                  </SelectContent>
                </Select>
                {clinicSpecialty === "other" && (
                  <Input
                    value={otherSpecialty}
                    onChange={(e) => setOtherSpecialty(e.target.value)}
                    placeholder="اكتب تخصص العيادة يدوياً"
                    className="input-modern mt-2"
                  />
                )}
                <p className="text-xs text-muted-foreground">يستخدم هذا التخصص في تصميم صور العروض وملصق QR</p>
              </div>

              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="botToken" className="text-sm font-medium">رمز الموظف الآلي الموحّد (للأدمن فقط)</Label>
                  <Input
                    id="botToken"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="أدخل الرمز الموحّد"
                    className="input-modern font-mono text-sm"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    هذا التوكن موحّد لجميع العيادات ويُضبط مرة واحدة من حساب الأدمن.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-muted/40 border border-border p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  الموظف الآلي الذكي مفعّل تلقائياً عبر النظام (محمي من الإدارة).
                </div>
              )}

              <Button onClick={handleSaveClinic} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ الإعدادات
              </Button>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={handleCheckWebhook} className="w-full sm:w-auto">
                  🔎 فحص حالة الـ Webhook
                </Button>
                <Button variant="outline" onClick={handleResetWebhook} className="w-full sm:w-auto">
                  🔁 إعادة ضبط الـ Webhook
                </Button>
              </div>
            </div>
          </section>

          {/* ACCOUNT SETTINGS (Owner Email & Password) */}
          <section className="card-modern p-6 animate-slide-up delay-50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">إعدادات حساب المالك</h2>
                <p className="text-sm text-muted-foreground">تغيير بريد الدخول أو كلمة المرور الخاصة بصاحب العيادة</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ownerEmail" className="text-sm font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4" /> البريد الإلكتروني
                </Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@clinic.com"
                  className="input-modern"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerPassword" className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4" /> كلمة المرور الجديدة
                </Label>
                <Input
                  id="ownerPassword"
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="اتركه فارغاً إذا لم ترد التغيير"
                  className="input-modern"
                  dir="ltr"
                />
              </div>
            </div>
            <Button onClick={handleUpdateAccount} disabled={updatingAccount} className="mt-4 w-full sm:w-auto">
              {updatingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              تحديث الحساب
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              ملاحظة: تغيير البريد الإلكتروني يتطلب تأكيداً من البريد الجديد.
            </p>
          </section>

          {/* WORKING HOURS */}
          <section className="card-modern p-6 animate-slide-up delay-50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <CalendarClock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">أوقات الدوام الرسمية</h2>
                <p className="text-sm text-muted-foreground">تحديد ساعات العمل التي يرد عليها موظفنا الآلي الذكي بالحجوزات</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">بداية الدوام</Label>
                <Input
                  type="time"
                  value={workingHoursStart}
                  onChange={(e) => setWorkingHoursStart(e.target.value)}
                  className="input-modern text-center"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">نهاية الدوام</Label>
                <Input
                  type="time"
                  value={workingHoursEnd}
                  onChange={(e) => setWorkingHoursEnd(e.target.value)}
                  className="input-modern text-center"
                />
              </div>
            </div>
            <Button onClick={handleSaveClinic} disabled={saving} className="mt-4 w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ أوقات الدوام
            </Button>
          </section>

          {/* STAFF MANAGEMENT */}
          <section className="card-modern p-6 animate-slide-up delay-75">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground">إدارة الموظفين</h2>
                <p className="text-xs text-muted-foreground">أضف موظفاً بالبريد الإلكتروني، ثم اعتمده يدوياً ليتمكن من الدخول.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <Input
                placeholder="بريد الموظف الإلكتروني"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                dir="ltr"
                className="input-modern"
              />
              <Input
                type="password"
                placeholder="كلمة مرور مؤقتة (6 أحرف على الأقل)"
                value={newStaffPassword}
                onChange={(e) => setNewStaffPassword(e.target.value)}
                dir="ltr"
                className="input-modern"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-5">
              <Select value={newStaffRole} onValueChange={(v) => setNewStaffRole(v as any)}>
                <SelectTrigger className="w-full input-modern">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reception">استقبال</SelectItem>
                  <SelectItem value="cashier">صندوق</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={addStaff}
                disabled={staffBusy || !newStaffEmail.trim() || !newStaffPassword.trim()}
              >
                {staffBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إنشاء حساب الموظف
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              💡 سيتم إنشاء حساب الموظف واعتماده تلقائياً. أعطه البريد وكلمة المرور ليدخل من تبويب{" "}
              <b>«دخول موظف»</b>.
            </p>

            <div className="mb-5 space-y-2 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <Label className="text-sm font-semibold text-foreground">رقم واتساب موظف الاستقبال</Label>
              <Input
                value={receptionistWhatsapp}
                onChange={(e) => setReceptionistWhatsapp(e.target.value)}
                placeholder="مثال: 967771234567 (بدون + أو 00)"
                dir="ltr"
                className="input-modern"
              />
              <p className="text-xs text-muted-foreground">
                يُستخدم عندما يطلب زبون «حجز باسم شخص آخر» ويُظهر في تذييل الإعلانات المولّدة.
              </p>
            </div>

            {staffList.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
                لا يوجد موظفون بعد
              </div>
            ) : (
              <div className="space-y-2">
                {staffList.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl border border-border bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate" dir="ltr">
                        {s.email}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                          {s.role === "reception" ? "استقبال" : "صندوق"}
                        </span>
                        {s.approved ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                            معتمد
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600">
                            بانتظار الاعتماد
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.approved ? (
                        <Button size="sm" variant="outline" onClick={() => revokeStaff(s.id)}>
                          تعليق
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => approveStaff(s.id)}>
                          <Check className="w-4 h-4" />
                          اعتماد
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeStaff(s.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* CUSTOMER BOOKING LINK */}
          <section className="card-modern p-6 animate-slide-up delay-75">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <Link2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">رابط حجز العملاء</h2>
                <p className="text-sm text-muted-foreground">أرسله للزبائن ليحجزوا داخل هذه العيادة فقط</p>
              </div>
            </div>
            <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                هذا هو الرابط/الأمر الخاص بالزبون. عند فتحه سيتعرف موظفنا الآلي الذكي على عيادتك ويعرض خدماتك فقط.
              </p>
              <div className="flex gap-2">
                <Input
                  value={`/start clinic_${clinic?.id || ""}`}
                  readOnly
                  className="font-mono text-sm bg-background"
                  dir="ltr"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(`/start clinic_${clinic?.id || ""}`, "customerLink")}
                  className="shrink-0"
                >
                  {copiedField === "customerLink" ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                أمر <code className="bg-background px-1.5 py-0.5 rounded">link_</code> خاص بربط حساب
                الطبيب لاستقبال الإشعارات، وليس للزبائن.
              </p>
            </div>
          </section>

          {/* QR CODE POSTER */}
          <section className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg">
                <QrCode className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">ملصق QR الفاخر</h2>
                <p className="text-sm text-muted-foreground">
                  تصميم عالمي جاهز للطباعة (A5) — يُولَّد مرة واحدة ولا يتغيّر أبداً
                </p>
              </div>
            </div>

            {(() => {
              const effectiveBotUsername = botUsername || "SmartClinc_bot";
              if (!clinic?.id) return null;
              const link = `https://t.me/${effectiveBotUsername}?start=clinic_${clinic.id}`;
              return (
                <div className="space-y-4">
                  {qrPosterUrl ? (
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 rounded-2xl border border-amber-500/30">
                      <img
                        src={qrPosterUrl}
                        alt="QR Poster"
                        className="w-full max-w-md mx-auto rounded-xl shadow-2xl"
                      />
                    </div>
                  ) : (
                    <div className="bg-muted/30 border-2 border-dashed border-amber-500/40 rounded-2xl p-10 text-center">
                      <Sparkles className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        اضغط "توليد الملصق" لإنشاء تصميم احترافي يحمل شعار العيادة، اسمها، تخصصها، بريدها، والـ QR.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input value={link} readOnly className="font-mono text-xs bg-background" dir="ltr" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(link, "qrLink")}
                      className="shrink-0"
                    >
                      {copiedField === "qrLink" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => generateQrPoster(!!qrPosterUrl)}
                      disabled={generatingQrPoster}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {generatingQrPoster ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <ImagePlus className="w-4 h-4 ml-1" />}
                      {qrPosterUrl ? "🔄 إعادة توليد التصميم" : "🎨 توليد الملصق الفاخر"}
                    </Button>
                    {qrPosterUrl && (
                      <Button onClick={downloadQrPoster} variant="outline" className="flex-1">
                        <Download className="w-4 h-4 ml-1" /> تنزيل للطباعة
                      </Button>
                    )}
                    {botToken && (
                      <Button variant="outline" onClick={refreshBotUsername} disabled={loadingBotInfo}>
                        {loadingBotInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث اسم البوت"}
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    💡 يُحفظ التصميم في قاعدة البيانات مرة واحدة فقط. يُفضّل عدم تغييره لأن الرابط ثابت مع العيادة.
                  </p>
                </div>
              );
            })()}
          </section>

          {/* VOICE AGENT */}
          <section className="card-modern p-6 animate-slide-up delay-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">الوكيل الصوتي (مجاني)</h2>
                <p className="text-sm text-muted-foreground">يرسل ردّاً صوتياً عربياً للزبون بعد كل ردّ نصي</p>
              </div>
            </div>
            <div className="space-y-4 bg-accent/5 border border-accent/20 rounded-2xl p-5">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">تفعيل الردود الصوتية</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    عند تفعيلها يصل الزبون برد واحد فقط: نص أو صوت
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={voiceAgentEnabled}
                  onChange={(e) => setVoiceAgentEnabled(e.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </label>
              <div className="space-y-2">
                <Label className="text-sm font-medium">طريقة الرد عند تفعيل الصوت</Label>
                <Select value={voiceMode} onValueChange={setVoiceMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر طريقة الرد" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">تلقائي: نص أو صوت بالتبادل</SelectItem>
                    <SelectItem value="text">نص فقط</SelectItem>
                    <SelectItem value="voice">صوت فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="voiceTone" className="text-sm font-medium">نبرة الرد الأساسية</Label>
                <Input
                  id="voiceTone"
                  value={voiceTone}
                  onChange={(e) => setVoiceTone(e.target.value)}
                  placeholder="مثال: ودود ومحترم"
                  className="input-modern"
                />
              </div>
              <p className="text-xs text-muted-foreground">💡 الصوت يُولّد عبر Google Translate TTS المجاني</p>
            </div>
          </section>

          {/* LINK DOCTOR NOTIFICATIONS */}
          <section className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">إشعارات فورية</h2>
                <p className="text-sm text-muted-foreground">اربط حسابك لاستقبال كل حجز/إلغاء فوراً</p>
              </div>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-3">
              <p className="text-sm text-foreground">
                <b>الخطوات:</b>
              </p>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal pr-5">
                <li>افتح موظفنا الآلي الذكي الخاص بالعيادة</li>
                <li>انسخ الأمر التالي وأرسله له:</li>
              </ol>
              <div className="flex gap-2">
                <Input
                  value={`/start link_${user?.id || ""}`}
                  readOnly
                  className="font-mono text-sm bg-background"
                  dir="ltr"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(`/start link_${user?.id || ""}`, "linkCmd")}
                  className="shrink-0"
                >
                  {copiedField === "linkCmd" ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                بمجرد الإرسال، سيؤكد لك موظفنا الآلي الذكي الربط، وستصلك جميع الإشعارات.
              </p>
            </div>
          </section>

          {/* INTEGRATION INFO */}
          <section className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">معلومات الربط</h2>
                <p className="text-sm text-muted-foreground">
                  {isAdmin ? "معلومات الربط الكاملة (صلاحيات المدير)" : "معرّف العيادة الخاص بك"}
                </p>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="bg-primary/5 rounded-2xl p-5 border border-primary/20">
                <Label className="flex items-center gap-2 text-primary font-semibold mb-3">
                  <Sparkles className="w-4 h-4" /> معرّف العيادة (Clinic ID)
                </Label>
                <div className="flex gap-2">
                  <Input value={clinic?.id || ""} readOnly className="font-mono text-sm bg-background" dir="ltr" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(clinic?.id || "", "clinicId")}
                    className="shrink-0"
                  >
                    {copiedField === "clinicId" ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">هذا الرقم هو هويتك الفريدة في النظام.</p>
              </div>
              {isAdmin && (
                <>
                  <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-2">
                    <p className="text-xs text-warning flex items-center gap-2">
                      <Shield className="w-4 h-4" /> هذه المعلومات تظهر لك فقط لأنك مدير النظام
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <div className="flex items-center gap-2 bg-muted/30 rounded-xl p-4">
                      <Link2 className="w-5 h-5 text-muted-foreground shrink-0" />
                      <Input
                        value={supabaseUrl}
                        readOnly
                        className="font-mono text-xs bg-transparent border-0"
                        dir="ltr"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(supabaseUrl, "url")}
                      >
                        {copiedField === "url" ? (
                          <Check className="w-4 h-4 text-success" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 bg-muted/30 rounded-xl p-4">
                      <Key className="w-5 h-5 text-muted-foreground shrink-0" />
                      <Input
                        value={supabaseAnonKey}
                        readOnly
                        className="font-mono text-xs bg-transparent border-0"
                        dir="ltr"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(supabaseAnonKey, "key")}
                      >
                        {copiedField === "key" ? (
                          <Check className="w-4 h-4 text-success" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* PROMOTIONS & OFFERS */}
          <section className="card-modern p-6 animate-slide-up delay-150">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Tag className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground">العروض والخصومات</h2>
                <p className="text-sm text-muted-foreground">إدارة العروض الترويجية وأكواد الخصم + صور إعلانية احترافية</p>
              </div>
              <Button
                onClick={() => openPromoDialog()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Plus className="w-4 h-4 ml-1" />
                إضافة عرض
              </Button>
            </div>

            {promotions.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-amber-200 rounded-2xl bg-amber-50/30">
                <Gift className="w-12 h-12 text-amber-300 mx-auto mb-3" />
                <p className="text-muted-foreground">لا توجد عروض حالياً</p>
                <p className="text-xs text-muted-foreground">أضف عرضك الأول لترويج خدمات عيادتك</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {promotions.map((promo) => (
                  <div
                    key={promo.id}
                    className="border rounded-xl p-4 hover:shadow-md transition-all bg-card/50 relative"
                  >
                    {promo.image_url && (
                      <div className="w-full h-48 rounded-lg overflow-hidden mb-3 bg-slate-100 border border-slate-200 relative group">
                        <img
                          src={promo.image_url}
                          alt={promo.title}
                          className="w-full h-full object-contain hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <button
                          onClick={() => deletePromoImage(promo)}
                          className="absolute top-2 left-2 w-8 h-8 rounded-full bg-red-500/90 hover:bg-red-600 text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          title="حذف الصورة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-foreground">{promo.title}</h3>
                        {promo.description && (
                          <p className="text-xs text-muted-foreground mt-1">{promo.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 font-bold text-xs">
                            {promo.discount_type === "percentage"
                              ? `${promo.discount_value}%`
                              : `${promo.discount_value}`}
                          </span>
                          {promo.code && (
                            <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary font-mono text-xs">
                              {promo.code}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                              promo.is_active
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-red-500/10 text-red-600"
                            }`}
                          >
                            {promo.is_active ? "نشط" : "موقف"}
                          </span>
                        </div>
                        {promo.service_ids && promo.service_ids.length > 0 && (
                          <p className="text-[10px] text-emerald-700 mt-1 font-bold">
                            ✓ مرتبط بـ {promo.service_ids.length} خدمة
                          </p>
                        )}
                        {promo.start_date && promo.end_date && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {promo.start_date} → {promo.end_date}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openPromoDialog(promo)}
                          className="h-7 w-7 p-0"
                          title="تعديل العرض"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => togglePromoStatus(promo.id, promo.is_active)}
                          className="h-7 w-7 p-0"
                        >
                          {promo.is_active ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <X className="w-4 h-4 text-red-500" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deletePromo(promo.id)}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full text-xs border-amber-500/30 text-amber-700 hover:bg-amber-500/10 font-bold"
                      onClick={() => generatePromoImage(promo)}
                      disabled={generatingPromoImage}
                    >
                      {generatingPromoImage ? (
                        <Loader2 className="w-3 h-3 animate-spin ml-1" />
                      ) : (
                        <ImagePlus className="w-3 h-3 ml-1" />
                      )}
                      {promo.image_url ? "إعادة توليد بتصميم جديد 🔄" : "توليد إعلان فاخر 🎨"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SERVICES */}
          <section className="card-modern p-6 animate-slide-up delay-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">الخدمات والأسعار</h2>
                <p className="text-sm text-muted-foreground">كل خدمة لها اسم عربي وإنجليزي طبي</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-2">
              <Input
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="اسم الخدمة (عربي) — مثال: فحص السكر"
                className="flex-1 input-modern"
              />
              <Input
                value={newServiceNameEn}
                onChange={(e) => { setNewServiceNameEn(e.target.value); setNewServiceNameEnEdited(true); }}
                placeholder="English name"
                className="flex-1 input-modern"
                dir="ltr"
              />
              <Input
                type="number"
                value={newServicePrice}
                onChange={(e) => setNewServicePrice(e.target.value)}
                placeholder="السعر (اختياري)"
                className="w-full sm:w-32 input-modern"
              />
              <Button onClick={handleAddService} disabled={!newServiceName}>
                <Plus className="w-4 h-4" /> إضافة
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              🤖 يُقترح الاسم الإنجليزي تلقائياً من قاموس طبي — يمكنك تعديله. اترك السعر فارغاً ليظهر «حسب الفحص».
            </p>

            <div className="divide-y divide-border">
              {services.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">لم تتم إضافة أي خدمات بعد</p>
                </div>
              ) : (
                services.map((service: any) => (
                  <div key={service.id} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">{service.name}</p>
                        {editingServiceId === service.id ? (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Input
                              value={editingServiceNameEn}
                              onChange={(e) => setEditingServiceNameEn(e.target.value)}
                              dir="ltr"
                              className="h-8 text-sm flex-1"
                              placeholder="English name"
                              autoFocus
                            />
                            <Input
                              type="number"
                              value={editingServicePrice}
                              onChange={(e) => setEditingServicePrice(e.target.value)}
                              className="h-8 text-sm w-24"
                              placeholder="السعر"
                            />
                            <Button size="sm" onClick={() => handleUpdateService(service.id)}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingServiceId(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                              {service.name_en || "—"}
                            </p>
                            <p className="text-sm text-primary font-bold">
                              {service.price === null ? "حسب الفحص" : Number(service.price).toLocaleString()}
                            </p>
                            <button
                              onClick={() => { setEditingServiceId(service.id); setEditingServiceNameEn(service.name_en || ""); setEditingServicePrice(service.price !== null ? String(service.price) : ""); }}
                              className="text-primary hover:underline text-[10px]"
                            >
                              ✏️ تعديل
                            </button>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteService(service.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* SUBSCRIPTION STATUS */}
          <section className="card-modern p-6 animate-slide-up delay-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">حالة الاشتراك</h2>
                <p className="text-sm text-muted-foreground">معلومات اشتراكك الحالي</p>
              </div>
            </div>
            <div className="bg-muted/30 rounded-2xl p-5 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-muted-foreground">الحالة:</span>
                <span
                  className={`${
                    subscription?.status === "trial"
                      ? "badge-pending"
                      : subscription?.is_active
                      ? "badge-success"
                      : "badge-destructive"
                  }`}
                >
                  {subscription?.status === "trial"
                    ? "فترة تجريبية"
                    : subscription?.is_active
                    ? "نشط"
                    : "منتهي"}
                </span>
              </div>
              {subscription?.trial_ends_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">تنتهي في:</span>
                  <span className="text-foreground font-semibold">
                    {new Date(subscription.trial_ends_at).toLocaleDateString("ar-SA", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* PROMO DIALOG */}
      <Dialog
        open={promoDialogOpen}
        onOpenChange={(open) => {
          if (!open) setPromoDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingPromo ? "تعديل العرض" : "إضافة عرض جديد"}</DialogTitle>
            <DialogDescription>أدخل تفاصيل العرض الترويجي أو كود الخصم</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">بيانات العرض</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAutoFillTemplate} className="text-amber-600 border-amber-200">
                  ✨ توليد نصوص تلقائية
                </Button>
              </div>
              <div>
                <Label className="text-sm font-medium">اسم العرض *</Label>
                <Input
                  value={promoForm.title || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, title: e.target.value })}
                  placeholder="مثال: عرض الصيف"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">الوصف</Label>
                <Input
                  value={promoForm.description || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })}
                  placeholder="وصف مختصر للعرض"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">نوع الخصم *</Label>
                  <Select
                    value={promoForm.discount_type}
                    onValueChange={(v: "percentage" | "fixed") =>
                      setPromoForm({ ...promoForm, discount_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">نسبة مئوية (%)</SelectItem>
                      <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">قيمة الخصم *</Label>
                  <Input
                    type="number"
                    value={promoForm.discount_value || ""}
                    onChange={(e) =>
                      setPromoForm({ ...promoForm, discount_value: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="20"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">كود الخصم (اختياري)</Label>
                <Input
                  value={promoForm.code || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER25"
                  dir="ltr"
                />
                <p className="text-[10px] text-muted-foreground mt-1">اترك فارغاً للتوليد التلقائي</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-amber-700">
                  🎁 الخدمات الفعلية المشمولة بالعرض (ضروري)
                </Label>
                <p className="text-[10px] text-muted-foreground mb-2">
                  اختر من قائمة خدمات عيادتك. البوت سيعرض هذه الخدمات فقط عندما يضغط العميل "اطلب الآن".
                </p>
                {services.length === 0 ? (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    ⚠️ لا توجد خدمات مسجلة. أضف خدمات أولاً من قسم "الخدمات والأسعار" بالأسفل.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-44 overflow-y-auto border border-input rounded-md p-3 bg-background">
                    {services.map((svc) => {
                      const isChecked = (promoForm.service_ids || []).includes(svc.id);
                      return (
                        <label
                          key={svc.id}
                          className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 p-1.5 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const current = promoForm.service_ids || [];
                              const next = e.target.checked
                                ? [...current, svc.id]
                                : current.filter((id) => id !== svc.id);
                              setPromoForm({ ...promoForm, service_ids: next });
                            }}
                            className="w-4 h-4 accent-amber-600"
                          />
                          <span className="text-sm flex-1">{svc.name}</span>
                          {svc.price !== null && (
                            <span className="text-xs text-muted-foreground">{svc.price}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                {(promoForm.service_ids || []).length === 0 && services.length > 0 && (
                  <p className="text-[10px] text-amber-700 mt-1 font-semibold">
                    ⚠️ اختر خدمة واحدة على الأقل وإلا لن يعمل العرض.
                  </p>
                )}
                {(promoForm.service_ids || []).length > 0 && (
                  <p className="text-[10px] text-emerald-700 mt-1 font-semibold">
                    ✅ تم اختيار {(promoForm.service_ids || []).length} خدمة.
                  </p>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium">عناصر الإعلان (نصوص زخرفية للصورة فقط)</Label>
                <textarea
                  value={promoForm.items || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, items: e.target.value })}
                  placeholder={"مثال:\nتحاليل دقيقة\nاستشارة مجانية\nخصم للعائلات"}
                  className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  نصوص اختيارية تظهر في الصورة الإعلانية المولدة.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">موقع العيادة (يظهر في التصميم)</Label>
                <Input
                  value={promoForm.location || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, location: e.target.value })}
                  placeholder="مثال: مكة المكرمة - بطحاء قريش"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">تاريخ البداية</Label>
                <Input
                  type="date"
                  value={promoForm.start_date || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">تاريخ النهاية</Label>
                <Input
                  type="date"
                  value={promoForm.end_date || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, end_date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">حد الاستخدام الكلي</Label>
                  <Input
                    type="number"
                    value={promoForm.usage_limit || ""}
                    onChange={(e) =>
                      setPromoForm({ ...promoForm, usage_limit: parseInt(e.target.value) || undefined })
                    }
                    placeholder="50"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">لكل مريض</Label>
                  <Input
                    type="number"
                    value={promoForm.per_user_limit || 1}
                    onChange={(e) =>
                      setPromoForm({ ...promoForm, per_user_limit: parseInt(e.target.value) || 1 })
                    }
                    placeholder="1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">قالب التصميم الإعلاني</Label>
                <Select
                  value={promoForm.template || "auto"}
                  onValueChange={(v) => setPromoForm({ ...promoForm, template: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">تلقائي (حسب التخصص)</SelectItem>
                    <SelectItem value="teal">أخضر مختبرات (تحاليل)</SelectItem>
                    <SelectItem value="dental">أزرق أسنان</SelectItem>
                    <SelectItem value="derma">بنفسجي جلدية</SelectItem>
                    <SelectItem value="cosmetic">سماوي تجميل/ليزر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">هاتف التذييل (اختياري)</Label>
                <Input
                  value={promoForm.phone_text || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, phone_text: e.target.value })}
                  placeholder="مثال: 920014099"
                  dir="ltr"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={promoForm.is_active !== false}
                  onChange={(e) => setPromoForm({ ...promoForm, is_active: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <Label className="text-sm font-medium cursor-pointer">العرض نشط</Label>
              </div>
              <div>
                <Label className="text-sm font-medium">صورة العرض (اختياري)</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePromoImageSelect}
                    className="hidden"
                    ref={promoImageInputRef}
                    id="promo-image-upload-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePromoImageUploadClick}
                    disabled={uploadingPromoImage}
                  >
                    <Upload className="w-4 h-4 ml-1" />{" "}
                    {uploadingPromoImage ? "جاري الرفع..." : "رفع صورة"}
                  </Button>
                  {promoImagePreview && (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                      <img
                        src={promoImagePreview}
                        alt="معاينة"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => {
                          setPromoImageFile(null);
                          setPromoImagePreview(null);
                          setPromoForm({ ...promoForm, image_url: "" });
                          if (promoImageInputRef.current) {
                            promoImageInputRef.current.value = "";
                          }
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  أو استخدم زر "توليد صورة إعلان احترافية" بعد الحفظ
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setPromoDialogOpen(false);
                resetPromoForm();
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={handlePromoSubmit}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={uploadingPromoImage}
            >
              {uploadingPromoImage ? (
                <Loader2 className="w-4 h-4 animate-spin ml-1" />
              ) : (
                <Save className="w-4 h-4 ml-1" />
              )}
              {editingPromo ? "تحديث العرض" : "إضافة العرض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0] || "";
  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + " " + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text) return "";
  let result = text;
  while (ctx.measureText(result).width > maxWidth && result.length > 0) {
    result = result.substring(0, result.length - 1);
  }
  if (result.length < text.length) {
    result = result.substring(0, result.length - 1) + "…";
  }
  return result;
}

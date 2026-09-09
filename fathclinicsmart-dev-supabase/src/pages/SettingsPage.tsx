import { useEffect, useState, useRef } from "react";
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
import { QRCodeCanvas } from "qrcode.react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Stethoscope, LogOut, ArrowRight, Save, Copy, Check, Link2, Key, Plus, Trash2, Loader2,
  Bot, Building2, CreditCard, Shield, Clock, Activity, Sparkles, Upload, Image, QrCode,
  Download, CalendarClock, Tag, Gift, BadgePercent, ImagePlus, X, Edit, Eye,
} from "lucide-react";
import html2canvas from "html2canvas";

interface Service {
  id: string;
  name: string;
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
  created_at: string;
}

// ============================================================
// SPECIALTY THEMES — MEGA POOL EDITION v7
// كل تخصص لديه 8+ صورة مختلفة لضمان عدم التكرار
// ============================================================
const SPECIALTY_THEMES: Record<string, any> = {
  dental: {
    bg1: "#DBEAFE", bg2: "#93C5FD", bg3: "#3B82F6",
    darkColor: "#1E3A8A",
    accent: "#F59E0B",
    accentDark: "#B45309",
    chipBg: "#DBEAFE",
    chipBorder: "#3B82F6",
    chipText: "#1E3A8A",
    icon: "🦷",
    label: "طب الأسنان",
    labelEn: "Dental Care",
    tagline: "ابتسامة صحية تدوم",
    heroImages: [
      "https://images.pexels.com/photos/6528856/pexels-photo-6528856.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3845763/pexels-photo-3845763.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/305568/pexels-photo-305568.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3762453/pexels-photo-3762453.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/6528854/pexels-photo-6528854.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/4270360/pexels-photo-4270360.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3881457/pexels-photo-3881457.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/6812503/pexels-photo-6812503.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  dermatology: {
    bg1: "#FCE7F3", bg2: "#F9A8D4", bg3: "#DB2777",
    darkColor: "#831843",
    accent: "#F59E0B",
    accentDark: "#B45309",
    chipBg: "#FCE7F3",
    chipBorder: "#DB2777",
    chipText: "#831843",
    icon: "✨",
    label: "الجلدية والتجميل",
    labelEn: "Dermatology",
    tagline: "بشرة نضرة وإشراقة طبيعية",
    heroImages: [
      "https://images.pexels.com/photos/3762879/pexels-photo-3762879.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3985329/pexels-photo-3985329.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3985338/pexels-photo-3985338.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/6663575/pexels-photo-6663575.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5069433/pexels-photo-5069433.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/7755513/pexels-photo-7755513.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/4041392/pexels-photo-4041392.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5069611/pexels-photo-5069611.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  gynecology: {
    bg1: "#FBCFE8", bg2: "#F472B6", bg3: "#BE185D",
    darkColor: "#500724",
    accent: "#F59E0B",
    accentDark: "#B45309",
    chipBg: "#FBCFE8",
    chipBorder: "#BE185D",
    chipText: "#500724",
    icon: "🌸",
    label: "النساء والولادة",
    labelEn: "Gynecology",
    tagline: "رعاية متكاملة للأم والطفل",
    heroImages: [
      "https://images.pexels.com/photos/3662824/pexels-photo-3662824.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/4056723/pexels-photo-4056723.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3985163/pexels-photo-3985163.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1556710/pexels-photo-1556710.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1442005/pexels-photo-1442005.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1648377/pexels-photo-1648377.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3662850/pexels-photo-3662850.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/6849249/pexels-photo-6849249.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  ophthalmology: {
    bg1: "#CFFAFE", bg2: "#67E8F9", bg3: "#0891B2",
    darkColor: "#164E63",
    accent: "#F59E0B",
    accentDark: "#B45309",
    chipBg: "#CFFAFE",
    chipBorder: "#0891B2",
    chipText: "#164E63",
    icon: "👁️",
    label: "طب العيون",
    labelEn: "Ophthalmology",
    tagline: "رؤية أوضح لحياة أفضل",
    heroImages: [
      "https://images.pexels.com/photos/5752242/pexels-photo-5752242.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5752272/pexels-photo-5752272.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5752275/pexels-photo-5752275.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5752268/pexels-photo-5752268.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/2911521/pexels-photo-2911521.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1290141/pexels-photo-1290141.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5752238/pexels-photo-5752238.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3985233/pexels-photo-3985233.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  general: {
    bg1: "#D1FAE5", bg2: "#6EE7B7", bg3: "#059669",
    darkColor: "#064E3B",
    accent: "#F59E0B",
    accentDark: "#B45309",
    chipBg: "#D1FAE5",
    chipBorder: "#059669",
    chipText: "#064E3B",
    icon: "🏥",
    label: "الطب العام",
    labelEn: "General Medicine",
    tagline: "صحتك أولويتنا القصوى",
    heroImages: [
      "https://images.pexels.com/photos/4386466/pexels-photo-4386466.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3376790/pexels-photo-3376790.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/4173251/pexels-photo-4173251.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/4225920/pexels-photo-4225920.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3846005/pexels-photo-3846005.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/6129507/pexels-photo-6129507.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/4021775/pexels-photo-4021775.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3735709/pexels-photo-3735709.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
};

// ============================================================
// Smart service image selector — expanded pool
// ============================================================
const SERVICE_KEYWORD_IMAGES: Array<{ keywords: string[]; images: string[] }> = [
  {
    keywords: ["تحليل", "دم", "مختبر", "فحص دم", "تحاليل", "معمل", "cbc"],
    images: [
      "https://images.pexels.com/photos/3735709/pexels-photo-3735709.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/8460158/pexels-photo-8460158.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5726837/pexels-photo-5726837.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/4033148/pexels-photo-4033148.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  {
    keywords: ["أسنان", "تنظيف", "تقويم", "حشو", "خلع", "تركيب", "ابتسامة", "لثة"],
    images: [
      "https://images.pexels.com/photos/6529144/pexels-photo-6529144.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/6528856/pexels-photo-6528856.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/305568/pexels-photo-305568.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3881457/pexels-photo-3881457.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  {
    keywords: ["جلد", "بشرة", "ليزر", "تجميل", "حب الشباب", "تقشير", "بوتوكس", "فيلر"],
    images: [
      "https://images.pexels.com/photos/3762453/pexels-photo-3762453.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3985329/pexels-photo-3985329.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/6663575/pexels-photo-6663575.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5069433/pexels-photo-5069433.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  {
    keywords: ["حمل", "ولادة", "أم", "طفل", "متابعة", "سونار", "رضيع", "أطفال"],
    images: [
      "https://images.pexels.com/photos/3662850/pexels-photo-3662850.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1442005/pexels-photo-1442005.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1648377/pexels-photo-1648377.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1556710/pexels-photo-1556710.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  {
    keywords: ["عين", "نظر", "فحص نظر", "عدسات", "قرنية", "شبكية"],
    images: [
      "https://images.pexels.com/photos/5752268/pexels-photo-5752268.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/5752242/pexels-photo-5752242.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/2911521/pexels-photo-2911521.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1290141/pexels-photo-1290141.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  {
    keywords: ["أشعة", "تصوير", "رنين", "مقطعية", "x-ray"],
    images: [
      "https://images.pexels.com/photos/5327585/pexels-photo-5327585.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/7089401/pexels-photo-7089401.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/263402/pexels-photo-263402.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
  {
    keywords: ["استشارة", "كشف", "فحص عام", "طبيب"],
    images: [
      "https://images.pexels.com/photos/4173251/pexels-photo-4173251.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/4386466/pexels-photo-4386466.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3376790/pexels-photo-3376790.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
  },
];

// Hash-based image picker → ensures different image per promo
function pickHeroImage(theme: any, promo: Promotion, items: string[]): string {
  const searchText = `${promo.title} ${promo.description || ""} ${items.join(" ")}`.toLowerCase();

  // Hash from promo.id for deterministic uniqueness
  let hash = 0;
  const seedStr = (promo.id || "") + Date.now().toString();
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  // Try keyword match first
  for (const entry of SERVICE_KEYWORD_IMAGES) {
    for (const kw of entry.keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        const idx = hash % entry.images.length;
        return entry.images[idx];
      }
    }
  }

  // Fallback: pick from theme hero pool by hash
  const heros = theme.heroImages || [];
  if (heros.length === 0) return "";
  const idx = hash % heros.length;
  return heros[idx];
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, updateClinic } = useClinic();
  const { toast } = useToast();

  const promoImageInputRef = useRef<HTMLInputElement>(null);

  const [clinicName, setClinicName] = useState("");
  const [clinicSpecialty, setClinicSpecialty] = useState("general");
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
  });
  const [promoImageFile, setPromoImageFile] = useState<File | null>(null);
  const [promoImagePreview, setPromoImagePreview] = useState<string | null>(null);
  const [generatingPromoImage, setGeneratingPromoImage] = useState(false);
  const [uploadingPromoImage, setUploadingPromoImage] = useState(false);

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
      setBotToken((clinic as any).bot_token || "");
      setLogoUrl(clinic.logo_url || null);
      setBotUsername((clinic as any).bot_username || null);
      setVoiceAgentEnabled(!!(clinic as any).voice_agent_enabled);
      setVoiceTone((clinic as any).voice_tone || "ودود ومحترم");
      setVoiceMode((clinic as any).voice_mode || "auto");
      setReceptionistWhatsapp((clinic as any).receptionist_whatsapp || "");
      setWorkingHoursStart((clinic as any).working_hours_start || "08:00");
      setWorkingHoursEnd((clinic as any).working_hours_end || "16:00");
      fetchServices();
      fetchStaff();
      fetchPromotions();
    }
  }, [clinic]);

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

  const downloadQr = () => {
    const canvas = document.getElementById("clinic-qr") as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${clinic?.name || "clinic"}.png`;
    a.click();
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
      specialty: clinicSpecialty,
      bot_token: botToken,
      voice_agent_enabled: voiceAgentEnabled,
      voice_tone: voiceTone,
      voice_mode: voiceMode,
      receptionist_whatsapp: receptionistWhatsapp || null,
      working_hours_start: workingHoursStart,
      working_hours_end: workingHoursEnd,
    };
    let { error } = await updateClinic(fullPayload);
    if (error && String(error.message || "").toLowerCase().includes("specialty")) {
      console.warn("specialty column missing, retrying without it");
      const { specialty, ...safePayload } = fullPayload;
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
    const { error } = await supabase.from("services").insert({
      clinic_id: clinic.id,
      name: newServiceName.trim(),
      price: priceValue,
    });
    if (error) {
      toast({ title: "خطأ", description: error.message || "فشل في إضافة الخدمة", variant: "destructive" });
    } else {
      setNewServiceName("");
      setNewServicePrice("");
      fetchServices();
      toast({ title: "تمت الإضافة ✓", description: "تمت إضافة الخدمة بنجاح" });
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

  const resetPromoForm = () => {
    setPromoForm({
      discount_type: "percentage",
      is_active: true,
      per_user_limit: 1,
      template: "auto",
      items: "",
      phone_text: "",
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

  const handlePromoSubmit = async () => {
    if (!clinic) return;
    if (!promoForm.title || !promoForm.discount_type || !promoForm.discount_value) {
      toast({ title: "بيانات ناقصة", description: "يرجى ملء جميع الحقول الأساسية", variant: "destructive" });
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
  // 🎨 GENERATE PREMIUM MEDICAL AD IMAGE — v7 ULTIMATE
  // Full-canvas layout, giant 3D gold number, unique images each time
  // ============================================================
  const generatePromoImage = async (promo: Promotion, forceRegenerate: boolean = false) => {
    if (!clinic) {
      toast({ title: "خطأ", description: "لم يتم تحميل بيانات العيادة", variant: "destructive" });
      return;
    }

    if (!forceRegenerate && promo.image_url) {
      const confirmRegen = window.confirm(
        "✅ توجد صورة مرفوعة مسبقاً لهذا العرض.\n\nهل تريد توليد صورة جديدة (بتصميم مختلف) تحل محل القديمة؟"
      );
      if (!confirmRegen) {
        toast({
          title: "ℹ️ الصورة موجودة",
          description: "الصورة الحالية جاهزة للاستخدام. يمكنك حذفها من زر 🗑 على الصورة ثم إعادة التوليد.",
        });
        return;
      }
    }

    setGeneratingPromoImage(true);

    try {
      const specialty = clinicSpecialty || "general";
      const theme = SPECIALTY_THEMES[specialty] || SPECIALTY_THEMES.general;

      const itemsList = (promo as any).items
        ? String((promo as any).items)
            .split(/[,،\n]/)
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

      const finalItems = itemsList.length > 0
        ? itemsList.slice(0, 9)
        : ["استشارة مجانية", "خصم فوري", "خدمة متميزة"];

      // Canvas — Portrait ratio 4:5 like Instagram
      const W = 1200;
      const H = 1500;
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

      // ============ STEP 1: BACKGROUND — clean modern gradient ============
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, "#FFFFFF");
      bgGrad.addColorStop(0.4, theme.bg1);
      bgGrad.addColorStop(1, theme.bg2);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Decorative diagonal accent stripe (right side)
      ctx.save();
      ctx.translate(W, 0);
      ctx.rotate(Math.PI / 12);
      const stripeGrad = ctx.createLinearGradient(0, 0, 0, H * 1.5);
      stripeGrad.addColorStop(0, `${theme.bg3}30`);
      stripeGrad.addColorStop(1, `${theme.bg3}05`);
      ctx.fillStyle = stripeGrad;
      ctx.fillRect(-200, 0, 400, H * 1.5);
      ctx.restore();

      // Subtle dot pattern
      ctx.save();
      ctx.fillStyle = `${theme.darkColor}08`;
      for (let x = 0; x < W; x += 45) {
        for (let y = 0; y < H; y += 45) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ============ STEP 2: HERO IMAGE — LARGE LEFT COLUMN (full height) ============
      const heroImageUrl = pickHeroImage(theme, promo, itemsList);
      const heroImg = await loadImage(heroImageUrl);

      const heroX = 40;
      const heroY = 260;
      const heroW = 620;
      const heroH = 1050;

      // Outer white frame with shadow
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 15;
      ctx.fillStyle = "white";
      roundRect(heroX - 12, heroY - 12, heroW + 24, heroH + 24, 32);
      ctx.fill();
      ctx.restore();

      // Draw hero image with cover mode
      if (heroImg) {
        ctx.save();
        roundRect(heroX, heroY, heroW, heroH, 24);
        ctx.clip();

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

        // Subtle bottom gradient for depth
        const overlayGrad = ctx.createLinearGradient(heroX, heroY + heroH * 0.6, heroX, heroY + heroH);
        overlayGrad.addColorStop(0, "rgba(0,0,0,0)");
        overlayGrad.addColorStop(1, "rgba(0,0,0,0.4)");
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(heroX, heroY, heroW, heroH);
        ctx.restore();

        // Colored corner accent (bottom-left of image)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(heroX, heroY + heroH);
        ctx.lineTo(heroX + 100, heroY + heroH);
        ctx.lineTo(heroX, heroY + heroH - 100);
        ctx.closePath();
        ctx.fillStyle = theme.bg3;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.restore();
      } else {
        // Fallback
        ctx.save();
        roundRect(heroX, heroY, heroW, heroH, 24);
        const fallGrad = ctx.createLinearGradient(heroX, heroY, heroX, heroY + heroH);
        fallGrad.addColorStop(0, theme.bg2);
        fallGrad.addColorStop(1, theme.bg3);
        ctx.fillStyle = fallGrad;
        ctx.fill();
        ctx.font = "350px 'Segoe UI Emoji', Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(theme.icon, heroX + heroW / 2, heroY + heroH / 2);
        ctx.restore();
      }

      // ============ STEP 3: HEADER — BIG LOGO + CLINIC NAME ============
      let logoImg: HTMLImageElement | null = null;
      if (clinic.logo_url) {
        logoImg = await loadImage(clinic.logo_url);
      }

      const logoSize = 160;
      const logoX = W / 2 - logoSize / 2;
      const logoY = 50;

      // Golden ring around logo
      ctx.save();
      ctx.shadowColor = "rgba(245, 158, 11, 0.5)";
      ctx.shadowBlur = 25;
      const ringGrad = ctx.createLinearGradient(logoX, logoY, logoX + logoSize, logoY + logoSize);
      ringGrad.addColorStop(0, "#FDE68A");
      ringGrad.addColorStop(0.5, "#F59E0B");
      ringGrad.addColorStop(1, "#B45309");
      ctx.fillStyle = ringGrad;
      roundRect(logoX - 8, logoY - 8, logoSize + 16, logoSize + 16, 28);
      ctx.fill();
      ctx.restore();

      // White inner card
      ctx.save();
      ctx.fillStyle = "white";
      roundRect(logoX - 4, logoY - 4, logoSize + 8, logoSize + 8, 24);
      ctx.fill();
      ctx.restore();

      if (logoImg) {
        ctx.save();
        roundRect(logoX, logoY, logoSize, logoSize, 20);
        ctx.clip();
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      } else {
        ctx.save();
        roundRect(logoX, logoY, logoSize, logoSize, 20);
        const iconGrad = ctx.createLinearGradient(logoX, logoY, logoX, logoY + logoSize);
        iconGrad.addColorStop(0, theme.bg2);
        iconGrad.addColorStop(1, theme.bg3);
        ctx.fillStyle = iconGrad;
        ctx.fill();
        ctx.font = "100px 'Segoe UI Emoji', Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "white";
        ctx.fillText(theme.icon, logoX + logoSize / 2, logoY + logoSize / 2 + 5);
        ctx.restore();
      }

      // Clinic name (Arabic, bold, big)
      ctx.save();
      ctx.font = "900 52px 'Cairo', 'Tajawal', 'Segoe UI', Arial";
      ctx.fillStyle = theme.darkColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.direction = "rtl";
      ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillText(clinic.name, W / 2, logoY + logoSize + 20);
      ctx.restore();

      // Specialty label (with dot separator)
      ctx.save();
      ctx.font = "600 22px 'Cairo', Arial";
      ctx.fillStyle = theme.chipText;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.direction = "rtl";
      ctx.fillText(`${theme.label}  •  ${theme.labelEn}`, W / 2, logoY + logoSize + 88);
      ctx.restore();

      // Small colored underline
      ctx.save();
      ctx.strokeStyle = theme.bg3;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(W / 2 - 60, logoY + logoSize + 130);
      ctx.lineTo(W / 2 + 60, logoY + logoSize + 130);
      ctx.stroke();
      ctx.restore();

      // ============ STEP 4: End date badge (top left) ============
      if (promo.end_date) {
        ctx.save();
        const badgeW = 280;
        const badgeH = 52;
        const badgeX = 40;
        const badgeY = 60;

        ctx.shadowColor = "rgba(220, 38, 38, 0.5)";
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 4;
        const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
        badgeGrad.addColorStop(0, "#EF4444");
        badgeGrad.addColorStop(1, "#B91C1C");
        ctx.fillStyle = badgeGrad;
        roundRect(badgeX, badgeY, badgeW, badgeH, 26);
        ctx.fill();
        ctx.shadowColor = "transparent";

        ctx.font = "bold 22px 'Cairo', Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = "rtl";
        ctx.fillText(`⏰ حتى ${promo.end_date}`, badgeX + badgeW / 2, badgeY + badgeH / 2);
        ctx.restore();
      }

      // ============ STEP 5: TITLE — right side, bold ============
      const rightX = W - 60;
      const rightColW = W - heroX - heroW - 120;
      const rightColCenter = heroX + heroW + 60 + rightColW / 2;

      ctx.save();
      ctx.font = "900 58px 'Cairo', Arial";
      ctx.fillStyle = theme.darkColor;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.direction = "rtl";
      const titleLines = wrapText(ctx, promo.title, rightColW);
      titleLines.slice(0, 2).forEach((line, idx) => {
        ctx.fillText(line, rightX, 330 + idx * 68);
      });
      ctx.restore();

      // Description
      if (promo.description) {
        ctx.save();
        ctx.font = "600 22px 'Cairo', Arial";
        ctx.fillStyle = theme.chipText;
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.direction = "rtl";
        const descLines = wrapText(ctx, promo.description, rightColW);
        descLines.slice(0, 3).forEach((line, idx) => {
          ctx.fillText(line, rightX, 490 + idx * 32);
        });
        ctx.restore();
      }

      // ============ STEP 6: GIANT 3D GOLDEN DISCOUNT NUMBER ============
      const discountCenterX = rightColCenter;
      const discountY = 640;
      const numStr = String(promo.discount_value);
      const unitStr = promo.discount_type === "percentage" ? "%" : "ريال";

      // "خصم يصل إلى" label
      ctx.save();
      ctx.font = "900 28px 'Cairo', Arial";
      ctx.fillStyle = theme.darkColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.direction = "rtl";
      ctx.fillText("خصم يصل إلى", discountCenterX, discountY);
      ctx.restore();

      // Draw the GIANT 3D golden number with premium effects
      ctx.save();
      const bigFontSize = 340;
      ctx.font = `900 ${bigFontSize}px 'Cairo', 'Arial Black', Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.direction = "ltr";

      const numY = discountY + 45;

      // Layer 1-12: Deep 3D shadow stack
      for (let i = 14; i >= 1; i--) {
        ctx.fillStyle = `rgba(120, 53, 15, ${0.08 + i * 0.03})`;
        ctx.fillText(numStr, discountCenterX + i * 0.6, numY + i * 0.8);
      }

      // Layer 13: Deep shadow
      ctx.shadowColor = "rgba(180, 83, 9, 0.4)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = "#78350F";
      ctx.fillText(numStr, discountCenterX + 2, numY + 4);

      // Layer 14: MAIN GOLD GRADIENT (metallic)
      ctx.shadowColor = "transparent";
      const goldGrad = ctx.createLinearGradient(0, numY, 0, numY + bigFontSize);
      goldGrad.addColorStop(0, "#FFF8DC");
      goldGrad.addColorStop(0.15, "#FEF3C7");
      goldGrad.addColorStop(0.35, "#FDE68A");
      goldGrad.addColorStop(0.5, "#FBBF24");
      goldGrad.addColorStop(0.65, "#F59E0B");
      goldGrad.addColorStop(0.85, "#D97706");
      goldGrad.addColorStop(1, "#78350F");
      ctx.fillStyle = goldGrad;
      ctx.fillText(numStr, discountCenterX, numY);

      // Layer 15: Top glossy highlight
      ctx.save();
      const clipY = numY;
      const clipH = bigFontSize * 0.4;
      ctx.beginPath();
      ctx.rect(discountCenterX - bigFontSize * 0.7, clipY, bigFontSize * 1.4, clipH);
      ctx.clip();
      const highlightGrad = ctx.createLinearGradient(0, clipY, 0, clipY + clipH);
      highlightGrad.addColorStop(0, "rgba(255, 255, 255, 0.85)");
      highlightGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.4)");
      highlightGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = highlightGrad;
      ctx.fillText(numStr, discountCenterX, numY);
      ctx.restore();

      // Layer 16: Dark outline
      ctx.strokeStyle = "#78350F";
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeText(numStr, discountCenterX, numY);

      // Layer 17: Reflection below (very subtle)
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.scale(1, -0.3);
      ctx.translate(0, -(numY + bigFontSize) * 2 - 30);
      const reflGrad = ctx.createLinearGradient(0, numY, 0, numY + bigFontSize);
      reflGrad.addColorStop(0, "#F59E0B");
      reflGrad.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = reflGrad;
      ctx.fillText(numStr, discountCenterX, numY);
      ctx.restore();

      ctx.restore();

      // Unit label (% or ريال) — big golden bar below number
      ctx.save();
      const unitW = 200;
      const unitH = 74;
      const unitX = discountCenterX - unitW / 2;
      const unitY = numY + bigFontSize + 20;

      ctx.shadowColor = "rgba(180, 83, 9, 0.6)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      const unitGrad = ctx.createLinearGradient(0, unitY, 0, unitY + unitH);
      unitGrad.addColorStop(0, "#FDE68A");
      unitGrad.addColorStop(0.5, "#F59E0B");
      unitGrad.addColorStop(1, "#B45309");
      ctx.fillStyle = unitGrad;
      roundRect(unitX, unitY, unitW, unitH, 37);
      ctx.fill();
      ctx.shadowColor = "transparent";

      // Inner shine
      ctx.save();
      roundRect(unitX + 6, unitY + 6, unitW - 12, (unitH - 12) / 2, 30);
      const shineGrad = ctx.createLinearGradient(0, unitY, 0, unitY + unitH / 2);
      shineGrad.addColorStop(0, "rgba(255,255,255,0.5)");
      shineGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shineGrad;
      ctx.fill();
      ctx.restore();

      ctx.font = "900 42px 'Cairo', Arial";
      ctx.fillStyle = "#5C1A00";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = "rtl";
      ctx.fillText(unitStr, discountCenterX, unitY + unitH / 2 + 2);
      ctx.restore();

      // ============ STEP 7: SERVICE CHIPS — bottom right col (2 cols) ============
      const chipsStartY = 1170;
      const chipsPerRow = 2;
      const chipsRightAreaX = heroX + heroW + 60;
      const chipsRightAreaW = W - chipsRightAreaX - 40;
      const chipGap = 12;
      const chipW = (chipsRightAreaW - (chipsPerRow - 1) * chipGap) / chipsPerRow;
      const chipH = 58;
      const chipRows = Math.min(3, Math.ceil(finalItems.length / chipsPerRow));

      finalItems.slice(0, chipsPerRow * chipRows).forEach((item, idx) => {
        const row = Math.floor(idx / chipsPerRow);
        const col = idx % chipsPerRow;
        const chipX = chipsRightAreaX + col * (chipW + chipGap);
        const chipY = chipsStartY + row * (chipH + chipGap);

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;

        // Chip background gradient
        const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX, chipY + chipH);
        chipGrad.addColorStop(0, "white");
        chipGrad.addColorStop(1, theme.chipBg);
        ctx.fillStyle = chipGrad;
        roundRect(chipX, chipY, chipW, chipH, 29);
        ctx.fill();
        ctx.shadowColor = "transparent";

        // Border
        ctx.strokeStyle = theme.chipBorder;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        roundRect(chipX, chipY, chipW, chipH, 29);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Small colored dot on right
        ctx.fillStyle = theme.bg3;
        ctx.beginPath();
        ctx.arc(chipX + chipW - 18, chipY + chipH / 2, 5, 0, Math.PI * 2);
        ctx.fill();

        // Text
        ctx.font = "bold 20px 'Cairo', Arial";
        ctx.fillStyle = theme.chipText;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = "rtl";
        const displayText = truncateText(ctx, item, chipW - 45);
        ctx.fillText(displayText, chipX + chipW / 2 - 8, chipY + chipH / 2);
        ctx.restore();
      });

      // ============ STEP 8: FOOTER — Phone / Code (full width bottom) ============
      const footerY = H - 90;
      const phoneText = (promo as any).phone_text || "";

      if (phoneText || promo.code) {
        const footerW = W - 80;
        const footerH = 68;
        const footerX = 40;

        ctx.save();
        // Golden bottom bar
        ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 8;
        const footGrad = ctx.createLinearGradient(0, footerY, 0, footerY + footerH);
        footGrad.addColorStop(0, "white");
        footGrad.addColorStop(1, "#F9FAFB");
        ctx.fillStyle = footGrad;
        roundRect(footerX, footerY, footerW, footerH, 34);
        ctx.fill();
        ctx.shadowColor = "transparent";

        // Colored left accent
        ctx.fillStyle = theme.bg3;
        roundRect(footerX, footerY, 8, footerH, 4);
        ctx.fill();

        if (phoneText) {
          // Green phone circle (right side in RTL layout)
          const phoneCircleX = footerX + footerW - 50;
          ctx.shadowColor = "rgba(16, 185, 129, 0.5)";
          ctx.shadowBlur = 12;
          const phoneGrad = ctx.createLinearGradient(phoneCircleX - 22, footerY + 15, phoneCircleX + 22, footerY + 55);
          phoneGrad.addColorStop(0, "#34D399");
          phoneGrad.addColorStop(1, "#059669");
          ctx.fillStyle = phoneGrad;
          ctx.beginPath();
          ctx.arc(phoneCircleX, footerY + footerH / 2, 24, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowColor = "transparent";

          ctx.font = "26px 'Segoe UI Emoji', Arial";
          ctx.fillStyle = "white";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("📞", phoneCircleX, footerY + footerH / 2 + 3);

          // Phone number (LTR)
          ctx.font = "900 38px 'Cairo', Arial";
          ctx.fillStyle = theme.darkColor;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.direction = "ltr";
          ctx.fillText(phoneText, phoneCircleX - 40, footerY + footerH / 2);

          // "احجز الآن" label (left side)
          ctx.font = "bold 22px 'Cairo', Arial";
          ctx.fillStyle = theme.chipText;
          ctx.textAlign = "left";
          ctx.direction = "rtl";
          ctx.fillText("احجز الآن 🤖", footerX + 40, footerY + footerH / 2);
        } else if (promo.code) {
          ctx.font = "bold 24px 'Cairo', Arial";
          ctx.fillStyle = theme.chipText;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.direction = "rtl";
          ctx.fillText("كود الخصم", footerX + footerW - 30, footerY + footerH / 2);

          ctx.font = "900 36px 'Courier New', monospace";
          ctx.fillStyle = theme.accentDark;
          ctx.textAlign = "left";
          ctx.direction = "ltr";
          ctx.fillText(promo.code, footerX + 40, footerY + footerH / 2);
        }
        ctx.restore();
      } else {
        // Generic call-to-action
        ctx.save();
        const ctaW = 600;
        const ctaH = 65;
        const ctaX = W / 2 - ctaW / 2;
        const ctaY = footerY;

        ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
        ctx.shadowBlur = 20;
        const ctaGrad = ctx.createLinearGradient(0, ctaY, 0, ctaY + ctaH);
        ctaGrad.addColorStop(0, theme.bg2);
        ctaGrad.addColorStop(1, theme.bg3);
        ctx.fillStyle = ctaGrad;
        roundRect(ctaX, ctaY, ctaW, ctaH, 32);
        ctx.fill();
        ctx.shadowColor = "transparent";

        ctx.font = "900 26px 'Cairo', Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = "rtl";
        ctx.fillText("احجز الآن عن طريق موظفنا الآلي الذكي 🤖", W / 2, ctaY + ctaH / 2);
        ctx.restore();
      }

      // ============ STEP 9: Convert & Upload ============
      const imageDataUrl = canvas.toDataURL("image/png", 1.0);
      const base64Data = imageDataUrl.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const filePath = `${clinic.id}/promo_${promo.id}_${Date.now()}.png`;
      const supabaseUrl2 = import.meta.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

      let uploadSuccess = false;

      if (supabaseServiceKey) {
        try {
          const uploadResponse = await fetch(`${supabaseUrl2}/storage/v1/object/promo-images/${filePath}`, {
            method: "POST",
            headers: {
              "Content-Type": "image/png",
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "x-upsert": "true",
            },
            body: bytes,
          });
          if (uploadResponse.ok) uploadSuccess = true;
        } catch (e) {}
      }

      if (!uploadSuccess) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            const formData = new FormData();
            formData.append("file", new Blob([bytes], { type: "image/png" }), filePath);
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
        } catch (e) {}
      }

      if (!uploadSuccess) {
        try {
          const { error: uploadError } = await supabase.storage
            .from("promo-images")
            .upload(filePath, bytes, { contentType: "image/png", upsert: true });
          if (!uploadError) uploadSuccess = true;
        } catch (e) {}
      }

      if (!uploadSuccess) {
        throw new Error("فشل رفع الصورة. تأكد من bucket 'promo-images'.");
      }

      const { data: urlData } = supabase.storage.from("promo-images").getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from("promotions").update({ image_url: publicUrl }).eq("id", promo.id);

      toast({
        title: "✅ تم توليد الصورة الاحترافية",
        description: "صورة إعلانية بجودة عالية جاهزة للنشر",
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
      // Try to extract path from URL to remove
      const url = new URL(promo.image_url.split("?")[0]);
      const pathMatch = url.pathname.match(/\/promo-images\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        await supabase.storage.from("promo-images").remove([pathMatch[1]]);
      }
      await supabase.from("promotions").update({ image_url: null }).eq("id", promo.id);
      toast({ title: "✓ تم الحذف", description: "تم حذف الصورة. يمكنك توليد صورة جديدة الآن" });
      fetchPromotions();
    } catch (e: any) {
      // Even if storage delete fails, still clear image_url from DB
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
                <Label htmlFor="clinicName" className="text-sm font-medium">اسم العيادة</Label>
                <Input
                  id="clinicName"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="أدخل اسم العيادة"
                  className="input-modern"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">تخصص العيادة</Label>
                <Select value={clinicSpecialty} onValueChange={setClinicSpecialty}>
                  <SelectTrigger className="input-modern">
                    <SelectValue placeholder="اختر تخصص العيادة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dental">🦷 أسنان</SelectItem>
                    <SelectItem value="dermatology">✨ جلدية</SelectItem>
                    <SelectItem value="gynecology">👩‍⚕️ نساء وولادة</SelectItem>
                    <SelectItem value="ophthalmology">👁️ عيون</SelectItem>
                    <SelectItem value="general">🏥 عام</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">يستخدم هذا التخصص في تصميم صور العروض الإعلانية</p>
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

          <section className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg">
                <QrCode className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">رمز QR للحجز</h2>
                <p className="text-sm text-muted-foreground">اطبعه وعلّقه في العيادة — الزبون يمسحه ويُحجز فوراً</p>
              </div>
            </div>
            {(() => {
              const effectiveBotUsername = botUsername || "SmartClinc_bot";
              if (!clinic?.id) return null;
              const link = `https://t.me/${effectiveBotUsername}?start=clinic_${clinic.id}`;
              return (
                <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-6">
                  <div className="bg-white p-4 rounded-2xl shadow-md">
                    <QRCodeCanvas id="clinic-qr" value={link} size={200} level="M" includeMargin={false} />
                  </div>
                  <div className="flex-1 space-y-3 w-full">
                    <p className="text-sm text-foreground">
                      عند مسح الرمز يفتح موظفنا الآلي الذكي <b dir="ltr">@{effectiveBotUsername}</b> مباشرةً على عيادتك.
                    </p>
                    <div className="flex gap-2">
                      <Input value={link} readOnly className="font-mono text-xs bg-background" dir="ltr" />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(link, "qrLink")}
                        className="shrink-0"
                      >
                        {copiedField === "qrLink" ? (
                          <Check className="w-4 h-4 text-success" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={downloadQr} className="flex-1">
                        <Download className="w-4 h-4" /> تنزيل صورة QR
                      </Button>
                      {botToken && (
                        <Button variant="outline" onClick={refreshBotUsername} disabled={loadingBotInfo}>
                          {loadingBotInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث اسم الموظف الآلي"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

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
                      <div className="w-full h-32 rounded-lg overflow-hidden mb-3 bg-slate-100 border border-slate-200 relative group">
                        <img
                          src={promo.image_url}
                          alt={promo.title}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
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
                              : `${promo.discount_value} ريال`}
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
                      {promo.image_url ? "إعادة توليد الصورة 🔄" : "توليد صورة إعلانية احترافية 🎨"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card-modern p-6 animate-slide-up delay-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">الخدمات والأسعار</h2>
                <p className="text-sm text-muted-foreground">قائمة الخدمات المتاحة في عيادتك</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Input
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="اسم الخدمة"
                className="flex-1 input-modern"
              />
              <Input
                type="number"
                value={newServicePrice}
                onChange={(e) => setNewServicePrice(e.target.value)}
                placeholder="السعر (اختياري)"
                className="w-full sm:w-40 input-modern"
              />
              <Button onClick={handleAddService} disabled={!newServiceName}>
                <Plus className="w-4 h-4" /> إضافة
              </Button>
            </div>
            <p className="text-xs text-muted-foreground -mt-3 mb-4">
              اترك حقل السعر فارغاً ليظهر للزبون كـ <b>«حسب الفحص»</b>
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
                services.map((service) => (
                  <div key={service.id} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold text-foreground">{service.name}</p>
                      <p className="text-sm text-primary font-bold">
                        {service.price === null
                          ? "حسب الفحص"
                          : `${Number(service.price).toLocaleString()} ريال`}
                      </p>
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
                ))
              )}
            </div>
          </section>

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
                      <SelectItem value="fixed">مبلغ ثابت (ر.ي)</SelectItem>
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
                <Label className="text-sm font-medium">عناصر الإعلان (الخدمات المشمولة في العرض فقط)</Label>
                <textarea
                  value={promoForm.items || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, items: e.target.value })}
                  placeholder={"مثال:\nتحاليل دقيقة\nاستشارة مجانية\nخصم للعائلات"}
                  className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  اكتب فقط الخدمات المشمولة في العرض. افصل بين العناصر بسطر أو فاصلة.
                </p>
              </div>
            </div>

            <div className="space-y-4">
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

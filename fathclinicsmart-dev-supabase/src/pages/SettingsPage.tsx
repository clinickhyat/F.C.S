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

// ============================================================
// Interfaces
// ============================================================
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
// Theme configurations per specialty — ULTRA PREMIUM EDITION v3
// ============================================================
const SPECIALTY_THEMES: Record<string, any> = {
  dental: {
    gradient: "linear-gradient(135deg, #0EA5E9 0%, #0284C7 35%, #075985 70%, #0C4A6E 100%)",
    accentColor: "#FCD34D",
    primaryGlow: "#38BDF8",
    secondaryGlow: "#FBBF24",
    chipBg: "rgba(56, 189, 248, 0.15)",
    chipBorder: "rgba(255, 255, 255, 0.25)",
    doctorImage: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=900&h=1200&fit=crop&q=90",
    bgPattern: "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=1200&h=1600&fit=crop&q=80",
    icon: "🦷",
    tagline: "ابتسامة صحية تدوم",
    ringColor: "#FCD34D",
  },
  dermatology: {
    gradient: "linear-gradient(135deg, #A855F7 0%, #9333EA 35%, #7E22CE 70%, #581C87 100%)",
    accentColor: "#FDE68A",
    primaryGlow: "#C084FC",
    secondaryGlow: "#F9A8D4",
    chipBg: "rgba(192, 132, 252, 0.15)",
    chipBorder: "rgba(255, 255, 255, 0.25)",
    doctorImage: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=900&h=1200&fit=crop&q=90",
    bgPattern: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&h=1600&fit=crop&q=80",
    icon: "✨",
    tagline: "بشرة نضرة وإشراقة طبيعية",
    ringColor: "#F9A8D4",
  },
  gynecology: {
    gradient: "linear-gradient(135deg, #EC4899 0%, #DB2777 35%, #BE185D 70%, #831843 100%)",
    accentColor: "#FDE68A",
    primaryGlow: "#F472B6",
    secondaryGlow: "#FBBF24",
    chipBg: "rgba(244, 114, 182, 0.15)",
    chipBorder: "rgba(255, 255, 255, 0.25)",
    doctorImage: "https://images.unsplash.com/photo-1638202993928-7267aad84c31?w=900&h=1200&fit=crop&q=90",
    bgPattern: "https://images.unsplash.com/photo-1584982751601-97dcc096659c?w=1200&h=1600&fit=crop&q=80",
    icon: "👩‍⚕️",
    tagline: "رعاية متكاملة للأم والطفل",
    ringColor: "#FBBF24",
  },
  ophthalmology: {
    gradient: "linear-gradient(135deg, #06B6D4 0%, #0891B2 35%, #0E7490 70%, #164E63 100%)",
    accentColor: "#FDE68A",
    primaryGlow: "#22D3EE",
    secondaryGlow: "#FCD34D",
    chipBg: "rgba(34, 211, 238, 0.15)",
    chipBorder: "rgba(255, 255, 255, 0.25)",
    doctorImage: "https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=900&h=1200&fit=crop&q=90",
    bgPattern: "https://images.unsplash.com/photo-1580281657527-47f249e8f4df?w=1200&h=1600&fit=crop&q=80",
    icon: "👁️",
    tagline: "رؤية أوضح لحياة أفضل",
    ringColor: "#FCD34D",
  },
  general: {
    gradient: "linear-gradient(135deg, #14B8A6 0%, #0D9488 35%, #0F766E 70%, #134E4A 100%)",
    accentColor: "#FDE68A",
    primaryGlow: "#2DD4BF",
    secondaryGlow: "#FBBF24",
    chipBg: "rgba(45, 212, 191, 0.15)",
    chipBorder: "rgba(255, 255, 255, 0.25)",
    doctorImage: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=900&h=1200&fit=crop&q=90",
    bgPattern: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&h=1600&fit=crop&q=80",
    icon: "🏥",
    tagline: "صحتك أولويتنا القصوى",
    ringColor: "#FBBF24",
  },
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, updateClinic } = useClinic();
  const { toast } = useToast();

  // --- Refs ---
  const promoImageInputRef = useRef<HTMLInputElement>(null);

  // --- Existing State ---
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

  // --- Promotions State ---
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

  // ============================================================
  // UseEffects
  // ============================================================
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
      setClinicSpecialty((clinic as any).specialty || "general");
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

  // ============================================================
  // Data Fetching Functions
  // ============================================================
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

  // ============================================================
  // Save Clinic Settings
  // ============================================================
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
    const { error } = await updateClinic({
      name: clinicName,
      specialty: clinicSpecialty,
      bot_token: botToken,
      voice_agent_enabled: voiceAgentEnabled,
      voice_tone: voiceTone,
      voice_mode: voiceMode,
      receptionist_whatsapp: receptionistWhatsapp || null,
      working_hours_start: workingHoursStart,
      working_hours_end: workingHoursEnd,
    } as any);
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

  // ============================================================
  // Promotion Handlers
  // ============================================================
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
  // 🔥 GENERATE PROFESSIONAL PROMO IMAGE — Ultra Premium v3
  // ============================================================
  const generatePromoImage = async (promo: Promotion) => {
    if (!clinic) {
      toast({ title: "خطأ", description: "لم يتم تحميل بيانات العيادة", variant: "destructive" });
      return;
    }
    setGeneratingPromoImage(true);

    try {
      // 1. Theme
      const specialty = (clinic as any).specialty || "general";
      const theme = SPECIALTY_THEMES[specialty] || SPECIALTY_THEMES.general;

      // 2. Data prep
      const discountDisplay =
        promo.discount_type === "percentage"
          ? `${promo.discount_value}%`
          : `${promo.discount_value} ر.ي`;

      const itemsList = (promo as any).items
        ? String((promo as any).items)
            .split(/[,،\n]/)
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

      const serviceNames = services.map((s) => s.name);
      const finalItems = itemsList.length > 0 ? itemsList : serviceNames.slice(0, 6);

      // 3. Container
      const container = document.createElement("div");
      container.id = "promo-card-container";
      container.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 1080px;
        height: 1440px;
        background: ${theme.gradient};
        font-family: 'Cairo', 'Tajawal', 'Segoe UI', sans-serif;
        direction: rtl;
        color: white;
        overflow: hidden;
        z-index: 99999;
      `;

      // 4. Logo
      const logoHtml = clinic.logo_url
        ? `<img src="${clinic.logo_url}" style="width: 110px; height: 110px; border-radius: 28px; object-fit: cover; border: 4px solid rgba(255,255,255,0.4); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 60px ${theme.primaryGlow}40;" crossorigin="anonymous" />`
        : `<div style="width: 110px; height: 110px; background: linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.1)); border-radius: 28px; display: flex; align-items: center; justify-content: center; font-size: 64px; border: 4px solid rgba(255,255,255,0.4); backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,0.4);">${theme.icon}</div>`;

      // 5. QR
      const effectiveBotUsername = botUsername || "SmartClinc_bot";
      const qrLink = `https://t.me/${effectiveBotUsername}?start=clinic_${clinic.id}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrLink)}&color=0F172A&bgcolor=FFFFFF&margin=1&qzone=1`;

      // 6. End date badge
      const endDateHtml = promo.end_date
        ? `<div style="display: inline-flex; align-items: center; gap: 10px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.95)); padding: 12px 26px; border-radius: 50px; border: 2px solid rgba(255,255,255,0.3); box-shadow: 0 8px 30px rgba(239, 68, 68, 0.4);">
            <span style="font-size: 26px;">⏰</span>
            <span style="font-size: 22px; font-weight: 800; color: white; letter-spacing: 0.5px;">حتى ${promo.end_date}</span>
          </div>`
        : "";

      // 7. Code badge
      const codeHtml = promo.code
        ? `<div style="display: flex; align-items: center; gap: 14px; background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.1)); backdrop-filter: blur(20px); padding: 14px 30px; border-radius: 20px; border: 2px solid ${theme.accentColor}80;">
            <span style="font-size: 26px;">🎟️</span>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 14px; color: rgba(255,255,255,0.7); font-weight: 600;">كود الخصم</span>
              <span style="font-size: 32px; font-weight: 900; color: ${theme.accentColor}; letter-spacing: 3px; direction: ltr; text-shadow: 0 2px 10px ${theme.accentColor}80;">${promo.code}</span>
            </div>
          </div>`
        : "";

      // 8. Phone
      const phoneHtml = (promo as any).phone_text
        ? `<div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.08); backdrop-filter: blur(15px); padding: 12px 22px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.15);">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #10B981, #059669); display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);">📞</div>
            <span style="font-size: 30px; font-weight: 800; color: white; direction: ltr; letter-spacing: 1px;">${(promo as any).phone_text}</span>
          </div>`
        : "";

      // 9. Chips — professional pill design
      const chipColors = [
        { bg: "rgba(255,255,255,0.12)", border: theme.primaryGlow },
        { bg: "rgba(255,255,255,0.12)", border: theme.secondaryGlow },
        { bg: "rgba(255,255,255,0.12)", border: theme.primaryGlow },
        { bg: "rgba(255,255,255,0.12)", border: theme.secondaryGlow },
        { bg: "rgba(255,255,255,0.12)", border: theme.primaryGlow },
        { bg: "rgba(255,255,255,0.12)", border: theme.secondaryGlow },
      ];

      const chipsHtml =
        finalItems.length > 0
          ? `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 10px 0;">
              ${finalItems
                .slice(0, 6)
                .map((item: string, idx: number) => {
                  const c = chipColors[idx % chipColors.length];
                  return `<div style="background: ${c.bg}; backdrop-filter: blur(20px); border: 2px solid ${c.border}60; padding: 18px 20px; border-radius: 22px; text-align: center; box-shadow: 0 8px 25px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: -20px; right: -20px; width: 60px; height: 60px; border-radius: 50%; background: ${c.border}25; filter: blur(20px);"></div>
                    <span style="font-size: 22px; font-weight: 800; color: white; text-shadow: 0 2px 10px rgba(0,0,0,0.3); position: relative; z-index: 1; line-height: 1.3;">${item}</span>
                  </div>`;
                })
                .join("")}
            </div>`
          : "";

      // 10. SVG decorative pattern (medical cross + waves)
      const svgDecor = `
        <svg width="1080" height="1440" style="position: absolute; top: 0; left: 0; z-index: 0; opacity: 0.08;" viewBox="0 0 1080 1440" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="medPattern" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
              <path d="M50 30 L70 30 L70 50 L90 50 L90 70 L70 70 L70 90 L50 90 L50 70 L30 70 L30 50 L50 50 Z" fill="white" opacity="0.4"/>
              <circle cx="60" cy="60" r="3" fill="${theme.accentColor}" opacity="0.5"/>
            </pattern>
          </defs>
          <rect width="1080" height="1440" fill="url(#medPattern)"/>
        </svg>
      `;

      // 11. Wave SVG at bottom
      const waveSvg = `
        <svg width="1080" height="200" style="position: absolute; bottom: 0; left: 0; z-index: 0; opacity: 0.15;" viewBox="0 0 1080 200" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,100 C270,180 540,20 810,100 C945,140 1010,80 1080,100 L1080,200 L0,200 Z" fill="${theme.primaryGlow}"/>
          <path d="M0,140 C270,80 540,180 810,120 C945,90 1010,150 1080,130 L1080,200 L0,200 Z" fill="${theme.accentColor}" opacity="0.5"/>
        </svg>
      `;

      // 12. Doctor image overlay (professional medical image)
      const doctorOverlay = `
        <div style="position: absolute; bottom: 200px; left: 20px; width: 380px; height: 550px; z-index: 1; opacity: 0.88;">
          <img src="${theme.doctorImage}" 
               style="width: 100%; height: 100%; object-fit: cover; border-radius: 30px; 
                      mask-image: linear-gradient(to top, black 60%, transparent 100%), linear-gradient(to right, transparent 0%, black 15%);
                      -webkit-mask-image: linear-gradient(to top, black 60%, transparent 100%);
                      filter: drop-shadow(0 20px 50px rgba(0,0,0,0.5));" 
               crossorigin="anonymous" />
        </div>
      `;

      // 13. Golden 3D discount number
      const goldenDiscount = `
        <div style="position: relative; display: inline-flex; align-items: baseline; gap: 8px;">
          <span style="
            font-size: 240px; 
            font-weight: 900; 
            line-height: 0.9;
            background: linear-gradient(135deg, #FDE68A 0%, #F59E0B 40%, #D97706 70%, #92400E 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 8px 20px rgba(217, 119, 6, 0.5)) drop-shadow(0 0 40px ${theme.accentColor}80);
            text-shadow: 0 4px 0 rgba(146, 64, 14, 0.3);
            letter-spacing: -8px;
          ">${promo.discount_value}</span>
          <span style="
            font-size: 90px; 
            font-weight: 900;
            background: linear-gradient(135deg, #FDE68A 0%, #F59E0B 60%, #D97706 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 4px 15px rgba(217, 119, 6, 0.5));
          ">${promo.discount_type === "percentage" ? "%" : "ر.ي"}</span>
        </div>
      `;

      // 14. Build final HTML
      container.innerHTML = `
        <!-- Background image overlay -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; opacity: 0.15; background: url('${theme.bgPattern}') center/cover no-repeat; filter: blur(3px);"></div>
        
        <!-- Dark vignette -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.4) 100%);"></div>

        <!-- SVG pattern -->
        ${svgDecor}

        <!-- Decorative glowing orbs -->
        <div style="position: absolute; top: -150px; right: -150px; width: 500px; height: 500px; border-radius: 50%; background: radial-gradient(circle, ${theme.primaryGlow}40 0%, transparent 65%); z-index: 0; filter: blur(20px);"></div>
        <div style="position: absolute; top: 300px; left: -200px; width: 450px; height: 450px; border-radius: 50%; background: radial-gradient(circle, ${theme.accentColor}30 0%, transparent 70%); z-index: 0; filter: blur(30px);"></div>
        <div style="position: absolute; bottom: -100px; right: -100px; width: 400px; height: 400px; border-radius: 50%; background: radial-gradient(circle, ${theme.secondaryGlow}25 0%, transparent 70%); z-index: 0; filter: blur(25px);"></div>

        <!-- Wave decoration -->
        ${waveSvg}

        <!-- Doctor image -->
        ${doctorOverlay}

        <!-- Main content -->
        <div style="position: relative; z-index: 2; display: flex; flex-direction: column; height: 100%; padding: 45px 55px;">
          
          <!-- HEADER -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px;">
            <div style="display: flex; align-items: center; gap: 22px;">
              ${logoHtml}
              <div>
                <h1 style="font-size: 46px; font-weight: 900; margin: 0; color: #ffffff; line-height: 1.1; text-shadow: 0 4px 30px rgba(0,0,0,0.5), 0 0 20px ${theme.primaryGlow}40;">${clinic.name}</h1>
                <p style="font-size: 22px; color: rgba(255,255,255,0.85); margin: 8px 0 0; font-weight: 600; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">${theme.tagline} ${theme.icon}</p>
              </div>
            </div>
            ${endDateHtml}
          </div>

          <!-- DIVIDER GLOW LINE -->
          <div style="height: 3px; background: linear-gradient(90deg, transparent, ${theme.accentColor}, ${theme.primaryGlow}, transparent); margin-bottom: 30px; border-radius: 3px; box-shadow: 0 0 20px ${theme.accentColor}80;"></div>

          <!-- HERO SECTION: Title + Discount -->
          <div style="display: flex; align-items: center; justify-content: flex-end; margin: 20px 0 15px 0;">
            <div style="text-align: left; flex: 1; padding-right: 400px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #DC2626, #991B1B); padding: 8px 22px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 8px 25px rgba(220, 38, 38, 0.5); transform: rotate(-2deg);">
                <span style="font-size: 22px; font-weight: 900; color: white; letter-spacing: 2px;">🔥 عرض حصري</span>
              </div>
              <h2 style="font-size: 78px; font-weight: 900; margin: 0 0 10px 0; line-height: 1.1; color: #ffffff; text-shadow: 0 6px 40px rgba(0,0,0,0.6), 0 0 30px ${theme.primaryGlow}30;">
                ${promo.title}
              </h2>
              ${
                promo.description
                  ? `<p style="font-size: 28px; color: rgba(255,255,255,0.92); margin: 12px 0 0 0; line-height: 1.4; text-shadow: 0 3px 20px rgba(0,0,0,0.4); font-weight: 500;">${promo.description}</p>`
                  : ""
              }
            </div>
          </div>

          <!-- GOLDEN DISCOUNT -->
          <div style="display: flex; justify-content: flex-end; align-items: center; margin: 10px 0 20px 0; padding-right: 60px;">
            <div style="text-align: center;">
              <div style="font-size: 26px; font-weight: 700; color: rgba(255,255,255,0.8); margin-bottom: -20px; letter-spacing: 3px; text-shadow: 0 2px 10px rgba(0,0,0,0.4);">وفّر</div>
              ${goldenDiscount}
              <div style="font-size: 24px; font-weight: 800; color: ${theme.accentColor}; margin-top: -10px; letter-spacing: 4px; text-shadow: 0 2px 15px ${theme.accentColor}80;">${promo.discount_type === "percentage" ? "خصم فوري" : "قيمة الخصم"}</div>
            </div>
          </div>

          <!-- SERVICE CHIPS GRID -->
          ${chipsHtml ? `<div style="margin: 15px 0;">${chipsHtml}</div>` : `<div style="flex: 1;"></div>`}

          <!-- BOTTOM CARD: QR + Contact -->
          <div style="
            background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05));
            backdrop-filter: blur(30px);
            border-radius: 30px;
            padding: 28px 32px;
            margin-top: auto;
            border: 2px solid rgba(255,255,255,0.2);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
            position: relative;
            overflow: hidden;
          ">
            <div style="position: absolute; top: -30px; right: -30px; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, ${theme.accentColor}30, transparent); filter: blur(20px);"></div>
            
            <!-- QR Section -->
            <div style="flex-shrink: 0; text-align: center;">
              <div style="background: white; padding: 10px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.4); border: 3px solid ${theme.accentColor};">
                <img src="${qrCodeUrl}" style="width: 180px; height: 180px; display: block;" crossorigin="anonymous" />
              </div>
              <div style="margin-top: 10px; font-size: 16px; font-weight: 700; color: ${theme.accentColor}; letter-spacing: 1px;">📱 امسح واحجز</div>
            </div>

            <!-- Contact Info -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 14px;">
              ${codeHtml}
              ${phoneHtml}
              ${
                !codeHtml && !phoneHtml
                  ? `<div style="font-size: 28px; font-weight: 800; color: white; text-align: center;">احجز موعدك الآن عن طريق موظفنا الآلي الذكي 🤖</div>`
                  : `<div style="font-size: 18px; font-weight: 600; color: rgba(255,255,255,0.75); text-align: right; margin-top: 4px;">✨ احجز عن طريق موظفنا الآلي الذكي</div>`
              }
            </div>
          </div>

          <!-- FOOTER -->
          <div style="text-align: center; padding-top: 18px; margin-top: 12px;">
            <span style="font-size: 16px; color: rgba(255,255,255,0.4); letter-spacing: 1px; font-weight: 500;">© ${new Date().getFullYear()} ${clinic.name} — نظام العيادة الذكي</span>
          </div>
        </div>
      `;

      // 15. Append + capture
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        width: 1080,
        height: 1440,
        imageTimeout: 15000,
        onclone: (doc) => {
          const images = doc.querySelectorAll('img');
          return Promise.all(
            Array.from(images).map((img) => {
              if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
              return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 8000);
              });
            })
          );
        },
      });

      document.body.removeChild(container);

      // 16. Convert to bytes
      const imageDataUrl = canvas.toDataURL("image/png");
      const base64Data = imageDataUrl.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 17. Upload (multi-fallback strategy)
      const filePath = `${clinic.id}/promo_${promo.id}.png`;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

      let uploadSuccess = false;

      if (supabaseServiceKey) {
        try {
          const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/promo-images/${filePath}`, {
            method: "POST",
            headers: {
              "Content-Type": "image/png",
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "x-upsert": "true",
            },
            body: bytes,
          });
          if (uploadResponse.ok) {
            uploadSuccess = true;
            console.log("✅ Uploaded with service role key");
          } else {
            const errorText = await uploadResponse.text();
            console.log("⚠️ Service role upload failed:", errorText);
          }
        } catch (e) {
          console.log("⚠️ Service role upload error:", e);
        }
      }

      if (!uploadSuccess) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            const formData = new FormData();
            formData.append("file", new Blob([bytes], { type: "image/png" }), filePath);
            const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/promo-images/${filePath}`, {
              method: "POST",
              headers: {
                "apikey": supabaseAnonKey,
                "Authorization": `Bearer ${token}`,
                "x-upsert": "true",
              },
              body: formData,
            });
            if (uploadResponse.ok) {
              uploadSuccess = true;
              console.log("✅ Uploaded with session token");
            } else {
              const errorText = await uploadResponse.text();
              console.log("⚠️ Session token upload failed:", errorText);
            }
          }
        } catch (e) {
          console.log("⚠️ Session token upload error:", e);
        }
      }

      if (!uploadSuccess) {
        try {
          const { error: uploadError } = await supabase.storage
            .from("promo-images")
            .upload(filePath, bytes, {
              contentType: "image/png",
              upsert: true,
            });
          if (!uploadError) {
            uploadSuccess = true;
            console.log("✅ Uploaded with supabase client");
          } else {
            console.log("⚠️ Supabase client upload failed:", uploadError);
          }
        } catch (e) {
          console.log("⚠️ Supabase client upload error:", e);
        }
      }

      if (!uploadSuccess) {
        throw new Error("فشل رفع الصورة. تأكد من أن bucket 'promo-images' موجود ومفعل.");
      }

      // 18. Get URL + update DB
      const { data: urlData } = supabase.storage.from("promo-images").getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase
        .from("promotions")
        .update({ image_url: publicUrl })
        .eq("id", promo.id);

      toast({
        title: "✅ تم توليد الصورة الاحترافية",
        description: "صورة إعلانية بجودة عالية جاهزة للنشر",
      });
      fetchPromotions();

    } catch (error: any) {
      console.error("❌ خطأ في توليد الصورة:", error);
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

  // ============================================================
  // Loading State
  // ============================================================
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

  // ============================================================
  // Render
  // ============================================================
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
          {/* ============================================================
              CLINIC SETTINGS
              ============================================================ */}
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
              {/* Logo */}
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

              {/* Clinic Name */}
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

              {/* Specialty */}
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

              {/* Bot Token */}
              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="botToken" className="text-sm font-medium">رمز الموظف الآلي الموحّد (للأدمن فقط)</Label>
                  <Input
                    id="botToken"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="أدخل رمز الموظف الآلي الموحّد"
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

              {/* Save & Webhook */}
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

          {/* ============================================================
              WORKING HOURS
              ============================================================ */}
          <section className="card-modern p-6 animate-slide-up delay-50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <CalendarClock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">أوقات الدوام الرسمية</h2>
                <p className="text-sm text-muted-foreground">تحديد ساعات العمل التي يرد عليها الموظف الآلي بالحجوزات</p>
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

          {/* ============================================================
              STAFF MANAGEMENT
              ============================================================ */}
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

          {/* ============================================================
              CUSTOMER BOOKING LINK
              ============================================================ */}
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
                هذا هو الرابط/الأمر الخاص بالزبون. عند فتحه سيتعرف الموظف الآلي على عيادتك ويعرض خدماتك فقط.
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

          {/* ============================================================
              QR CODE
              ============================================================ */}
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
                      عند مسح الرمز يفتح موظفنا الآلي <b dir="ltr">@{effectiveBotUsername}</b> مباشرةً على عيادتك.
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

          {/* ============================================================
              VOICE AGENT
              ============================================================ */}
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

          {/* ============================================================
              LINK DOCTOR
              ============================================================ */}
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
                <li>افتح موظف العيادة الآلي</li>
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
                بمجرد الإرسال، سيؤكد لك الموظف الآلي الربط، وستصلك جميع الإشعارات.
              </p>
            </div>
          </section>

          {/* ============================================================
              INTEGRATION INFO
              ============================================================ */}
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

          {/* ============================================================
              🎁 PROMOTIONS & OFFERS
              ============================================================ */}
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
                      <div className="w-full h-32 rounded-lg overflow-hidden mb-3 bg-slate-100 border border-slate-200">
                        <img
                          src={promo.image_url}
                          alt={promo.title}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
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
                      توليد صورة إعلانية احترافية 🎨
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ============================================================
              SERVICES
              ============================================================ */}
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

          {/* ============================================================
              SUBSCRIPTION STATUS
              ============================================================ */}
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

      {/* ============================================================
          🎁 PROMO DIALOG (Add/Edit)
          ============================================================ */}
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
            {/* Left Column */}
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
              {/* Items */}
              <div>
                <Label className="text-sm font-medium">عناصر الإعلان (تظهر كصناديق في الصورة)</Label>
                <textarea
                  value={promoForm.items || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, items: e.target.value })}
                  placeholder={"مثال:\nتحاليل دقيقة\nاستشارة مجانية\nخصم للعائلات"}
                  className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  افصل بين العناصر بسطر أو فاصلة. إن تُركت فارغة تُستخدم أسماء الخدمات تلقائياً.
                </p>
              </div>
            </div>

            {/* Right Column */}
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
              {/* Template */}
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
              {/* Phone Text */}
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
              {/* Image Upload */}
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

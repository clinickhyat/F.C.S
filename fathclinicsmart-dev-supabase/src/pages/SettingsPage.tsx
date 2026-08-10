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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Stethoscope,
  LogOut,
  ArrowRight,
  Save,
  Copy,
  Check,
  Link2,
  Key,
  Plus,
  Trash2,
  Loader2,
  Bot,
  Building2,
  CreditCard,
  Shield,
  Clock,
  Activity,
  Sparkles,
  Upload,
  Image,
  QrCode,
  Download,
  CalendarClock,
  Tag,
  Gift,
  BadgePercent,
  ImagePlus,
  X,
  Edit,
  Eye,
} from "lucide-react";
// 🆕 استيراد html2canvas (موجود في المشروع)
import html2canvas from "html2canvas";

interface Service {
  id: string;
  name: string;
  price: number | null;
}

// 🆕 إضافة حقول القالب إلى واجهة Promotion
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
  template?: string;    // 'auto' | 'teal' | 'dental' | 'derma' | 'cosmetic'
  items?: string;       // عناصر الخدمة مفصولة بفواصل
  phone_text?: string;  // رقم الهاتف في تذييل الصورة
  created_at: string;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, updateClinic } = useClinic();
  const { toast } = useToast();

  // --- Refs ---
  const promoImageInputRef = useRef<HTMLInputElement>(null);
  // 🆕 Ref لعنصر الصورة المؤقت
  const promoCardRef = useRef<HTMLDivElement | null>(null);

  // --- Existing State ---
  const [clinicName, setClinicName] = useState("");
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
  const [staffList, setStaffList] = useState<
    Array<{
      id: string;
      email: string;
      role: string;
      approved: boolean;
      created_at: string;
    }>
  >([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"reception" | "cashier">("reception");
  const [staffBusy, setStaffBusy] = useState(false);
  const [receptionistWhatsapp, setReceptionistWhatsapp] = useState("");
  const [workingHoursStart, setWorkingHoursStart] = useState("08:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("16:00");

  // 🆕 Promotions State
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

  // --- Existing UseEffects ---
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

  // --- Existing Functions ---
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
      toast({ title: "تم جلب اسم البوت ✓", description: `@${r.data.username}` });
    } else {
      toast({ title: "تعذّر جلب اسم البوت", description: r.error || "احفظ توكن البوت أولاً", variant: "destructive" });
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
        toast({ title: "تم الحفظ ✓", description: "تم حفظ الإعدادات وربط البوت بنجاح" });
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
      description: r.ok ? "البوت جاهز لاستقبال الرسائل" : (r.error || ""),
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

  // 🆕 Promotion Handlers
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
    console.log("📷 تم اختيار صورة العرض:", file.name, file.size);
    setPromoImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPromoImagePreview(ev.target?.result as string);
      console.log("✅ تم تحميل معاينة الصورة");
    };
    reader.onerror = (err) => {
      console.error("❌ فشل قراءة الصورة:", err);
      toast({ title: "خطأ", description: "فشل قراءة الصورة", variant: "destructive" });
    };
    reader.readAsDataURL(file);
    if (promoImageInputRef.current) {
      promoImageInputRef.current.value = "";
    }
  };

  const handlePromoImageUploadClick = () => {
    console.log("🖱️ زر رفع الصورة تم الضغط عليه");
    if (promoImageInputRef.current) {
      promoImageInputRef.current.click();
    } else {
      console.error("❌ المرجع غير موجود");
      toast({ title: "خطأ", description: "حدث خطأ في تهيئة رفع الصورة", variant: "destructive" });
    }
  };

  // 🆕 دالة رفع الصورة إلى Supabase Storage باستخدام Service Role Key
  const uploadPromoImageToStorage = async (bytes: Uint8Array, filePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from("promo-images")
        .upload(filePath, bytes, {
          contentType: "image/png",
          upsert: true,
        });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("promo-images")
        .getPublicUrl(filePath);
      return publicUrl;
    } catch (error: any) {
      console.error("❌ فشل رفع الصورة:", error);
      toast({ title: "خطأ في رفع الصورة", description: error.message || "فشل رفع الصورة إلى التخزين", variant: "destructive" });
      return null;
    }
  };

  // 🆕 NEW: توليد صورة عرض احترافية باستخدام html2canvas (نفس آلية سند الإيصال)
  const generatePromoImage = async (promo: Promotion) => {
    if (!clinic) return;
    setGeneratingPromoImage(true);

    try {
      // 1. إنشاء عنصر مؤقت في DOM (مخفي عن المستخدم)
      const container = document.createElement("div");
      container.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 800px;
        height: 1000px;
        background: transparent;
        z-index: -9999;
      `;
      container.id = "promo-card-container";
      document.body.appendChild(container);

      // 2. بناء قالب HTML/CSS للصورة الاحترافية (مستوحى من الإعلانات الطبية الفاخرة)
      const discountDisplay = promo.discount_type === "percentage" ? `${promo.discount_value}%` : `${promo.discount_value} ر.ي`;
      const isPercentage = promo.discount_type === "percentage";
      const itemsArray = (promo.items || "").split(",").map(s => s.trim()).filter(Boolean);

      // تدرجات الألوان حسب القالب
      const templateStyles: Record<string, { bg: string; accent: string; gold: string }> = {
        teal: { bg: "linear-gradient(165deg, #032f2b 0%, #0f766e 50%, #2dd4bf 100%)", accent: "#e11d48", gold: "#f7c948" },
        dental: { bg: "linear-gradient(165deg, #0a2e6e 0%, #1d4ed8 50%, #60a5fa 100%)", accent: "#dc2626", gold: "#fbbf24" },
        derma: { bg: "linear-gradient(165deg, #3b0764 0%, #86198f 50%, #e879f9 100%)", accent: "#dc2626", gold: "#fbbf24" },
        cosmetic: { bg: "linear-gradient(165deg, #082f49 0%, #0369a1 50%, #7dd3fc 100%)", accent: "#e11d48", gold: "#f7c948" },
        general: { bg: "linear-gradient(165deg, #043f3a 0%, #0f766e 50%, #5eead4 100%)", accent: "#e11d48", gold: "#f7c948" },
      };
      const selectedTemplate = (promo.template || "auto") !== "auto" ? promo.template : "general";
      const theme = templateStyles[selectedTemplate] || templateStyles.general;

      const qrValue = `https://t.me/${botUsername || "SmartClinc_bot"}?start=clinic_${clinic.id}`;

      container.innerHTML = `
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Cairo', sans-serif; }
          .promo-card {
            width: 800px;
            height: 1000px;
            background: ${theme.bg};
            border-radius: 24px;
            padding: 40px 48px;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
            direction: rtl;
          }
          .promo-card .deco-circle {
            position: absolute;
            border-radius: 50%;
            background: rgba(255,255,255,0.05);
          }
          .promo-card .deco-circle-1 {
            width: 400px;
            height: 400px;
            top: -120px;
            right: -120px;
          }
          .promo-card .deco-circle-2 {
            width: 300px;
            height: 300px;
            bottom: -100px;
            left: -100px;
          }
          .promo-card .header {
            display: flex;
            align-items: center;
            gap: 18px;
            margin-bottom: 20px;
            position: relative;
            z-index: 2;
          }
          .promo-card .header .logo {
            width: 72px;
            height: 72px;
            border-radius: 18px;
            background: rgba(255,255,255,0.15);
            border: 2px solid rgba(255,255,255,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex-shrink: 0;
          }
          .promo-card .header .logo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .promo-card .header .clinic-info h2 {
            font-size: 32px;
            font-weight: 900;
            line-height: 1.2;
          }
          .promo-card .header .clinic-info p {
            font-size: 16px;
            color: rgba(255,255,255,0.7);
            margin-top: 2px;
          }
          .promo-card .header .badge {
            background: ${theme.accent};
            border-radius: 999px;
            padding: 8px 22px;
            font-size: 18px;
            font-weight: 800;
            border: 2px solid rgba(255,255,255,0.6);
            margin-right: auto;
          }
          .promo-card .title-section {
            margin-top: 10px;
            position: relative;
            z-index: 2;
          }
          .promo-card .title-section h1 {
            font-size: 56px;
            font-weight: 900;
            line-height: 1.2;
          }
          .promo-card .title-section p {
            font-size: 22px;
            color: rgba(255,255,255,0.8);
            margin-top: 6px;
          }
          .promo-card .discount-row {
            display: flex;
            align-items: center;
            gap: 30px;
            margin: 24px 0;
            position: relative;
            z-index: 2;
          }
          .promo-card .discount-number {
            font-size: 120px;
            font-weight: 900;
            color: ${theme.gold};
            line-height: 1;
            display: flex;
            align-items: baseline;
            gap: 8px;
          }
          .promo-card .discount-number span {
            font-size: 48px;
          }
          .promo-card .discount-circle {
            width: 140px;
            height: 140px;
            border-radius: 50%;
            background: ${theme.accent};
            border: 5px solid rgba(255,255,255,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            font-weight: 900;
            text-align: center;
            line-height: 1.2;
            flex-shrink: 0;
          }
          .promo-card .items-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 16px 0;
            position: relative;
            z-index: 2;
          }
          .promo-card .items-row .chip {
            background: rgba(255,255,255,0.12);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 20px;
            padding: 8px 18px;
            font-size: 16px;
            font-weight: 600;
          }
          .promo-card .bottom-card {
            margin-top: auto;
            background: rgba(255,255,255,0.96);
            border-radius: 20px;
            padding: 20px 28px;
            display: flex;
            align-items: center;
            gap: 20px;
            position: relative;
            z-index: 2;
          }
          .promo-card .bottom-card .info {
            flex: 1;
          }
          .promo-card .bottom-card .info .code-row {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .promo-card .bottom-card .info .code-row .label {
            font-size: 16px;
            color: #64748b;
            font-weight: 700;
          }
          .promo-card .bottom-card .info .code-row .code {
            font-size: 32px;
            font-weight: 900;
            color: #0d9488;
            direction: ltr;
            font-family: monospace;
          }
          .promo-card .bottom-card .info .phone {
            font-size: 24px;
            font-weight: 900;
            color: #0f172a;
            direction: ltr;
            margin-top: 4px;
          }
          .promo-card .bottom-card .info .hint {
            font-size: 14px;
            color: #94a3b8;
            margin-top: 2px;
          }
          .promo-card .bottom-card .qr {
            background: #ffffff;
            padding: 6px;
            border-radius: 12px;
            border: 2px solid #e2e8f0;
            flex-shrink: 0;
          }
          .promo-card .bottom-card .qr canvas {
            display: block;
            width: 120px;
            height: 120px;
          }
          .promo-card .footer {
            text-align: center;
            padding-top: 16px;
            border-top: 1px solid rgba(255,255,255,0.1);
            margin-top: 16px;
            font-size: 14px;
            color: rgba(255,255,255,0.35);
            position: relative;
            z-index: 2;
          }
        </style>
        <div class="promo-card">
          <div class="deco-circle deco-circle-1"></div>
          <div class="deco-circle deco-circle-2"></div>

          <div class="header">
            <div class="logo">
              ${logoUrl ? `<img src="${logoUrl}" alt="شعار العيادة" />` : '<span style="font-size: 32px;">🏥</span>'}
            </div>
            <div class="clinic-info">
              <h2>${clinic.name}</h2>
              <p>عرض خاص — لفترة محدودة</p>
            </div>
            <div class="badge">${promo.end_date ? `حتى ${promo.end_date}` : "لفترة محدودة"}</div>
          </div>

          <div class="title-section">
            <h1>${promo.title}</h1>
            ${promo.description ? `<p>${promo.description}</p>` : ""}
          </div>

          <div class="discount-row">
            <div class="discount-number">
              ${promo.discount_value}<span>${isPercentage ? "%" : "ر.ي"}</span>
            </div>
            <div class="discount-circle">${isPercentage ? `${promo.discount_value}%` : "عرض خاص"}</div>
          </div>

          ${itemsArray.length ? `
            <div class="items-row">
              ${itemsArray.map(item => `<span class="chip">${item}</span>`).join("")}
            </div>
          ` : ""}

          <div class="bottom-card">
            <div class="info">
              ${promo.code ? `
                <div class="code-row">
                  <span class="label">كود الخصم:</span>
                  <span class="code">${promo.code}</span>
                </div>
              ` : `<div style="font-size: 20px; font-weight: 800; color: #0d9488;">🎁 الخصم يُطبَّق تلقائياً عند الحجز</div>`}
              ${promo.phone_text ? `<div class="phone">📞 ${promo.phone_text}</div>` : ""}
              <div class="hint">امسح الرمز واحجز فوراً عبر البوت</div>
            </div>
            <div class="qr">
              <div id="promo-qr-code"></div>
            </div>
          </div>

          <div class="footer">
            © ${new Date().getFullYear()} ${clinic.name} — نظام العيادة الذكي
          </div>
        </div>
      `;

      // 3. رسم QR Code داخل العنصر
      const qrContainer = container.querySelector("#promo-qr-code");
      if (qrContainer) {
        // استخدام QRCodeCanvas مباشرة (موجود في المشروع)
        const qrCanvas = document.createElement("canvas");
        qrCanvas.width = 120;
        qrCanvas.height = 120;
        qrContainer.appendChild(qrCanvas);
        // استخدام مكتبة qrcode.react (موجودة) ولكن نستخدمها بشكل مباشر
        // بدلاً من ذلك، نستخدم QRCodeCanvas كـ React component لكن هنا نضعه كـ HTML
        // سنقوم بتوليد QR باستخدام canvas يدوياً
        const QRCode = require("qrcode");
        await QRCode.toCanvas(qrCanvas, qrValue, { width: 120, margin: 2 });
      }

      // 4. الانتظار قليلاً لضمان اكتمال التحميل
      await new Promise(resolve => setTimeout(resolve, 300));

      // 5. التقاط الصورة باستخدام html2canvas
      const canvas = await html2canvas(container, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        allowTaint: true,
        width: 800,
        height: 1000,
      });

      // 6. إزالة العنصر المؤقت
      document.body.removeChild(container);

      // 7. تحويل canvas إلى Uint8Array
      const imageDataUrl = canvas.toDataURL("image/png");
      const base64Data = imageDataUrl.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 8. رفع الصورة إلى Supabase Storage
      const filePath = `${clinic.id}/promo_${promo.id}.png`;
      const publicUrl = await uploadPromoImageToStorage(bytes, filePath);

      if (!publicUrl) {
        throw new Error("فشل رفع الصورة");
      }

      // 9. تحديث قاعدة البيانات
      await supabase
        .from("promotions")
        .update({ image_url: publicUrl })
        .eq("id", promo.id);

      toast({ title: "✅ تم توليد الصورة بنجاح", description: "صورة العرض الاحترافية جاهزة" });
      fetchPromotions();

    } catch (error: any) {
      console.error("❌ توليد الصورة فشل:", error);
      toast({ title: "فشل التوليد", description: error.message || "حدث خطأ أثناء توليد الصورة", variant: "destructive" });
    } finally {
      setGeneratingPromoImage(false);
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
          {/* --- Clinic Settings --- */}
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

              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="botToken" className="text-sm font-medium">رمز البوت الموحّد (للأدمن فقط)</Label>
                  <Input
                    id="botToken"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="أدخل رمز البوت الموحّد"
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
                  بوت تيليجرام مفعّل تلقائياً عبر النظام (محمي من الإدارة).
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

          {/* --- Working Hours --- */}
          <section className="card-modern p-6 animate-slide-up delay-50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <CalendarClock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">أوقات الدوام الرسمية</h2>
                <p className="text-sm text-muted-foreground">تحديد ساعات العمل التي يرد عليها البوت بالحجوزات</p>
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

          {/* --- Staff Management --- */}
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
                يُستخدم عندما يطلب زبون في تيليجرام «حجز باسم شخص آخر» — يُوجَّه للتواصل مع الاستقبال عبر
                واتساب.
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

          {/* --- Customer Booking Link --- */}
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
                هذا هو الرابط/الأمر الخاص بالزبون. عند فتحه سيتعرف البوت على عيادتك ويعرض خدماتك فقط.
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

          {/* --- QR Code --- */}
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
                      عند مسح الرمز يفتح بوت <b dir="ltr">@{effectiveBotUsername}</b> مباشرةً على عيادتك.
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
                          {loadingBotInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث اسم البوت"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* --- Voice Agent --- */}
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

          {/* --- Link Doctor --- */}
          <section className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">إشعارات تيليجرام الفورية</h2>
                <p className="text-sm text-muted-foreground">اربط حسابك لاستقبال كل حجز/إلغاء فوراً</p>
              </div>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-3">
              <p className="text-sm text-foreground">
                <b>الخطوات:</b>
              </p>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal pr-5">
                <li>افتح بوت العيادة في تيليجرام</li>
                <li>انسخ الأمر التالي وأرسله للبوت:</li>
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
                بمجرد الإرسال، سيؤكد لك البوت الربط، وستصلك جميع الإشعارات.
              </p>
            </div>
          </section>

          {/* --- Integration Info --- */}
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
                  <div className="bg-muted/30 rounded-2xl p-5 border border-border">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" /> ملاحظات التكامل المباشر
                    </h3>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>استخدم البوت الموحد والـ Webhook المباشر داخل النظام فقط</li>
                      <li>
                        <strong className="text-foreground">مهم:</strong> كل عملية بيانات يجب أن تكون
                        مربوطة بـ{" "}
                        <code className="bg-background px-1.5 py-0.5 rounded text-primary">clinic_id</code>
                      </li>
                      <li>
                        جداول البيانات:{" "}
                        <code className="bg-background px-1.5 py-0.5 rounded">patients</code> و{" "}
                        <code className="bg-background px-1.5 py-0.5 rounded">appointments</code>
                      </li>
                    </ol>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ============================================================
              🆕 NEW: PROMOTIONS & OFFERS SECTION
              ============================================================ */}
          <section className="card-modern p-6 animate-slide-up delay-150">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Tag className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground">العروض والخصومات</h2>
                <p className="text-sm text-muted-foreground">إدارة العروض الترويجية وأكواد الخصم</p>
              </div>
              <Button
                onClick={() => openPromoDialog()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Plus className="w-4 h-4 ml-1" />
                إضافة عرض
              </Button>
            </div>

            {/* Promotions List */}
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
                      <div className="w-full h-32 rounded-lg overflow-hidden mb-3 bg-slate-100">
                        <img
                          src={promo.image_url}
                          alt={promo.title}
                          className="w-full h-full object-cover"
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
                      className="mt-3 w-full text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                      onClick={() => generatePromoImage(promo)}
                      disabled={generatingPromoImage}
                    >
                      {generatingPromoImage ? (
                        <Loader2 className="w-3 h-3 animate-spin ml-1" />
                      ) : (
                        <ImagePlus className="w-3 h-3 ml-1" />
                      )}
                      توليد صورة عرض احترافية 🎨
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* --- Services --- */}
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

          {/* --- Subscription Status --- */}
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
          🆕 NEW: Promotions Dialog (Add/Edit) — مع حقول القالب
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
              {/* 🆕 حقل عناصر الإعلان */}
              <div>
                <Label className="text-sm font-medium">عناصر الإعلان (تظهر كصناديق في الصورة)</Label>
                <textarea
                  value={promoForm.items || ""}
                  onChange={(e) => setPromoForm({ ...promoForm, items: e.target.value })}
                  placeholder={"مثال:\nتحاليل دقيقة\nاستشارة مجانية\nخصم للعائلات"}
                  className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">افصل بين العناصر بسطر أو فاصلة.</p>
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
              {/* 🆕 حقل قالب التصميم */}
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
                    <SelectItem value="auto">تلقائي (حسب التصنيف)</SelectItem>
                    <SelectItem value="teal">أخضر مختبرات (تحاليل)</SelectItem>
                    <SelectItem value="dental">أزرق أسنان</SelectItem>
                    <SelectItem value="derma">بنفسجي جلدية</SelectItem>
                    <SelectItem value="cosmetic">سماوي تجميل/ليزر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* 🆕 حقل رقم الهاتف */}
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
                    <Upload className="w-4 h-4 ml-1" />
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
                  أو استخدم زر "توليد صورة عرض احترافية" بعد الحفظ
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

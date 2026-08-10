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

interface Service { id: string; name: string; price: number | null; }

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

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, updateClinic } = useClinic();
  const { toast } = useToast();

  const promoImageInputRef = useRef<HTMLInputElement>(null);

  const [clinicName, setClinicName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [clinicSpecialty, setClinicSpecialty] = useState<string>("general");
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

  // --- UseEffects ---
  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [user, authLoading, navigate]);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
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
      setClinicSpecialty((clinic as any).specialty || "general");
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
    const { data } = await supabase.from("clinic_staff").select("id,email,role,approved,created_at")
      .eq("clinic_id", clinic.id).order("created_at", { ascending: false });
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
        body: JSON.stringify({ email: newStaffEmail.trim(), password: newStaffPassword, role: newStaffRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast({ title: "تعذّر الإضافة", description: data?.error || "خطأ غير معروف", variant: "destructive" });
        return;
      }
      toast({ title: "تمت إضافة الموظف ✓", description: "يمكنه تسجيل الدخول فوراً بالبريد وكلمة المرور" });
      setNewStaffEmail(""); setNewStaffPassword("");
      fetchStaff();
    } finally { setStaffBusy(false); }
  };

  const approveStaff = async (id: string) => { await supabase.rpc("approve_clinic_staff", { staff_id: id } as any); toast({ title: "تم الاعتماد ✓" }); fetchStaff(); };
  const revokeStaff = async (id: string) => { await supabase.rpc("revoke_clinic_staff", { staff_id: id } as any); toast({ title: "تم التعليق" }); fetchStaff(); };
  const removeStaff = async (id: string) => { await supabase.rpc("remove_clinic_staff", { staff_id: id } as any); toast({ title: "تم الحذف" }); fetchStaff(); };

  const refreshBotUsername = async () => {
    setLoadingBotInfo(true);
    const r = await invokeBotAction("bot-info");
    setLoadingBotInfo(false);
    if (r.ok && r.data?.username) { setBotUsername(r.data.username); toast({ title: "تم جلب اسم البوت ✓", description: `@${r.data.username}` }); }
    else toast({ title: "تعذّر جلب اسم البوت", description: r.error || "احفظ توكن البوت أولاً", variant: "destructive" });
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
    const { data } = await supabase.from("services").select("*").eq("clinic_id", clinic.id).order("created_at", { ascending: true });
    setServices(data || []);
  };

  const handleSaveClinic = async () => {
    if (!clinic) { toast({ title: "تعذر تحميل العيادة", description: "أعد تحميل الصفحة.", variant: "destructive" }); return; }
    setSaving(true);
    try { await supabase.rpc("save_clinic_vault", { bot_token: botToken || null } as any); } catch (e) { console.warn("vault save failed", e); }
    const { error } = await updateClinic({
      name: clinicName, bot_token: botToken,
      specialty: clinicSpecialty,
      voice_agent_enabled: voiceAgentEnabled, voice_tone: voiceTone, voice_mode: voiceMode,
      receptionist_whatsapp: receptionistWhatsapp || null,
      working_hours_start: workingHoursStart, working_hours_end: workingHoursEnd,
    } as any);
    if (error) { setSaving(false); toast({ title: "خطأ", description: error.message || "فشل في حفظ الإعدادات", variant: "destructive" }); return; }
    if (botToken && botToken.trim().length > 10) {
      const hookResult = await invokeBotAction("set-webhook");
      if (!hookResult.ok) toast({ title: "تم الحفظ - تنبيه", description: "تم حفظ التوكن لكن فشل ضبط webhook", variant: "destructive" });
      else toast({ title: "تم الحفظ ✓", description: "تم حفظ الإعدادات وربط البوت بنجاح" });
    } else toast({ title: "تم الحفظ ✓", description: "تم حفظ إعدادات العيادة بنجاح" });
    setSaving(false);
  };

  const invokeBotAction = async (action: "set-webhook" | "webhook-info" | "bot-info"): Promise<{ ok: boolean; data?: any; error?: string }> => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch(`${supabaseUrl}/functions/v1/telegram-bot?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: supabaseAnonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) return { ok: false, error: data?.error || data?.webhook?.description || `HTTP ${res.status}` };
      return { ok: true, data };
    } catch (e: any) { return { ok: false, error: e?.message || "خطأ في الاتصال" }; }
  };

  const handleCheckWebhook = async () => {
    const r = await invokeBotAction("webhook-info");
    if (!r.ok) { toast({ title: "تعذّر فحص الـ Webhook", description: r.error, variant: "destructive" }); return; }
    const info = r.data?.info?.result || {};
    const desc = info.url
      ? `✓ مرتبط بـ: ${info.url}\nآخر خطأ: ${info.last_error_message || "لا يوجد"}\nمعلق: ${info.pending_update_count ?? 0}`
      : "⚠️ لم يُضبط webhook بعد. احفظ التوكن أو اضغط 'إعادة ضبط الـ Webhook'.";
    toast({ title: info.url ? "حالة الـ Webhook" : "تنبيه", description: desc });
  };

  const handleResetWebhook = async () => {
    const r = await invokeBotAction("set-webhook");
    toast({ title: r.ok ? "تم ضبط الـ Webhook ✓" : "فشل الضبط", description: r.ok ? "البوت جاهز لاستقبال الرسائل" : (r.error || ""), variant: r.ok ? "default" : "destructive" });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !clinic) return;
    setUploadingLogo(true);
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/logo.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from("clinic-logos").upload(filePath, file, { upsert: true });
    if (uploadError) { toast({ title: "خطأ", description: friendlyStorageError(uploadError.message), variant: "destructive" }); setUploadingLogo(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("clinic-logos").getPublicUrl(filePath);
    const { error: updateError } = await supabase.from("clinics").update({ logo_url: publicUrl }).eq("id", clinic.id).eq("owner_id", user.id);
    if (updateError) toast({ title: "خطأ", description: "فشل في حفظ رابط الشعار", variant: "destructive" });
    else { setLogoUrl(publicUrl); toast({ title: "تم الرفع ✓", description: "تم رفع شعار العيادة بنجاح" }); }
    setUploadingLogo(false);
  };

  const friendlyStorageError = (msg: string): string => {
    if (msg.includes("row-level security") || msg.includes("security policy")) {
      return "سياسات الرفع غير مفعّلة بعد: نفّذ ملف SQL الخاص بإصلاح RLS في Supabase ثم أعد المحاولة.";
    }
    return msg || "فشل الرفع";
  };

  const handleAddService = async () => {
    if (!clinic || !newServiceName.trim()) return;
    const trimmedPrice = newServicePrice.trim();
    const priceValue = trimmedPrice === "" ? null : parseFloat(trimmedPrice);
    if (trimmedPrice !== "" && (Number.isNaN(priceValue) || (priceValue as number) < 0)) { toast({ title: "خطأ", description: "السعر غير صالح", variant: "destructive" }); return; }
    const { error } = await supabase.from("services").insert({ clinic_id: clinic.id, name: newServiceName.trim(), price: priceValue });
    if (error) toast({ title: "خطأ", description: error.message || "فشل في إضافة الخدمة", variant: "destructive" });
    else { setNewServiceName(""); setNewServicePrice(""); fetchServices(); toast({ title: "تمت الإضافة ✓", description: "تمت إضافة الخدمة بنجاح" }); }
  };

  const handleDeleteService = async (id: string) => {
    const { error } = await supabase.from("services").delete().eq("id", id).eq("clinic_id", clinic?.id || "");
    if (error) toast({ title: "خطأ", description: "فشل في حذف الخدمة", variant: "destructive" });
    else { fetchServices(); toast({ title: "تم الحذف", description: "تم حذف الخدمة بنجاح" }); }
  };

  // 🆕 Promotion Handlers
  const resetPromoForm = () => {
    setPromoForm({ discount_type: "percentage", is_active: true, per_user_limit: 1, template: "auto", items: "", phone_text: "" });
    setPromoImageFile(null); setPromoImagePreview(null); setEditingPromo(null);
  };

  const openPromoDialog = (promo?: Promotion) => {
    if (promo) {
      setEditingPromo(promo);
      setPromoForm({
        title: promo.title, description: promo.description || "",
        discount_type: promo.discount_type, discount_value: promo.discount_value,
        code: promo.code || "", start_date: promo.start_date || "", end_date: promo.end_date || "",
        usage_limit: promo.usage_limit || undefined, per_user_limit: promo.per_user_limit || 1,
        is_active: promo.is_active, image_url: promo.image_url || "",
        template: promo.template || "auto", items: promo.items || "", phone_text: promo.phone_text || "",
      });
      if (promo.image_url) setPromoImagePreview(promo.image_url);
    } else resetPromoForm();
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
        const { error: uploadError } = await supabase.storage.from("promo-images").upload(filePath, promoImageFile, { upsert: true });
        if (uploadError) { toast({ title: "خطأ في رفع الصورة", description: friendlyStorageError(uploadError.message), variant: "destructive" }); setUploadingPromoImage(false); return; }
        const { data: { publicUrl } } = supabase.storage.from("promo-images").getPublicUrl(filePath);
        imageUrl = publicUrl;
      } catch (err: any) { toast({ title: "خطأ", description: friendlyStorageError(err.message), variant: "destructive" }); setUploadingPromoImage(false); return; }
    }
    const payload = {
      clinic_id: clinic.id,
      title: promoForm.title, description: promoForm.description || null,
      discount_type: promoForm.discount_type, discount_value: promoForm.discount_value,
      code: promoForm.code || null, start_date: promoForm.start_date || null, end_date: promoForm.end_date || null,
      usage_limit: promoForm.usage_limit || null, per_user_limit: promoForm.per_user_limit || 1,
      is_active: promoForm.is_active !== undefined ? promoForm.is_active : true,
      image_url: imageUrl,
      template: promoForm.template || "auto", items: promoForm.items || null, phone_text: promoForm.phone_text || null,
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
      toast({ title: "خطأ", description: error.message?.includes("row-level security") ? friendlyStorageError(error.message) : "فشل حفظ العرض: " + error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الحفظ ✓", description: "تم حفظ العرض بنجاح — يمكنك الآن توليد صورة إعلانية احترافية" });
      setPromoDialogOpen(false); resetPromoForm(); fetchPromotions();
    }
  };

  const fetchPromotions = async () => {
    if (!clinic) return;
    const { data } = await supabase.from("promotions").select("*").eq("clinic_id", clinic.id).order("created_at", { ascending: false });
    setPromotions(data || []);
  };

  const togglePromoStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from("promotions").update({ is_active: !currentStatus }).eq("id", id);
    if (error) toast({ title: "خطأ", description: "فشل تغيير حالة العرض", variant: "destructive" });
    else { toast({ title: "تم التحديث", description: `تم ${!currentStatus ? "تفعيل" : "إيقاف"} العرض` }); fetchPromotions(); }
  };

  const deletePromo = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا العرض؟")) return;
    const { error } = await supabase.from("promotions").delete().eq("id", id);
    if (error) toast({ title: "خطأ", description: "فشل حذف العرض", variant: "destructive" });
    else { toast({ title: "تم الحذف", description: "تم حذف العرض بنجاح" }); fetchPromotions(); }
  };

  function detectCategory(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("اسنان") || lower.includes("dental") || lower.includes("سن") || lower.includes("ضرس") || lower.includes("أسنان")) return "dental";
    if (lower.includes("جلد") || lower.includes("dermatology") || lower.includes("بشرة") || lower.includes("حبوب") || lower.includes("جلدية")) return "dermatology";
    if (lower.includes("نساء") || lower.includes("ولادة") || lower.includes("gynecology") || lower.includes("حمل")) return "gynecology";
    if (lower.includes("عيون") || lower.includes("ophthalmology") || lower.includes("نظر")) return "ophthalmology";
    if (lower.includes("تجميل") || lower.includes("cosmetic") || lower.includes("ليزر") || lower.includes("تحاليل") || lower.includes("مختبر")) return "cosmetic";
    return "general";
  }

  // ============================================================
  // 🔥 IMPROVED: generatePromoImage using html2canvas with upsert
  // ============================================================
  const generatePromoImage = async (promo: Promotion) => {
    if (!clinic) {
      toast({ title: "خطأ", description: "لم يتم تحميل بيانات العيادة", variant: "destructive" });
      return;
    }
    setGeneratingPromoImage(true);

    try {
      // 1. تحديد التخصص الفعلي
      const specialty = clinicSpecialty || detectCategory(promo.title + " " + (promo.description || ""));

      // 2. قائمة الثيمات حسب التخصص
      const themes: Record<string, any> = {
        dental: {
          background: "linear-gradient(145deg, #0b2a3b 0%, #1a4a6e 40%, #2c6f8f 100%)",
          accentColor: "#4fc3f7",
          imageKeyword: "dentist+checking+patient",
          overlayImage: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=800&h=600&fit=crop",
          icon: "🦷",
        },
        dermatology: {
          background: "linear-gradient(145deg, #2d1b3d 0%, #4a2c5e 40%, #6b3f8a 100%)",
          accentColor: "#ce93d8",
          imageKeyword: "dermatologist+examining",
          overlayImage: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=800&h=600&fit=crop",
          icon: "✨",
        },
        gynecology: {
          background: "linear-gradient(145deg, #1e3a4a 0%, #2d5a6e 40%, #4a7d94 100%)",
          accentColor: "#f48fb1",
          imageKeyword: "gynecologist+ultrasound",
          overlayImage: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&h=600&fit=crop",
          icon: "👩‍⚕️",
        },
        ophthalmology: {
          background: "linear-gradient(145deg, #0d2b45 0%, #1a4a6e 40%, #2b6f8a 100%)",
          accentColor: "#4dd0e1",
          imageKeyword: "eye+doctor+examining",
          overlayImage: "https://images.unsplash.com/photo-1596178060671-7a80dc8059ea?w=800&h=600&fit=crop",
          icon: "👁️",
        },
        general: {
          background: "linear-gradient(145deg, #0a0f1f 0%, #141e33 40%, #0d2b3e 100%)",
          accentColor: "#fbbf24",
          imageKeyword: "doctor+with+stethoscope",
          overlayImage: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&h=600&fit=crop",
          icon: "🏥",
        },
      };

      const theme = themes[specialty] || themes.general;

      // 3. تحضير البيانات
      const discountDisplay =
        promo.discount_type === "percentage"
          ? `${promo.discount_value}%`
          : `${promo.discount_value} ر.ي`;

      const discountLabel =
        promo.discount_type === "percentage" ? "خصم" : "قيمة الخصم";

      const itemsList = (promo as any).items
        ? String((promo as any).items)
            .split(/[,،\n]/)
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

      const servicesItems = services.map(s => s.name);
      const finalItems = itemsList.length > 0 ? itemsList : servicesItems.slice(0, 5);

      // 4. بناء القالب HTML
      const container = document.createElement("div");
      container.id = "promo-card-container";
      container.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 1000px;
        height: 1300px;
        background: ${theme.background};
        padding: 40px 50px;
        font-family: 'Cairo', 'Segoe UI', sans-serif;
        direction: rtl;
        color: white;
        border-radius: 40px;
        box-shadow: 0 40px 100px rgba(0,0,0,0.8);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      `;

      // طبقة الخلفية مع تأثير ضبابي
      const overlayStyle = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.25);
        backdrop-filter: blur(2px);
        z-index: 0;
      `;

      // شعار العيادة
      const logoHtml = clinic.logo_url
        ? `<img src="${clinic.logo_url}" style="width: 90px; height: 90px; border-radius: 24px; object-fit: cover; border: 3px solid rgba(255,255,255,0.3); box-shadow: 0 8px 30px rgba(0,0,0,0.4);" crossorigin="anonymous" />`
        : `<div style="width: 90px; height: 90px; background: rgba(255,255,255,0.12); border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 56px; border: 3px solid rgba(255,255,255,0.2); backdrop-filter: blur(8px);">${theme.icon}</div>`;

      // تاريخ الصلاحية
      const endDateHtml = promo.end_date
        ? `<div style="display: flex; align-items: center; gap: 8px; background: rgba(239, 68, 68, 0.15); backdrop-filter: blur(12px); padding: 8px 20px; border-radius: 40px; border: 1px solid rgba(239, 68, 68, 0.2);">
            <span style="font-size: 24px;">📅</span>
            <span style="font-size: 22px; font-weight: 700; color: #fca5a5;">صالح حتى: ${promo.end_date}</span>
          </div>`
        : "";

      // كود الخصم
      const codeHtml = promo.code
        ? `<div style="display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.08); backdrop-filter: blur(16px); padding: 12px 28px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.15);">
            <span style="font-size: 24px; color: rgba(255,255,255,0.7);">🔑</span>
            <span style="font-size: 40px; font-weight: 900; color: #fbbf24; letter-spacing: 4px; direction: ltr;">${promo.code}</span>
          </div>`
        : "";

      // رقم الهاتف
      const phoneHtml = (promo as any).phone_text
        ? `<div style="display: flex; align-items: center; gap: 12px; font-size: 32px; font-weight: 700; color: rgba(255,255,255,0.9);">
            <span>📞</span>
            <span dir="ltr">${(promo as any).phone_text}</span>
          </div>`
        : "";

      // عناصر الخدمة (chips)
      const chipsHtml =
        finalItems.length > 0
          ? finalItems
              .map(
                (item: string) =>
                  `<span style="background: rgba(255,255,255,0.1); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.2); padding: 12px 28px; border-radius: 40px; font-size: 24px; font-weight: 600; color: rgba(255,255,255,0.95); box-shadow: 0 4px 20px rgba(0,0,0,0.2);">${item}</span>`
              )
              .join("")
          : "";

      // QR Code
      const effectiveBotUsername = botUsername || "SmartClinc_bot";
      const qrLink = `https://t.me/${effectiveBotUsername}?start=clinic_${clinic.id}`;
      const qrCodeHtml = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
        qrLink
      )}&color=000000&bgcolor=FFFFFF&margin=2&qzone=1" style="width: 170px; height: 170px; border-radius: 24px; background: white; padding: 8px; border: 3px solid rgba(255,255,255,0.2); box-shadow: 0 10px 40px rgba(0,0,0,0.3);" crossorigin="anonymous" />`;

      // صورة الخلفية التوضيحية (من Unsplash)
      const bgImage = theme.overlayImage;

      // تجميع القالب النهائي
      container.innerHTML = `
        <!-- طبقة الخلفية -->
        <div style="${overlayStyle}"></div>
        
        <!-- صورة الخلفية التوضيحية -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; opacity: 0.1; background: url('${bgImage}') center/cover no-repeat; filter: blur(4px);"></div>

        <!-- المحتوى الأساسي -->
        <div style="position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%;">
          
          <!-- الرأس -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="display: flex; align-items: center; gap: 24px;">
              ${logoHtml}
              <div>
                <h1 style="font-size: 44px; font-weight: 900; margin: 0; color: #ffffff; line-height: 1.1; text-shadow: 0 4px 30px rgba(0,0,0,0.3);">${clinic.name}</h1>
                <p style="font-size: 24px; color: rgba(255,255,255,0.6); margin: 6px 0 0; font-weight: 500;">عرض ترويجي حصري 🎁</p>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 14px;">
              ${endDateHtml}
            </div>
          </div>

          <!-- القسم الرئيسي -->
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 10px 0;">
            <h2 style="font-size: 80px; font-weight: 900; margin: 0 0 12px 0; line-height: 1.2; color: #ffffff; text-shadow: 0 4px 40px rgba(0,0,0,0.4);">
              ${promo.title}
            </h2>
            ${
              promo.description
                ? `<p style="font-size: 32px; color: rgba(255,255,255,0.85); margin: 0 0 30px 0; line-height: 1.5; text-shadow: 0 2px 20px rgba(0,0,0,0.2);">${promo.description}</p>`
                : ""
            }

            <!-- عرض الخصم -->
            <div style="display: flex; align-items: center; gap: 60px; margin: 20px 0 30px 0;">
              <div style="display: flex; align-items: baseline; gap: 15px;">
                <span style="font-size: 160px; font-weight: 900; color: #fbbf24; line-height: 1; text-shadow: 0 8px 50px rgba(251, 191, 36, 0.3);">${promo.discount_value}</span>
                <span style="font-size: 56px; font-weight: 900; color: #fbbf24; text-shadow: 0 4px 30px rgba(251, 191, 36, 0.2);">${promo.discount_type === "percentage" ? "%" : "ر.ي"}</span>
              </div>
              <div style="width: 200px; height: 200px; border-radius: 50%; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); border: 8px solid rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; flex-direction: column; box-shadow: 0 20px 60px rgba(220, 38, 38, 0.4);">
                <span style="font-size: 48px; font-weight: 900; color: white; text-align: center; line-height: 1.1;">${discountDisplay}</span>
                <span style="font-size: 26px; font-weight: 700; color: rgba(255,255,255,0.9);">${discountLabel}</span>
              </div>
            </div>

            <!-- عناصر الخدمة -->
            ${
              chipsHtml
                ? `<div style="display: flex; flex-wrap: wrap; gap: 16px; margin: 10px 0 20px 0;">${chipsHtml}</div>`
                : ""
            }
          </div>

          <!-- البطاقة السفلية -->
          <div style="background: rgba(255,255,255,0.08); backdrop-filter: blur(20px); border-radius: 32px; padding: 28px 35px; margin-top: auto; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; box-shadow: 0 10px 50px rgba(0,0,0,0.3);">
            <div style="display: flex; flex-direction: column; gap: 16px; flex: 1;">
              ${codeHtml}
              ${phoneHtml}
              <div style="font-size: 20px; color: rgba(255,255,255,0.5); display: flex; align-items: center; gap: 8px;">
                <span>📱</span>
                <span>امسح الرمز واحجز الآن عبر البوت</span>
              </div>
            </div>
            <div style="flex-shrink: 0; margin-right: 20px;">
              ${qrCodeHtml}
            </div>
          </div>

          <!-- تذييل -->
          <div style="text-align: center; padding-top: 20px; margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.05);">
            <span style="font-size: 18px; color: rgba(255,255,255,0.25);">© ${new Date().getFullYear()} ${clinic.name} — نظام العيادة الذكي</span>
          </div>
        </div>
      `;

      // 5. إضافة العنصر إلى DOM
      document.body.appendChild(container);

      // 6. انتظار تحميل الصور
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 7. التقاط الصورة
      const canvas = await html2canvas(container, {
        scale: 4,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        width: 1000,
        height: 1300,
        onclone: (doc) => {
          const images = doc.querySelectorAll('img');
          return Promise.all(
            Array.from(images).map((img) => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              });
            })
          );
        },
      });

      // 8. إزالة العنصر
      document.body.removeChild(container);

      // 9. تحويل إلى blob
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));

      // 10. رفع الصورة باستخدام supabase.storage مع upsert: true (حل مشكلة التكرار)
      const filePath = `${clinic.id}/promo_${promo.id}.png`;
      const { error: uploadError } = await supabase.storage
        .from('promo-images')
        .upload(filePath, blob, {
          contentType: 'image/png',
          upsert: true, // 👈 هذا هو المفتاح لحل مشكلة 409
        });

      if (uploadError) {
        console.error("❌ فشل رفع الصورة:", uploadError);
        toast({ title: "خطأ", description: "فشل رفع الصورة: " + uploadError.message, variant: "destructive" });
        setGeneratingPromoImage(false);
        return;
      }

      // 11. الحصول على الرابط العام
      const { data: urlData } = supabase.storage.from('promo-images').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      // 12. تحديث قاعدة البيانات
      await supabase
        .from('promotions')
        .update({ image_url: publicUrl })
        .eq('id', promo.id);

      toast({
        title: "✅ تم توليد الصورة بنجاح",
        description: "صورة العرض الاحترافية جاهزة للنشر",
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

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "تم النسخ ✓", description: "تم نسخ النص إلى الحافظة" });
  };

  const handleSignOut = async () => { await signOut(); navigate("/"); };

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
                {logoUrl ? <img src={logoUrl} alt="شعار العيادة" className="w-full h-full object-cover" /> : <Stethoscope className="w-6 h-6 text-white" />}
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{clinic?.name || "عيادتي"}</h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3 text-primary" /> الإعدادات</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}><ArrowRight className="w-5 h-5" /></Button>
              <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="w-5 h-5" /></Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* === إعدادات العيادة === */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg"><Building2 className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">إعدادات العيادة</h2><p className="text-sm text-muted-foreground">معلومات العيادة الأساسية</p></div>
            </div>
            <div className="grid gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2"><Image className="w-4 h-4" /> شعار العيادة</Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-muted/50 border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                    {logoUrl ? <img src={logoUrl} alt="شعار العيادة" className="w-full h-full object-cover" /> : <Image className="w-8 h-8 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                      <Button type="button" variant="outline" disabled={uploadingLogo} className="pointer-events-none">
                        {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploadingLogo ? "جاري الرفع..." : "رفع شعار"}
                      </Button>
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">يُفضل صورة مربعة بحجم 200x200 بكسل أو أكبر</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clinicName" className="text-sm font-medium">اسم العيادة</Label>
                <Input id="clinicName" value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="أدخل اسم العيادة" className="input-modern" />
              </div>

              {/* حقل تخصص العيادة */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">تخصص العيادة (لتصميم الإعلانات)</Label>
                <Select value={clinicSpecialty} onValueChange={setClinicSpecialty}>
                  <SelectTrigger className="w-full input-modern">
                    <SelectValue placeholder="اختر تخصص العيادة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">🏥 عام</SelectItem>
                    <SelectItem value="dental">🦷 أسنان</SelectItem>
                    <SelectItem value="dermatology">✨ جلدية</SelectItem>
                    <SelectItem value="gynecology">👩‍⚕️ نساء وولادة</SelectItem>
                    <SelectItem value="ophthalmology">👁️ عيون</SelectItem>
                    <SelectItem value="cosmetic">💎 تجميل</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">يُستخدم لتحديد الصور والألوان في إعلانات العروض الترويجية</p>
              </div>

              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="botToken" className="text-sm font-medium">رمز البوت الموحّد (للأدمن فقط)</Label>
                  <Input id="botToken" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="أدخل رمز البوت الموحّد" className="input-modern font-mono text-sm" dir="ltr" />
                  <p className="text-xs text-muted-foreground">هذا التوكن موحّد لجميع العيادات ويُضبط مرة واحدة من حساب الأدمن.</p>
                </div>
              ) : (
                <div className="rounded-xl bg-muted/40 border border-border p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> بوت تيليجرام مفعّل تلقائياً عبر النظام (محمي من الإدارة).
                </div>
              )}

              <Button onClick={handleSaveClinic} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الإعدادات
              </Button>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={handleCheckWebhook} className="w-full sm:w-auto">🔎 فحص حالة الـ Webhook</Button>
                <Button variant="outline" onClick={handleResetWebhook} className="w-full sm:w-auto">🔁 إعادة ضبط الـ Webhook</Button>
              </div>
            </div>
          </section>

          {/* === أوقات الدوام === */}
          <section className="card-modern p-6 animate-slide-up delay-50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg"><CalendarClock className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">أوقات الدوام الرسمية</h2><p className="text-sm text-muted-foreground">تحديد ساعات العمل التي يرد عليها البوت بالحجوزات</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-sm font-medium">بداية الدوام</Label><Input type="time" value={workingHoursStart} onChange={(e) => setWorkingHoursStart(e.target.value)} className="input-modern text-center" /></div>
              <div className="space-y-2"><Label className="text-sm font-medium">نهاية الدوام</Label><Input type="time" value={workingHoursEnd} onChange={(e) => setWorkingHoursEnd(e.target.value)} className="input-modern text-center" /></div>
            </div>
            <Button onClick={handleSaveClinic} disabled={saving} className="mt-4 w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ أوقات الدوام
            </Button>
          </section>

          {/* === إدارة الموظفين === */}
          <section className="card-modern p-6 animate-slide-up delay-75">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg"><Shield className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-black text-foreground">إدارة الموظفين</h2><p className="text-xs text-muted-foreground">أضف موظفاً بالبريد الإلكتروني، ثم اعتمده يدوياً ليتمكن من الدخول.</p></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <Input placeholder="بريد الموظف الإلكتروني" value={newStaffEmail} onChange={(e) => setNewStaffEmail(e.target.value)} dir="ltr" className="input-modern" />
              <Input type="password" placeholder="كلمة مرور مؤقتة (6 أحرف على الأقل)" value={newStaffPassword} onChange={(e) => setNewStaffPassword(e.target.value)} dir="ltr" className="input-modern" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-5">
              <Select value={newStaffRole} onValueChange={(v) => setNewStaffRole(v as any)}>
                <SelectTrigger className="w-full input-modern"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="reception">استقبال</SelectItem><SelectItem value="cashier">صندوق</SelectItem></SelectContent>
              </Select>
              <Button onClick={addStaff} disabled={staffBusy || !newStaffEmail.trim() || !newStaffPassword.trim()}>
                {staffBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إنشاء حساب الموظف
              </Button>
            </div>
            <div className="mb-5 space-y-2 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <Label className="text-sm font-semibold text-foreground">رقم واتساب موظف الاستقبال</Label>
              <Input value={receptionistWhatsapp} onChange={(e) => setReceptionistWhatsapp(e.target.value)} placeholder="مثال: 967771234567 (بدون + أو 00)" dir="ltr" className="input-modern" />
              <p className="text-xs text-muted-foreground">يُستخدم عندما يطلب زبون في تيليجرام «حجز باسم شخص آخر» ويُظهر في تذييل الإعلانات المولّدة.</p>
            </div>
            {staffList.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">لا يوجد موظفون بعد</div>
            ) : (
              <div className="space-y-2">
                {staffList.map((s) => (
                  <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl border border-border bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate" dir="ltr">{s.email}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary">{s.role === "reception" ? "استقبال" : "صندوق"}</span>
                        {s.approved ? <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">معتمد</span> : <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600">بانتظار الاعتماد</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.approved ? <Button size="sm" variant="outline" onClick={() => revokeStaff(s.id)}>تعليق</Button> : <Button size="sm" onClick={() => approveStaff(s.id)}><Check className="w-4 h-4" /> اعتماد</Button>}
                      <Button size="sm" variant="ghost" onClick={() => removeStaff(s.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* === رابط حجز العملاء === */}
          <section className="card-modern p-6 animate-slide-up delay-75">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg"><Link2 className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">رابط حجز العملاء</h2><p className="text-sm text-muted-foreground">أرسله للزبائن ليحجزوا داخل هذه العيادة فقط</p></div>
            </div>
            <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5 space-y-3">
              <p className="text-sm text-muted-foreground">هذا هو الرابط/الأمر الخاص بالزبون. عند فتحه سيتعرف البوت على عيادتك ويعرض خدماتك فقط.</p>
              <div className="flex gap-2">
                <Input value={`/start clinic_${clinic?.id || ""}`} readOnly className="font-mono text-sm bg-background" dir="ltr" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(`/start clinic_${clinic?.id || ""}`, "customerLink")} className="shrink-0">
                  {copiedField === "customerLink" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">أمر <code className="bg-background px-1.5 py-0.5 rounded">link_</code> خاص بربط حساب الطبيب لاستقبال الإشعارات، وليس للزبائن.</p>
            </div>
          </section>

          {/* === QR Code === */}
          <section className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg"><QrCode className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">رمز QR للحجز</h2><p className="text-sm text-muted-foreground">اطبعه وعلّقه في العيادة — الزبون يمسحه ويُحجز فوراً</p></div>
            </div>
            {(() => {
              const effectiveBotUsername = botUsername || "SmartClinc_bot";
              if (!clinic?.id) return null;
              const link = `https://t.me/${effectiveBotUsername}?start=clinic_${clinic.id}`;
              return (
                <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-6">
                  <div className="bg-white p-4 rounded-2xl shadow-md"><QRCodeCanvas id="clinic-qr" value={link} size={200} level="M" includeMargin={false} /></div>
                  <div className="flex-1 space-y-3 w-full">
                    <p className="text-sm text-foreground">عند مسح الرمز يفتح بوت <b dir="ltr">@{effectiveBotUsername}</b> مباشرةً على عيادتك.</p>
                    <div className="flex gap-2">
                      <Input value={link} readOnly className="font-mono text-xs bg-background" dir="ltr" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(link, "qrLink")} className="shrink-0">
                        {copiedField === "qrLink" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={downloadQr} className="flex-1"><Download className="w-4 h-4" /> تنزيل صورة QR</Button>
                      {botToken && <Button variant="outline" onClick={refreshBotUsername} disabled={loadingBotInfo}>{loadingBotInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث اسم البوت"}</Button>}
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* === الوكيل الصوتي === */}
          <section className="card-modern p-6 animate-slide-up delay-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg"><Sparkles className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">الوكيل الصوتي (مجاني)</h2><p className="text-sm text-muted-foreground">يرسل ردّاً صوتياً عربياً للزبون بعد كل ردّ نصي</p></div>
            </div>
            <div className="space-y-4 bg-accent/5 border border-accent/20 rounded-2xl p-5">
              <label className="flex items-center justify-between cursor-pointer">
                <div><div className="font-medium">تفعيل الردود الصوتية</div><p className="text-xs text-muted-foreground mt-1">عند تفعيلها يصل الزبون برد واحد فقط: نص أو صوت</p></div>
                <input type="checkbox" checked={voiceAgentEnabled} onChange={(e) => setVoiceAgentEnabled(e.target.checked)} className="w-5 h-5 accent-primary" />
              </label>
              <div className="space-y-2">
                <Label className="text-sm font-medium">طريقة الرد عند تفعيل الصوت</Label>
                <Select value={voiceMode} onValueChange={setVoiceMode}>
                  <SelectTrigger><SelectValue placeholder="اختر طريقة الرد" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">تلقائي: نص أو صوت بالتبادل</SelectItem>
                    <SelectItem value="text">نص فقط</SelectItem>
                    <SelectItem value="voice">صوت فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="voiceTone" className="text-sm font-medium">نبرة الرد الأساسية</Label>
                <Input id="voiceTone" value={voiceTone} onChange={(e) => setVoiceTone(e.target.value)} placeholder="مثال: ودود ومحترم" className="input-modern" />
              </div>
              <p className="text-xs text-muted-foreground">💡 الصوت يُولّد عبر Google Translate TTS المجاني</p>
            </div>
          </section>

          {/* === ربط تيليجرام === */}
          <section className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg"><Bot className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">إشعارات تيليجرام الفورية</h2><p className="text-sm text-muted-foreground">اربط حسابك لاستقبال كل حجز/إلغاء فوراً</p></div>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-3">
              <p className="text-sm text-foreground"><b>الخطوات:</b></p>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal pr-5">
                <li>افتح بوت العيادة في تيليجرام</li>
                <li>انسخ الأمر التالي وأرسله للبوت:</li>
              </ol>
              <div className="flex gap-2">
                <Input value={`/start link_${user?.id || ""}`} readOnly className="font-mono text-sm bg-background" dir="ltr" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(`/start link_${user?.id || ""}`, "linkCmd")} className="shrink-0">
                  {copiedField === "linkCmd" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">بمجرد الإرسال، سيؤكد لك البوت الربط، وستصلك جميع الإشعارات.</p>
            </div>
          </section>

          {/* === معلومات الربط === */}
          <section className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg"><Bot className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">معلومات الربط</h2><p className="text-sm text-muted-foreground">{isAdmin ? "معلومات الربط الكاملة (صلاحيات المدير)" : "معرّف العيادة الخاص بك"}</p></div>
            </div>
            <div className="grid gap-4">
              <div className="bg-primary/5 rounded-2xl p-5 border border-primary/20">
                <Label className="flex items-center gap-2 text-primary font-semibold mb-3"><Sparkles className="w-4 h-4" /> معرّف العيادة (Clinic ID)</Label>
                <div className="flex gap-2">
                  <Input value={clinic?.id || ""} readOnly className="font-mono text-sm bg-background" dir="ltr" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(clinic?.id || "", "clinicId")} className="shrink-0">
                    {copiedField === "clinicId" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">هذا الرقم هو هويتك الفريدة في النظام.</p>
              </div>
              {isAdmin && (
                <>
                  <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-2">
                    <p className="text-xs text-warning flex items-center gap-2"><Shield className="w-4 h-4" /> هذه المعلومات تظهر لك فقط لأنك مدير النظام</p>
                  </div>
                  <div className="grid gap-3">
                    <div className="flex items-center gap-2 bg-muted/30 rounded-xl p-4">
                      <Link2 className="w-5 h-5 text-muted-foreground shrink-0" />
                      <Input value={supabaseUrl} readOnly className="font-mono text-xs bg-transparent border-0" dir="ltr" />
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(supabaseUrl, "url")}>{copiedField === "url" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</Button>
                    </div>
                    <div className="flex items-center gap-2 bg-muted/30 rounded-xl p-4">
                      <Key className="w-5 h-5 text-muted-foreground shrink-0" />
                      <Input value={supabaseAnonKey} readOnly className="font-mono text-xs bg-transparent border-0" dir="ltr" />
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(supabaseAnonKey, "key")}>{copiedField === "key" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* === 🎁 العروض والخصومات === */}
          <section className="card-modern p-6 animate-slide-up delay-150">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg"><Tag className="w-6 h-6 text-white" /></div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground">العروض والخصومات</h2>
                <p className="text-sm text-muted-foreground">إدارة العروض الترويجية وأكواد الخصم + صور إعلانية احترافية</p>
              </div>
              <Button onClick={() => openPromoDialog()} className="bg-amber-600 hover:bg-amber-700 text-white"><Plus className="w-4 h-4 ml-1" /> إضافة عرض</Button>
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
                  <div key={promo.id} className="border rounded-xl p-4 hover:shadow-md transition-all bg-card/50 relative">
                    {promo.image_url && (
                      <div className="w-full h-32 rounded-lg overflow-hidden mb-3 bg-slate-100">
                        <img src={promo.image_url} alt={promo.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-foreground">{promo.title}</h3>
                        {promo.description && <p className="text-xs text-muted-foreground mt-1">{promo.description}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 font-bold text-xs">
                            {promo.discount_type === "percentage" ? `${promo.discount_value}%` : `${promo.discount_value} ريال`}
                          </span>
                          {promo.code && <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary font-mono text-xs">{promo.code}</span>}
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${promo.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                            {promo.is_active ? "نشط" : "موقف"}
                          </span>
                          <BadgePercent className="w-4 h-4 text-amber-500" />
                        </div>
                        {promo.start_date && promo.end_date && <p className="text-[10px] text-muted-foreground mt-1">{promo.start_date} → {promo.end_date}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openPromoDialog(promo)} className="h-7 w-7 p-0"><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => togglePromoStatus(promo.id, promo.is_active)} className="h-7 w-7 p-0">
                          {promo.is_active ? <Check className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-red-500" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deletePromo(promo.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="mt-3 w-full text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10" onClick={() => generatePromoImage(promo)} disabled={generatingPromoImage}>
                      {generatingPromoImage ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <ImagePlus className="w-3 h-3 ml-1" />}
                      توليد صورة إعلان احترافية 🎨
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* === الخدمات والأسعار === */}
          <section className="card-modern p-6 animate-slide-up delay-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg"><CreditCard className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">الخدمات والأسعار</h2><p className="text-sm text-muted-foreground">قائمة الخدمات المتاحة في عيادتك</p></div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="اسم الخدمة" className="flex-1 input-modern" />
              <Input type="number" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} placeholder="السعر (اختياري)" className="w-full sm:w-40 input-modern" />
              <Button onClick={handleAddService} disabled={!newServiceName}><Plus className="w-4 h-4" /> إضافة</Button>
            </div>
            <p className="text-xs text-muted-foreground -mt-3 mb-4">اترك حقل السعر فارغاً ليظهر للزبون كـ <b>«حسب الفحص»</b></p>
            <div className="divide-y divide-border">
              {services.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4"><CreditCard className="w-8 h-8 text-muted-foreground" /></div>
                  <p className="text-muted-foreground">لم تتم إضافة أي خدمات بعد</p>
                </div>
              ) : (
                services.map((service) => (
                  <div key={service.id} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold text-foreground">{service.name}</p>
                      <p className="text-sm text-primary font-bold">{service.price === null ? "حسب الفحص" : `${Number(service.price).toLocaleString()} ريال`}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteService(service.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* === حالة الاشتراك === */}
          <section className="card-modern p-6 animate-slide-up delay-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg"><Clock className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-foreground">حالة الاشتراك</h2><p className="text-sm text-muted-foreground">معلومات اشتراكك الحالي</p></div>
            </div>
            <div className="bg-muted/30 rounded-2xl p-5 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-muted-foreground">الحالة:</span>
                <span className={`${subscription?.status === "trial" ? "badge-pending" : subscription?.is_active ? "badge-success" : "badge-destructive"}`}>
                  {subscription?.status === "trial" ? "فترة تجريبية" : subscription?.is_active ? "نشط" : "منتهي"}
                </span>
              </div>
              {subscription?.trial_ends_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">تنتهي في:</span>
                  <span className="text-foreground font-semibold">
                    {new Date(subscription.trial_ends_at).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* ============================================================
          🎁 نافذة إضافة/تعديل عرض
          ============================================================ */}
      <Dialog open={promoDialogOpen} onOpenChange={(open) => { if (!open) setPromoDialogOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingPromo ? "تعديل العرض" : "إضافة عرض جديد"}</DialogTitle>
            <DialogDescription>أدخل تفاصيل العرض الترويجي أو كود الخصم</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-4">
              <div><Label className="text-sm font-medium">اسم العرض *</Label><Input value={promoForm.title || ""} onChange={(e) => setPromoForm({ ...promoForm, title: e.target.value })} placeholder="مثال: عرض الصيف" /></div>
              <div><Label className="text-sm font-medium">الوصف</Label><Input value={promoForm.description || ""} onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })} placeholder="وصف مختصر للعرض" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">نوع الخصم *</Label>
                  <Select value={promoForm.discount_type} onValueChange={(v: "percentage" | "fixed") => setPromoForm({ ...promoForm, discount_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="percentage">نسبة مئوية (%)</SelectItem><SelectItem value="fixed">مبلغ ثابت (ر.ي)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-sm font-medium">قيمة الخصم *</Label><Input type="number" value={promoForm.discount_value || ""} onChange={(e) => setPromoForm({ ...promoForm, discount_value: parseFloat(e.target.value) || 0 })} placeholder="20" /></div>
              </div>
              <div>
                <Label className="text-sm font-medium">كود الخصم (اختياري)</Label>
                <Input value={promoForm.code || ""} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} placeholder="SUMMER25" dir="ltr" />
                <p className="text-[10px] text-muted-foreground mt-1">اترك فارغاً للتوليد التلقائي</p>
              </div>
              <div>
                <Label className="text-sm font-medium">عناصر الإعلان (تظهر كصناديق في الصورة)</Label>
                <textarea value={promoForm.items || ""} onChange={(e) => setPromoForm({ ...promoForm, items: e.target.value })} placeholder={"مثال:\nتحاليل دقيقة\nاستشارة مجانية\nخصم للعائلات"} className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm" />
                <p className="text-[10px] text-muted-foreground mt-1">افصل بين العناصر بسطر أو فاصلة. إن تُركت فارغة تُستخدم أسماء الخدمات تلقائياً.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div><Label className="text-sm font-medium">تاريخ البداية</Label><Input type="date" value={promoForm.start_date || ""} onChange={(e) => setPromoForm({ ...promoForm, start_date: e.target.value })} /></div>
              <div><Label className="text-sm font-medium">تاريخ النهاية</Label><Input type="date" value={promoForm.end_date || ""} onChange={(e) => setPromoForm({ ...promoForm, end_date: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-sm font-medium">حد الاستخدام الكلي</Label><Input type="number" value={promoForm.usage_limit || ""} onChange={(e) => setPromoForm({ ...promoForm, usage_limit: parseInt(e.target.value) || undefined })} placeholder="50" /></div>
                <div><Label className="text-sm font-medium">لكل مريض</Label><Input type="number" value={promoForm.per_user_limit || 1} onChange={(e) => setPromoForm({ ...promoForm, per_user_limit: parseInt(e.target.value) || 1 })} placeholder="1" /></div>
              </div>
              <div>
                <Label className="text-sm font-medium">قالب التصميم الإعلاني</Label>
                <Select value={promoForm.template || "auto"} onValueChange={(v) => setPromoForm({ ...promoForm, template: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">تلقائي (حسب التصنيف)</SelectItem>
                    <SelectItem value="teal">أخضر مختبرات (تحاليل)</SelectItem>
                    <SelectItem value="dental">أزرق أسنان</SelectItem>
                    <SelectItem value="derma">بنفسجي جلدية</SelectItem>
                    <SelectItem value="cosmetic">سماوي تجميل/ليزر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">هاتف التذييل (اختياري)</Label>
                <Input value={promoForm.phone_text || ""} onChange={(e) => setPromoForm({ ...promoForm, phone_text: e.target.value })} placeholder="مثال: 920014099" dir="ltr" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={promoForm.is_active !== false} onChange={(e) => setPromoForm({ ...promoForm, is_active: e.target.checked })} className="w-4 h-4 accent-primary" />
                <Label className="text-sm font-medium cursor-pointer">العرض نشط</Label>
              </div>
              <div>
                <Label className="text-sm font-medium">صورة العرض (اختياري)</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="file" accept="image/*" onChange={handlePromoImageSelect} className="hidden" ref={promoImageInputRef} id="promo-image-upload-input" />
                  <Button type="button" variant="outline" size="sm" onClick={handlePromoImageUploadClick} disabled={uploadingPromoImage}>
                    <Upload className="w-4 h-4 ml-1" /> {uploadingPromoImage ? "جاري الرفع..." : "رفع صورة"}
                  </Button>
                  {promoImagePreview && (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                      <img src={promoImagePreview} alt="معاينة" className="w-full h-full object-cover" />
                      <button onClick={() => { setPromoImageFile(null); setPromoImagePreview(null); if (promoImageInputRef.current) promoImageInputRef.current.value = ""; }} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">أو استخدم زر "توليد صورة إعلان احترافية" بعد الحفظ</p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setPromoDialogOpen(false); resetPromoForm(); }}>إلغاء</Button>
            <Button onClick={handlePromoSubmit} className="bg-amber-600 hover:bg-amber-700 text-white" disabled={uploadingPromoImage}>
              {uploadingPromoImage ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
              {editingPromo ? "تحديث العرض" : "إضافة العرض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

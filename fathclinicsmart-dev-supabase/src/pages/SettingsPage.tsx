import { useEffect, useState } from "react";
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
  Stethoscope, LogOut, ArrowRight, Save, Copy, Check,
  Link2, Key, Plus, Trash2, Loader2, Bot, Building2, 
  CreditCard, Shield, Clock, Activity, Sparkles, Upload, Image, QrCode, Download
} from "lucide-react";

interface Service {
  id: string;
  name: string;
  price: number | null;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, updateClinic } = useClinic();
  const { toast } = useToast();

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
  const [receptionPin, setReceptionPin] = useState("1234");
  const [cashierPin, setCashierPin] = useState("5678");
  const [staffList, setStaffList] = useState<Array<{ id: string; email: string; role: string; approved: boolean; created_at: string }>>([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"reception" | "cashier">("reception");
  const [staffBusy, setStaffBusy] = useState(false);
  const [receptionistWhatsapp, setReceptionistWhatsapp] = useState("");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
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
      setBotToken(clinic.bot_token || "");
      // @ts-ignore - logo_url will be available after migration
      setLogoUrl(clinic.logo_url || null);
      // @ts-ignore - bot_username added in latest migration
      setBotUsername(clinic.bot_username || null);
      // @ts-ignore - voice fields added in latest migration
      setVoiceAgentEnabled(!!clinic.voice_agent_enabled);
      // @ts-ignore
      setVoiceTone(clinic.voice_tone || "ودود ومحترم");
      setVoiceMode(clinic.voice_mode || "auto");
      setReceptionPin(clinic.reception_pin || "1234");
      setCashierPin(clinic.cashier_pin || "5678");
      // @ts-ignore - receptionist_whatsapp added in latest migration
      setReceptionistWhatsapp((clinic as any).receptionist_whatsapp || "");
      fetchServices();
      fetchStaff();
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
      toast({ title: "تعذر تحميل العيادة", description: "أعد تحميل الصفحة. إن استمرت المشكلة سجّل الخروج ثم الدخول مجدداً.", variant: "destructive" });
      return;
    }
    setSaving(true);
    // Save secrets to vault (source of truth) — owner only
    try {
      await supabase.rpc("save_clinic_vault", {
        _reception_pin: receptionPin || null,
        _cashier_pin: cashierPin || null,
        _bot_token: botToken || null,
      } as any);
    } catch (e) {
      console.warn("vault save failed", e);
    }
    const { error } = await updateClinic({ name: clinicName, bot_token: botToken, voice_agent_enabled: voiceAgentEnabled, voice_tone: voiceTone, voice_mode: voiceMode, reception_pin: receptionPin, cashier_pin: cashierPin, receptionist_whatsapp: receptionistWhatsapp || null } as any);
    if (error) {
      setSaving(false);
      console.error("Save clinic error:", error);
      toast({ title: "خطأ", description: error.message || "فشل في حفظ الإعدادات", variant: "destructive" });
      return;
    }

    // Auto-configure Telegram webhook with the saved token
    if (botToken && botToken.trim().length > 10) {
      const hookResult = await invokeBotAction("set-webhook");
      if (!hookResult.ok) {
        toast({
          title: "تم الحفظ - تنبيه",
          description: "تم حفظ التوكن لكن فشل ضبط webhook تلقائياً: " + (hookResult.error || "تحقق أن التوكن صحيح"),
          variant: "destructive",
        });
      } else {
        toast({ title: "تم الحفظ ✓", description: "تم حفظ الإعدادات وربط البوت بنجاح" });
      }
    } else {
      toast({ title: "تم الحفظ ✓", description: "تم حفظ إعدادات العيادة بنجاح" });
    }
    setSaving(false);
  };

  const invokeBotAction = async (action: "set-webhook" | "webhook-info" | "bot-info"): Promise<{ ok: boolean; data?: any; error?: string }> => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch(`${supabaseUrl}/functions/v1/telegram-bot?action=${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseAnonKey,
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
    
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/logo.${fileExt}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('clinic-logos')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: "خطأ", description: "فشل في رفع الشعار", variant: "destructive" });
      setUploadingLogo(false);
      return;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('clinic-logos')
      .getPublicUrl(filePath);

    // Update clinic with logo URL
    const { error: updateError } = await supabase
      .from('clinics')
      .update({ logo_url: publicUrl })
      .eq('id', clinic.id)
      .eq('owner_id', user.id);

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
      console.error("Add service error:", error);
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
      {/* Header */}
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

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Clinic Settings */}
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
              {/* Clinic Logo Upload */}
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
                    <p className="text-xs text-muted-foreground mt-1">
                      يُفضل صورة مربعة بحجم 200x200 بكسل أو أكبر
                    </p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="receptionPin" className="text-sm font-medium">رمز PIN للاستقبال</Label>
                  <Input id="receptionPin" value={receptionPin} onChange={(e) => setReceptionPin(e.target.value)} inputMode="numeric" className="input-modern text-center font-mono" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cashierPin" className="text-sm font-medium">رمز PIN للصندوق</Label>
                  <Input id="cashierPin" value={cashierPin} onChange={(e) => setCashierPin(e.target.value)} inputMode="numeric" className="input-modern text-center font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button variant="outline" type="button" onClick={() => navigate("/reception")}>فتح بوابة الاستقبال</Button>
                <Button variant="outline" type="button" onClick={() => navigate("/cashier")}>فتح بوابة الصندوق</Button>
              </div>
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

          {/* Staff Management */}
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
                <SelectTrigger className="w-full input-modern"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reception">استقبال</SelectItem>
                  <SelectItem value="cashier">صندوق</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addStaff} disabled={staffBusy || !newStaffEmail.trim() || !newStaffPassword.trim()}>
                {staffBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إنشاء حساب الموظف
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              💡 سيتم إنشاء حساب الموظف واعتماده تلقائياً. أعطه البريد وكلمة المرور ليدخل من تبويب <b>«دخول موظف»</b>.
              يمكن للموظف تغيير كلمة المرور لاحقاً.
            </p>

            {/* Receptionist WhatsApp — used for third-party bookings via Telegram */}
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
                يُستخدم عندما يطلب زبون في تيليجرام «حجز باسم شخص آخر» — يُوجَّه للتواصل مع الاستقبال عبر واتساب.
              </p>
            </div>


            {staffList.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
                لا يوجد موظفون بعد
              </div>
            ) : (
              <div className="space-y-2">
                {staffList.map((s) => (
                  <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl border border-border bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate" dir="ltr">{s.email}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary">{s.role === "reception" ? "استقبال" : "صندوق"}</span>
                        {s.approved ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">معتمد</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">بانتظار الاعتماد</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.approved ? (
                        <Button size="sm" variant="outline" onClick={() => revokeStaff(s.id)}>تعليق</Button>
                      ) : (
                        <Button size="sm" onClick={() => approveStaff(s.id)}><Check className="w-4 h-4" />اعتماد</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeStaff(s.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Customer Booking Link */}
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
                هذا هو الرابط/الأمر الخاص بالزبون. عند فتحه سيتعرف البوت على عيادتك ويعرض خدماتك فقط، ولن يطلب من الزبون إدخال ID يدوياً.
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
                  {copiedField === "customerLink" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                أمر <code className="bg-background px-1.5 py-0.5 rounded">link_</code> خاص بربط حساب الطبيب لاستقبال الإشعارات، وليس للزبائن.
              </p>
            </div>
          </section>

          {/* QR Code for the Telegram booking link */}
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
                      عند مسح الرمز يفتح بوت <b dir="ltr">@{effectiveBotUsername}</b> مباشرةً على عيادتك ويبدأ الترحيب بالزبون.
                    </p>
                    <div className="flex gap-2">
                      <Input value={link} readOnly className="font-mono text-xs bg-background" dir="ltr" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(link, "qrLink")} className="shrink-0">
                        {copiedField === "qrLink" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={downloadQr} className="flex-1">
                        <Download className="w-4 h-4" />
                        تنزيل صورة QR
                      </Button>
                      {botToken && (
                        <Button variant="outline" onClick={refreshBotUsername} disabled={loadingBotInfo}>
                          {loadingBotInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث اسم البوت"}
                        </Button>
                      )}
                    </div>
                    {!botUsername && (
                      <p className="text-xs text-muted-foreground">
                        هذا الرمز يعمل تلقائياً باستخدام بوت النظام المركزي. لا حاجة لأي توكن.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

          </section>

          {/* Voice Agent (gTTS, free, no quota) */}
          <section className="card-modern p-6 animate-slide-up delay-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">الوكيل الصوتي (مجاني)</h2>
                <p className="text-sm text-muted-foreground">يرسل ردّاً صوتياً عربياً للزبون بعد كل ردّ نصي — بدون استهلاك رصيد الذكاء الصناعي</p>
              </div>
            </div>

            <div className="space-y-4 bg-accent/5 border border-accent/20 rounded-2xl p-5">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">تفعيل الردود الصوتية في تيليجرام</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    عند تفعيلها يصل الزبون برد واحد فقط: نص أو صوت حسب الوضع المختار، ولا يتم إرسال الاثنين معاً.
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
                  <SelectTrigger><SelectValue placeholder="اختر طريقة الرد" /></SelectTrigger>
                  <SelectContent className="bg-popover z-50">
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
                  placeholder="مثال: ودود ومحترم، مهني وحازم، مرح ومُطمئِن"
                  className="input-modern"
                />
                <p className="text-xs text-muted-foreground">تُستخدم في الردود النصية والصوتية على حدٍ سواء.</p>
              </div>

              <p className="text-xs text-muted-foreground">
                💡 الصوت يُولّد عبر Google Translate TTS المجاني (لا API key، لا حدود تجريبية).
              </p>
            </div>
          </section>





          {/* Link Doctor to Telegram for Instant Notifications */}
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
                  {copiedField === "linkCmd" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                بمجرد الإرسال، سيؤكد لك البوت الربط، وستصلك جميع الإشعارات على هذا الحساب.
              </p>
            </div>
          </section>

          {/* Direct integration info - Only for Admin or regular clinic info */}
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
              {/* Clinic ID - Always visible */}
              <div className="bg-primary/5 rounded-2xl p-5 border border-primary/20">
                <Label className="flex items-center gap-2 text-primary font-semibold mb-3">
                  <Sparkles className="w-4 h-4" />
                  معرّف العيادة (Clinic ID)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={clinic?.id || ""}
                    readOnly
                    className="font-mono text-sm bg-background"
                    dir="ltr"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(clinic?.id || "", "clinicId")}
                    className="shrink-0"
                  >
                    {copiedField === "clinicId" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  هذا الرقم هو هويتك الفريدة في النظام. يستخدم لربط جميع بياناتك (المرضى، المواعيد، الخدمات) بعيادتك.
                </p>
              </div>

              {/* API Details - Only for Admin */}
              {isAdmin && (
                <>
                  <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-2">
                    <p className="text-xs text-warning flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      هذه المعلومات تظهر لك فقط لأنك مدير النظام
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <div className="flex items-center gap-2 bg-muted/30 rounded-xl p-4">
                      <Link2 className="w-5 h-5 text-muted-foreground shrink-0" />
                      <Input
                        value={supabaseUrl}
                        readOnly
                        className="font-mono text-xs bg-transparent border-0 focus-visible:ring-0"
                        dir="ltr"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(supabaseUrl, "url")}
                      >
                        {copiedField === "url" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 bg-muted/30 rounded-xl p-4">
                      <Key className="w-5 h-5 text-muted-foreground shrink-0" />
                      <Input
                        value={supabaseAnonKey}
                        readOnly
                        className="font-mono text-xs bg-transparent border-0 focus-visible:ring-0"
                        dir="ltr"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(supabaseAnonKey, "key")}
                      >
                        {copiedField === "key" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="bg-muted/30 rounded-2xl p-5 border border-border">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      ملاحظات التكامل المباشر
                    </h3>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>استخدم البوت الموحد والـ Webhook المباشر داخل النظام فقط</li>
                      <li><strong className="text-foreground">مهم:</strong> كل عملية بيانات يجب أن تكون مربوطة بـ <code className="bg-background px-1.5 py-0.5 rounded text-primary">clinic_id</code></li>
                      <li>جداول البيانات: <code className="bg-background px-1.5 py-0.5 rounded">patients</code> و <code className="bg-background px-1.5 py-0.5 rounded">appointments</code></li>
                    </ol>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Services */}
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
            
            {/* Add Service */}
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
                <Plus className="w-4 h-4" />
                إضافة
              </Button>
            </div>
            <p className="text-xs text-muted-foreground -mt-3 mb-4">
              اترك حقل السعر فارغاً ليظهر للزبون كـ <b>«حسب الفحص»</b> ويُحدَّد بعد المعاينة.
            </p>

            {/* Services List */}
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
                        {service.price === null || service.price === undefined
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

          {/* Subscription Status */}
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
                <span className={`${
                  subscription?.status === "trial" ? "badge-pending" : 
                  subscription?.is_active ? "badge-success" : "badge-destructive"
                }`}>
                  {subscription?.status === "trial" ? "فترة تجريبية" : 
                   subscription?.is_active ? "نشط" : "منتهي"}
                </span>
              </div>
              {subscription?.trial_ends_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">تنتهي في:</span>
                  <span className="text-foreground font-semibold">
                    {new Date(subscription.trial_ends_at).toLocaleDateString("ar-SA", { 
                      year: 'numeric', month: 'long', day: 'numeric' 
                    })}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

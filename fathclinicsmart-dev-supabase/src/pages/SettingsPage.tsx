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
  CreditCard, Shield, Clock, Activity, Sparkles, Upload, Image, QrCode, Download,
  Users, UserPlus, UserCheck, UserX, CalendarClock
} from "lucide-react";

interface Service {
  id: string;
  name: string;
  price: number | null;
}

interface StaffMember {
  id: string;
  email: string;
  role: string;
  approved_by_owner: boolean | null;
  created_at: string | null;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, updateClinic } = useClinic();
  const { toast } = useToast();

  const [clinicName, setClinicName] = useState("");
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
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"receptionist" | "cashier">("receptionist");
  const [staffBusy, setStaffBusy] = useState(false);
  const [receptionistWhatsapp, setReceptionistWhatsapp] = useState("");
  const [workingHoursStart, setWorkingHoursStart] = useState("08:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("16:00");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // ─── Auth Guards ───
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // ─── Admin Check ───
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

  // ─── Load Clinic Data ───
  useEffect(() => {
    if (clinic) {
      setClinicName(clinic.name || "");
      setLogoUrl(clinic.logo_url || null);
      setVoiceAgentEnabled(!!clinic.voice_agent_enabled);
      setVoiceMode(clinic.voice_mode || "auto");
      setVoiceTone((clinic as any).voice_tone || "ودود ومحترم");
      setReceptionistWhatsapp((clinic as any).receptionist_whatsapp || "");
      setWorkingHoursStart((clinic as any).working_hours_start || "08:00");
      setWorkingHoursEnd((clinic as any).working_hours_end || "16:00");
      fetchServices();
      fetchStaff();
    }
  }, [clinic]);

  // ─── Services ───
  const fetchServices = async () => {
    if (!clinic) return;
    const { data } = await supabase
      .from("services")
      .select("id,name,price")
      .eq("clinic_id", clinic.id)
      .order("created_at", { ascending: true });
    setServices((data as Service[]) || []);
  };

  // ─── Staff ───
  const fetchStaff = async () => {
    if (!clinic) return;
    const { data } = await supabase
      .from("clinic_staff")
      .select("id,email,role,approved_by_owner,created_at")
      .eq("clinic_id", clinic.id)
      .order("created_at", { ascending: false });
    setStaffList((data as StaffMember[]) || []);
  };

  const addStaff = async () => {
    if (!newStaffEmail.trim()) {
      toast({ title: "بيانات ناقصة", description: "أدخل البريد الإلكتروني", variant: "destructive" });
      return;
    }
    setStaffBusy(true);
    try {
      const { error } = await supabase.from("clinic_staff").insert({
        clinic_id: clinic!.id,
        email: newStaffEmail.trim(),
        role: newStaffRole,
        approved_by_owner: false,
      });
      if (error) throw error;
      toast({ title: "تمت إضافة الموظف ✓", description: "سيرسل طلب انضمام إلى المالك" });
      setNewStaffEmail("");
      fetchStaff();
    } catch (err: any) {
      toast({ title: "تعذّر الإضافة", description: err.message, variant: "destructive" });
    } finally {
      setStaffBusy(false);
    }
  };

  const approveStaff = async (id: string) => {
    await supabase.from("clinic_staff").update({ approved_by_owner: true }).eq("id", id);
    toast({ title: "تم الاعتماد ✓" });
    fetchStaff();
  };
  const revokeStaff = async (id: string) => {
    await supabase.from("clinic_staff").update({ approved_by_owner: false }).eq("id", id);
    toast({ title: "تم التعليق" });
    fetchStaff();
  };
  const removeStaff = async (id: string) => {
    await supabase.from("clinic_staff").delete().eq("id", id);
    toast({ title: "تم الحذف" });
    fetchStaff();
  };

  // ─── Bot ───
  const refreshBotUsername = async () => {
    setLoadingBotInfo(true);
    const r = await invokeBotAction("bot-info");
    setLoadingBotInfo(false);
    if (r.ok && r.data?.username) {
      setBotUsername(r.data.username);
      toast({ title: "تم جلب اسم البوت ✓", description: `@${r.data.username}` });
    } else {
      toast({ title: "تعذّر جلب اسم البوت", description: r.error || "تأكد من ضبط التوكن العام", variant: "destructive" });
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

  // ─── Save Clinic ───
  const handleSaveClinic = async () => {
    if (!clinic) {
      toast({ title: "تعذر تحميل العيادة", description: "أعد تحميل الصفحة.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await updateClinic({
      name: clinicName,
      voice_agent_enabled: voiceAgentEnabled,
      voice_tone: voiceTone,
      voice_mode: voiceMode,
      receptionist_whatsapp: receptionistWhatsapp || null,
      working_hours_start: workingHoursStart,
      working_hours_end: workingHoursEnd,
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "خطأ", description: error.message || "فشل في الحفظ", variant: "destructive" });
      return;
    }
    toast({ title: "تم الحفظ ✓", description: "تم حفظ جميع الإعدادات" });
  };

  // ─── Webhook ───
  const invokeBotAction = async (action: "set-webhook" | "webhook-info" | "bot-info") => {
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
    if (!r.ok) return toast({ title: "تعذّر الفحص", description: r.error, variant: "destructive" });
    const info = r.data?.info?.result || {};
    toast({
      title: info.url ? "حالة الـ Webhook" : "تنبيه",
      description: info.url
        ? `✓ ${info.url}\nآخر خطأ: ${info.last_error_message || "لا يوجد"}`
        : "⚠️ لم يُضبط webhook بعد.",
    });
  };

  const handleResetWebhook = async () => {
    const r = await invokeBotAction("set-webhook");
    toast({
      title: r.ok ? "تم ضبط الـ Webhook ✓" : "فشل الضبط",
      description: r.ok ? "البوت جاهز" : r.error || "",
      variant: r.ok ? "default" : "destructive",
    });
  };

  // ─── Logo ───
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !clinic) return;
    setUploadingLogo(true);
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/logo.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from("clinic-logos").upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast({ title: "خطأ", description: "فشل رفع الشعار", variant: "destructive" });
      setUploadingLogo(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("clinic-logos").getPublicUrl(filePath);
    const { error: updateError } = await supabase
      .from("clinics")
      .update({ logo_url: publicUrl })
      .eq("id", clinic.id);
    if (updateError) {
      toast({ title: "خطأ", description: "فشل حفظ الرابط", variant: "destructive" });
    } else {
      setLogoUrl(publicUrl);
      toast({ title: "تم الرفع ✓", description: "تم رفع الشعار" });
    }
    setUploadingLogo(false);
  };

  // ─── Services CRUD ───
  const handleAddService = async () => {
    if (!clinic || !newServiceName.trim()) return;
    const trimmedPrice = newServicePrice.trim();
    const priceValue = trimmedPrice === "" ? null : parseFloat(trimmedPrice);
    if (trimmedPrice !== "" && (Number.isNaN(priceValue) || (priceValue as number) < 0)) {
      return toast({ title: "خطأ", description: "السعر غير صالح", variant: "destructive" });
    }
    const { error } = await supabase.from("services").insert({
      clinic_id: clinic.id,
      name: newServiceName.trim(),
      price: priceValue,
    });
    if (error) {
      toast({ title: "خطأ", description: error.message || "فشل الإضافة", variant: "destructive" });
    } else {
      setNewServiceName("");
      setNewServicePrice("");
      fetchServices();
      toast({ title: "تمت الإضافة ✓" });
    }
  };

  const handleDeleteService = async (id: string) => {
    const { error } = await supabase.from("services").delete().eq("id", id).eq("clinic_id", clinic?.id || "");
    if (error) {
      toast({ title: "خطأ", description: "فشل الحذف", variant: "destructive" });
    } else {
      fetchServices();
      toast({ title: "تم الحذف" });
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "تم النسخ ✓" });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (authLoading || clinicLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">جاري التحميل...</p>
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
                {logoUrl ? <img src={logoUrl} alt="شعار" className="w-full h-full object-cover" /> : <Stethoscope className="w-6 h-6 text-white" />}
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{clinic?.name || "عيادتي"}</h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="w-3 h-3 text-primary" /> الإعدادات
                </p>
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
          {/* ===== Clinic Settings ===== */}
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
                <Label className="text-sm font-medium flex items-center gap-2"><Image className="w-4 h-4" /> شعار العيادة</Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-muted/50 border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                    {logoUrl ? <img src={logoUrl} alt="شعار" className="w-full h-full object-cover" /> : <Image className="w-8 h-8 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                      <Button type="button" variant="outline" disabled={uploadingLogo} className="pointer-events-none">
                        {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploadingLogo ? "جاري الرفع..." : "رفع شعار"}
                      </Button>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clinicName" className="text-sm font-medium">اسم العيادة</Label>
                <Input id="clinicName" value={clinicName} onChange={(e) => setClinicName(e.target.value)} className="input-modern" />
              </div>

              <Button onClick={handleSaveClinic} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ الإعدادات الأساسية
              </Button>
            </div>
          </section>

          {/* ===== Working Hours ===== */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <CalendarClock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">أوقات الدوام الرسمية</h2>
                <p className="text-sm text-muted-foreground">تحديد ساعات العمل للرد على الحجوزات</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">بداية الدوام</Label>
                <Input type="time" value={workingHoursStart} onChange={(e) => setWorkingHoursStart(e.target.value)} className="input-modern text-center" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">نهاية الدوام</Label>
                <Input type="time" value={workingHoursEnd} onChange={(e) => setWorkingHoursEnd(e.target.value)} className="input-modern text-center" />
              </div>
            </div>
            <Button onClick={handleSaveClinic} disabled={saving} className="mt-4 w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ أوقات الدوام
            </Button>
          </section>

          {/* ===== Receptionist WhatsApp ===== */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">رقم واتساب موظف الاستقبال</h2>
                <p className="text-sm text-muted-foreground">يُستخدم في حالات "حجز باسم شخص آخر" ورسائل انتهاء الدوام</p>
              </div>
            </div>
            <div className="space-y-2">
              <Input
                value={receptionistWhatsapp}
                onChange={(e) => setReceptionistWhatsapp(e.target.value)}
                placeholder="مثال: 967771234567 (بدون + أو 00)"
                dir="ltr"
                className="input-modern"
              />
              <Button onClick={handleSaveClinic} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ رقم واتساب
              </Button>
            </div>
          </section>

          {/* ===== Staff Management ===== */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">إدارة الموظفين</h2>
                <p className="text-sm text-muted-foreground">إضافة الموظفين ومنحهم الصلاحيات</p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <Input
                placeholder="بريد الموظف الإلكتروني"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                dir="ltr"
                className="input-modern flex-1"
              />
              <Select value={newStaffRole} onValueChange={(v) => setNewStaffRole(v as any)}>
                <SelectTrigger className="w-40 input-modern">
                  <SelectValue placeholder="الدور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receptionist">استقبال</SelectItem>
                  <SelectItem value="cashier">صندوق</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addStaff} disabled={staffBusy || !newStaffEmail.trim()}>
                {staffBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                إضافة
              </Button>
            </div>

            {staffList.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
                لا يوجد موظفون بعد
              </div>
            ) : (
              <div className="space-y-2">
                {staffList.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30">
                    <div>
                      <div className="font-semibold" dir="ltr">{s.email}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                          {s.role === "receptionist" ? "استقبال" : "صندوق"}
                        </span>
                        {s.approved_by_owner ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">معتمد</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600">بانتظار الاعتماد</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {s.approved_by_owner ? (
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

          {/* ===== Customer Booking Link ===== */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <Link2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">رابط حجز العملاء</h2>
                <p className="text-sm text-muted-foreground">أرسله للزبائن للحجز المباشر</p>
              </div>
            </div>
            <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={`/start clinic_${clinic?.id || ""}`}
                  readOnly
                  className="font-mono text-sm bg-background"
                  dir="ltr"
                />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(`/start clinic_${clinic?.id || ""}`, "customerLink")}>
                  {copiedField === "customerLink" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </section>

          {/* ===== QR Code ===== */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg">
                <QrCode className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">رمز QR للحجز</h2>
                <p className="text-sm text-muted-foreground">اطبعه وعلّقه في العيادة</p>
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
                    <p className="text-sm text-foreground">عند المسح يفتح البوت مباشرةً على عيادتك.</p>
                    <div className="flex gap-2">
                      <Input value={link} readOnly className="font-mono text-xs bg-background" dir="ltr" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(link, "qrLink")}>
                        {copiedField === "qrLink" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={downloadQr} className="flex-1"><Download className="w-4 h-4" /> تنزيل QR</Button>
                      <Button variant="outline" onClick={refreshBotUsername} disabled={loadingBotInfo}>
                        {loadingBotInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث اسم البوت"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* ===== Voice Agent ===== */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">الوكيل الصوتي (مجاني)</h2>
                <p className="text-sm text-muted-foreground">ردود صوتية عربية مجانية</p>
              </div>
            </div>
            <div className="space-y-4 bg-accent/5 border border-accent/20 rounded-2xl p-5">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="font-medium">تفعيل الردود الصوتية</div>
                <input type="checkbox" checked={voiceAgentEnabled} onChange={(e) => setVoiceAgentEnabled(e.target.checked)} className="w-5 h-5 accent-primary" />
              </label>
              <div className="space-y-2">
                <Label className="text-sm font-medium">طريقة الرد</Label>
                <Select value={voiceMode} onValueChange={setVoiceMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">تلقائي: نص أو صوت</SelectItem>
                    <SelectItem value="text">نص فقط</SelectItem>
                    <SelectItem value="voice">صوت فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveClinic} disabled={saving} variant="outline"><Save className="w-4 h-4" /> حفظ</Button>
            </div>
          </section>

          {/* ===== Services ===== */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">الخدمات والأسعار</h2>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="اسم الخدمة" className="flex-1 input-modern" />
              <Input type="number" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} placeholder="السعر (اختياري)" className="w-full sm:w-40 input-modern" />
              <Button onClick={handleAddService} disabled={!newServiceName}><Plus className="w-4 h-4" /> إضافة</Button>
            </div>
            <div className="divide-y divide-border">
              {services.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">لا توجد خدمات</div>
              ) : (
                services.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-primary font-bold">
                        {s.price == null ? "حسب الفحص" : `${Number(s.price).toLocaleString()} ريال`}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteService(s.id)} className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ===== Subscription ===== */}
          <section className="card-modern p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">حالة الاشتراك</h2>
              </div>
            </div>
            <div className="bg-muted/30 rounded-2xl p-5 border border-border space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الحالة:</span>
                <span className={
                  subscription?.status === "trial" ? "badge-pending" :
                  subscription?.is_active ? "badge-success" : "badge-destructive"
                }>
                  {subscription?.status === "trial" ? "تجريبي" :
                   subscription?.is_active ? "نشط" : "منتهي"}
                </span>
              </div>
              {subscription?.trial_ends_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ينتهي في:</span>
                  <span className="font-semibold">
                    {new Date(subscription.trial_ends_at).toLocaleDateString("ar-SA", { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* ===== Admin Only: Bot Token ===== */}
          {isAdmin && (
            <section className="card-modern p-6 animate-slide-up">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">توكن البوت العام (أدمن)</h2>
                  <p className="text-sm text-muted-foreground">يُستخدم لجميع العيادات</p>
                </div>
              </div>
              <div className="space-y-3">
                <Input
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="أدخل توكن البوت العام"
                  className="input-modern font-mono text-sm"
                  dir="ltr"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSaveClinic} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ التوكن
                  </Button>
                  <Button variant="outline" onClick={handleCheckWebhook}>🔎 فحص Webhook</Button>
                  <Button variant="outline" onClick={handleResetWebhook}>🔁 إعادة ضبط Webhook</Button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/layout/Footer";
import { toast } from "@/hooks/use-toast";
import {
  Banknote, CheckCircle, LogOut, Search, ShieldCheck, Stethoscope, Users,
  Camera, X, Loader2, AlertCircle, Image as ImageIcon, Upload, RefreshCw, Send, Printer, Download, Clock
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import html2canvas from "html2canvas";

type Appointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  arrived_at: string | null;
  payment_status: string;
  is_walk_in: boolean;
  patients: { name: string; phone: string; telegram_user_id?: string } | null;
  services: { name: string; price: number | null } | null;
};

// ─── معرفات عناصر الماسح ───
const QR_CAMERA_ELEMENT_ID = "qr-camera-container-cashier";
const QR_FILE_ELEMENT_ID = "qr-hidden-file-reader-cashier";

export default function CashierPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");

  // ─── حالة الماسح ───
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  // ─── المصادقة والترخيص ───
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (clinicLoading) return;
    if (role === "owner" || role === "cashier" || role === "reception") setUnlocked(true);
  }, [role, clinicLoading]);

  // ─── جلب المواعيد ───
  const fetchAppointments = useCallback(async () => {
    if (!clinic || !unlocked) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("id,date,time,status,reservation_code,arrived_at,payment_status,is_walk_in,patients(name,phone),services(name,price)")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  }, [clinic, unlocked, today]);

  useEffect(() => {
    if (!clinic || !unlocked) return;
    fetchAppointments();
    const channel = supabase
      .channel(`cashier-${clinic.id}-${today}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, fetchAppointments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, unlocked, today, fetchAppointments]);

  // ─── تنظيف الماسح ───
  useEffect(() => {
    return () => { destroyScanner(); };
  }, []);

  const destroyScanner = async () => {
    if (!scannerRef.current) return;
    try {
      if (scannerRef.current.isScanning) await scannerRef.current.stop();
      scannerRef.current.clear();
    } catch (_) {}
    finally { scannerRef.current = null; }
  };

  const getFriendlyError = (error: any): string => {
    const msg = String(error?.message || error || "");
    if (msg.includes("NotAllowedError") || msg.includes("Permission")) return "🔒 لم يتم منح إذن الكاميرا.";
    if (msg.includes("NotFoundError") || msg.includes("DevicesNotFoundError")) return "📷 لا توجد كاميرا متصلة.";
    if (msg.includes("NotReadableError") || msg.includes("TrackStartError")) return "⚠️ الكاميرا مستخدمة من تطبيق آخر.";
    return `❌ فشل تشغيل الكاميرا. حاول مرة أخرى أو ارفع صورة الموعد.`;
  };

  // ─── تحديث حالة الوصول ───
  const markArrived = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ arrived_at: new Date().toISOString(), department: "استقبال" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    if (!error) {
      toast({ title: "✅ تم تسجيل الحضور", description: "تحول الموعد إلى حالة (وصل)" });
      fetchAppointments();
    }
  };

  // ─── معالجة الكود الممسوح ذكياً ───
  const handleScannedCode = useCallback(async (decodedText: string) => {
    const rawText = decodedText.trim();
    let extractedCode = rawText;
    const match = rawText.match(/RE-[A-Za-z0-9]+/i) || rawText.match(/RE-\d+/i);
    if (match) extractedCode = match[0];

    const currentAppointments = appointmentsRef.current;
    let found = currentAppointments.find(a =>
      a.id === rawText ||
      a.reservation_code.toLowerCase() === rawText.toLowerCase() ||
      a.reservation_code.toLowerCase() === extractedCode.toLowerCase() ||
      rawText.toLowerCase().includes(a.reservation_code.toLowerCase())
    );

    if (!found && clinic) {
      const { data } = await supabase
        .from("appointments")
        .select("id,date,time,status,reservation_code,arrived_at,payment_status,is_walk_in,patients(name,phone),services(name,price)")
        .eq("clinic_id", clinic.id)
        .or(`reservation_code.ilike.${extractedCode},reservation_code.ilike.${rawText},id.eq.${rawText}`)
        .maybeSingle();
      if (data) found = data as Appointment;
    }

    if (found) {
      // 1. إذا لم يكن قد سجل وصوله بعد، نقوم بتأكيد وصوله أولاً
      if (!found.arrived_at) {
        await markArrived(found.id);
        found.arrived_at = new Date().toISOString();
      }

      // 2. إذا كان مدفوعاً مسبقاً
      if (found.payment_status === "paid") {
        toast({ title: "تنبيه", description: `الموعد (${found.reservation_code}) تم دفع رسومه مسبقاً` });
      } else {
        // 3. فتح النافذة وسداد الدفع
        setSelectedAppointment(found);
        setShowReceipt(false);
        toast({ title: "✅ جاهز للدفع", description: `المريض: ${found.patients?.name || "بدون اسم"}` });
        setScannerOpen(false);
        stopScanner();
      }
    } else {
      toast({ title: "لم يتم العثور على الموعد", description: `الكود: ${extractedCode}`, variant: "destructive" });
    }
  }, [clinic]);

  const stopScanner = useCallback(async () => {
    await destroyScanner();
    setScannerOpen(false);
    setScannerStatus("idle");
    setCameraError(null);
  }, []);

  const startScanner = useCallback(async () => {
    await destroyScanner();
    setCameraError(null);
    setScannerStatus("loading");
    setScannerOpen(true);
    await new Promise(r => setTimeout(r, 250));

    const element = document.getElementById(QR_CAMERA_ELEMENT_ID);
    if (!element) { setCameraError("❌ تعذر تهيئة الماسح."); setScannerStatus("error"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError("🌐 المتصفح لا يدعم الكاميرا."); setScannerStatus("error"); return; }

    const tryStart = async (facingMode: "environment" | "user"): Promise<boolean> => {
      try {
        const scanner = new Html5Qrcode(QR_CAMERA_ELEMENT_ID, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode }, 
          { fps: 10, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.7), height: Math.floor(Math.min(w, h) * 0.7) }), aspectRatio: 1.0 },
          (text) => { stopScanner().then(() => handleScannedCode(text)); },
          () => {}
        );
        setScannerStatus("active");
        return true;
      } catch (e) { 
        if (scannerRef.current) { try { scannerRef.current.clear(); } catch(_){} scannerRef.current = null; } 
        throw e; 
      }
    };

    try { await tryStart("environment"); return; } catch (_) {
      try { await new Promise(r => setTimeout(r, 150)); await tryStart("user"); return; } catch (second) {
        setCameraError(getFriendlyError(second)); setScannerStatus("error");
      }
    }
  }, [stopScanner, handleScannedCode]);

  // ─── معالجة الصورة لقراءات التيلجرام ───
  const processImageForQR = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("فشل Canvas");
        let w = img.width, h = img.height;
        const maxDim = 1000;
        if (w > maxDim || h > maxDim) { 
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; } 
          else { w = Math.round((w * maxDim) / h); h = maxDim; } 
        }
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => { if (blob) resolve(new File([blob], file.name, { type: "image/png" })); else reject("فشل التحويل"); }, "image/png");
      };
      img.onerror = () => reject("فشل التحميل");
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    await destroyScanner();

    try {
      const fileScanner = new Html5Qrcode(QR_FILE_ELEMENT_ID, { verbose: false });
      let decodedText = "";
      try { 
        decodedText = await fileScanner.scanFile(file, false); 
      } catch (_) {
        const resized = await processImageForQR(file);
        decodedText = await fileScanner.scanFile(resized, false);
      }
      await stopScanner();
      handleScannedCode(decodedText);
    } catch (err) {
      toast({ title: "فشل قراءة QR", description: "تأكد من وضوح كود QR في الصورة.", variant: "destructive" });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── دوال الصندوق والسداد ───
  const unlock = () => {
    if (pin === (clinic?.cashier_pin || "5678")) setUnlocked(true);
    else toast({ title: "رمز غير صحيح", description: "تحقق من رمز الصندوق في الإعدادات", variant: "destructive" });
  };

  const handlePayNow = async () => {
    if (!selectedAppointment || !clinic) return;
    setProcessingPayment(true);
    const { error } = await supabase
      .from("appointments")
      .update({ payment_status: "paid", status: "confirmed", department: "صندوق" })
      .eq("id", selectedAppointment.id)
      .eq("clinic_id", clinic.id);

    if (error) {
      toast({ title: "خطأ", description: "فشل تحديث حالة الدفع", variant: "destructive" });
      setProcessingPayment(false);
      return;
    }

    toast({ title: "✅ تم تسجيل الدفع", description: "تم إصدار الفاتورة بنجاح" });
    setSelectedAppointment({ ...selectedAppointment, payment_status: "paid" });
    setShowReceipt(true);
    setProcessingPayment(false);
    fetchAppointments();
  };

  // ─── توليد السند الاحترافي كصورة ───
  const generateReceiptImage = async (): Promise<string> => {
    const element = document.getElementById("receipt-card-container");
    if (!element) throw new Error("عنصر السند غير متوفر");
    const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    return canvas.toDataURL("image/png");
  };

  const downloadReceipt = async () => {
    try {
      const imgData = await generateReceiptImage();
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `سند_دفع_${selectedAppointment?.reservation_code || "receipt"}.png`;
      link.click();
    } catch (_) {
      toast({ title: "خطأ", description: "تعذر تنزيل السند", variant: "destructive" });
    }
  };

  const printReceipt = async () => {
    try {
      const imgData = await generateReceiptImage();
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`
          <html>
            <head><title>طباعة السند</title></head>
            <body style="margin:0; flex; items-center; justify-content:center; display:flex; min-height:100vh; background:#f4f4f5;">
              <img src="${imgData}" style="max-width:100%; height:auto;" onload="window.print();window.close();" />
            </body>
          </html>
        `);
        win.document.close();
      }
    } catch (_) {
      toast({ title: "خطأ", description: "تعذر طباعة السند", variant: "destructive" });
    }
  };

  const sendReceiptToTelegram = async () => {
    const patient = selectedAppointment?.patients;
    const tgId = patient?.telegram_user_id || patient?.phone?.replace("tg:", "");
    if (!tgId) {
      toast({ title: "❌ لا يوجد حساب تيليجرام مرتبط", description: "هذا المريض لم يقم بتسجيل الحجز عبر تيليجرام مباشرة.", variant: "destructive" });
      return;
    }

    setSendingReceipt(true);
    try {
      const { data } = await supabase.from("global_settings").select("telegram_bot_token").limit(1).maybeSingle();
      const botToken = data?.telegram_bot_token;
      if (!botToken) { 
        toast({ title: "خطأ", description: "توكن التليجرام غير مضبوط في النظام", variant: "destructive" }); 
        setSendingReceipt(false); 
        return; 
      }

      const imageBase64 = await generateReceiptImage();
      const arr = imageBase64.split(",");
      const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      const blob = new Blob([u8arr], { type: mime });

      const formData = new FormData();
      formData.append("chat_id", tgId);
      formData.append("photo", blob, `Receipt_${selectedAppointment?.reservation_code}.png`);
      formData.append("caption", `🧾 **سند استلام مبلغ - ${clinic?.name || "العيادة"}**\n\nعزيزي المريض **${patient?.name || ""}**، تم استلام المبلغ بنجاح. نتمنى لك دوام الصحة والعافية.`);

      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: "POST", body: formData });
      const result = await res.json();

      if (result.ok) {
        toast({ title: "🚀 تم الإرسال بنجاح", description: "تم إرسال السند إلى المريض على حساب تيليجرام" });
      } else {
        toast({ title: "فشل الإرسال", description: result.description || "تأكد من أن المريض بدأ محادثة مع البوت", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "خطأ", description: "حدث خطأ أثناء الاتصال بتيليجرام", variant: "destructive" });
    } finally { 
      setSendingReceipt(false); 
    }
  };

  // ─── فلترة المواعيد ───
  const filtered = useMemo(() => appointments.filter((a) =>
    a.reservation_code.toLowerCase().includes(search.toLowerCase()) ||
    a.patients?.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.patients?.phone?.includes(search)
  ), [appointments, search]);

  if (authLoading || clinicLoading) return <div className="min-h-screen bg-mesh flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  if (clinicError) return <div className="min-h-screen bg-mesh flex items-center justify-center text-destructive font-bold">{clinicError}</div>;

  if (isTrialExpired && role !== "owner") {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
        <div className="card-modern p-8 max-w-md text-center space-y-4">
          <div className="text-3xl">⛔</div>
          <h1 className="text-xl font-black">لا يمكن الدخول</h1>
          <p className="text-sm text-muted-foreground">العيادة منتهية الاشتراك. يرجى مراجعة إدارة العيادة.</p>
          <Button onClick={signOut} className="w-full">تسجيل الخروج</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      <div id={QR_FILE_ELEMENT_ID} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* مودال الماسح */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden border border-border">
            <div className="flex justify-between items-center px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold text-foreground">مسح QR للصندوق</h3>
              <button onClick={stopScanner} className="p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative mx-5 mb-4 rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "1/1" }}>
              <div id={QR_CAMERA_ELEMENT_ID} className="w-full h-full" />
              {(scannerStatus === "loading" || uploadingImage) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                  <p className="text-white text-sm font-medium">{uploadingImage ? "جاري قراءة الصورة..." : "جاري تشغيل الكاميرا..."}</p>
                </div>
              )}
              {scannerStatus === "active" && !uploadingImage && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-48 h-48">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary animate-bounce" style={{ animationDuration: "1.5s" }} />
                  </div>
                </div>
              )}
              {scannerStatus === "error" && !uploadingImage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-5 text-center z-20">
                  <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
                  <p className="text-white text-xs leading-relaxed mb-4">{cameraError}</p>
                  <Button onClick={startScanner} className="bg-primary text-white text-xs" size="sm">
                    <RefreshCw className="w-3.5 h-3.5 ml-1" />
                    إعادة المحاولة
                  </Button>
                </div>
              )}
            </div>

            <div className="px-5 pb-3">
              <Button 
                variant="outline" 
                className="w-full gap-2 border-dashed border-primary/50 text-primary text-xs h-10"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                <ImageIcon className="w-4 h-4" />
                اختيار صورة من المعرض (لقطة شاشة)
              </Button>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <Button variant="ghost" className="w-full text-xs" onClick={stopScanner}>إغلاق</Button>
            </div>
          </div>
        </div>
      )}

      {/* قفل PIN */}
      {!unlocked && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="card-modern p-8 w-full max-w-sm text-center space-y-5">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-black text-foreground">بوابة الصندوق</h1>
            <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} placeholder="رمز PIN" className="text-center text-xl tracking-widest" />
            <Button onClick={unlock} className="w-full">دخول</Button>
          </div>
        </div>
      )}

      {/* الهيدر */}
      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4 h-18 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow"><Stethoscope className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-xl font-bold text-foreground">الصندوق</h1><p className="text-xs text-muted-foreground">تحصيل رسوم اليوم</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={startScanner} title="مسح QR"><Camera className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title="رفع صورة"><Upload className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/reception")} title="الاستقبال"><Users className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المريض، كود الحجز أو رقم الهاتف" className="pr-10" />
          </div>
          <Button variant="outline" onClick={fetchAppointments}><RefreshCw className="w-4 h-4 ml-1" />تحديث البيانات</Button>
        </div>

        <div className="grid gap-3">
          {filtered.map((a) => {
            const isPaid = a.payment_status === "paid";
            const isArrived = !!a.arrived_at;
            return (
              <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                    <span className="text-sm text-muted-foreground"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                    {isArrived ? (
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">وصل العيادة</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">بانتظار الوصول</span>
                    )}
                    {isPaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">مدفوع</span>}
                  </div>
                  <h2 className="font-bold text-foreground">{a.patients?.name || "مريض"}</h2>
                  <p className="text-sm text-muted-foreground">{a.patients?.phone || "بدون هاتف"} — الخدمة: <b>{a.services?.name || "بدون خدمة"}</b></p>
                </div>
                <div className="flex gap-2 items-center justify-end">
                  {isPaid ? (
                    <Button variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-50/50" onClick={() => { setSelectedAppointment(a); setShowReceipt(true); }}>
                      <CheckCircle className="w-4 h-4 ml-1" />عرض الفاتورة
                    </Button>
                  ) : (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setSelectedAppointment(a); setShowReceipt(false); }}>
                      <Banknote className="w-4 h-4 ml-1" />تسجيل الدفع ({a.services?.price || 0} ر.ي)
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="card-modern p-12 text-center text-muted-foreground">لا توجد حالات مسجلة اليوم</div>}
        </div>
      </main>

      {/* مودال الدفع والسند الاحترافي */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-3xl max-w-md w-full shadow-2xl p-6 relative border border-border my-8">
            <button 
              onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition"
            >
              <X className="w-5 h-5" />
            </button>

            {!showReceipt ? (
              <div className="space-y-5 pt-2">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                    <Banknote className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">تأكيد استلام المبلغ</h2>
                  <p className="text-xs text-muted-foreground mt-1">يرجى مراجعة تفاصيل الحجز وتأكيد الدفع</p>
                </div>

                <div className="card-modern p-4 bg-muted/40 space-y-3 text-sm">
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">اسم المريض</span>
                    <span className="font-bold text-foreground">{selectedAppointment.patients?.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">كود الحجز</span>
                    <span className="font-mono font-bold text-primary">{selectedAppointment.reservation_code}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">نوع الخدمة</span>
                    <span className="font-medium text-foreground">{selectedAppointment.services?.name}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-base">
                    <span className="font-bold text-foreground">المبلغ المطلوب</span>
                    <span className="font-black text-emerald-600 text-lg">{selectedAppointment.services?.price || 0} ريال</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11 text-base font-bold" onClick={handlePayNow} disabled={processingPayment}>
                    {processingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5 ml-1" />}
                    تأكيد الدفع وإصدار السند
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="text-center mb-1">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5" /> تم الدفع والسداد بنجاح
                  </span>
                </div>

                {/* 🎨 السند الاحترافي (مستوحى من تصميم الفواتير العالمية Apple / Stripe) */}
                <div 
                  id="receipt-card-container" 
                  className="bg-white text-gray-900 p-6 rounded-2xl border border-gray-200 shadow-xl relative overflow-hidden" 
                  style={{ direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                  <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-primary" />
                  
                  {/* الرأس */}
                  <div className="text-center border-b border-gray-100 pb-4 mb-4">
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">{clinic?.name || "العيادة الطبية"}</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">سند استلام مبلغ مالـي (Receipt)</p>
                  </div>

                  {/* التفاصيل */}
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center text-gray-600">
                      <span>رقم السند:</span>
                      <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{selectedAppointment.reservation_code}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>تاريخ الإصدار:</span>
                      <span className="font-medium text-gray-800">{format(new Date(), "yyyy/MM/dd - hh:mm a")}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>اسم المريض:</span>
                      <span className="font-bold text-gray-900 text-sm">{selectedAppointment.patients?.name}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>الخدمة المقدمة:</span>
                      <span className="font-medium text-gray-800">{selectedAppointment.services?.name}</span>
                    </div>

                    <div className="my-3 border-t border-dashed border-gray-200" />

                    <div className="flex justify-between items-center bg-emerald-50/80 p-3 rounded-xl border border-emerald-100">
                      <span className="font-bold text-emerald-900 text-sm">المبلغ الإجمالي المدفوع:</span>
                      <span className="font-black text-emerald-700 text-xl">{selectedAppointment.services?.price || 0} <span className="text-xs font-normal">ر.ي</span></span>
                    </div>
                  </div>

                  {/* التذييل */}
                  <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                    <span>حالة الدفع: مدفوع نقداً ✅</span>
                    <span>معتمد من النظام الإلكتروني</span>
                  </div>
                </div>

                {/* أزرار الإجراءات السريعة */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={downloadReceipt}>
                    <Download className="w-3.5 h-3.5" />
                    تنزيل
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={printReceipt}>
                    <Printer className="w-3.5 h-3.5" />
                    طباعة
                  </Button>
                  <Button 
                    size="sm" 
                    className="text-xs gap-1 bg-[#0088cc] hover:bg-[#0077b3] text-white" 
                    onClick={sendReceiptToTelegram}
                    disabled={sendingReceipt}
                  >
                    {sendingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    تيليجرام
                  </Button>
                </div>

                <Button variant="ghost" className="w-full text-xs mt-2" onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }}>
                  إغلاق Window
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

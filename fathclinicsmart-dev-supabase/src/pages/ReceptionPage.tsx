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
  CalendarDays, CheckCircle, Clock, LogOut, QrCode, Search, 
  ShieldCheck, Stethoscope, Wallet, Users, TrendingUp, Timer, 
  Camera, X, Loader2, AlertCircle, Image as ImageIcon, Upload, RefreshCw
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Html5Qrcode } from "html5-qrcode";

type Appointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  arrived_at: string | null;
  entered_at?: string | null;
  payment_status: string;
  patients: { name: string; phone: string } | null;
  services: { name: string; price: number | null } | null;
};

// ─── معرفات عناصر الماسح ───
const QR_CAMERA_ELEMENT_ID = "qr-camera-container";
const QR_FILE_ELEMENT_ID = "qr-hidden-file-reader";

export default function ReceptionPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const today = dateFilter;

  // ─── حالة الماسح والصور ───
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  // ─── المصادقة ───
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (clinicLoading) return;
    if (role === "owner" || role === "reception") setUnlocked(true);
    if (role === "cashier") navigate("/cashier", { replace: true });
  }, [role, clinicLoading, navigate]);

  // ─── جلب المواعيد ───
  const fetchAppointments = async () => {
    if (!clinic || !unlocked) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("id,date,time,status,reservation_code,arrived_at,payment_status,entered_at,patients(name,phone),services(name,price)")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  };

  useEffect(() => {
    if (!clinic || !unlocked) return;
    fetchAppointments();
    const channel = supabase
      .channel(`reception-${clinic.id}-${today}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, fetchAppointments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, unlocked, today]);

  // ─── تنظيف الماسح عند الخروج ───
  useEffect(() => {
    return () => { destroyScanner(); };
  }, []);

  // ─── دالة تدمير الماسح ───
  const destroyScanner = async () => {
    if (!scannerRef.current) return;
    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      scannerRef.current.clear();
    } catch (_) {}
    finally {
      scannerRef.current = null;
    }
  };

  // ─── ترجمة رسائل الخطأ ───
  const getFriendlyError = (error: any): string => {
    const msg = String(error?.message || error || "");
    if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
      return "🔒 لم يتم منح إذن الكاميرا. افتح إعدادات المتصفح وامنح الإذن ثم أعد المحاولة.";
    }
    if (msg.includes("NotFoundError") || msg.includes("DevicesNotFoundError")) {
      return "📷 لا توجد كاميرا في جهازك أو لم يتم التعرف عليها.";
    }
    if (msg.includes("NotReadableError") || msg.includes("TrackStartError")) {
      return "⚠️ الكاميرا مستخدمة من تطبيق آخر. أغلق التطبيقات الأخرى وأعد المحاولة.";
    }
    return `❌ فشل فتح الكاميرا. حاول مرة أخرى أو قم برفع صورة الموعد من المعرض.`;
  };

  // ─── تحديث حالة الموعد إلى "وصل" ───
  const markArrived = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ arrived_at: new Date().toISOString(), department: "استقبال" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    if (error) {
      toast({ title: "خطأ", description: "فشل تحديث الموعد", variant: "destructive" });
    } else {
      toast({ title: "✅ تم تأكيد الحضور", description: "تم تحويل الموعد إلى (وصل)" });
    }
  };

  // ─── معالجة الكود الممسوح ───
  const handleScannedCode = useCallback((decodedText: string) => {
    const currentAppointments = appointmentsRef.current;
    const cleanCode = decodedText.trim();

    const found = currentAppointments.find(a =>
      a.id === cleanCode ||
      a.reservation_code === cleanCode ||
      a.reservation_code.toLowerCase() === cleanCode.toLowerCase()
    );

    if (found) {
      if (!found.arrived_at) {
        markArrived(found.id);
      } else {
        toast({ title: "تنبيه", description: `الموعد (${found.reservation_code}) تم تسجيل حضوره مسبقاً` });
      }
    } else {
      toast({
        title: "لم يتم العثور على الموعد",
        description: `الكود الممسوح: ${cleanCode}`,
        variant: "destructive",
      });
    }
  }, []);

  // ─── إيقاف الماسح ───
  const stopScanner = useCallback(async () => {
    await destroyScanner();
    setScannerOpen(false);
    setScannerStatus("idle");
    setCameraError(null);
  }, []);

  // ─── تشغيل الكاميرا المباشرة ───
  const startScanner = useCallback(async () => {
    await destroyScanner();

    setCameraError(null);
    setScannerStatus("loading");
    setScannerOpen(true);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    await new Promise(resolve => setTimeout(resolve, 250));

    const element = document.getElementById(QR_CAMERA_ELEMENT_ID);
    if (!element) {
      setCameraError("❌ تعذر تهيئة الماسح. أعد المحاولة.");
      setScannerStatus("error");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("🌐 متصفحك لا يدعم الوصول للكاميرا. يمكنك رفع صورة الكود من المعرض.");
      setScannerStatus("error");
      return;
    }

    const tryStart = async (facingMode: "environment" | "user"): Promise<boolean> => {
      try {
        const scanner = new Html5Qrcode(QR_CAMERA_ELEMENT_ID, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode },
          {
            fps: 10,
            qrbox: (w: number, h: number) => {
              const size = Math.floor(Math.min(w, h) * 0.7);
              return { width: size, height: size };
            },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            stopScanner().then(() => handleScannedCode(decodedText));
          },
          () => {}
        );

        setScannerStatus("active");
        return true;
      } catch (error: any) {
        if (scannerRef.current) {
          try { scannerRef.current.clear(); } catch (_) {}
          scannerRef.current = null;
        }
        throw error;
      }
    };

    try {
      await tryStart("environment");
      return;
    } catch (firstError: any) {
      try {
        const el = document.getElementById(QR_CAMERA_ELEMENT_ID);
        if (el) el.innerHTML = "";
        await new Promise(resolve => setTimeout(resolve, 150));
        await tryStart("user");
        return;
      } catch (secondError: any) {
        setCameraError(getFriendlyError(secondError));
        setScannerStatus("error");
      }
    }
  }, [stopScanner, handleScannedCode]);

  // ─── معالجة الصورة المرفوعة وضبط قياساتها ───
  const processImageForQR = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("فشل إنشاء Canvas");

        let width = img.width;
        let height = img.height;
        const maxDim = 1000;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: "image/png" }));
          } else {
            reject("فشل تحويل الصورة");
          }
        }, "image/png");
      };
      img.onerror = () => reject("فشل تحميل الصورة");
      img.src = URL.createObjectURL(file);
    });
  };

  // ─── قراءة QR من المعرض ───
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setCameraError(null);

    // إيقاف بث الكاميرا الحية إذا كانت تعمل
    await destroyScanner();

    try {
      // استخدام العنصر الخفي الثابت الموجود دائماً في الصفحة
      const fileScanner = new Html5Qrcode(QR_FILE_ELEMENT_ID, { verbose: false });
      let decodedText = "";

      try {
        decodedText = await fileScanner.scanFile(file, false);
      } catch (firstErr) {
        // إذا فشلت القراءة المباشرة، نعيد معالجة الصورة وقصها تلقائياً
        const resizedFile = await processImageForQR(file);
        decodedText = await fileScanner.scanFile(resizedFile, false);
      }

      // إغلاق المودال والبدء في تنفيذ الحضور
      await stopScanner();
      handleScannedCode(decodedText);

    } catch (err) {
      console.error("فشل قراءة الصورة:", err);
      toast({
        title: "فشل قراءة QR من الصورة",
        description: "تأكد من اختيار صورة تحتوي على كود QR واضح، أو استخدم الكاميرا مباشرة.",
        variant: "destructive",
      });
      setCameraError("لم نتمكن من التعرف على كود QR في هذه الصورة. يرجى تجريب صورة أكثر وضوحاً.");
      setScannerStatus("error");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── دوال التحديث اليدوي ───
  const unlock = () => {
    if (pin === (clinic?.reception_pin || "1234")) {
      setUnlocked(true);
    } else {
      toast({ title: "رمز غير صحيح", description: "تحقق من رمز الاستقبال في الإعدادات", variant: "destructive" });
    }
  };

  const markEntered = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ status: "completed", department: "المعاينة" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    if (error) {
      toast({ title: "خطأ", description: "فشل تسجيل الدخول", variant: "destructive" });
    } else {
      toast({ title: "تم الدخول", description: "أُضيفت الحالة إلى المعاينات" });
    }
  };

  const markNoShow = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    if (error) {
      toast({ title: "خطأ", description: "فشل التحديث", variant: "destructive" });
    } else {
      toast({ title: "تم تسجيل عدم الحضور", description: "أُغلق الموعد كـ (لم يصل)" });
    }
  };

  // ─── فلترة المواعيد ───
  const filtered = useMemo(() => appointments.filter((a) => {
    const matchesSearch =
      a.reservation_code.toLowerCase().includes(search.toLowerCase()) ||
      a.patients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.patients?.phone?.includes(search);
    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return !["cancelled", "completed"].includes(a.status);
    if (statusFilter === "arrived") return !!a.arrived_at && a.status !== "completed";
    if (statusFilter === "waiting") return !a.arrived_at && !["cancelled", "completed"].includes(a.status);
    if (statusFilter === "completed") return a.status === "completed" || !!a.entered_at;
    if (statusFilter === "paid") return a.payment_status === "paid";
    return a.status === statusFilter;
  }), [appointments, search, statusFilter]);

  if (authLoading || clinicLoading) {
    return <div className="min-h-screen bg-mesh flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  }

  if (clinicError) {
    return <div className="min-h-screen bg-mesh flex items-center justify-center p-4"><div className="card-modern p-6 max-w-md text-center text-destructive font-bold">{clinicError}</div></div>;
  }

  if (isTrialExpired && role !== "owner") {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
        <div className="card-modern p-8 max-w-md text-center space-y-4">
          <div className="text-3xl">⛔</div>
          <h1 className="text-xl font-black text-foreground">لا يمكن الدخول</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            أنت موظف في عيادة <b>{clinic?.name || ""}</b>. هذه العيادة منتهية الاشتراك. يرجى من صاحب العيادة تجديد الاشتراك.
          </p>
          <Button onClick={signOut} className="w-full">تسجيل الخروج</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      {/* عنصر خفي لقراءة الصور من المعرض بشكل ثابت ودائم */}
      <div id={QR_FILE_ELEMENT_ID} className="hidden" />

      {/* مدخل ملفات الصور الخفي */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* مودال الماسح */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold text-foreground">مسح QR Code</h3>
              <button onClick={stopScanner} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative mx-5 mb-4 rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "1/1" }}>
              <div id={QR_CAMERA_ELEMENT_ID} className="w-full h-full" />

              {(scannerStatus === "loading" || uploadingImage) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                  <p className="text-white text-sm font-medium">
                    {uploadingImage ? "جاري قراءة الصورة..." : "جاري تشغيل الكاميرا..."}
                  </p>
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
                  <div className="flex gap-2 w-full">
                    <Button onClick={startScanner} className="flex-1 bg-primary text-white text-xs" size="sm">
                      <RefreshCw className="w-3.5 h-3.5 ml-1" />
                      إعادة المحاولة
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 pb-3">
              <Button 
                variant="outline" 
                className="w-full gap-2 border-dashed border-primary/50 hover:bg-primary/5 text-primary text-xs h-10"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                <ImageIcon className="w-4 h-4" />
                اختيار صورة من المعرض (لقطة شاشة)
              </Button>
            </div>

            {scannerStatus === "active" && (
              <p className="text-[11px] text-center text-muted-foreground px-5 pb-3">
                وجّه الكاميرا نحو الكود أو اختر صورة من المعرض
              </p>
            )}

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
            <h1 className="text-2xl font-black text-foreground">بوابة الاستقبال</h1>
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
            <div><h1 className="text-xl font-bold text-foreground">الاستقبال</h1><p className="text-xs text-muted-foreground">مواعيد اليوم</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={startScanner} className="hover:bg-primary/10" title="مسح QR بواسطة الكاميرا">
              <Camera className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="hover:bg-primary/10" title="مسح QR من المعرض">
              <Upload className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/cashier")}><Wallet className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <StatsAndCharts appointments={appointments} />

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو كود الحجز أو الهاتف" className="pr-10" /></div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-40">
            <option value="active">النشطة</option>
            <option value="all">الكل</option>
            <option value="waiting">بانتظار الوصول</option>
            <option value="arrived">حاضر</option>
            <option value="paid">مدفوع</option>
            <option value="completed">تم الدخول</option>
            <option value="cancelled">ملغي/لم يصل</option>
          </select>
          <Button variant="outline" onClick={fetchAppointments}><CalendarDays className="w-4 h-4" />تحديث</Button>
        </div>

        <div className="grid gap-3">
          {filtered.map((a) => {
            const confirmedNotArrived = a.status === "confirmed" && !a.arrived_at;
            const arrivedUnpaid = !!a.arrived_at && a.payment_status !== "paid";
            const paidWaitingEntry = !!a.arrived_at && a.payment_status === "paid";
            return (
              <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                    <span className="text-sm text-muted-foreground"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                    {confirmedNotArrived && <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">تم التأكيد — لم يصل</span>}
                    {arrivedUnpaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">حاضر — بانتظار الدفع</span>}
                    {paidWaitingEntry && <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">مدفوع — جاهز للدخول</span>}
                  </div>
                  <h2 className="font-bold text-foreground">{a.patients?.name || "مريض"}</h2>
                  <p className="text-sm text-muted-foreground">{a.patients?.phone || "بدون هاتف"} — {a.services?.name || "بدون خدمة"}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {!a.arrived_at && (
                    <>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markArrived(a.id)}><CheckCircle className="w-4 h-4" />وصل</Button>
                      <Button variant="destructive" onClick={() => markNoShow(a.id)}>لم يصل</Button>
                    </>
                  )}
                  {paidWaitingEntry && (
                    <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markEntered(a.id)}>
                      <Stethoscope className="w-4 h-4" />دخول
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="card-modern p-12 text-center text-muted-foreground"><QrCode className="w-10 h-10 mx-auto mb-3" />لا توجد مواعيد نشطة اليوم</div>}
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ─── مكون الإحصائيات ───
function StatsAndCharts({ appointments }: { appointments: Appointment[] }) {
  const nonCancelled = appointments.filter((a) => a.status !== "cancelled");
  const total = nonCancelled.length;
  const arrived = nonCancelled.filter((a) => !!a.arrived_at || ["arrived","paid","completed"].includes(a.status)).length;
  const waiting = nonCancelled.filter((a) => !a.arrived_at && a.status !== "completed").length;
  const examined = nonCancelled.filter((a) => a.status === "completed" || !!a.entered_at).length;
  const confirmedRate = total > 0 ? Math.round((arrived / total) * 100) : 0;

  const hourly = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (let h = 8; h <= 20; h++) buckets[h] = 0;
    nonCancelled.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h] += 1;
    });
    return Object.entries(buckets).map(([h, count]) => ({ hour: `${h}:00`, count }));
  }, [appointments]);

  const statusData = useMemo(() => ([
    { name: "حضروا", value: arrived },
    { name: "بانتظار", value: waiting },
    { name: "معاينة", value: examined },
  ]), [arrived, waiting, examined]);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(152 69% 40%)"];
  const stats = [
    { label: "إجمالي اليوم", value: total, icon: CalendarDays, tint: "from-primary/20 to-primary/5", iconClass: "text-primary" },
    { label: "حضور", value: arrived, icon: CheckCircle, tint: "from-emerald-500/20 to-emerald-500/5", iconClass: "text-emerald-500" },
    { label: "بانتظار", value: waiting, icon: Timer, tint: "from-amber-500/20 to-amber-500/5", iconClass: "text-amber-500" },
    { label: "الحالات المعاينة", value: examined, icon: Stethoscope, tint: "from-teal-500/20 to-teal-500/5", iconClass: "text-teal-500" },
    { label: "نسبة الحضور", value: `${confirmedRate}%`, icon: TrendingUp, tint: "from-accent/20 to-accent/5", iconClass: "text-accent" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={`card-modern p-4 bg-gradient-to-br ${s.tint} border border-border/60`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                <p className="text-2xl font-black text-foreground mt-1">{s.value}</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-background/60 flex items-center justify-center backdrop-blur">
                <s.icon className={`w-5 h-5 ${s.iconClass}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground">التوزيع الزمني للمواعيد</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourly} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-4 h-4 text-accent" />
            <h3 className="font-bold text-foreground">حالة الحضور</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={4} stroke="hsl(var(--background))" strokeWidth={2}>
                {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
              <Legend wrapperStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Footer } from "@/components/layout/Footer";
import { toast } from "@/hooks/use-toast";
import {
  CalendarDays, CheckCircle, Clock, LogOut, QrCode, Search,
  Stethoscope, Wallet, Users, TrendingUp, Timer,
  Camera, X, Loader2, AlertCircle, Image as ImageIcon, Upload, RefreshCw,
  UserPlus, Award, PieChart as PieIcon, Home, Activity
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Html5Qrcode } from "html5-qrcode";

// ─── تعريف الأنواع ───
type Appointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  arrived_at: string | null;
  entered_at?: string | null;
  payment_status: string;
  notes?: string | null;
  department?: string | null;
  patients: { name: string; phone: string } | null;
  services: { name: string; price: number | null } | null;
};

// ─── دالة استخراج الاسم والرقم الصحيحين (مأخوذة من كود الكاشير) ───
const extractCleanInfo = (apt: Appointment) => {
  let name = apt.patients?.name || "";
  let phone = apt.patients?.phone || "";

  const isGenericName = !name || name === "." || name.trim().toLowerCase() === "point" || name.startsWith("tg:") || name.includes("غير محدد");
  const isGenericPhone = !phone || phone.trim().toLowerCase().startsWith("tg:") || phone === "." || phone === "بدون هاتف";

  if ((isGenericName || isGenericPhone) && apt.notes) {
    const nameMatch = apt.notes.match(/المريض:\s*([^(–\n\r]+)/);
    if (nameMatch && nameMatch[1] && isGenericName) {
      name = nameMatch[1].replace(/👤/g, "").replace(/@\w+/g, "").trim();
    }

    const phoneMatch = apt.notes.match(/\(([^)]+)\)/) || apt.notes.match(/(?:الهاتف:\s*|📱\s*)([+\d\s-]+)/);
    if (phoneMatch && phoneMatch[1] && isGenericPhone) {
      const extractedP = phoneMatch[1].trim();
      if (!extractedP.startsWith("tg:")) {
        phone = extractedP;
      }
    }
  }

  let cleanName = name.replace(/^tg:\d+/i, "").replace(/👤/g, "").replace(/@\w+/g, "").trim();
  if (!cleanName || cleanName === "." || cleanName.length < 2) cleanName = "مريض غير محدد";

  let cleanPhone = phone.trim();
  if (!cleanPhone || cleanPhone.toLowerCase().startsWith("tg:") || cleanPhone === "." || cleanPhone === "بدون هاتف") {
    cleanPhone = "حجز عبر تلجرام (بدون رقم)";
  }

  return { cleanName, cleanPhone };
};

// ─── معرفات عناصر الماسح ───
const QR_CAMERA_ELEMENT_ID = "qr-camera-container";
const QR_FILE_ELEMENT_ID = "qr-hidden-file-reader";

export default function ReceptionPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);

  // ✏️ [V2.0] الفلتر الافتراضي "all" بدل "active"
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const today = dateFilter;

  // ─── حالة الماسح ───
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ✏️ [V2.0] حالة المريض المباشر
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientPhoneInput, setPatientPhoneInput] = useState("");
  const [creatingWalkIn, setCreatingWalkIn] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (clinicLoading) return;
    if (role === "cashier") navigate("/cashier", { replace: true });
  }, [role, clinicLoading, navigate]);

  // ─── جلب المواعيد (مع department) ───
  const fetchAppointments = useCallback(async () => {
    if (!clinic) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("id,date,time,status,reservation_code,arrived_at,payment_status,entered_at,notes,department,patients(name,phone),services(name,price)")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  }, [clinic, today]);

  useEffect(() => {
    if (!clinic) return;
    fetchAppointments();
    const channel = supabase
      .channel(`reception-${clinic.id}-${today}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, fetchAppointments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, today, fetchAppointments]);

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
      toast({ title: "✅ تم تأكيد الحضور", description: "تحولت حالة الموعد تلقائياً إلى (وصل)" });
      fetchAppointments();
    }
  };

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
        .select("id,date,time,status,reservation_code,arrived_at,payment_status,entered_at,notes,department,patients(name,phone),services(name,price)")
        .eq("clinic_id", clinic.id)
        .or(`reservation_code.ilike.${extractedCode},reservation_code.ilike.${rawText},id.eq.${rawText}`)
        .maybeSingle();

      if (data) {
        found = data as Appointment;
        if (found.date !== dateFilter) setDateFilter(found.date);
      }
    }

    if (found) {
      if (!found.arrived_at) {
        await markArrived(found.id);
        setScannerMessage(`✅ تم تسجيل الحضور: ${found.reservation_code}`);
      } else {
        toast({ title: "تنبيه", description: `الموعد (${found.reservation_code}) تم تسجيل حضوره مسبقاً` });
        setScannerMessage(`ℹ️ الحضور مُسجَّل مسبقاً: ${found.reservation_code}`);
      }
      setTimeout(() => setScannerMessage(null), 3000);
    } else {
      setScannerMessage(`❌ لم يتم العثور على الموعد — الكود: ${extractedCode}`);
      setTimeout(() => setScannerMessage(null), 4000);
      toast({
        title: "لم يتم العثور على الموعد",
        description: `الكود الممسوح: ${extractedCode}`,
        variant: "destructive",
      });
    }
  }, [clinic, dateFilter, fetchAppointments]);

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

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
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
              const size = Math.floor(Math.min(w, h) * 0.8);
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

    try { await tryStart("environment"); return; }
    catch (firstError: any) {
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
          if (blob) resolve(new File([blob], file.name, { type: "image/png" }));
          else reject("فشل تحويل الصورة");
        }, "image/png");
      };
      img.onerror = () => reject("فشل تحميل الصورة");
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setCameraError(null);
    await destroyScanner();

    try {
      const fileScanner = new Html5Qrcode(QR_FILE_ELEMENT_ID, { verbose: false });
      let decodedText = "";

      try {
        decodedText = await fileScanner.scanFile(file, false);
      } catch (firstErr) {
        const resizedFile = await processImageForQR(file);
        decodedText = await fileScanner.scanFile(resizedFile, false);
      }

      await stopScanner();
      handleScannedCode(decodedText);

    } catch (err) {
      console.error("فشل قراءة الصورة:", err);
      toast({
        title: "فشل قراءة QR من الصورة",
        description: "تأكد من اختيار صورة تحتوي على كود QR واضح.",
        variant: "destructive",
      });
      setCameraError("لم نتمكن من التعرف على كود QR في هذه الصورة.");
      setScannerStatus("error");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ✏️ [V2.0] إضافة مريض مباشر
  const addWalkIn = async () => {
    if (!clinic) return;
    if (!patientNameInput.trim()) {
      toast({ title: "⚠️ الاسم مطلوب", variant: "destructive" });
      return;
    }
    setCreatingWalkIn(true);
    try {
      // 1) إنشاء مريض
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .insert({
          clinic_id: clinic.id,
          name: patientNameInput.trim(),
          phone: patientPhoneInput.trim() || "بدون هاتف",
        })
        .select("id")
        .single();

      if (patientError || !patient) {
        toast({ title: "خطأ", description: "فشل إضافة المريض", variant: "destructive" });
        setCreatingWalkIn(false);
        return;
      }

      // 2) إنشاء الحجز مع حالة وصل + مدفوع
      const code = `WI-${Math.floor(1000 + Math.random() * 9000)}`;
      const nowISO = new Date().toISOString();
      const { error: apptError } = await supabase.from("appointments").insert({
        clinic_id: clinic.id,
        patient_id: patient.id,
        date: today,
        time: format(new Date(), "HH:mm"),
        status: "confirmed",
        reservation_code: code,
        arrived_at: nowISO,
        payment_status: "paid",
        is_walk_in: true,
        department: "استقبال",
      });

      if (apptError) {
        toast({ title: "خطأ", description: "فشل إنشاء الحجز المباشر", variant: "destructive" });
        setCreatingWalkIn(false);
        return;
      }

      toast({ title: "✅ تم تسجيل المريض المباشر", description: `الكود: ${code}` });
      setWalkInOpen(false);
      setPatientNameInput("");
      setPatientPhoneInput("");
      fetchAppointments();
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "خطأ غير متوقع", variant: "destructive" });
    } finally {
      setCreatingWalkIn(false);
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
      fetchAppointments();
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
      fetchAppointments();
    }
  };

  const filtered = useMemo(() => appointments.filter((a) => {
    const { cleanName, cleanPhone } = extractCleanInfo(a);
    const matchesSearch =
      a.reservation_code.toLowerCase().includes(search.toLowerCase()) ||
      cleanName.toLowerCase().includes(search.toLowerCase()) ||
      cleanPhone.includes(search);
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
            أنت موظف في عيادة <b>{clinic?.name || ""}</b>. هذه العيادة منتهية الاشتراك.
          </p>
          <Button onClick={signOut} className="w-full">تسجيل الخروج</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      <div id={QR_FILE_ELEMENT_ID} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* ========== الماسح المحسّن ========== */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-lg flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-border">
            <div className="flex justify-between items-center px-6 pt-6 pb-4 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">مسح QR للاستقبال</h3>
                  <p className="text-xs text-muted-foreground">وجّه الكاميرا نحو كود الحجز</p>
                </div>
              </div>
              <button onClick={stopScanner} className="p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {scannerMessage && (
              <div className={`mx-6 mt-3 px-4 py-3 rounded-xl text-sm font-bold text-center ${scannerMessage.startsWith("✅") ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30" : scannerMessage.startsWith("ℹ️") ? "bg-blue-500/15 text-blue-700 border border-blue-500/30" : "bg-red-500/15 text-red-700 border border-red-500/30"}`}>
                {scannerMessage}
              </div>
            )}

            <div className="relative mx-6 my-4 rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "1/1" }}>
              <div id={QR_CAMERA_ELEMENT_ID} className="w-full h-full" />

              {(scannerStatus === "loading" || uploadingImage) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                  <Loader2 className="w-12 h-12 animate-spin text-primary mb-3" />
                  <p className="text-white text-sm font-medium">
                    {uploadingImage ? "جاري قراءة الصورة..." : "جاري تشغيل الكاميرا..."}
                  </p>
                </div>
              )}

              {scannerStatus === "active" && !uploadingImage && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-64 h-64">
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-lg" />
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary animate-bounce" style={{ animationDuration: "1.5s" }} />
                  </div>
                </div>
              )}

              {scannerStatus === "error" && !uploadingImage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-5 text-center z-20">
                  <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
                  <p className="text-white text-sm leading-relaxed mb-4">{cameraError}</p>
                  <Button onClick={startScanner} className="bg-primary text-white" size="sm">
                    <RefreshCw className="w-4 h-4 ml-1" />
                    إعادة المحاولة
                  </Button>
                </div>
              )}
            </div>

            <div className="px-6 pb-3">
              <Button
                variant="outline"
                className="w-full gap-2 border-dashed border-primary/50 hover:bg-primary/5 text-primary h-12 font-bold"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                <ImageIcon className="w-5 h-5" />
                رفع صورة QR من المعرض
              </Button>
            </div>

            <div className="flex gap-2 px-6 pb-6">
              <Button variant="ghost" className="w-full" onClick={stopScanner}>إغلاق</Button>
            </div>
          </div>
        </div>
      )}

      {/* ========== الهيدر بأزرار مُعنونة ========== */}
      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">الاستقبال</h1>
              <p className="text-xs text-muted-foreground">مواعيد اليوم</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={startScanner} className="gap-2">
              <Camera className="w-4 h-4" />مسح QR
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="w-4 h-4" />رفع صورة
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWalkInOpen(true)} className="gap-2 text-primary border-primary/40 hover:bg-primary/10">
              <UserPlus className="w-4 h-4" />مريض مباشر
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/cashier")} className="gap-2">
              <Wallet className="w-4 h-4" />الكاشير
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")} className="gap-2">
              <Home className="w-4 h-4" />الرئيسية
            </Button>
            <Button variant="outline" size="sm" onClick={signOut} className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
              <LogOut className="w-4 h-4" />خروج
            </Button>
          </div>
        </div>
      </header>

      {/* ========== المحتوى الرئيسي ========== */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <StatsAndCharts appointments={appointments} />

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو كود الحجز أو الهاتف" className="pr-10" />
          </div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-40">
            <option value="all">الكل</option>
            <option value="active">النشطة</option>
            <option value="waiting">بانتظار الوصول</option>
            <option value="arrived">حاضر</option>
            <option value="paid">مدفوع</option>
            <option value="completed">تم الدخول</option>
            <option value="cancelled">ملغي/لم يصل</option>
          </select>
          <Button variant="outline" onClick={fetchAppointments}>
            <RefreshCw className="w-4 h-4 ml-1" />تحديث
          </Button>
        </div>

        <div className="grid gap-3">
          {filtered.map((a) => {
            const { cleanName, cleanPhone } = extractCleanInfo(a);
            const confirmedNotArrived = a.status === "confirmed" && !a.arrived_at;
            const arrivedUnpaid = !!a.arrived_at && a.payment_status !== "paid";
            const paidWaitingEntry = !!a.arrived_at && a.payment_status === "paid";

            return (
              <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                    <span className="text-sm text-muted-foreground">
                      <Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}
                    </span>
                    {confirmedNotArrived && <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">تم التأكيد — لم يصل</span>}
                    {arrivedUnpaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">حاضر — بانتظار الدفع</span>}
                    {paidWaitingEntry && <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">مدفوع — جاهز للدخول</span>}
                    {a.status === "completed" && <span className="px-2 py-0.5 rounded-lg text-xs bg-slate-500/15 text-slate-600 font-bold">تم الدخول</span>}
                    {a.status === "cancelled" && <span className="px-2 py-0.5 rounded-lg text-xs bg-red-500/15 text-red-600 font-bold">ملغي/لم يصل</span>}
                  </div>
                  <h2 className="font-bold text-foreground">{cleanName}</h2>
                  <p className="text-sm text-muted-foreground">{cleanPhone} — {a.services?.name || "بدون خدمة"}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {!a.arrived_at && a.status !== "cancelled" && (
                    <>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markArrived(a.id)}>
                        <CheckCircle className="w-4 h-4 ml-1" />وصل
                      </Button>
                      <Button variant="destructive" onClick={() => markNoShow(a.id)}>لم يصل</Button>
                    </>
                  )}
                  {paidWaitingEntry && a.status !== "completed" && (
                    <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markEntered(a.id)}>
                      <Stethoscope className="w-4 h-4 ml-1" />دخول
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="card-modern p-12 text-center text-muted-foreground">
              <QrCode className="w-10 h-10 mx-auto mb-3" />لا توجد مواعيد مطابقة للفلتر الحالي
            </div>
          )}
        </div>
      </main>

      {/* ========== مودال المريض المباشر ========== */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              إضافة مريض مباشر (Walk-In)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">اسم المريض *</label>
              <Input
                value={patientNameInput}
                onChange={(e) => setPatientNameInput(e.target.value)}
                placeholder="الاسم الكامل"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">رقم الهاتف (اختياري)</label>
              <Input
                value={patientPhoneInput}
                onChange={(e) => setPatientPhoneInput(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-800 font-bold">
              ✓ سيُسجَّل المريض فوراً بحالة "وصل" و "مدفوع" في الاستقبال.
            </div>
            <Button
              onClick={addWalkIn}
              disabled={creatingWalkIn || !patientNameInput.trim()}
              className="w-full bg-primary"
            >
              {creatingWalkIn ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <UserPlus className="w-4 h-4 ml-1" />}
              إضافة وتسجيل الحجز
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// مكون الإحصائيات والرسوم البيانية (4 رسوم)
// ═══════════════════════════════════════════════════════════
function StatsAndCharts({ appointments }: { appointments: Appointment[] }) {
  const nonCancelled = appointments.filter((a) => a.status !== "cancelled");
  const total = nonCancelled.length;
  const arrived = nonCancelled.filter((a) => !!a.arrived_at || ["arrived", "paid", "completed"].includes(a.status)).length;
  const waiting = nonCancelled.filter((a) => !a.arrived_at && a.status !== "completed").length;
  const examined = nonCancelled.filter((a) => a.status === "completed" || !!a.entered_at).length;
  const confirmedRate = total > 0 ? Math.round((arrived / total) * 100) : 0;

  // 1) التوزيع الزمني
  const hourly = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (let h = 8; h <= 20; h++) buckets[h] = 0;
    nonCancelled.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h] += 1;
    });
    return Object.entries(buckets).map(([h, count]) => ({ hour: `${h}:00`, count }));
  }, [appointments]);

  // 2) حالة الحضور
  const statusData = useMemo(() => ([
    { name: "حضروا", value: arrived },
    { name: "بانتظار", value: waiting },
    { name: "معاينة", value: examined },
  ]), [arrived, waiting, examined]);

  // 3) ✏️ [V2.0] شعبية الخدمات
  const servicePopularity = useMemo(() => {
    const map: Record<string, number> = {};
    nonCancelled.forEach((a) => {
      const key = a.services?.name || "غير محدد";
      map[key] = (map[key] || 0) + 1;
    });
    const entries = Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return entries.slice(0, 7);
  }, [appointments]);

  // 4) ✏️ [V2.0] أداء الأقسام
  const departmentPerformance = useMemo(() => {
    const map: Record<string, number> = {};
    appointments.forEach((a) => {
      const key = a.department || "غير محدد";
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [appointments]);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(152 69% 40%)"];
  const DEPT_COLORS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e", "#64748b", "#14b8a6"];

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

      {/* صف 1: التوزيع الزمني + حالة الحضور */}
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

      {/* صف 2: ✏️ [V2.0] شعبية الخدمات + أداء الأقسام */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-foreground">شعبية الخدمات</h3>
          </div>
          {servicePopularity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <PieIcon className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-xs font-bold">لا توجد خدمات بعد</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={servicePopularity} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="serviceGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.9} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
                <Bar dataKey="value" name="عدد المواعيد" fill="url(#serviceGrad)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-foreground">أداء الأقسام</h3>
          </div>
          {departmentPerformance.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <PieIcon className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-xs font-bold">لا توجد بيانات بعد</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={departmentPerformance} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
                <Bar dataKey="value" name="عدد المواعيد" radius={[8, 8, 0, 0]}>
                  {departmentPerformance.map((_, i) => (
                    <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

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
  Banknote, CheckCircle, LogOut, Search, ShieldCheck, Stethoscope, Users,
  Camera, X, Loader2, AlertCircle, Image as ImageIcon, Upload, RefreshCw, Printer, Download, Clock, Plus, UserPlus, DollarSign, TrendingUp, Receipt, MessageCircle, MinusCircle, Wallet, ArrowDownCircle, ArrowUpCircle
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Html5Qrcode } from "html5-qrcode";
import html2canvas from "html2canvas";

// ─── الأنواع والبيانات ───
type Appointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  arrived_at: string | null;
  payment_status: string;
  paid_amount?: number | null;
  discount_amount?: number | null;
  is_walk_in: boolean;
  patients: { name: string; phone: string } | null;
  services: { name: string; price: number | null } | null;
  // بيانات مكملة مستخرجة من كود QR
  extracted_patient_name?: string;
  extracted_patient_phone?: string;
};

type Expense = {
  id: string;
  title: string;
  amount: number;
  category: string;
  time: string;
};

// ─── معرفات عناصر الماسح ───
const QR_CAMERA_ELEMENT_ID = "qr-camera-container-cashier";
const QR_FILE_ELEMENT_ID = "qr-hidden-file-reader-cashier";

// ─── محلل النص الهيكلي لكود QR (استخراج الاسم والرقم الصريح من كروت التلجرام) ───
const parseStructuredQrText = (text: string) => {
  let reservationCode = "";
  let patientName = "";
  let patientPhone = "";

  // 1. استخراج كود الحجز
  const codeMatch = text.match(/RE-[A-Za-z0-9]+/i) || text.match(/RE-\d+/i);
  if (codeMatch) reservationCode = codeMatch[0];

  // 2. استخراج اسم المريض من سطر (المريض: علي قاسم)
  const nameMatch = text.match(/المريض:\s*([^\n\r]+)/);
  if (nameMatch) {
    patientName = nameMatch[1].replace(/@\w+/g, "").trim();
  }

  // 3. استخراج رقم الهاتف من سطر (الهاتف: +967715365516)
  const phoneMatch = text.match(/الهاتف:\s*([^\n\r]+)/);
  if (phoneMatch) {
    patientPhone = phoneMatch[1].trim();
  }

  return { reservationCode, patientName, patientPhone };
};

// تنظيف وتجهيز أرقام الهواتف للواتساب
const formatPhoneForWhatsApp = (phone?: string): string => {
  if (!phone || phone.includes("بدون") || phone.startsWith("tg:")) return "";
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.substring(1);
  if (cleaned.startsWith("00")) cleaned = cleaned.substring(2);
  if (cleaned.startsWith("0")) cleaned = "967" + cleaned.substring(1);
  return cleaned;
};

export default function CashierPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
  
  // مودالات الإضافة والمصروفات
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientPhoneInput, setPatientPhoneInput] = useState("");
  
  // بيانات المصروف الجديد
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("نثريات");

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const today = dateFilter;

  // ─── حالة السداد والسند ───
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

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
    if (role === "owner" || role === "cashier") setUnlocked(true);
    if (role === "reception") navigate("/reception", { replace: true });
  }, [role, clinicLoading, navigate]);

  // ─── جلب المواعيد ───
  const fetchAppointments = useCallback(async () => {
    if (!clinic || !unlocked) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,is_walk_in,patients(name,phone),services(name,price)")
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

  // ─── فتح نافذة تحصيل الدفع ───
  const openPaymentModal = (appointment: Appointment, overrideName?: string, overridePhone?: string) => {
    const appWithOverrides = {
      ...appointment,
      extracted_patient_name: overrideName || appointment.extracted_patient_name,
      extracted_patient_phone: overridePhone || appointment.extracted_patient_phone,
    };

    setSelectedAppointment(appWithOverrides);
    const defaultPrice = appointment.services?.price || 0;
    setPaidAmountInput(appointment.paid_amount != null ? String(appointment.paid_amount) : String(defaultPrice));
    setDiscountInput(appointment.discount_amount != null ? String(appointment.discount_amount) : "0");
    setShowReceipt(appointment.payment_status === "paid");
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

  // ─── معالجة الكود الممسوح واستخراج الاسم والرقم من البطاقة ───
  const handleScannedCode = useCallback(async (decodedText: string) => {
    const rawText = decodedText.trim();
    
    // تحليل النص المستخرج من QR (سواء كان نصاً بسيطة أو كرت تلجرام كاملاً)
    const { reservationCode, patientName, patientPhone } = parseStructuredQrText(rawText);
    const targetCode = reservationCode || rawText;

    const currentAppointments = appointmentsRef.current;
    let found = currentAppointments.find(a =>
      a.id === rawText ||
      a.reservation_code.toLowerCase() === targetCode.toLowerCase() ||
      rawText.toLowerCase().includes(a.reservation_code.toLowerCase())
    );

    if (!found && clinic) {
      const { data } = await supabase
        .from("appointments")
        .select("id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,is_walk_in,patients(name,phone),services(name,price)")
        .eq("clinic_id", clinic.id)
        .or(`reservation_code.ilike.${targetCode},reservation_code.ilike.${rawText},id.eq.${rawText}`)
        .maybeSingle();
      if (data) found = data as Appointment;
    }

    if (found) {
      if (!found.arrived_at) {
        await markArrived(found.id);
        found.arrived_at = new Date().toISOString();
      }

      openPaymentModal(found, patientName, patientPhone);
      stopScanner();
    } else {
      toast({ title: "لم يتم العثور على الموعد", description: `الكود المستخرج: ${targetCode}`, variant: "destructive" });
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

  // ─── معالجة الصورة لقراءات المعرض والتلجرام ───
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

  // تأكيد الدفع وحفظ المبالغ والخصم
  const handlePayNow = async () => {
    if (!selectedAppointment || !clinic) return;
    setProcessingPayment(true);

    const paidVal = parseFloat(paidAmountInput) || 0;
    const discountVal = parseFloat(discountInput) || 0;

    const { error } = await supabase
      .from("appointments")
      .update({ 
        payment_status: "paid", 
        status: "confirmed", 
        department: "صندوق",
        paid_amount: paidVal,
        discount_amount: discountVal
      })
      .eq("id", selectedAppointment.id)
      .eq("clinic_id", clinic.id);

    if (error) {
      toast({ title: "خطأ", description: "فشل تحديث حالة الدفع", variant: "destructive" });
      setProcessingPayment(false);
      return;
    }

    toast({ title: "✅ تم تسجيل الدفع بنجاح", description: "تم تحديث الخزينة وإصدار سند الاستلام" });
    setSelectedAppointment({ 
      ...selectedAppointment, 
      payment_status: "paid",
      paid_amount: paidVal,
      discount_amount: discountVal
    });
    setShowReceipt(true);
    setProcessingPayment(false);
    fetchAppointments();
  };

  // ─── تسجيل مريض مباشر ───
  const addWalkIn = async () => {
    if (!clinic || !patientNameInput.trim()) return;
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .insert({ clinic_id: clinic.id, name: patientNameInput.trim(), phone: patientPhoneInput.trim() || "بدون هاتف" })
      .select("id")
      .single();
    if (patientError || !patient) {
      toast({ title: "خطأ", description: "فشل إضافة المريض", variant: "destructive" });
      return;
    }
    const code = `WI-${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await supabase.from("appointments").insert({
      clinic_id: clinic.id,
      patient_id: patient.id,
      date: today,
      time: format(new Date(), "HH:mm"),
      status: "confirmed",
      reservation_code: code,
      arrived_at: new Date().toISOString(),
      payment_status: "paid",
      is_walk_in: true,
      department: "صندوق",
    });
    if (error) toast({ title: "خطأ", description: "فشل إضافة مريض مباشر", variant: "destructive" });
    else {
      toast({ title: "تمت الإضافة", description: `تم تسجيل المريض المباشر ${code}` });
      setWalkInOpen(false); setPatientNameInput(""); setPatientPhoneInput(""); fetchAppointments();
    }
  };

  // ─── تسجيل مصروف جديد ───
  const handleAddExpense = () => {
    if (!expenseTitle.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
      toast({ title: "بيانات غير مكتملة", description: "يرجى إدخال اسم المصروف والمبلغ بشكل صحيح", variant: "destructive" });
      return;
    }

    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      title: expenseTitle.trim(),
      amount: parseFloat(expenseAmount),
      category: expenseCategory,
      time: format(new Date(), "HH:mm")
    };

    setExpenses(prev => [newExpense, ...prev]);
    toast({ title: "✅ تم تسجيل المصروف", description: `تم قيد (${expenseTitle}) بمبلغ ${expenseAmount} ر.ي` });
    setExpenseTitle("");
    setExpenseAmount("");
    setExpenseModalOpen(false);
  };

  // ─── توليد السند كصورة فائقة الدقة ───
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
            <head><title>طباعة سند الدفع</title></head>
            <body style="margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f4f4f5;">
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

  // ─── استرجاع اسم ورقم هاتف المريض الحقيقي المعروضين ───
  const getDisplayPatientName = (app?: Appointment | null) => {
    if (!app) return "مريض زائر";
    if (app.extracted_patient_name && app.extracted_patient_name.trim()) {
      return app.extracted_patient_name.trim();
    }
    const dbName = app.patients?.name || "";
    return dbName.replace(/@\w+/g, "").replace(/tg:\w+/gi, "").trim() || "مريض زائر";
  };

  const getDisplayPatientPhone = (app?: Appointment | null) => {
    if (!app) return "غير مسجل";
    if (app.extracted_patient_phone && app.extracted_patient_phone.trim()) {
      return app.extracted_patient_phone.trim();
    }
    const dbPhone = app.patients?.phone || "";
    if (dbPhone.includes("بدون") || dbPhone.startsWith("tg:")) return "غير مسجل";
    return dbPhone;
  };

  // ─── إرسال السند عبر الواتساب برقم المريض والاسم الحقيقي ───
  const sendReceiptToWhatsApp = () => {
    const rawPhone = getDisplayPatientPhone(selectedAppointment);
    const whatsappPhone = formatPhoneForWhatsApp(rawPhone);

    if (!whatsappPhone) {
      toast({ 
        title: "لا يوجد رقم هاتف صحيح", 
        description: "هذا المريض ليس لديه رقم هاتف واتساب مسجل بنمط دولي في بطاقة الحجز.", 
        variant: "destructive" 
      });
      return;
    }

    const actualName = getDisplayPatientName(selectedAppointment);
    const netPaid = (selectedAppointment?.paid_amount || 0) - (selectedAppointment?.discount_amount || 0);

    const message = `🧾 *سند استلام مبلغ - ${clinic?.name || "العيادة الطبية"}*\n\n` +
      `اسم المريض: *${actualName}*\n` +
      `رقم الحجز: *${selectedAppointment?.reservation_code}*\n` +
      `الخدمة: *${selectedAppointment?.services?.name || "فحص طبي"}*\n` +
      `المبلغ المدفوع: *${netPaid} ريال*\n` +
      `تاريخ وساعة السداد: *${format(new Date(), "yyyy/MM/dd hh:mm a")}*\n` +
      `رمز إثبات الدفع: *PAY-VERIFIED-${selectedAppointment?.reservation_code}*\n\n` +
      `نشكركم لزيارتكم ونتمنى لكم دوام الصحة والعافية! ✨`;

    const url = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    toast({ title: "✅ تم فتح الواتساب", description: `جاري التحويل لإرسال السند إلى المريض (${actualName})` });
  };

  // ─── رمز إثبات الدفع المالي الفريد للسند ───
  const getUniquePaymentToken = (appointment: Appointment) => {
    const baseCode = appointment.reservation_code || "PAY";
    const netPaid = (appointment.paid_amount || 0) - (appointment.discount_amount || 0);
    return `PAY-VERIFIED|${baseCode}|${netPaid}YR|${appointment.id.slice(0, 6).toUpperCase()}`;
  };

  // ─── فلترة المواعيد ───
  const filtered = useMemo(() => appointments.filter((a) => {
    const patientName = getDisplayPatientName(a);
    const patientPhone = getDisplayPatientPhone(a);
    const matchesSearch =
      a.reservation_code.toLowerCase().includes(search.toLowerCase()) ||
      patientName.toLowerCase().includes(search.toLowerCase()) ||
      patientPhone.includes(search);
    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return !["cancelled"].includes(a.status);
    if (statusFilter === "paid") return a.payment_status === "paid";
    if (statusFilter === "unpaid") return a.payment_status !== "paid" && a.status !== "cancelled";
    if (statusFilter === "arrived") return !!a.arrived_at;
    if (statusFilter === "waiting") return !a.arrived_at && a.status !== "cancelled";
    return true;
  }), [appointments, search, statusFilter]);

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
            <div><h1 className="text-xl font-bold text-foreground">الصندوق الخزينة</h1><p className="text-xs text-muted-foreground">تحصيل ومصروفات اليوم</p></div>
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
        <CashierStats appointments={appointments} expenses={expenses} />

        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المريض، كود الحجز أو رقم الهاتف" className="pr-10" />
          </div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-40">
            <option value="active">النشطة</option>
            <option value="all">الكل</option>
            <option value="paid">مدفوع</option>
            <option value="unpaid">بانتظار الدفع</option>
            <option value="arrived">حاضر</option>
            <option value="waiting">لم يصل</option>
          </select>
          
          <div className="flex gap-2">
            <Button onClick={() => setWalkInOpen(true)} className="bg-primary"><Plus className="w-4 h-4 ml-1" />مريض مباشر</Button>
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setExpenseModalOpen(true)}>
              <MinusCircle className="w-4 h-4 ml-1" />تسجيل مصروف
            </Button>
            <Button variant="outline" onClick={fetchAppointments}><RefreshCw className="w-4 h-4 ml-1" />تحديث</Button>
          </div>
        </div>

        {/* جدول المصروفات المسجلة اليوم */}
        {expenses.length > 0 && (
          <div className="card-modern p-4 space-y-2 bg-red-50/30 dark:bg-red-950/10 border-red-200/50">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-red-600 flex items-center gap-1">
                <MinusCircle className="w-4 h-4" /> المصروفات المسجلة اليوم ({expenses.length})
              </h3>
              <span className="text-xs font-black text-red-600">
                إجمالي: {expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()} ر.ي
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {expenses.map((exp) => (
                <div key={exp.id} className="bg-background border border-border px-3 py-1.5 rounded-xl text-xs shrink-0 flex items-center gap-2">
                  <span className="font-bold text-foreground">{exp.title}</span>
                  <span className="text-muted-foreground">({exp.category})</span>
                  <span className="font-black text-red-500">{exp.amount} ر.ي</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* قائمة المواعيد والعمليات */}
        <div className="grid gap-3">
          {filtered.map((a) => {
            const isPaid = a.payment_status === "paid";
            const isArrived = !!a.arrived_at;
            const patientNameClean = getDisplayPatientName(a);
            const patientPhoneClean = getDisplayPatientPhone(a);

            return (
              <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                    {a.is_walk_in && <span className="bg-emerald-500/15 text-emerald-600 px-2 py-0.5 rounded-lg text-xs font-bold">مباشر</span>}
                    <span className="text-sm text-muted-foreground"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                    {isArrived ? (
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">وصل العيادة</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">بانتظار الوصول</span>
                    )}
                    {isPaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">مدفوع</span>}
                  </div>
                  <h2 className="font-bold text-foreground">{patientNameClean}</h2>
                  <p className="text-sm text-muted-foreground">{patientPhoneClean} — الخدمة: <b>{a.services?.name || "بدون خدمة"}</b></p>
                </div>
                <div className="flex gap-2 items-center justify-end">
                  {isPaid ? (
                    <Button variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-50/50" onClick={() => openPaymentModal(a)}>
                      <CheckCircle className="w-4 h-4 ml-1" />عرض السند الفاخر
                    </Button>
                  ) : (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openPaymentModal(a)}>
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

      {/* مودال الدفع والسند الفاخر الاحترافي */}
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
                  <h2 className="text-xl font-bold text-foreground">تأكيد تحصيل المبلغ</h2>
                  <p className="text-xs text-muted-foreground mt-1">راجع المبلغ والخصم قبل سداد الفاتورة</p>
                </div>

                <div className="card-modern p-4 bg-muted/40 space-y-3 text-sm">
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">اسم المريض</span>
                    <span className="font-bold text-foreground">{getDisplayPatientName(selectedAppointment)}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">رقم الهاتف</span>
                    <span className="font-bold text-foreground">{getDisplayPatientPhone(selectedAppointment)}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">كود الحجز</span>
                    <span className="font-mono font-bold text-primary">{selectedAppointment.reservation_code}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">الخدمة المطلوبة</span>
                    <span className="font-medium text-foreground">{selectedAppointment.services?.name || "فحص طبي"}</span>
                  </div>

                  {/* إدخال وتعديل المبلغ والخصم */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">المبلغ المستلم (ر.ي)</label>
                      <Input 
                        type="number" 
                        value={paidAmountInput} 
                        onChange={(e) => setPaidAmountInput(e.target.value)} 
                        className="font-bold text-lg"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">الخصم (ر.ي)</label>
                      <Input 
                        type="number" 
                        value={discountInput} 
                        onChange={(e) => setDiscountInput(e.target.value)} 
                        className="font-bold text-lg text-red-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2 border-t border-border/80 text-base">
                    <span className="font-bold text-foreground">الصافي المطلوب</span>
                    <span className="font-black text-emerald-600 text-xl">
                      {Math.max(0, (parseFloat(paidAmountInput) || 0) - (parseFloat(discountInput) || 0))} ريال
                    </span>
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

                {/* 🎨 السند الإلكتروني الفاخر والمصمم عالمياً بالاسم الحقيقي والباركود الجديد */}
                <div 
                  id="receipt-card-container" 
                  className="bg-white text-gray-900 p-6 rounded-2xl border border-gray-200 shadow-xl relative overflow-hidden" 
                  style={{ direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                  <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-primary" />
                  
                  {/* الرأس والختم الأمني */}
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <div>
                      <h3 className="text-lg font-black text-gray-900 tracking-tight">{clinic?.name || "العيادة الطبية Smart Clinic"}</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">سند استلام مالي رسمـي (Official Cash Receipt)</p>
                    </div>
                    <div className="border-2 border-emerald-600 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black rotate-[-6deg] opacity-90 shadow-sm">
                      مدفوع ومعتمد ✓
                    </div>
                  </div>

                  {/* التفاصيل والأسماء الحقيقية للمريض المستخرجة من البطاقة */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center text-gray-600">
                      <span>رقم السند / الحجز:</span>
                      <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{selectedAppointment.reservation_code}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>تاريخ ووقت السداد:</span>
                      <span className="font-medium text-gray-800">{format(new Date(), "yyyy/MM/dd - hh:mm a")}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>اسم المريض (الصريح):</span>
                      <span className="font-bold text-gray-900 text-sm">{getDisplayPatientName(selectedAppointment)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>رقم الهاتف:</span>
                      <span className="font-medium text-gray-800">{getDisplayPatientPhone(selectedAppointment)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>الخدمة المقدمة:</span>
                      <span className="font-medium text-gray-800">{selectedAppointment.services?.name || "فحص طبي"}</span>
                    </div>

                    {(selectedAppointment.discount_amount || 0) > 0 && (
                      <div className="flex justify-between items-center text-red-600">
                        <span>الخصم الممنوح:</span>
                        <span className="font-bold">-{selectedAppointment.discount_amount} ر.ي</span>
                      </div>
                    )}

                    <div className="my-3 border-t border-dashed border-gray-200" />

                    <div className="flex justify-between items-center bg-emerald-50/80 p-3 rounded-xl border border-emerald-100">
                      <span className="font-bold text-emerald-900 text-sm">المبلغ الإجمالي المستلم:</span>
                      <span className="font-black text-emerald-700 text-xl">
                        {(selectedAppointment.paid_amount || 0) - (selectedAppointment.discount_amount || 0)} <span className="text-xs font-normal">ر.ي</span>
                      </span>
                    </div>
                  </div>

                  {/* 📌 باركود إثبات الدفع المالي الجديد والخاص بالسند */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-gray-700">رمز إثبات صحة السند المالي:</p>
                      <p className="text-[9px] font-mono text-gray-400 mt-0.5">{getUniquePaymentToken(selectedAppointment)}</p>
                    </div>
                    <div className="bg-white p-1 rounded-lg border border-gray-200 shrink-0">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x100&data=${encodeURIComponent(getUniquePaymentToken(selectedAppointment))}`} 
                        alt="Payment Verification QR" 
                        className="w-12 h-12"
                        crossOrigin="anonymous"
                      />
                    </div>
                  </div>

                  {/* التذييل */}
                  <div className="mt-3 text-center text-[9px] text-gray-400 border-t border-gray-100 pt-2">
                    معتمد إلكترونياً عبر صندوق الخزينة — جميع الحقوق محفوظة
                  </div>
                </div>

                {/* أزرار الإجراءات السريعة (واتساب، طباعة، تنزيل) */}
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
                    className="text-xs gap-1 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold" 
                    onClick={sendReceiptToWhatsApp}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    واتساب
                  </Button>
                </div>

                <Button variant="ghost" className="w-full text-xs mt-2" onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }}>
                  إغلاق النافذة
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* مودال إضافة مريض مباشر */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إضافة مريض مباشر (Walk-In)</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input value={patientNameInput} onChange={(e) => setPatientNameInput(e.target.value)} placeholder="اسم المريض بالكامل" />
            <Input value={patientPhoneInput} onChange={(e) => setPatientPhoneInput(e.target.value)} placeholder="رقم الهاتف (مثال: +967715365516)" />
            <Button onClick={addWalkIn} className="w-full bg-primary"><UserPlus className="w-4 h-4 ml-1" />إضافة وتسجيل الحجز</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* مودال قيد المصروفات والنثريات */}
      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-1"><MinusCircle className="w-5 h-5" /> تسجـيل مصروف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">البيان / سبب المصروف</label>
              <Input value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} placeholder="مثلاً: شراء أدوات طبية / إيجار / كهرباء" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">المبلغ (ر.ي)</label>
                <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">الفئة</label>
                <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-xs w-full">
                  <option value="نثريات">نثريات</option>
                  <option value="أدوات طبية">أدوات طبية</option>
                  <option value="صيانة">صيانة</option>
                  <option value="كهرباء/ماء">كهرباء/ماء</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>
            </div>
            <Button onClick={handleAddExpense} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"><MinusCircle className="w-4 h-4 ml-1" />قيد المصروف في الخزينة</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

// ─── مكون الإحصائيات المالية والرسوم البيانية للصندوق ───
function CashierStats({ appointments, expenses }: { appointments: Appointment[]; expenses: Expense[] }) {
  const paid = appointments.filter((a) => a.payment_status === "paid");
  
  const amountFor = (a: Appointment) =>
    typeof a.paid_amount === "number" ? a.paid_amount : (a.services?.price || 0);

  const totalRevenue = paid.reduce((s, a) => s + amountFor(a), 0);
  const totalDiscount = paid.reduce((s, a) => s + (a.discount_amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  
  // صافي الخزينة = (الإيرادات - الخصومات) - المصروفات
  const netInDrawer = (totalRevenue - totalDiscount) - totalExpenses;
  const avgTicket = paid.length ? Math.round((totalRevenue - totalDiscount) / paid.length) : 0;

  // الرسوم البيانية: المقارنة بين الإيرادات والمصروفات حسب الساعات
  const financialFlow = useMemo(() => {
    const buckets: Record<number, { revenue: number; expense: number }> = {};
    for (let h = 8; h <= 20; h++) buckets[h] = { revenue: 0, expense: 0 };

    paid.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) {
        buckets[h].revenue += (amountFor(a) - (a.discount_amount || 0));
      }
    });

    expenses.forEach((e) => {
      const h = parseInt(String(e.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) {
        buckets[h].expense += e.amount;
      }
    });

    return Object.entries(buckets).map(([h, data]) => ({ hour: `${h}:00`, ...data }));
  }, [paid, expenses]);

  const byService = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach((a) => {
      const key = a.services?.name || "بدون خدمة";
      map[key] = (map[key] || 0) + (amountFor(a) - (a.discount_amount || 0));
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid]);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(152 69% 40%)", "hsl(38 92% 50%)"];
  const stats = [
    { label: "إجمالي المقبوضات", value: `${totalRevenue.toLocaleString()} ر.ي`, icon: ArrowUpCircle, tint: "from-emerald-500/20 to-emerald-500/5", iconClass: "text-emerald-500" },
    { label: "إجمالي الخصومات", value: `${totalDiscount.toLocaleString()} ر.ي`, icon: Receipt, tint: "from-amber-500/20 to-amber-500/5", iconClass: "text-amber-500" },
    { label: "إجمالي المصروفات", value: `${totalExpenses.toLocaleString()} ر.ي`, icon: ArrowDownCircle, tint: "from-red-500/20 to-red-500/5", iconClass: "text-red-500" },
    { label: "صافي الصندوق (الخزينة)", value: `${netInDrawer.toLocaleString()} ر.ي`, icon: Wallet, tint: "from-primary/20 to-primary/5", iconClass: "text-primary" },
    { label: "متوسط الفاتورة", value: `${avgTicket.toLocaleString()} ر.ي`, icon: TrendingUp, tint: "from-violet-500/20 to-violet-500/5", iconClass: "text-violet-500" },
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
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-foreground">تدفق الإيرادات والمصروفات</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={financialFlow} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="revenue" name="إيرادات" fill="hsl(152 69% 40%)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="expense" name="مصروفات" fill="hsl(0 84% 60%)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground">الإيرادات حسب الخدمات</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byService} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={4} stroke="hsl(var(--background))" strokeWidth={2}>
                {byService.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
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

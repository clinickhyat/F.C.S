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
  Banknote, CheckCircle, LogOut, Plus, Search, ShieldCheck, Stethoscope,
  UserPlus, Users, DollarSign, TrendingUp, Receipt, Clock,
  Camera, X, Loader2, AlertCircle, Send, Printer,
  Download, ImagePlus, TrendingDown, Wallet, BarChart2, PieChart as PieIcon
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area
} from "recharts";
import { Html5Qrcode } from "html5-qrcode";
import jsQR from "jsqr";
import html2canvas from "html2canvas";
import QRCode from "qrcode";

type Appointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  arrived_at: string | null;
  entered_at?: string | null;
  payment_status: string;
  paid_amount?: number | null;
  discount_amount?: number | null;
  is_walk_in: boolean;
  patients: { name: string; phone: string; telegram_user_id?: string } | null;
  services: { name: string; price: number | null } | null;
};

type Expense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  created_at: string;
};

const QR_ELEMENT_ID = "qr-camera-container-cashier";

// ══════════════════════════════════════════════
// استخراج بيانات كاملة من نص QR بطاقة الحجز
// ══════════════════════════════════════════════
function parseQRText(raw: string): {
  code: string;
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
} {
  const text = raw.trim();

  const codeMatch =
    text.match(/كود\s*الحجز\s*[:\-]\s*([A-Z0-9\-]+)/i) ||
    text.match(/\b(RE-\d{3,8})\b/i) ||
    text.match(/\b(WI-\d{3,8})\b/i);
  const code = codeMatch ? codeMatch[1].trim().toUpperCase() : "";

  const nameMatch =
    text.match(/المريض\s*[:\-]\s*(.+?)(?:\n|الهاتف|$)/i) ||
    text.match(/الاسم\s*[:\-]\s*(.+?)(?:\n|الهاتف|$)/i);
  const name = nameMatch ? nameMatch[1].trim() : "";

  const phoneMatch =
    text.match(/الهاتف\s*[:\-]\s*([+\d\s]{7,20})/i) ||
    text.match(/(\+?967\d{9,})/);
  const phone = phoneMatch ? phoneMatch[1].trim() : "";

  const serviceMatch = text.match(/الخدمة\s*[:\-]\s*(.+?)(?:\n|التاريخ|$)/i);
  const service = serviceMatch ? serviceMatch[1].trim() : "";

  const dateMatch = text.match(/التاريخ\s*[:\-]\s*(.+?)(?:\n|الوقت|$)/i);
  const date = dateMatch ? dateMatch[1].trim() : "";

  const timeMatch = text.match(/الوقت\s*[:\-]\s*(.+?)(?:\n|كود|$)/i);
  const time = timeMatch ? timeMatch[1].trim() : "";

  return { code, name, phone, service, date, time };
}

function extractReservationCode(raw: string): string[] {
  const parsed = parseQRText(raw);
  const candidates: string[] = [];
  if (parsed.code) candidates.push(parsed.code);

  const text = raw.trim();
  const patterns = [/\b([A-Z]{2,4}-\d{3,8})\b/gi, /\b(WI-\d{3,8})\b/gi];
  for (const p of patterns) {
    for (const m of [...text.matchAll(p)]) {
      if (m[1]) candidates.push(m[1].toUpperCase());
    }
  }
  const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  for (const u of [...text.matchAll(uuid)]) candidates.push(u[0]);
  candidates.push(text);
  return [...new Set(candidates)];
}

// هل الرقم معرف تليجرام؟
function isTelegramId(phone: string | undefined): boolean {
  if (!phone) return true;
  return (
    phone.startsWith("tg:") ||
    phone.startsWith("TG:") ||
    /^tg:\d+$/i.test(phone) ||
    phone === "بدون هاتف" ||
    phone.trim() === ""
  );
}

// تنظيف الرقم: أعطِ الأولوية لـ QR على DB
function getCleanPhone(dbPhone: string | undefined, qrPhone: string): string {
  if (isTelegramId(dbPhone)) return qrPhone || "";
  return dbPhone!;
}

function getCleanName(dbName: string | undefined, qrName: string): string {
  if (!dbName || dbName === "." || dbName.trim().length < 2) return qrName || "غير محدد";
  return dbName;
}

// توليد كود سند الدفع
function generateReceiptCode(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PAY-${yy}${mm}${dd}-${rand}`;
}

async function generatePaymentQR(code: string): Promise<string> {
  try {
    return await QRCode.toDataURL(code, {
      width: 120, margin: 1,
      color: { dark: "#065f46", light: "#f0fdf4" },
      errorCorrectionLevel: "M",
    });
  } catch { return ""; }
}

export default function CashierPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();

  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const today = dateFilter;

  const [walkInOpen, setWalkInOpen] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("عام");

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const [receiptCode, setReceiptCode] = useState<string>("");
  const [receiptQRData, setReceiptQRData] = useState<string>("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [shouldStartCamera, setShouldStartCamera] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [imageScanning, setImageScanning] = useState(false);

  const [activeTab, setActiveTab] = useState<"appointments" | "stats" | "expenses">("appointments");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { appointmentsRef.current = appointments; }, [appointments]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (clinicLoading) return;
    if (role === "owner" || role === "cashier") setUnlocked(true);
    if (role === "reception") navigate("/reception", { replace: true });
  }, [role, clinicLoading, navigate]);

  const fetchAppointments = useCallback(async () => {
    if (!clinic || !unlocked) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("id,date,time,status,reservation_code,arrived_at,entered_at,payment_status,paid_amount,discount_amount,is_walk_in,patients(name,phone,telegram_user_id),services(name,price)")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  }, [clinic, unlocked, today]);

  const fetchExpenses = useCallback(async () => {
    if (!clinic || !unlocked) return;
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("created_at", { ascending: false });
    if (data) setExpenses(data as Expense[]);
  }, [clinic, unlocked, today]);

  useEffect(() => {
    if (!clinic || !unlocked) return;
    fetchAppointments();
    fetchExpenses();
    const channel = supabase
      .channel(`cashier-${clinic.id}-${today}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "appointments",
        filter: `clinic_id=eq.${clinic.id}`
      }, fetchAppointments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, unlocked, today, fetchAppointments, fetchExpenses]);

  useEffect(() => { return () => { destroyScanner(); }; }, []);

  // ── useEffect الماسح ──
  useEffect(() => {
    if (!scannerOpen || !shouldStartCamera) return;
    let cancelled = false;
    let attempts = 0;
    const tryInit = async () => {
      const waitForEl = (): Promise<HTMLElement> =>
        new Promise((resolve, reject) => {
          const check = () => {
            if (cancelled) { reject(new Error("cancelled")); return; }
            const el = document.getElementById(QR_ELEMENT_ID);
            if (el) { resolve(el); return; }
            if (++attempts >= 20) { reject(new Error("Element not found")); return; }
            setTimeout(check, 100);
          };
          check();
        });
      try {
        await waitForEl();
        if (!cancelled) await initCamera();
      } catch (err: any) {
        if (cancelled) return;
        if (err.message !== "cancelled") { setCameraError("❌ تعذر تهيئة الماسح."); setScannerStatus("error"); }
      } finally {
        if (!cancelled) setShouldStartCamera(false);
      }
    };
    tryInit();
    return () => { cancelled = true; };
  }, [scannerOpen, shouldStartCamera]);

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
    return "❌ فشل فتح الكاميرا. حاول مرة أخرى.";
  };

  const markArrived = async (appointmentId: string) => {
    if (!clinic) return;
    await supabase.from("appointments")
      .update({ arrived_at: new Date().toISOString(), department: "استقبال" })
      .eq("id", appointmentId).eq("clinic_id", clinic.id);
    fetchAppointments();
  };

  const markNoShow = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase.from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId).eq("clinic_id", clinic.id);
    if (!error) toast({ title: "تم تسجيل عدم الحضور" });
    fetchAppointments();
  };

  // ══════════════════════════════════════════════
  // handleScannedCode - يعطي الأولوية لبيانات QR
  // ══════════════════════════════════════════════
  const handleScannedCode = useCallback(async (rawText: string) => {
    const qrParsed = parseQRText(rawText);
    const candidates = extractReservationCode(rawText);
    console.log("QR Parsed:", qrParsed, "| Candidates:", candidates);

    let found: Appointment | undefined;
    const current = appointmentsRef.current;

    for (const c of candidates) {
      found = current.find(a =>
        a.id === c ||
        a.reservation_code.toUpperCase() === c.toUpperCase() ||
        c.toUpperCase().includes(a.reservation_code.toUpperCase())
      );
      if (found) break;
    }

    if (!found && clinic && qrParsed.code) {
      const { data } = await supabase
        .from("appointments")
        .select("id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,is_walk_in,patients(name,phone,telegram_user_id),services(name,price)")
        .eq("clinic_id", clinic.id)
        .ilike("reservation_code", `%${qrParsed.code}%`)
        .maybeSingle();
      if (data) found = data as Appointment;
    }

    if (found) {
      // الأولوية: بيانات QR → بيانات DB
      const cleanPhone = getCleanPhone(found.patients?.phone, qrParsed.phone);
      const cleanName = getCleanName(found.patients?.name, qrParsed.name);

      const enriched: Appointment = {
        ...found,
        patients: {
          name: cleanName,
          phone: cleanPhone,
          telegram_user_id: found.patients?.telegram_user_id,
        },
        services: found.services || (qrParsed.service ? { name: qrParsed.service, price: null } : null),
      };

      if (!enriched.arrived_at) {
        await markArrived(enriched.id);
        enriched.arrived_at = new Date().toISOString();
      }

      if (enriched.payment_status === "paid") {
        toast({ title: "ℹ️ مدفوع مسبقاً", description: enriched.patients?.name });
        setSelectedAppointment(enriched);
        setShowReceipt(true);
      } else {
        setCustomAmount(String(enriched.services?.price || ""));
        setDiscountAmount("");
        setSelectedAppointment(enriched);
        setShowReceipt(false);
        toast({ title: "✅ جاهز للدفع", description: enriched.patients?.name });
      }
      setScannerOpen(false);
      await stopScanner();

    } else if (qrParsed.code || qrParsed.name) {
      // موعد من QR فقط (ليس في DB أو يوم مختلف)
      const tempAppointment: Appointment = {
        id: "temp-" + Date.now(),
        date: qrParsed.date || format(new Date(), "yyyy-MM-dd"),
        time: qrParsed.time || "00:00",
        status: "confirmed",
        reservation_code: qrParsed.code || "UNKNOWN",
        arrived_at: new Date().toISOString(),
        payment_status: "unpaid",
        paid_amount: null,
        discount_amount: null,
        is_walk_in: false,
        patients: {
          name: qrParsed.name || "غير محدد",
          phone: qrParsed.phone || "",
          telegram_user_id: undefined,
        },
        services: qrParsed.service ? { name: qrParsed.service, price: null } : null,
      };
      setCustomAmount("");
      setDiscountAmount("");
      setSelectedAppointment(tempAppointment);
      setShowReceipt(false);
      setScannerOpen(false);
      await stopScanner();
      toast({
        title: "⚠️ الموعد ليس في قائمة اليوم",
        description: `${qrParsed.name} — ${qrParsed.code} — يمكنك تسجيل الدفع`,
        duration: 5000,
      });
    } else {
      toast({
        title: "❌ لم يتم العثور على الموعد",
        description: `الكود: ${candidates[0] || rawText.slice(0, 30)}`,
        variant: "destructive", duration: 5000,
      });
    }
  }, [clinic]);

  const initCamera = async () => {
    setScannerStatus("loading");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("🌐 متصفحك لا يدعم الكاميرا."); setScannerStatus("error"); return;
    }
    const cleanup = () => {
      if (scannerRef.current) { try { scannerRef.current.clear(); } catch (_) {} scannerRef.current = null; }
      const el = document.getElementById(QR_ELEMENT_ID);
      if (el) el.innerHTML = "";
    };
    const tryFacing = async (facingMode: "environment" | "user") => {
      cleanup();
      const s = new Html5Qrcode(QR_ELEMENT_ID, { verbose: false });
      scannerRef.current = s;
      await s.start({ facingMode },
        { fps: 10, qrbox: (w: number, h: number) => ({ width: Math.floor(Math.min(w, h) * 0.7), height: Math.floor(Math.min(w, h) * 0.7) }), aspectRatio: 1.0 },
        (text) => { stopScanner().then(() => handleScannedCode(text)); }, () => {}
      );
    };
    try { await tryFacing("environment"); setScannerStatus("active"); return; }
    catch (e1: any) {
      cleanup();
      if (e1?.message?.includes("NotAllowedError") || e1?.message?.includes("Permission")) {
        setCameraError(getFriendlyError(e1)); setScannerStatus("error"); return;
      }
    }
    try { await tryFacing("user"); setScannerStatus("active"); return; }
    catch { cleanup(); }
    try {
      cleanup();
      const cams = await Html5Qrcode.getCameras();
      if (!cams?.length) throw new Error("No cameras");
      const s = new Html5Qrcode(QR_ELEMENT_ID, { verbose: false });
      scannerRef.current = s;
      await s.start(cams[0].id, { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => { stopScanner().then(() => handleScannedCode(text)); }, () => {}
      );
      setScannerStatus("active");
    } catch (e3: any) { cleanup(); setCameraError(getFriendlyError(e3)); setScannerStatus("error"); }
  };

  const startScanner = useCallback(async () => {
    await destroyScanner();
    setCameraError(null); setScannerStatus("loading");
    setScannerOpen(true); setShouldStartCamera(true);
  }, []);

  const stopScanner = useCallback(async () => {
    setShouldStartCamera(false);
    await destroyScanner();
    setScannerOpen(false); setScannerStatus("idle"); setCameraError(null);
  }, []);

  const retryScanner = useCallback(async () => {
    await destroyScanner();
    setCameraError(null);
    const el = document.getElementById(QR_ELEMENT_ID);
    if (el) el.innerHTML = "";
    await initCamera();
  }, []);

  const scanImageWithJsQR = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          let { width: w, height: h } = img;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
            else { w = Math.round((w * MAX) / h); h = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas")); return; }
          ctx.drawImage(img, 0, 0, w, h);
          const d1 = ctx.getImageData(0, 0, w, h);
          const r1 = jsQR(d1.data, d1.width, d1.height, { inversionAttempts: "attemptBoth" });
          if (r1) { resolve(r1.data); return; }
          const d2 = ctx.getImageData(0, 0, w, h);
          for (let i = 0; i < d2.data.length; i += 4) {
            const v = ((d2.data[i] + d2.data[i + 1] + d2.data[i + 2]) / 3) > 128 ? 255 : 0;
            d2.data[i] = v; d2.data[i + 1] = v; d2.data[i + 2] = v;
          }
          ctx.putImageData(d2, 0, 0);
          const r2 = jsQR(d2.data, d2.width, d2.height, { inversionAttempts: "attemptBoth" });
          if (r2) { resolve(r2.data); return; }
          reject(new Error("NO_QR_FOUND"));
        };
        img.onerror = () => reject(new Error("IMAGE_LOAD_ERROR"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("FILE_READ_ERROR"));
      reader.readAsDataURL(file);
    });
  };

  const handleImageFile = useCallback(async (file: File) => {
    if (!file || !file.type.startsWith("image/")) { toast({ title: "نوع ملف غير صحيح", variant: "destructive" }); return; }
    setImageScanning(true);
    try {
      const decoded = await scanImageWithJsQR(file);
      setImageScanning(false);
      if (scannerOpen) await stopScanner();
      handleScannedCode(decoded);
    } catch {
      setImageScanning(false);
      toast({ title: "❌ لم يتم العثور على QR", description: "تأكد من وضوح الكود.", variant: "destructive", duration: 5000 });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [scannerOpen, handleScannedCode]);

  const unlock = () => {
    if (pin === (clinic?.cashier_pin || "5678")) setUnlocked(true);
    else toast({ title: "رمز غير صحيح", variant: "destructive" });
  };

  const handlePayNow = async () => {
    if (!selectedAppointment || !clinic) return;
    setProcessingPayment(true);
    const gross = parseFloat(customAmount) || selectedAppointment.services?.price || 0;
    const disc = parseFloat(discountAmount) || 0;
    const finalAmt = Math.max(0, gross - disc);
    const newCode = generateReceiptCode();

    // لا نحدّث DB للمواعيد المؤقتة (temp-)
    if (!selectedAppointment.id.startsWith("temp-")) {
      const { error } = await supabase.from("appointments")
        .update({ payment_status: "paid", paid_amount: finalAmt, discount_amount: disc, status: "confirmed", department: "صندوق" })
        .eq("id", selectedAppointment.id).eq("clinic_id", clinic.id);
      if (error) {
        toast({ title: "خطأ", description: "فشل تحديث حالة الدفع", variant: "destructive" });
        setProcessingPayment(false); return;
      }
    }

    const qrData = await generatePaymentQR(newCode);
    setReceiptCode(newCode);
    setReceiptQRData(qrData);
    setSelectedAppointment({ ...selectedAppointment, payment_status: "paid", paid_amount: finalAmt, discount_amount: disc });
    setShowReceipt(true);
    setProcessingPayment(false);
    fetchAppointments();
    toast({ title: "✅ تم تسجيل الدفع وإصدار السند" });
  };

  const addWalkIn = async () => {
    if (!clinic || !patientName.trim()) return;
    const { data: patient, error: pErr } = await supabase.from("patients")
      .insert({ clinic_id: clinic.id, name: patientName.trim(), phone: patientPhone.trim() || "بدون هاتف" })
      .select("id").single();
    if (pErr || !patient) { toast({ title: "خطأ", description: "فشل إضافة المريض", variant: "destructive" }); return; }
    const code = `WI-${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await supabase.from("appointments").insert({
      clinic_id: clinic.id, patient_id: patient.id, date: today,
      time: format(new Date(), "HH:mm"), status: "confirmed",
      reservation_code: code, arrived_at: new Date().toISOString(),
      payment_status: "unpaid", is_walk_in: true, department: "صندوق",
    });
    if (error) toast({ title: "خطأ", description: "فشل الإضافة", variant: "destructive" });
    else {
      toast({ title: "تمت الإضافة", description: code });
      setWalkInOpen(false); setPatientName(""); setPatientPhone(""); fetchAppointments();
    }
  };

  const addExpense = async () => {
    if (!clinic || !expenseDesc.trim() || !expenseAmount) return;
    const { error } = await supabase.from("expenses").insert({
      clinic_id: clinic.id, description: expenseDesc.trim(),
      amount: parseFloat(expenseAmount), category: expenseCategory,
      date: today, created_at: new Date().toISOString(),
    });
    if (error) toast({ title: "خطأ", description: "فشل إضافة المصروف", variant: "destructive" });
    else {
      toast({ title: "✅ تم تسجيل المصروف" });
      setExpenseOpen(false); setExpenseDesc(""); setExpenseAmount(""); setExpenseCategory("عام");
      fetchExpenses();
    }
  };

  const generateReceiptImage = async (): Promise<string> => {
    const element = document.getElementById("receipt-card-pro");
    if (!element) throw new Error("عنصر السند غير متوفر");
    const canvas = await html2canvas(element, { scale: 4, useCORS: true, backgroundColor: "#ffffff", logging: false });
    return canvas.toDataURL("image/png");
  };

  const downloadReceipt = async () => {
    try {
      const imgData = await generateReceiptImage();
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `سند_${receiptCode}.png`;
      link.click();
    } catch { toast({ title: "خطأ", description: "تعذر تنزيل السند", variant: "destructive" }); }
  };

  const printReceipt = async () => {
    try {
      const imgData = await generateReceiptImage();
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`<html><head><title>طباعة السند</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f4f4f5;"><img src="${imgData}" style="max-width:100%;height:auto;" onload="window.print();window.close();" /></body></html>`);
        win.document.close();
      }
    } catch { toast({ title: "خطأ", description: "تعذر الطباعة", variant: "destructive" }); }
  };

  // ══════════════════════════════════════════════
  // واتساب - يستخدم رقم الهاتف من QR (وليس tg:)
  // ══════════════════════════════════════════════
  const sendViaWhatsApp = async () => {
    if (!selectedAppointment) return;
    const rawPhone = selectedAppointment.patients?.phone || "";
    const patName = selectedAppointment.patients?.name || "المريض";

    if (isTelegramId(rawPhone)) {
      toast({
        title: "❌ لا يوجد رقم هاتف واتساب",
        description: "الرقم المسجل هو معرف تليجرام. يرجى مسح بطاقة الحجز لاستخراج الرقم الصحيح.",
        variant: "destructive", duration: 7000,
      });
      return;
    }

    setSendingReceipt(true);
    try {
      const imgData = await generateReceiptImage();
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `سند_${receiptCode}.png`;
      link.click();

      const digits = rawPhone.replace(/\D/g, "");
      let waPhone = digits;
      if (digits.startsWith("00")) waPhone = digits.slice(2);
      else if (digits.startsWith("0")) waPhone = "967" + digits.slice(1);
      else if (!digits.startsWith("967")) waPhone = "967" + digits;

      const amt = selectedAppointment.paid_amount ?? selectedAppointment.services?.price ?? 0;
      const disc = selectedAppointment.discount_amount || 0;
      const msg = encodeURIComponent(
        `🧾 سند دفع رسمي\n` +
        `🏥 ${clinic?.name || "العيادة"}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `👤 المريض: ${patName}\n` +
        `📋 رقم السند: ${receiptCode}\n` +
        `🔖 كود الحجز: ${selectedAppointment.reservation_code}\n` +
        `💊 الخدمة: ${selectedAppointment.services?.name || "—"}\n` +
        (disc > 0 ? `🏷️ الخصم: ${disc} ر.ي\n` : "") +
        `💰 المبلغ المدفوع: ${amt} ر.ي\n` +
        `📅 التاريخ: ${format(new Date(), "yyyy/MM/dd")}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `✅ تم الدفع بنجاح — يُرفق صورة السند`
      );
      setTimeout(() => { window.open(`https://wa.me/${waPhone}?text=${msg}`, "_blank"); }, 700);
      toast({ title: "✅ تم تنزيل السند وفتح واتساب" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setSendingReceipt(false); }
  };

  const sendViaTelegram = async () => {
    if (!selectedAppointment) return;
    const tgId = selectedAppointment.patients?.telegram_user_id;
    if (!tgId) {
      toast({ title: "❌ لا يوجد حساب تيليجرام", description: "استخدم واتساب بدلاً.", variant: "destructive" });
      return;
    }
    setSendingReceipt(true);
    try {
      const { data } = await supabase.from("global_settings").select("telegram_bot_token").limit(1).maybeSingle();
      const botToken = data?.telegram_bot_token;
      if (!botToken) { toast({ title: "خطأ", description: "توكن التليجرام غير مضبوط", variant: "destructive" }); return; }
      const imgData = await generateReceiptImage();
      const arr = imgData.split(",");
      const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const blob = new Blob([u8arr], { type: mime });
      const amt = selectedAppointment.paid_amount ?? selectedAppointment.services?.price ?? 0;
      const formData = new FormData();
      formData.append("chat_id", tgId);
      formData.append("photo", blob, `${receiptCode}.png`);
      formData.append("caption",
        `🧾 *سند دفع رسمي*\n🏥 ${clinic?.name || "العيادة"}\n\n` +
        `👤 *${selectedAppointment.patients?.name}*\n` +
        `📋 السند: \`${receiptCode}\`\n💰 *${amt} ر.ي* ✅`
      );
      formData.append("parse_mode", "Markdown");
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: "POST", body: formData });
      const result = await res.json();
      if (result.ok) toast({ title: "🚀 تم الإرسال عبر تيليجرام" });
      else toast({ title: "فشل الإرسال", description: result.description, variant: "destructive" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setSendingReceipt(false); }
  };

  const filtered = useMemo(() => appointments.filter((a) => {
    const matchesSearch =
      a.reservation_code.toLowerCase().includes(search.toLowerCase()) ||
      a.patients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.patients?.phone?.includes(search);
    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return !["cancelled"].includes(a.status);
    if (statusFilter === "paid") return a.payment_status === "paid";
    if (statusFilter === "unpaid") return a.payment_status !== "paid" && a.status !== "cancelled";
    if (statusFilter === "arrived") return !!a.arrived_at;
    if (statusFilter === "waiting") return !a.arrived_at && a.status !== "cancelled";
    if (statusFilter === "cancelled") return a.status === "cancelled";
    return true;
  }), [appointments, search, statusFilter]);

  const gross = parseFloat(customAmount) || 0;
  const disc = parseFloat(discountAmount) || 0;
  const netAmount = Math.max(0, gross - disc);
  const finalPaidAmount = selectedAppointment?.paid_amount ?? selectedAppointment?.services?.price ?? 0;
  const finalDiscount = selectedAppointment?.discount_amount || 0;

  if (authLoading || clinicLoading)
    return <div className="min-h-screen bg-mesh flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  if (clinicError)
    return <div className="min-h-screen bg-mesh flex items-center justify-center p-4"><div className="card-modern p-6 max-w-md text-center text-destructive font-bold">{clinicError}</div></div>;
  if (isTrialExpired && role !== "owner")
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
        <div className="card-modern p-8 max-w-md text-center space-y-4">
          <div className="text-3xl">⛔</div>
          <h1 className="text-xl font-black">لا يمكن الدخول</h1>
          <p className="text-sm text-muted-foreground">العيادة منتهية الاشتراك.</p>
          <Button onClick={signOut} className="w-full">تسجيل الخروج</Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }} />

      {/* ══ مودال الماسح ══ */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold">مسح QR Code</h3>
              <button onClick={stopScanner} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="relative mx-5 rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "1/1" }}>
              <div id={QR_ELEMENT_ID} className="w-full h-full" />
              {scannerStatus === "loading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
                  <Loader2 className="w-10 h-10 animate-spin text-white mb-3" />
                  <p className="text-white text-sm">جاري تشغيل الكاميرا...</p>
                </div>
              )}
              {scannerStatus === "active" && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className="relative w-48 h-48">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary animate-bounce" style={{ animationDuration: "1.5s" }} />
                  </div>
                </div>
              )}
              {scannerStatus === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-5 text-center z-10">
                  <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
                  <p className="text-white text-sm mb-4">{cameraError}</p>
                  <Button onClick={retryScanner} className="bg-primary text-white px-6" size="sm">إعادة المحاولة</Button>
                </div>
              )}
            </div>
            {scannerStatus === "active" && <p className="text-xs text-center text-muted-foreground px-5 pt-3">وجّه الكاميرا نحو QR بطاقة الحجز</p>}
            <div className="px-5 pt-3 pb-2">
              <Button variant="outline" className="w-full flex items-center gap-2 border-dashed" onClick={() => fileInputRef.current?.click()} disabled={imageScanning}>
                {imageScanning ? <><Loader2 className="w-4 h-4 animate-spin" /><span>جاري قراءة الصورة...</span></> : <><ImagePlus className="w-4 h-4" /><span>اختر لقطة شاشة من المعرض</span></>}
              </Button>
            </div>
            <div className="flex gap-3 px-5 pb-5 pt-2">
              <Button variant="outline" className="flex-1" onClick={stopScanner}>إغلاق</Button>
              {scannerStatus === "error" && <Button className="flex-1" onClick={retryScanner}>إعادة المحاولة</Button>}
            </div>
          </div>
        </div>
      )}

      {/* ══ PIN ══ */}
      {!unlocked && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="card-modern p-8 w-full max-w-sm text-center space-y-5">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-black">بوابة الصندوق</h1>
            <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()} placeholder="رمز PIN" className="text-center text-xl tracking-widest" />
            <Button onClick={unlock} className="w-full">دخول</Button>
          </div>
        </div>
      )}

      {/* ══ الهيدر ══ */}
      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4 h-18 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow"><Stethoscope className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-xl font-bold">الصندوق</h1><p className="text-xs text-muted-foreground">تحصيل مواعيد اليوم</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={startScanner} title="مسح QR"><Camera className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={imageScanning} title="صورة QR">
              {imageScanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/reception")}><Users className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      {/* ══ التبويبات ══ */}
      <div className="container mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit">
          {[
            { key: "appointments", label: "المواعيد", icon: Receipt },
            { key: "stats", label: "الإحصائيات", icon: BarChart2 },
            { key: "expenses", label: "المصروفات", icon: TrendingDown },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <tab.icon className="w-4 h-4" />{tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-4 space-y-5">

        {/* ─── تبويب المواعيد ─── */}
        {activeTab === "appointments" && (
          <>
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو كود الحجز أو الهاتف" className="pr-10" />
              </div>
              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-40">
                <option value="active">النشطة</option>
                <option value="all">الكل</option>
                <option value="paid">مدفوع</option>
                <option value="unpaid">بانتظار الدفع</option>
                <option value="arrived">حاضر</option>
                <option value="waiting">لم يصل</option>
                <option value="cancelled">ملغي</option>
              </select>
              <Button onClick={() => setWalkInOpen(true)}><Plus className="w-4 h-4" />مريض مباشر</Button>
            </div>
            <div className="grid gap-3">
              {filtered.map((a) => {
                const isPaid = a.payment_status === "paid";
                const isArrived = !!a.arrived_at;
                return (
                  <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold text-sm">{a.reservation_code}</code>
                        <span className="text-sm text-muted-foreground"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                        {a.is_walk_in && <span className="px-2 py-0.5 rounded-lg text-xs bg-purple-500/15 text-purple-600 font-bold">مباشر</span>}
                        {isArrived
                          ? <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">وصل</span>
                          : <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">لم يصل</span>}
                        {isPaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">مدفوع</span>}
                      </div>
                      <h2 className="font-bold text-foreground">{a.patients?.name || "مريض"}</h2>
                      <p className="text-sm text-muted-foreground">
                        {isTelegramId(a.patients?.phone)
                          ? <span className="text-amber-500 text-xs">⚠️ رقم تليجرام — امسح QR للرقم الصحيح</span>
                          : a.patients?.phone || "بدون هاتف"
                        } — {a.services?.name || "بدون خدمة"} — <b>{a.services?.price == null ? "حسب الفحص" : `${a.services.price} ر.ي`}</b>
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {!isArrived ? (
                        <>
                          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markArrived(a.id)}><CheckCircle className="w-4 h-4" />وصل</Button>
                          <Button variant="destructive" onClick={() => markNoShow(a.id)}>لم يصل</Button>
                        </>
                      ) : isPaid ? (
                        <Button variant="outline" className="text-emerald-600 border-emerald-500/30" onClick={() => { setSelectedAppointment(a); setShowReceipt(true); }}>
                          <CheckCircle className="w-4 h-4 ml-1" />عرض الفاتورة
                        </Button>
                      ) : (
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
                          setCustomAmount(String(a.services?.price || ""));
                          setDiscountAmount("");
                          setSelectedAppointment(a); setShowReceipt(false);
                        }}>
                          <Banknote className="w-4 h-4 ml-1" />تسجيل الدفع
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="card-modern p-12 text-center text-muted-foreground">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3" />لا توجد مواعيد نشطة اليوم
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "stats" && <CashierStats appointments={appointments} expenses={expenses} />}

        {activeTab === "expenses" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">مصروفات اليوم</h2>
              <Button onClick={() => setExpenseOpen(true)}><Plus className="w-4 h-4" />إضافة مصروف</Button>
            </div>
            <div className="grid gap-3">
              {expenses.map((e) => (
                <div key={e.id} className="card-modern p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground">{e.description}</p>
                    <p className="text-xs text-muted-foreground">{e.category} — {format(new Date(e.created_at), "hh:mm a")}</p>
                  </div>
                  <span className="font-black text-destructive text-lg">{e.amount.toLocaleString()} ر.ي</span>
                </div>
              ))}
              {expenses.length === 0 && (
                <div className="card-modern p-12 text-center text-muted-foreground">
                  <TrendingDown className="w-10 h-10 mx-auto mb-3" />لا توجد مصروفات مسجلة اليوم
                </div>
              )}
            </div>
            {expenses.length > 0 && (
              <div className="card-modern p-4 flex justify-between items-center">
                <span className="font-bold">إجمالي المصروفات</span>
                <span className="font-black text-destructive text-xl">{expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()} ر.ي</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══ مودال مريض مباشر ══ */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إضافة مريض مباشر</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="اسم المريض *" />
            <Input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="الهاتف (اختياري)" />
            <Button onClick={addWalkIn} className="w-full" disabled={!patientName.trim()}><UserPlus className="w-4 h-4" />إضافة</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ مودال إضافة مصروف ══ */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>تسجيل مصروف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} placeholder="وصف المصروف *" />
            <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="المبلغ (ر.ي) *" />
            <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              {["عام","رواتب","مستلزمات","صيانة","كهرباء","أدوية","تسويق","إيجار"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Button onClick={addExpense} className="w-full" disabled={!expenseDesc.trim() || !expenseAmount}><Plus className="w-4 h-4" />تسجيل</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ مودال الدفع والسند ══ */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-3xl max-w-md w-full shadow-2xl p-6 relative border border-border my-8">
            <button onClick={() => { setSelectedAppointment(null); setShowReceipt(false); setCustomAmount(""); setDiscountAmount(""); setReceiptCode(""); setReceiptQRData(""); }}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted hover:bg-muted/80 transition">
              <X className="w-5 h-5" />
            </button>

            {/* ── نافذة تأكيد الدفع ── */}
            {!showReceipt ? (
              <div className="space-y-5 pt-2">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                    <Banknote className="w-7 h-7 text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-bold">تأكيد تحصيل المبلغ</h2>
                  <p className="text-xs text-muted-foreground mt-1">يمكنك إدخال المبلغ المدفوع والخصم</p>
                </div>

                <div className="card-modern p-4 bg-muted/40 space-y-2.5 text-sm">
                  {/* اسم المريض من QR */}
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">اسم المريض</span>
                    <span className="font-bold text-foreground">{selectedAppointment.patients?.name}</span>
                  </div>
                  {/* الهاتف من QR مع تحذير إذا كان tg: */}
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">الهاتف</span>
                    {isTelegramId(selectedAppointment.patients?.phone) ? (
                      <span className="text-amber-500 text-xs font-medium">⚠️ رقم تليجرام — واتساب غير متاح</span>
                    ) : (
                      <span className="font-medium text-foreground">{selectedAppointment.patients?.phone}</span>
                    )}
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">كود الحجز</span>
                    <span className="font-mono font-bold text-primary">{selectedAppointment.reservation_code}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">الخدمة المطلوبة</span>
                    <span className="font-medium text-foreground">{selectedAppointment.services?.name || "—"}</span>
                  </div>

                  {/* المبلغ والخصم */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">المبلغ المستلم (ر.ي)</label>
                      <Input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder={String(selectedAppointment.services?.price || 0)}
                        className="text-center text-lg font-bold h-11 border-emerald-500/50" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">الخصم (ر.ي)</label>
                      <Input type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)}
                        placeholder="0"
                        className="text-center text-lg font-bold h-11 border-red-400/40" />
                    </div>
                  </div>

                  {/* الصافي */}
                  <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200/50 mt-1">
                    <span className="font-bold text-emerald-900 dark:text-emerald-300">الصافي المطلوب</span>
                    <span className="font-black text-emerald-700 text-xl">{netAmount.toLocaleString()} <span className="text-xs font-normal">ريال</span></span>
                  </div>
                </div>

                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base font-bold"
                  onClick={handlePayNow} disabled={processingPayment || !customAmount}>
                  {processingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5 ml-1" />}
                  تأكيد الدفع وإصدار السند
                </Button>
              </div>
            ) : (
              /* ── السند الاحترافي ── */
              <div className="space-y-4 pt-1">
                <div className="text-center">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-1.5 rounded-full border border-emerald-200">
                    <CheckCircle className="w-4 h-4" /> تم الدفع والسداد بنجاح
                  </span>
                </div>

                {/* ═══ السند - يُصوَّر كصورة ═══ */}
                <div
                  id="receipt-card-pro"
                  style={{
                    direction: "rtl",
                    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
                    background: "#ffffff",
                    width: "360px",
                    margin: "0 auto",
                    borderRadius: "20px",
                    overflow: "hidden",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {/* الشريط العلوي مع شعار العيادة */}
                  <div style={{
                    background: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%)",
                    padding: "18px 20px 16px",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}>
                    <div style={{
                      width: "46px", height: "46px",
                      background: "rgba(255,255,255,0.2)",
                      borderRadius: "12px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                      border: "1.5px solid rgba(255,255,255,0.3)",
                      fontSize: "22px",
                    }}>
                      {(clinic as any)?.logo_url
                        ? <img src={(clinic as any).logo_url} alt="logo" style={{ width: "34px", height: "34px", borderRadius: "8px", objectFit: "cover" }} />
                        : "🏥"
                      }
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "8px", opacity: 0.8, margin: "0 0 2px", letterSpacing: "1.5px" }}>OFFICIAL PAYMENT RECEIPT</p>
                      <h2 style={{ fontSize: "16px", fontWeight: 900, margin: 0, lineHeight: 1.2 }}>{clinic?.name || "العيادة الطبية"}</h2>
                      <p style={{ fontSize: "9px", opacity: 0.85, margin: "2px 0 0" }}>سند استلام مبلغ رسمي — مدفوع ومعتمد ✓</p>
                    </div>
                    <div style={{
                      background: "rgba(255,255,255,0.2)",
                      borderRadius: "10px",
                      padding: "5px 9px",
                      textAlign: "center",
                      border: "1px solid rgba(255,255,255,0.25)",
                      flexShrink: 0,
                    }}>
                      <p style={{ fontSize: "7px", opacity: 0.9, margin: 0 }}>رقم السند</p>
                      <p style={{ fontSize: "9px", fontWeight: 800, margin: "2px 0 0" }}>{receiptCode}</p>
                    </div>
                  </div>

                  {/* جسم السند */}
                  <div style={{ padding: "16px 20px" }}>
                    {/* بيانات المريض من QR */}
                    <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "12px 14px", marginBottom: "14px", border: "1px solid #e2e8f0" }}>
                      <p style={{ fontSize: "8px", color: "#6b7280", marginBottom: "8px", letterSpacing: "1px", fontWeight: 700 }}>بيانات المريض</p>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span style={{ fontSize: "10px", color: "#6b7280" }}>الاسم (الصريح)</span>
                        {/* الاسم من QR */}
                        <span style={{ fontSize: "13px", fontWeight: 800, color: "#111827" }}>{selectedAppointment.patients?.name}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span style={{ fontSize: "10px", color: "#6b7280" }}>رقم الهاتف</span>
                        {/* الهاتف من QR */}
                        <span style={{ fontSize: "11px", color: "#374151" }}>
                          {isTelegramId(selectedAppointment.patients?.phone)
                            ? "غير مسجل"
                            : selectedAppointment.patients?.phone}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "10px", color: "#6b7280" }}>كود الحجز</span>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#7c3aed", fontFamily: "monospace" }}>{selectedAppointment.reservation_code}</span>
                      </div>
                    </div>

                    {/* تفاصيل الخدمة */}
                    <div style={{ marginBottom: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #e5e7eb" }}>
                        <span style={{ fontSize: "10px", color: "#6b7280" }}>الخدمة المقدمة</span>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "#111827" }}>{selectedAppointment.services?.name || "—"}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #e5e7eb" }}>
                        <span style={{ fontSize: "10px", color: "#6b7280" }}>تاريخ ووقت السداد</span>
                        <span style={{ fontSize: "10px", color: "#374151" }}>{format(new Date(), "yyyy/MM/dd — hh:mm a")}</span>
                      </div>
                      {finalDiscount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #e5e7eb" }}>
                          <span style={{ fontSize: "10px", color: "#ef4444" }}>الخصم الممنوح</span>
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "#ef4444" }}>- {finalDiscount} ر.ي</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                        <span style={{ fontSize: "10px", color: "#6b7280" }}>طريقة الدفع</span>
                        <span style={{ fontSize: "10px", color: "#374151" }}>نقداً 💵</span>
                      </div>
                    </div>

                    {/* المبلغ */}
                    <div style={{ background: "linear-gradient(135deg, #ecfdf5, #f0fdfa)", border: "1.5px solid #6ee7b7", borderRadius: "14px", padding: "14px", textAlign: "center", marginBottom: "14px" }}>
                      <p style={{ fontSize: "9px", color: "#065f46", fontWeight: 600, marginBottom: "5px", letterSpacing: "0.5px" }}>المبلغ الإجمالي المدفوع</p>
                      <p style={{ fontSize: "34px", fontWeight: 900, color: "#059669", margin: 0, lineHeight: 1 }}>
                        {finalPaidAmount.toLocaleString()}
                        <span style={{ fontSize: "12px", fontWeight: 400, marginRight: "4px" }}>ر.ي</span>
                      </p>
                    </div>

                    {/* QR التحقق */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #f3f4f6" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
                          <div style={{ width: "7px", height: "7px", background: "#10b981", borderRadius: "50%" }} />
                          <span style={{ fontSize: "9px", color: "#059669", fontWeight: 700 }}>مدفوع ومعتمد إلكترونياً ✓</span>
                        </div>
                        <p style={{ fontSize: "8px", color: "#9ca3af", margin: 0 }}>رمز إثبات صحة السند المالي:</p>
                        <p style={{ fontSize: "7px", color: "#9ca3af", margin: "2px 0 0", fontFamily: "monospace" }}>
                          PAY-VERIFIED|{selectedAppointment.reservation_code}|{finalPaidAmount}YR
                        </p>
                      </div>
                      {receiptQRData && (
                        <img src={receiptQRData} alt="QR" style={{ width: "65px", height: "65px", borderRadius: "8px" }} />
                      )}
                    </div>
                  </div>

                  {/* تذييل السند - معتمد من النظام */}
                  <div style={{ background: "#f9fafb", padding: "8px 20px", borderTop: "1px solid #f3f4f6", textAlign: "center" }}>
                    <p style={{ fontSize: "8px", color: "#9ca3af", margin: 0 }}>
                      معتمد إلكترونياً عبر صندوق الخزينة — جميع الحقوق محفوظة
                    </p>
                  </div>
                </div>
                {/* ═══════════════════════════════════════ */}

                {/* أزرار الإجراءات */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={downloadReceipt}>
                    <Download className="w-3.5 h-3.5" />تنزيل
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={printReceipt}>
                    <Printer className="w-3.5 h-3.5" />طباعة
                  </Button>
                  <Button size="sm" className="gap-1.5 text-xs bg-[#25D366] hover:bg-[#20c05c] text-white" onClick={sendViaWhatsApp} disabled={sendingReceipt}>
                    {sendingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    واتساب
                  </Button>
                </div>

                {/* إعلان النظام الاحترافي */}
                <div className="mt-2 pt-3 border-t border-border/30">
                  <div className="flex items-center gap-2.5 py-2 px-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Stethoscope className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-tight">Smart Clinic System</p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">نظام إدارة العيادات الذكي</p>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <p className="text-[8px] text-slate-400 leading-tight">alkhyatalkhyat79</p>
                      <p className="text-[8px] text-slate-400 leading-tight">@gmail.com</p>
                    </div>
                  </div>
                </div>

                <Button variant="ghost" className="w-full text-sm mt-1" onClick={() => { setSelectedAppointment(null); setShowReceipt(false); setCustomAmount(""); setDiscountAmount(""); setReceiptCode(""); setReceiptQRData(""); }}>
                  إغلاق النافذة
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

// ══════════════════════════════════════════════
// CashierStats
// ══════════════════════════════════════════════
function CashierStats({ appointments, expenses }: { appointments: Appointment[]; expenses: Expense[] }) {
  const paid = appointments.filter((a) => a.payment_status === "paid");
  const waiting = appointments.filter((a) => !!a.arrived_at && a.payment_status !== "paid" && a.status !== "cancelled");
  const cancelled = appointments.filter((a) => a.status === "cancelled");
  const amountFor = (a: Appointment) => typeof a.paid_amount === "number" ? a.paid_amount : (a.services?.price || 0);
  const totalRevenue = paid.reduce((s, a) => s + amountFor(a), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const avgTicket = paid.length ? Math.round(totalRevenue / paid.length) : 0;

  const hourlyRevenue = useMemo(() => {
    const b: Record<number, number> = {};
    for (let h = 8; h <= 20; h++) b[h] = 0;
    paid.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!isNaN(h) && b[h] !== undefined) b[h] += amountFor(a);
    });
    return Object.entries(b).map(([h, v]) => ({ hour: `${h}`, amount: v }));
  }, [paid]);

  const byService = useMemo(() => {
    const map: Record<string, { count: number; amount: number }> = {};
    paid.forEach((a) => {
      const k = a.services?.name || "بدون خدمة";
      if (!map[k]) map[k] = { count: 0, amount: 0 };
      map[k].count++; map[k].amount += amountFor(a);
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v }));
  }, [paid]);

  const byExpenseCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const summaryData = [
    { name: "إيرادات", value: totalRevenue },
    { name: "مصروفات", value: totalExpenses },
    { name: "صافي", value: Math.max(0, netProfit) },
  ];

  const COLORS = ["#059669", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

  const kpis = [
    { label: "إجمالي الإيرادات", value: `${totalRevenue.toLocaleString()} ر.ي`, icon: DollarSign, tint: "from-emerald-500/20 to-emerald-500/5", iconClass: "text-emerald-500", sub: `${paid.length} فاتورة` },
    { label: "صافي الربح", value: `${netProfit.toLocaleString()} ر.ي`, icon: TrendingUp, tint: netProfit >= 0 ? "from-primary/20 to-primary/5" : "from-destructive/20 to-destructive/5", iconClass: netProfit >= 0 ? "text-primary" : "text-destructive", sub: "بعد المصروفات" },
    { label: "إجمالي المصروفات", value: `${totalExpenses.toLocaleString()} ر.ي`, icon: TrendingDown, tint: "from-red-500/20 to-red-500/5", iconClass: "text-red-500", sub: `${expenses.length} بند` },
    { label: "متوسط الفاتورة", value: `${avgTicket.toLocaleString()} ر.ي`, icon: Receipt, tint: "from-violet-500/20 to-violet-500/5", iconClass: "text-violet-500", sub: `من ${paid.length} مريض` },
    { label: "بانتظار الدفع", value: waiting.length, icon: Clock, tint: "from-amber-500/20 to-amber-500/5", iconClass: "text-amber-500", sub: "حاضر ولم يدفع" },
    { label: "ملغي / لم يصل", value: cancelled.length, icon: AlertCircle, tint: "from-gray-500/20 to-gray-500/5", iconClass: "text-gray-500", sub: "من الإجمالي" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`card-modern p-4 bg-gradient-to-br ${k.tint} border border-border/60`}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium truncate">{k.label}</p>
                <p className="text-xl font-black text-foreground mt-1">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-background/60 flex items-center justify-center backdrop-blur flex-shrink-0 ml-2">
                <k.icon className={`w-5 h-5 ${k.iconClass}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card-modern p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-primary" />
          <h3 className="font-bold">الملخص المالي اليومي</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "الإيرادات", value: totalRevenue, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "المصروفات", value: totalExpenses, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
            { label: "الصافي", value: netProfit, color: netProfit >= 0 ? "text-blue-600" : "text-red-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          ].map((item) => (
            <div key={item.label} className={`${item.bg} rounded-xl p-3 text-center`}>
              <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
              <p className={`text-lg font-black ${item.color}`}>{item.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">ر.ي</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold">الإيرادات حسب الساعة</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hourlyRevenue} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="amount" stroke="#059669" strokeWidth={2} fill="url(#revenueGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-primary" />
            <h3 className="font-bold">الإيرادات حسب الخدمة</h3>
          </div>
          {byService.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byService} dataKey="amount" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {byService.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
          )}
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-blue-500" />
            <h3 className="font-bold">الإيرادات مقابل المصروفات</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summaryData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {summaryData.map((_, i) => <Cell key={i} fill={i === 0 ? "#059669" : i === 1 ? "#ef4444" : "#3b82f6"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <h3 className="font-bold">المصروفات حسب الفئة</h3>
          </div>
          {byExpenseCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byExpenseCategory} dataKey="value" nameKey="name" innerRadius={40} outerRadius={75} paddingAngle={3}>
                  {byExpenseCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">لا توجد مصروفات</div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  Banknote, CheckCircle, LogOut, Search, Stethoscope, Users,
  Camera, X, Loader2, AlertCircle, Image as ImageIcon, Upload, RefreshCw, Printer, Download, Clock, Plus, UserPlus, DollarSign, TrendingUp, Receipt, MessageCircle, MinusCircle, Wallet, ArrowDownCircle, ArrowUpCircle, Sparkles, Send, FileText, Calendar, Filter, Trash2, CreditCard, PieChart as PieIcon
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Html5Qrcode } from "html5-qrcode";
import html2canvas from "html2canvas";

type Appointment = {
  id: string;
  patient_id?: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  arrived_at: string | null;
  payment_status: string;
  paid_amount?: number | null;
  discount_amount?: number | null;
  discount_applied?: number | null;
  discount_type?: string | null;
  is_walk_in: boolean;
  notes?: string | null;
  customer_telegram_id?: string | null;
  patients: { id?: string; name: string; phone: string; telegram_user_id?: string } | null;
  services: { name: string; price: number | null } | null;
  extracted_patient_name?: string;
  extracted_patient_phone?: string;
  is_promo?: boolean | null;
  promo_code?: string | null;
  promotion_id?: string | null;
  original_price?: number | null;
  final_price?: number | null;
  payment_method?: string | null;
  payment_time?: string | null;
  created_at?: string;
};

type Expense = {
  id: string;
  clinic_id?: string;
  title: string;
  amount: number;
  category: string;
  expense_date: string;
  expense_time: string;
  notes?: string | null;
};

type InvoiceItem = { name: string; qty: number; price: number };

type Invoice = {
  id: string;
  clinic_id: string;
  patient_id?: string | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  invoice_number: string;
  items: InvoiceItem[];
  subtotal: number;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  discount_amount: number;
  total_amount: number;
  paid_status: string;
  paid_amount?: number | null;
  payment_method?: string | null;
  notes?: string | null;
  created_at: string;
  paid_at?: string | null;
};

const QR_CAMERA_ELEMENT_ID = "qr-camera-container-cashier";
const QR_FILE_ELEMENT_ID = "qr-hidden-file-reader-cashier";

const parseQRText = (text: string) => {
  let code = "", name = "", phone = "", service = "", date = "", time = "";
  const codeMatch = text.match(/RE-[A-Za-z0-9]+/i) || text.match(/WI-[A-Za-z0-9]+/i);
  if (codeMatch) code = codeMatch[0];
  const nameMatch = text.match(/المريض:\s*([^\n\r]+)/);
  if (nameMatch) name = nameMatch[1].replace(/👤/g, "").replace(/@\w+/g, "").trim();
  const phoneMatch = text.match(/الهاتف:\s*([^\n\r]+)/);
  if (phoneMatch) phone = phoneMatch[1].replace(/📱/g, "").trim();
  const serviceMatch = text.match(/الخدمة:\s*([^\n\r]+)/);
  if (serviceMatch) service = serviceMatch[1].replace(/🏷️/g, "").trim();
  const dateMatch = text.match(/التاريخ:\s*([^\n\r]+)/);
  if (dateMatch) date = dateMatch[1].replace(/📅/g, "").trim();
  const timeMatch = text.match(/الوقت:\s*([^\n\r]+)/);
  if (timeMatch) time = timeMatch[1].replace(/⏰/g, "").trim();
  return { code, name, phone, service, date, time };
};

const cleanPhoneForWhatsApp = (phone?: string): string => {
  if (!phone || phone.startsWith("tg:") || phone.startsWith("TG:") || phone === "بدون هاتف" || phone === ".") return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  let waPhone = digits;
  if (digits.startsWith("00")) waPhone = digits.slice(2);
  else if (digits.startsWith("0")) waPhone = "967" + digits.slice(1);
  else if (!digits.startsWith("967") && digits.length === 9) waPhone = "967" + digits;
  return waPhone;
};

const extractCleanInfo = (a: Appointment) => {
  let name = a.patients?.name || a.extracted_patient_name || "";
  let phone = a.patients?.phone || a.extracted_patient_phone || "";

  const isGenericName = !name || name === "." || name.trim().toLowerCase() === "point" || name.startsWith("tg:") || name.includes("غير محدد");
  const isGenericPhone = !phone || phone.trim().toLowerCase().startsWith("tg:") || phone === "." || phone === "بدون هاتف";

  if ((isGenericName || isGenericPhone) && a.notes) {
    const nameMatch = a.notes.match(/المريض:\s*([^(–\n\r]+)/);
    if (nameMatch && nameMatch[1] && isGenericName) {
      name = nameMatch[1].replace(/👤/g, "").replace(/@\w+/g, "").trim();
    }
    const phoneMatch = a.notes.match(/\(([^)]+)\)/) || a.notes.match(/(?:الهاتف:\s*|📱\s*)([+\d\s-]+)/);
    if (phoneMatch && phoneMatch[1] && isGenericPhone) {
      const extractedP = phoneMatch[1].trim();
      if (!extractedP.startsWith("tg:")) phone = extractedP;
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

// ✏️ [V38.6] حساب الصافي بشكل صحيح (بدون طرح نسبة الخصم)
const computeNetAmount = (a: Appointment): number => {
  if (typeof a.paid_amount === "number" && a.paid_amount > 0) {
    return a.paid_amount;
  }
  if (typeof a.final_price === "number" && a.final_price > 0) {
    return a.final_price;
  }
  if (typeof a.services?.price === "number" && a.services.price > 0) {
    return a.services.price;
  }
  return 0;
};

// ✏️ [V38.6] تنسيق الخصم كنسبة أو مبلغ
const formatDiscount = (a: Appointment): string => {
  const val = a.discount_amount ?? 0;
  if (val <= 0) return "";
  const type = a.discount_type || (a.is_promo ? "percentage" : "fixed");
  return type === "percentage" ? `${val}%` : `${val}`;
};

export default function CashierPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();

  const [activeTab, setActiveTab] = useState<"main" | "invoices">("main");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");

  const [walkInOpen, setWalkInOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientPhoneInput, setPatientPhoneInput] = useState("");

  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("نثريات");
  const [expenseDate, setExpenseDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [expenseTime, setExpenseTime] = useState<string>(format(new Date(), "HH:mm"));

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const today = dateFilter;

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editPatientName, setEditPatientName] = useState<string>("");
  const [editPatientPhone, setEditPatientPhone] = useState<string>("");
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>("نقدي");
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);

  // ✏️ [V38.6] فلاتر الفواتير
  const [invoicesFrom, setInvoicesFrom] = useState<string>(todayStr);
  const [invoicesTo, setInvoicesTo] = useState<string>(todayStr);
  const [invoicesSearch, setInvoicesSearch] = useState<string>("");
  const [invoicesOnlyPromo, setInvoicesOnlyPromo] = useState<boolean>(false);
  const [invoicesLoading, setInvoicesLoading] = useState<boolean>(false);
  const [invoiceAppointments, setInvoiceAppointments] = useState<Appointment[]>([]);
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([]);

  // ✏️ [V38.6] نافذة إنشاء فاتورة
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [invPatientName, setInvPatientName] = useState("");
  const [invPatientPhone, setInvPatientPhone] = useState("");
  const [invItems, setInvItems] = useState<InvoiceItem[]>([{ name: "", qty: 1, price: 0 }]);
  const [invDiscountType, setInvDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [invDiscountValue, setInvDiscountValue] = useState<string>("0");
  const [invPaymentMethod, setInvPaymentMethod] = useState<string>("نقدي");
  const [invNotes, setInvNotes] = useState("");
  const [invSaving, setInvSaving] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (clinicLoading) return;
    if (role === "reception") navigate("/reception", { replace: true });
  }, [role, clinicLoading, navigate]);

  const fetchAppointments = useCallback(async () => {
    if (!clinic) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,discount_applied,discount_type,is_walk_in,notes,customer_telegram_id,is_promo,promo_code,promotion_id,original_price,final_price,payment_method,payment_time,created_at,patients(id,name,phone,telegram_user_id),services(name,price)")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  }, [clinic, today]);

  const fetchExpenses = useCallback(async () => {
    if (!clinic) return;
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("expense_date", today)
      .order("expense_time", { ascending: false });
    if (!error) setExpenses((data || []) as Expense[]);
  }, [clinic, today]);

  const fetchInvoices = useCallback(async () => {
    if (!clinic) return;
    setInvoicesLoading(true);
    try {
      const [apptRes, invRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,discount_applied,discount_type,is_walk_in,notes,customer_telegram_id,is_promo,promo_code,promotion_id,original_price,final_price,payment_method,payment_time,created_at,patients(id,name,phone,telegram_user_id),services(name,price)")
          .eq("clinic_id", clinic.id)
          .eq("payment_status", "paid")
          .gte("date", invoicesFrom)
          .lte("date", invoicesTo)
          .order("date", { ascending: false })
          .order("time", { ascending: false })
          .limit(500),
        supabase
          .from("invoices")
          .select("*")
          .eq("clinic_id", clinic.id)
          .gte("created_at", `${invoicesFrom}T00:00:00`)
          .lte("created_at", `${invoicesTo}T23:59:59`)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (apptRes.error) {
        console.error("❌ [INVOICES] appt fetch error:", apptRes.error);
      } else {
        setInvoiceAppointments((apptRes.data || []) as Appointment[]);
      }

      if (invRes.error) {
        console.error("❌ [INVOICES] inv fetch error:", invRes.error);
        setInvoicesList([]);
      } else {
        setInvoicesList((invRes.data || []) as Invoice[]);
      }
    } finally {
      setInvoicesLoading(false);
    }
  }, [clinic, invoicesFrom, invoicesTo]);

  useEffect(() => {
    if (!clinic) return;
    fetchAppointments();
    fetchExpenses();
    const channel = supabase
      .channel(`cashier-${clinic.id}-${today}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, fetchAppointments)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `clinic_id=eq.${clinic.id}` }, fetchExpenses)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, today, fetchAppointments, fetchExpenses]);

  useEffect(() => {
    if (activeTab === "invoices" && clinic) fetchInvoices();
  }, [activeTab, clinic, fetchInvoices]);

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

  const handleScannedCode = useCallback(async (rawText: string) => {
    const qrParsed = parseQRText(rawText);
    const targetCode = qrParsed.code || rawText.trim();

    let found: Appointment | undefined;
    const current = appointmentsRef.current;

    found = current.find(a =>
      a.id === targetCode ||
      a.reservation_code.toUpperCase() === targetCode.toUpperCase() ||
      rawText.toUpperCase().includes(a.reservation_code.toUpperCase())
    );

    if (!found && clinic && targetCode) {
      const { data } = await supabase
        .from("appointments")
        .select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,discount_applied,discount_type,is_walk_in,notes,customer_telegram_id,is_promo,promo_code,promotion_id,original_price,final_price,payment_method,payment_time,created_at,patients(id,name,phone,telegram_user_id),services(name,price)")
        .eq("clinic_id", clinic.id)
        .ilike("reservation_code", `%${targetCode}%`)
        .maybeSingle();
      if (data) found = data as Appointment;
    }

    if (found) {
      const { cleanName, cleanPhone } = extractCleanInfo(found);
      const enriched: Appointment = {
        ...found,
        extracted_patient_name: cleanName,
        extracted_patient_phone: cleanPhone,
        patients: {
          id: found.patients?.id,
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

      setSelectedAppointment(enriched);
      setEditPatientName(cleanName);
      setEditPatientPhone(cleanPhone === "حجز عبر تلجرام (بدون رقم)" ? "" : cleanPhone);

      const defaultPrice = enriched.final_price ?? enriched.services?.price ?? 0;
      const defaultDiscount = enriched.is_promo ? (enriched.discount_amount ?? 0) : 0;
      setPaidAmountInput(enriched.paid_amount != null ? String(enriched.paid_amount) : String(defaultPrice));
      setDiscountInput(enriched.discount_amount != null ? String(enriched.discount_amount) : String(defaultDiscount));
      setPaymentMethodInput(enriched.payment_method || "نقدي");
      setShowReceipt(enriched.payment_status === "paid");

      setScannerMessage(`✅ تم العثور على الحجز: ${cleanName}`);
      setTimeout(() => setScannerMessage(null), 3000);

      setScannerOpen(false);
      stopScanner();
    } else {
      setScannerMessage(`❌ لم يتم العثور على الموعد — الكود: ${targetCode}`);
      setTimeout(() => setScannerMessage(null), 4000);
      toast({
        title: "❌ لم يتم العثور على الموعد",
        description: `الكود المستخرج: ${targetCode}`,
        variant: "destructive",
      });
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
          { fps: 10, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.8), height: Math.floor(Math.min(w, h) * 0.8) }), aspectRatio: 1.0 },
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

  const openPaymentModal = (appointment: Appointment) => {
    const { cleanName, cleanPhone } = extractCleanInfo(appointment);
    const appEnriched = { ...appointment, extracted_patient_name: cleanName, extracted_patient_phone: cleanPhone };
    setSelectedAppointment(appEnriched);
    setEditPatientName(cleanName !== "مريض غير محدد" ? cleanName : "");
    setEditPatientPhone(cleanPhone === "حجز عبر تلجرام (بدون رقم)" ? "" : cleanPhone);
    const defaultPrice = appointment.final_price ?? appointment.services?.price ?? 0;
    const defaultDiscount = appointment.is_promo ? (appointment.discount_amount ?? 0) : 0;
    setPaidAmountInput(appointment.paid_amount != null ? String(appointment.paid_amount) : String(defaultPrice));
    setDiscountInput(appointment.discount_amount != null ? String(appointment.discount_amount) : String(defaultDiscount));
    setPaymentMethodInput(appointment.payment_method || "نقدي");
    setShowReceipt(appointment.payment_status === "paid");
  };

  const sendTelegramReceipt = async (appointment: Appointment, finalAmount: number) => {
    const tgUserId = appointment.customer_telegram_id || appointment.patients?.telegram_user_id;
    if (!tgUserId) return;
    setSendingTelegram(true);
    try {
      const canvas = await generateReceiptCanvas();
      const receiptImageBase64 = canvas.toDataURL("image/png");
      const { cleanName } = extractCleanInfo(appointment);
      const { data, error } = await supabase.functions.invoke("telegram-bot", {
        body: {
          action: "send_receipt",
          clinic_id: clinic?.id,
          chat_id: tgUserId,
          receipt_image: receiptImageBase64,
          reservation_code: appointment.reservation_code,
          patient_name: editPatientName || cleanName,
          service_name: appointment.services?.name || "فحص طبي",
          amount: finalAmount,
          clinic_name: clinic?.name || "العيادة الطبية",
        },
      });
      if (error) throw error;
      if (data?.ok) toast({ title: "✈️ تم إرسال السند تلقائياً للمريض عبر تلجرام" });
    } catch (err: any) {
      console.warn("[AUTO-RECEIPT] خطأ:", err?.message);
    } finally {
      setSendingTelegram(false);
    }
  };

  const handlePayNow = async () => {
    if (!selectedAppointment || !clinic) return;
    setProcessingPayment(true);

    const paidVal = parseFloat(paidAmountInput) || 0;
    const discountVal = parseFloat(discountInput) || 0;

    const patientId = selectedAppointment.patients?.id || selectedAppointment.patient_id;
    if (patientId && (editPatientName.trim() || editPatientPhone.trim())) {
      const updateData: any = {};
      if (editPatientName.trim()) updateData.name = editPatientName.trim();
      if (editPatientPhone.trim() && !editPatientPhone.startsWith("tg:")) updateData.phone = editPatientPhone.trim();
      await supabase.from("patients").update(updateData).eq("id", patientId);
    }

    const updatePayload: any = {
      payment_status: "paid",
      status: "confirmed",
      department: "صندوق",
      paid_amount: paidVal,
      discount_amount: discountVal,
      payment_method: paymentMethodInput,
      payment_time: new Date().toISOString(),
    };

    if (selectedAppointment.is_promo) {
      updatePayload.is_promo = true;
      updatePayload.promo_code = selectedAppointment.promo_code;
      updatePayload.promotion_id = selectedAppointment.promotion_id;
      updatePayload.original_price = selectedAppointment.original_price;
      updatePayload.final_price = selectedAppointment.final_price;
      updatePayload.discount_type = selectedAppointment.discount_type || "percentage";
    }

    const { error } = await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", selectedAppointment.id)
      .eq("clinic_id", clinic.id);

    if (error) {
      toast({ title: "خطأ", description: "فشل تحديث حالة الدفع", variant: "destructive" });
      setProcessingPayment(false);
      return;
    }

    toast({ title: "✅ تم تسجيل الدفع", description: "جاري إصدار السند وإرساله..." });

    const enrichedAppointment: Appointment = {
      ...selectedAppointment,
      payment_status: "paid",
      paid_amount: paidVal,
      discount_amount: discountVal,
      payment_method: paymentMethodInput,
      payment_time: new Date().toISOString(),
      extracted_patient_name: editPatientName.trim() || selectedAppointment.extracted_patient_name,
      extracted_patient_phone: editPatientPhone.trim() || selectedAppointment.extracted_patient_phone,
      patients: {
        id: patientId || "",
        name: editPatientName.trim() || selectedAppointment.patients?.name || "",
        phone: editPatientPhone.trim() || selectedAppointment.patients?.phone || "",
        telegram_user_id: selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id,
      },
    };

    setSelectedAppointment(enrichedAppointment);
    setShowReceipt(true);
    setProcessingPayment(false);
    fetchAppointments();

    const finalAmount = paidVal;
    setTimeout(() => { sendTelegramReceipt(enrichedAppointment, finalAmount); }, 500);
  };

  const addWalkIn = async () => {
    if (!clinic || !patientNameInput.trim()) return;
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .insert({ clinic_id: clinic.id, name: patientNameInput.trim(), phone: patientPhoneInput.trim() || "بدون هاتف" })
      .select("id").single();
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

  const handleAddExpense = async () => {
    if (!clinic) return;
    if (!expenseTitle.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
      toast({ title: "بيانات غير مكتملة", description: "يرجى إدخال اسم المصروف والمبلغ", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("expenses").insert({
      clinic_id: clinic.id,
      title: expenseTitle.trim(),
      amount: parseFloat(expenseAmount),
      category: expenseCategory,
      expense_date: expenseDate,
      expense_time: expenseTime + ":00",
    });
    if (error) {
      toast({ title: "خطأ", description: "فشل حفظ المصروف", variant: "destructive" });
      return;
    }
    toast({ title: "✅ تم تسجيل المصروف" });
    setExpenseTitle(""); setExpenseAmount("");
    setExpenseModalOpen(false);
    fetchExpenses();
  };

  const generateReceiptCanvas = async (): Promise<HTMLCanvasElement> => {
    const element = document.getElementById("receipt-card-container");
    if (!element) throw new Error("عنصر السند غير متوفر");
    return await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
  };

  const downloadReceipt = async () => {
    try {
      const canvas = await generateReceiptCanvas();
      const imgData = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `سند_دفع_${selectedAppointment?.reservation_code || "receipt"}.png`;
      link.click();
    } catch (_) { toast({ title: "خطأ", description: "تعذر تنزيل السند", variant: "destructive" }); }
  };

  const printReceipt = async () => {
    try {
      const canvas = await generateReceiptCanvas();
      const imgData = canvas.toDataURL("image/png");
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`<html><head><title>طباعة سند الدفع</title></head><body style="margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f4f4f5;"><img src="${imgData}" style="max-width:100%; height:auto;" onload="window.print();window.close();" /></body></html>`);
        win.document.close();
      }
    } catch (_) { toast({ title: "خطأ", description: "تعذر طباعة السند", variant: "destructive" }); }
  };

  const sendViaWhatsApp = async () => {
    if (!selectedAppointment) return;
    const rawPhone = editPatientPhone || selectedAppointment.extracted_patient_phone || selectedAppointment.patients?.phone || "";
    const waPhone = cleanPhoneForWhatsApp(rawPhone);
    if (!waPhone) {
      toast({ title: "❌ لا يوجد رقم هاتف صحيح", description: "أدخل رقم الهاتف أولاً", variant: "destructive" });
      return;
    }
    setSendingReceipt(true);
    try {
      const canvas = await generateReceiptCanvas();
      const imgData = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `سند_${selectedAppointment.reservation_code}.png`;
      link.click();
      const patientName = editPatientName || selectedAppointment.extracted_patient_name || "المريض";
      const finalAmt = selectedAppointment.paid_amount || 0;
      const msg = encodeURIComponent(
        `🧾 سند دفع - ${clinic?.name || "العيادة الطبية"}\n━━━━━━━━━━━━━━━\n👤 ${patientName}\n🔖 ${selectedAppointment.reservation_code}\n💊 ${selectedAppointment.services?.name || "فحص طبي"}\n💰 ${finalAmt}\n📅 ${format(new Date(), "yyyy/MM/dd - hh:mm a")}\n━━━━━━━━━━━━━━━`
      );
      setTimeout(() => { window.open(`https://wa.me/${waPhone}?text=${msg}`, "_blank"); }, 800);
      toast({ title: "✅ تم حفظ السند وفتح الواتساب" });
    } catch { toast({ title: "خطأ في معالجة السند", variant: "destructive" }); }
    finally { setSendingReceipt(false); }
  };

  const sendViaTelegram = async () => {
    if (!selectedAppointment) return;
    const tgUserId = selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id;
    if (!tgUserId) {
      toast({ title: "❌ المريض غير مسجل عبر تلجرام", variant: "destructive" });
      return;
    }
    setSendingTelegram(true);
    try {
      const canvas = await generateReceiptCanvas();
      const receiptImageBase64 = canvas.toDataURL("image/png");
      const { cleanName } = extractCleanInfo(selectedAppointment);
      const finalAmt = selectedAppointment.paid_amount || 0;
      const { data, error } = await supabase.functions.invoke("telegram-bot", {
        body: {
          action: "send_receipt",
          clinic_id: clinic?.id,
          chat_id: tgUserId,
          receipt_image: receiptImageBase64,
          reservation_code: selectedAppointment.reservation_code,
          patient_name: editPatientName || cleanName,
          service_name: selectedAppointment.services?.name || "فحص طبي",
          amount: finalAmt,
          clinic_name: clinic?.name || "العيادة الطبية",
        }
      });
      if (error) throw error;
      if (data?.ok) toast({ title: "✈️ تم إرسال السند عبر تلجرام!" });
      else toast({ title: "❌ فشل الإرسال", description: data?.error, variant: "destructive" });
    } catch (err: any) {
      toast({ title: "❌ خطأ في الاتصال", description: err.message, variant: "destructive" });
    } finally { setSendingTelegram(false); }
  };

  const getUniquePaymentToken = (appointment: Appointment) => {
    const baseCode = appointment.reservation_code || "PAY";
    const netPaid = appointment.paid_amount || 0;
    return `PAY-VERIFIED|${baseCode}|${netPaid}|${appointment.id.slice(0, 6).toUpperCase()}`;
  };

  // ✏️ [V38.6] إنشاء فاتورة يدوية
  const openCreateInvoice = () => {
    setInvPatientName(""); setInvPatientPhone("");
    setInvItems([{ name: "", qty: 1, price: 0 }]);
    setInvDiscountType("fixed"); setInvDiscountValue("0");
    setInvPaymentMethod("نقدي"); setInvNotes("");
    setCreateInvoiceOpen(true);
  };

  const addInvoiceItem = () => {
    setInvItems(prev => [...prev, { name: "", qty: 1, price: 0 }]);
  };

  const updateInvoiceItem = (index: number, patch: Partial<InvoiceItem>) => {
    setInvItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  const removeInvoiceItem = (index: number) => {
    setInvItems(prev => prev.filter((_, i) => i !== index));
  };

  const calcInvoiceSubtotal = (): number => {
    return invItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  };

  const calcInvoiceDiscount = (subtotal: number): number => {
    const v = parseFloat(invDiscountValue) || 0;
    if (invDiscountType === "percentage") return Math.round(subtotal * (v / 100) * 100) / 100;
    return Math.min(v, subtotal);
  };

  const handleSaveInvoice = async () => {
    if (!clinic) return;
    const subtotal = calcInvoiceSubtotal();
    if (subtotal <= 0) {
      toast({ title: "❌ أضف بند واحد على الأقل بسعر صحيح", variant: "destructive" });
      return;
    }
    setInvSaving(true);
    try {
      const discountAmount = calcInvoiceDiscount(subtotal);
      const totalAmount = Math.max(0, subtotal - discountAmount);
      const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
      const { error } = await supabase.from("invoices").insert({
        clinic_id: clinic.id,
        patient_name: invPatientName.trim() || null,
        patient_phone: invPatientPhone.trim() || null,
        invoice_number: invoiceNumber,
        items: invItems.filter(it => it.name.trim() && Number(it.price) > 0),
        subtotal,
        discount_type: invDiscountType,
        discount_value: parseFloat(invDiscountValue) || 0,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        paid_status: "paid",
        paid_amount: totalAmount,
        payment_method: invPaymentMethod,
        notes: invNotes.trim() || null,
        paid_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast({ title: "✅ تم إنشاء الفاتورة", description: invoiceNumber });
      setCreateInvoiceOpen(false);
      fetchInvoices();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally { setInvSaving(false); }
  };

  const filtered = useMemo(() => appointments.filter((a) => {
    const { cleanName, cleanPhone } = extractCleanInfo(a);
    const matchesSearch = a.reservation_code.toLowerCase().includes(search.toLowerCase()) ||
      cleanName.toLowerCase().includes(search.toLowerCase()) || cleanPhone.includes(search);
    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return !["cancelled"].includes(a.status);
    if (statusFilter === "paid") return a.payment_status === "paid";
    if (statusFilter === "unpaid") return a.payment_status !== "paid" && a.status !== "cancelled";
    if (statusFilter === "arrived") return !!a.arrived_at;
    if (statusFilter === "waiting") return !a.arrived_at && a.status !== "cancelled";
    return true;
  }), [appointments, search, statusFilter]);

  const filteredInvoices = useMemo(() => {
    return invoiceAppointments.filter((a) => {
      const { cleanName, cleanPhone } = extractCleanInfo(a);
      const q = invoicesSearch.trim().toLowerCase();
      const matchesSearch = !q || a.reservation_code.toLowerCase().includes(q) || cleanName.toLowerCase().includes(q) || cleanPhone.includes(q);
      if (!matchesSearch) return false;
      if (invoicesOnlyPromo && !a.is_promo) return false;
      return true;
    });
  }, [invoiceAppointments, invoicesSearch, invoicesOnlyPromo]);

  const filteredInvoicesList = useMemo(() => {
    return invoicesList.filter((inv) => {
      const q = invoicesSearch.trim().toLowerCase();
      if (!q) return true;
      return inv.invoice_number.toLowerCase().includes(q) ||
        (inv.patient_name || "").toLowerCase().includes(q) ||
        (inv.patient_phone || "").includes(q);
    });
  }, [invoicesList, invoicesSearch]);

  const invoicesStats = useMemo(() => {
    const apptTotal = filteredInvoices.reduce((s, a) => s + (a.paid_amount || 0), 0);
    const invTotal = filteredInvoicesList.reduce((s, i) => s + (i.total_amount || 0), 0);
    const totalPaid = apptTotal + invTotal;
    const count = filteredInvoices.length + filteredInvoicesList.length;
    const promoCount = filteredInvoices.filter(a => a.is_promo).length;
    return { totalPaid, count, promoCount };
  }, [filteredInvoices, filteredInvoicesList]);

  if (authLoading || clinicLoading) return <div className="min-h-screen bg-mesh flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  if (clinicError) return <div className="min-h-screen bg-mesh flex items-center justify-center text-destructive font-bold">{clinicError}</div>;

  if (isTrialExpired && role !== "owner") {
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
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col" dir="rtl">
      <div id={QR_FILE_ELEMENT_ID} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* مودال الماسح المحسّن */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-lg flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-border">
            <div className="flex justify-between items-center px-6 pt-6 pb-4 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">مسح QR للصندوق</h3>
                  <p className="text-xs text-muted-foreground">وجّه الكاميرا نحو كود الحجز</p>
                </div>
              </div>
              <button onClick={stopScanner} className="p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* رسالة الإشعار داخل النافذة (ثابتة) */}
            {scannerMessage && (
              <div className={`mx-6 mt-3 px-4 py-3 rounded-xl text-sm font-bold text-center ${scannerMessage.startsWith("✅") ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30" : "bg-red-500/15 text-red-700 border border-red-500/30"}`}>
                {scannerMessage}
              </div>
            )}

            <div className="relative mx-6 my-4 rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "1/1" }}>
              <div id={QR_CAMERA_ELEMENT_ID} className="w-full h-full" />
              {(scannerStatus === "loading" || uploadingImage) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                  <Loader2 className="w-12 h-12 animate-spin text-primary mb-3" />
                  <p className="text-white text-sm font-medium">{uploadingImage ? "جاري قراءة الصورة..." : "جاري تشغيل الكاميرا..."}</p>
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
                    <RefreshCw className="w-4 h-4 ml-1" />إعادة المحاولة
                  </Button>
                </div>
              )}
            </div>

            <div className="px-6 pb-3">
              <Button
                variant="outline"
                className="w-full gap-2 border-dashed border-primary/50 text-primary h-12 font-bold"
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

      {/* التبويبات */}
      <div className="glass-strong border-b border-border/40 sticky top-18 z-30">
        <div className="container mx-auto px-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("main")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all ${activeTab === "main" ? "text-primary border-b-3 border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
              style={{ borderBottomWidth: activeTab === "main" ? 3 : 0 }}
            >
              <Wallet className="w-4 h-4" />الخزينة
            </button>
            <button
              onClick={() => setActiveTab("invoices")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all ${activeTab === "invoices" ? "text-primary border-b-3 border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
              style={{ borderBottomWidth: activeTab === "invoices" ? 3 : 0 }}
            >
              <FileText className="w-4 h-4" />الفواتير
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {activeTab === "main" && (
          <>
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
                <Button variant="outline" onClick={() => { fetchAppointments(); fetchExpenses(); }}><RefreshCw className="w-4 h-4 ml-1" />تحديث</Button>
              </div>
            </div>

            {expenses.length > 0 && (
              <div className="card-modern p-4 space-y-2 bg-red-50/30 dark:bg-red-950/10 border-red-200/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-red-600 flex items-center gap-1">
                    <MinusCircle className="w-4 h-4" /> المصروفات المسجلة اليوم ({expenses.length})
                  </h3>
                  <span className="text-xs font-black text-red-600">
                    إجمالي: {expenses.reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {expenses.map((exp) => (
                    <div key={exp.id} className="bg-background border border-border px-3 py-1.5 rounded-xl text-xs shrink-0 flex items-center gap-2">
                      <span className="font-bold text-foreground">{exp.title}</span>
                      <span className="text-muted-foreground">({exp.category})</span>
                      <span className="font-black text-red-500">{exp.amount}</span>
                      <span className="text-[10px] text-muted-foreground">{String(exp.expense_time).slice(0,5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3">
              {filtered.map((a) => {
                const isPaid = a.payment_status === "paid";
                const isArrived = !!a.arrived_at;
                const isPromo = a.is_promo === true;
                const { cleanName, cleanPhone } = extractCleanInfo(a);
                const netAmt = computeNetAmount(a);

                return (
                  <div key={a.id} className={`card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isPromo ? "border-amber-400/60 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                        {isPromo && (
                          <span className="bg-amber-500/20 text-amber-700 px-2 py-0.5 rounded-lg text-xs font-bold">
                            🎁 عرض {a.promo_code ? `(${a.promo_code})` : ""}
                          </span>
                        )}
                        {a.is_walk_in && <span className="bg-emerald-500/15 text-emerald-600 px-2 py-0.5 rounded-lg text-xs font-bold">مباشر</span>}
                        <span className="text-sm text-muted-foreground"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                        {isArrived ? (
                          <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">وصل العيادة</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">بانتظار الوصول</span>
                        )}
                        {isPaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">مدفوع</span>}
                        {a.payment_method && isPaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-violet-500/15 text-violet-600 font-bold">{a.payment_method}</span>}
                      </div>
                      <h2 className="font-bold text-foreground">{cleanName}</h2>
                      <p className="text-sm text-muted-foreground">{cleanPhone} — الخدمة: <b>{a.services?.name || "بدون خدمة"}</b></p>
                      {isPromo && (
                        <p className="text-xs text-amber-700">
                          💰 الأصلي: <s>{a.original_price ?? "—"}</s> ← بعد الخصم: <b>{a.final_price ?? "—"}</b>
                          {formatDiscount(a) && ` — خصم ${formatDiscount(a)}`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 items-center justify-end">
                      {isPaid ? (
                        <Button variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-50/50" onClick={() => openPaymentModal(a)}>
                          <CheckCircle className="w-4 h-4 ml-1" />عرض السند
                        </Button>
                      ) : (
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openPaymentModal(a)}>
                          <Banknote className="w-4 h-4 ml-1" />تسجيل الدفع ({a.final_price ?? a.services?.price ?? 0})
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="card-modern p-12 text-center text-muted-foreground">لا توجد حالات مسجلة اليوم</div>}
            </div>
          </>
        )}

        {activeTab === "invoices" && (
          <>
            {/* كروت الإحصائيات */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="card-modern p-4 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-border/60">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">إجمالي المدفوعات</p>
                    <p className="text-2xl font-black text-foreground mt-1">{invoicesStats.totalPaid.toLocaleString()}</p>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-background/60 flex items-center justify-center"><ArrowUpCircle className="w-5 h-5 text-emerald-500" /></div>
                </div>
              </div>
              <div className="card-modern p-4 bg-gradient-to-br from-primary/20 to-primary/5 border border-border/60">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">عدد الفواتير</p>
                    <p className="text-2xl font-black text-foreground mt-1">{invoicesStats.count}</p>
                    {invoicesStats.promoCount > 0 && <p className="text-[10px] text-amber-700 font-bold mt-0.5">منها {invoicesStats.promoCount} عرض</p>}
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-background/60 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div>
                </div>
              </div>
              <div className="card-modern p-4 bg-gradient-to-br from-violet-500/20 to-violet-500/5 border border-border/60">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">فواتير يدوية</p>
                    <p className="text-2xl font-black text-foreground mt-1">{filteredInvoicesList.length}</p>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-background/60 flex items-center justify-center"><Receipt className="w-5 h-5 text-violet-500" /></div>
                </div>
              </div>
              <div className="card-modern p-4 bg-gradient-to-br from-sky-500/20 to-sky-500/5 border border-border/60 flex items-center justify-center">
                <Button onClick={openCreateInvoice} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold gap-2">
                  <Plus className="w-4 h-4" />إنشاء فاتورة جديدة
                </Button>
              </div>
            </div>

            {/* الفلاتر */}
            <div className="card-modern p-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={invoicesSearch} onChange={(e) => setInvoicesSearch(e.target.value)} placeholder="بحث بكود الحجز / اسم المريض / رقم الهاتف" className="pr-10" />
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Input type="date" value={invoicesFrom} onChange={(e) => setInvoicesFrom(e.target.value)} className="w-40" />
                  <span className="text-muted-foreground">→</span>
                  <Input type="date" value={invoicesTo} onChange={(e) => setInvoicesTo(e.target.value)} className="w-40" />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" checked={invoicesOnlyPromo} onChange={(e) => setInvoicesOnlyPromo(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                  <span className="text-amber-700">🎁 عرض فقط</span>
                </label>
                <Button variant="outline" onClick={fetchInvoices} disabled={invoicesLoading}>
                  {invoicesLoading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Filter className="w-4 h-4 ml-1" />}تطبيق
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/40">
                <button onClick={() => { setInvoicesFrom(todayStr); setInvoicesTo(todayStr); }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition">اليوم</button>
                <button onClick={() => { const d = new Date(); const from = new Date(d.getTime() - 6 * 24 * 60 * 60 * 1000); setInvoicesFrom(format(from, "yyyy-MM-dd")); setInvoicesTo(format(d, "yyyy-MM-dd")); }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 transition">آخر 7 أيام</button>
                <button onClick={() => { const d = new Date(); const from = new Date(d.getFullYear(), d.getMonth(), 1); setInvoicesFrom(format(from, "yyyy-MM-dd")); setInvoicesTo(format(d, "yyyy-MM-dd")); }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 transition">هذا الشهر</button>
              </div>
            </div>

            {invoicesLoading ? (
              <div className="card-modern p-12 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary mb-3" /><p className="text-muted-foreground">جاري التحميل...</p></div>
            ) : (filteredInvoices.length === 0 && filteredInvoicesList.length === 0) ? (
              <div className="card-modern p-12 text-center"><FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">لا توجد فواتير في هذه الفترة</p></div>
            ) : (
              <div className="grid gap-3">
                {/* فواتير يدوية (invoices table) */}
                {filteredInvoicesList.map((inv) => (
                  <div key={inv.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-sky-400/40 bg-sky-50/30 dark:bg-sky-950/10">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-sky-700 bg-sky-500/10 px-2 py-1 rounded-lg font-bold">{inv.invoice_number}</code>
                        <span className="px-2 py-0.5 rounded-lg text-xs bg-sky-500/15 text-sky-700 font-bold">فاتورة يدوية</span>
                        {inv.payment_method && <span className="px-2 py-0.5 rounded-lg text-xs bg-violet-500/15 text-violet-600 font-bold">{inv.payment_method}</span>}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />{format(new Date(inv.created_at), "yyyy-MM-dd HH:mm")}
                        </span>
                      </div>
                      <h2 className="font-bold text-foreground">{inv.patient_name || "—"}</h2>
                      <p className="text-sm text-muted-foreground">{inv.patient_phone || "—"} — بنود: <b>{inv.items?.length || 0}</b></p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                        <p className="text-2xl font-black text-sky-700">{Number(inv.total_amount || 0).toLocaleString()}</p>
                        {inv.discount_amount > 0 && <p className="text-[10px] text-red-500 font-bold">خصم: -{inv.discount_amount}{inv.discount_type === "percentage" ? ` (${inv.discount_value}%)` : ""}</p>}
                      </div>
                      <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setSelectedInvoice(inv)}>
                        <Receipt className="w-3.5 h-3.5" />عرض
                      </Button>
                    </div>
                  </div>
                ))}

                {/* فواتير المواعيد المدفوعة */}
                {filteredInvoices.map((a) => {
                  const isPromo = a.is_promo === true;
                  const { cleanName, cleanPhone } = extractCleanInfo(a);
                  const net = computeNetAmount(a);
                  const discFmt = formatDiscount(a);

                  return (
                    <div key={a.id} className={`card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isPromo ? "border-amber-400/60 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                          {isPromo && <span className="bg-amber-500/20 text-amber-700 px-2 py-0.5 rounded-lg text-xs font-bold">🎁 عرض {a.promo_code ? `(${a.promo_code})` : ""}</span>}
                          <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">مدفوع</span>
                          {a.payment_method && <span className="px-2 py-0.5 rounded-lg text-xs bg-violet-500/15 text-violet-600 font-bold">{a.payment_method}</span>}
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{a.date} — {String(a.time).slice(0, 5)}</span>
                        </div>
                        <h2 className="font-bold text-foreground">{cleanName}</h2>
                        <p className="text-sm text-muted-foreground">{cleanPhone} — <b>{a.services?.name || "بدون خدمة"}</b></p>
                        {isPromo && (
                          <p className="text-xs text-amber-700">
                            💰 الأصلي: <s>{a.original_price ?? "—"}</s> ← بعد الخصم: <b>{a.final_price ?? "—"}</b>
                            {discFmt && ` — خصم ${discFmt}`}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">الصافي</p>
                          <p className="text-2xl font-black text-emerald-600">{net.toLocaleString()}</p>
                        </div>
                        <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => {
                          const enriched = { ...a, extracted_patient_name: cleanName, extracted_patient_phone: cleanPhone };
                          setSelectedAppointment(enriched);
                          setEditPatientName(cleanName !== "مريض غير محدد" ? cleanName : "");
                          setEditPatientPhone(cleanPhone === "حجر عبر تلجرام (بدون رقم)" ? "" : cleanPhone);
                          setPaidAmountInput(a.paid_amount != null ? String(a.paid_amount) : "");
                          setDiscountInput(a.discount_amount != null ? String(a.discount_amount) : "0");
                          setPaymentMethodInput(a.payment_method || "نقدي");
                          setShowReceipt(true);
                        }}>
                          <Receipt className="w-3.5 h-3.5" />عرض السند
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* ================ مودال الدفع/السند ================ */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-3xl max-w-md w-full shadow-2xl p-6 relative border border-border my-8">
            <button onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition">
              <X className="w-5 h-5" />
            </button>

            {!showReceipt ? (
              <div className="space-y-5 pt-2">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-2"><Banknote className="w-6 h-6" /></div>
                  <h2 className="text-xl font-bold text-foreground">تأكيد تحصيل المبلغ</h2>
                  <p className="text-xs text-muted-foreground mt-1">تأكد من الاسم والهاتف قبل السداد</p>
                  {selectedAppointment.is_promo && (
                    <p className="text-xs text-amber-700 font-bold mt-2 bg-amber-50 rounded-lg px-3 py-1.5 inline-block">
                      🎁 حجز من عرض — الخصم {formatDiscount(selectedAppointment)}
                    </p>
                  )}
                </div>

                <div className="card-modern p-4 bg-muted/40 space-y-3 text-sm">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">اسم المريض الصريح</label>
                    <Input value={editPatientName} onChange={(e) => setEditPatientName(e.target.value)} placeholder="أدخل اسم المريض الرباعي" className="font-bold text-sm bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">رقم الهاتف (الواتساب)</label>
                    <Input value={editPatientPhone} onChange={(e) => setEditPatientPhone(e.target.value)} placeholder="مثال: 771234567" className="font-bold text-sm bg-background" dir="ltr" />
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2 pt-1">
                    <span className="text-muted-foreground">كود الحجز</span>
                    <span className="font-mono font-bold text-primary">{selectedAppointment.reservation_code}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">الخدمة</span>
                    <span className="font-medium text-foreground">{selectedAppointment.services?.name || "فحص طبي"}</span>
                  </div>

                  {selectedAppointment.is_promo && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-bold text-amber-800">تفاصيل العرض:</p>
                      {selectedAppointment.promo_code && <p className="text-xs text-amber-700">كود: <code className="bg-white px-1.5 rounded">{selectedAppointment.promo_code}</code></p>}
                      {selectedAppointment.original_price != null && <p className="text-xs text-amber-700">الأصلي: {selectedAppointment.original_price}</p>}
                      {selectedAppointment.final_price != null && <p className="text-xs text-amber-700 font-bold">بعد الخصم: {selectedAppointment.final_price}</p>}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">طريقة الدفع</label>
                    <div className="grid grid-cols-3 gap-2">
                      {["نقدي", "تحويل", "بطاقة"].map(m => (
                        <button
                          key={m}
                          onClick={() => setPaymentMethodInput(m)}
                          className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${paymentMethodInput === m ? "bg-primary text-white border-primary" : "bg-background border-border hover:bg-muted"}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">المبلغ المستلم</label>
                      <Input type="number" value={paidAmountInput} onChange={(e) => setPaidAmountInput(e.target.value)} className="font-bold text-lg" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">الخصم {selectedAppointment.is_promo ? `(${formatDiscount(selectedAppointment)})` : ""}</label>
                      <Input type="number" value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} className="font-bold text-lg text-red-500" />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2 border-t border-border/80 text-base">
                    <span className="font-bold text-foreground">الصافي</span>
                    <span className="font-black text-emerald-600 text-xl">{(parseFloat(paidAmountInput) || 0)}</span>
                  </div>
                </div>

                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 text-base font-bold" onClick={handlePayNow} disabled={processingPayment}>
                  {processingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5 ml-1" />}تأكيد الدفع
                </Button>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="text-center mb-1">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5" /> تم الدفع بنجاح
                  </span>
                </div>

                {/* السند */}
                <div id="receipt-card-container" className="bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-xl relative overflow-hidden" style={{ direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  <div style={{
                    background: selectedAppointment.is_promo ? "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #d946ef 100%)" : "linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%)",
                    padding: "20px 24px 18px", color: "white", display: "flex", alignItems: "center", gap: "14px"
                  }}>
                    <div style={{ width: "48px", height: "48px", background: "rgba(255,255,255,0.2)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1.5px solid rgba(255,255,255,0.3)" }}>
                      {clinic?.logo_url ? <img src={clinic.logo_url} alt="logo" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }} /> : <span style={{ fontSize: "22px" }}>{selectedAppointment.is_promo ? "🎁" : "🏥"}</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "9px", opacity: 0.8, marginBottom: "3px", letterSpacing: "1.5px" }}>{selectedAppointment.is_promo ? "PROMO RECEIPT" : "OFFICIAL RECEIPT"}</p>
                      <h2 style={{ fontSize: "17px", fontWeight: 900, margin: 0, lineHeight: 1.2 }}>{clinic?.name || "العيادة"}</h2>
                      <p style={{ fontSize: "10px", opacity: 0.85, marginTop: "3px" }}>سند استلام مبلغ</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "10px", padding: "6px 10px", textAlign: "center", border: "1px solid rgba(255,255,255,0.25)" }}>
                      <p style={{ fontSize: "8px", opacity: 0.9, margin: 0 }}>الحالة</p>
                      <p style={{ fontSize: "10px", fontWeight: 800, margin: "2px 0 0" }}>مدفوع ✓</p>
                    </div>
                  </div>

                  <div className="p-5 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-gray-600">
                      <span>كود الحجز:</span>
                      <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{selectedAppointment.reservation_code}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>التاريخ والوقت:</span>
                      <span className="font-medium text-gray-800">{format(new Date(), "yyyy/MM/dd - hh:mm a")}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>المريض:</span>
                      <span className="font-bold text-gray-900 text-sm">{editPatientName || extractCleanInfo(selectedAppointment).cleanName}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>الهاتف:</span>
                      <span className="font-medium text-gray-800" dir="ltr">{editPatientPhone || extractCleanInfo(selectedAppointment).cleanPhone}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>الخدمة:</span>
                      <span className="font-medium text-gray-800">{selectedAppointment.services?.name || "فحص طبي"}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>طريقة الدفع:</span>
                      <span className="font-bold text-gray-900">{paymentMethodInput}</span>
                    </div>

                    {selectedAppointment.is_promo && (
                      <>
                        <div className="my-2 border-t border-dashed border-purple-200" />
                        <div className="bg-gradient-to-r from-purple-50 to-fuchsia-50 border border-purple-200 rounded-xl p-3 space-y-1.5">
                          <p className="text-[10px] font-bold text-purple-800 uppercase tracking-wider">🎁 تفاصيل العرض</p>
                          {selectedAppointment.promo_code && (
                            <div className="flex justify-between items-center">
                              <span className="text-purple-700">كود العرض:</span>
                              <span className="font-mono font-bold text-purple-900 bg-white px-2 py-0.5 rounded">{selectedAppointment.promo_code}</span>
                            </div>
                          )}
                          {selectedAppointment.original_price != null && (
                            <div className="flex justify-between items-center">
                              <span className="text-purple-700">السعر الأصلي:</span>
                              <span className="font-medium text-purple-900 line-through">{selectedAppointment.original_price}</span>
                            </div>
                          )}
                          {formatDiscount(selectedAppointment) && (
                            <div className="flex justify-between items-center">
                              <span className="text-purple-700">نسبة الخصم:</span>
                              <span className="font-bold text-purple-700">{formatDiscount(selectedAppointment)}</span>
                            </div>
                          )}
                          {selectedAppointment.final_price != null && (
                            <div className="flex justify-between items-center border-t border-purple-200 pt-1.5 mt-1">
                              <span className="text-purple-700 font-bold">السعر بعد الخصم:</span>
                              <span className="font-black text-purple-900 text-base">{selectedAppointment.final_price}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    <div className="my-3 border-t border-dashed border-gray-200" />

                    <div className={`flex justify-between items-center p-3 rounded-xl border ${selectedAppointment.is_promo ? "bg-purple-50/80 border-purple-100" : "bg-emerald-50/80 border-emerald-100"}`}>
                      <span className={`font-bold text-sm ${selectedAppointment.is_promo ? "text-purple-900" : "text-emerald-900"}`}>المبلغ المستلم:</span>
                      <span className={`font-black text-xl ${selectedAppointment.is_promo ? "text-purple-700" : "text-emerald-700"}`}>
                        {(selectedAppointment.paid_amount || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-gray-700">رمز التحقق:</p>
                        <p className="text-[9px] font-mono text-gray-400 mt-0.5">{getUniquePaymentToken(selectedAppointment)}</p>
                      </div>
                      <div className="bg-white p-1 rounded-lg border border-gray-200 shrink-0">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x100&data=${encodeURIComponent(getUniquePaymentToken(selectedAppointment))}`} alt="QR" className="w-12 h-12" crossOrigin="anonymous" />
                      </div>
                    </div>

                    <div className="mt-3 text-center text-[9px] text-gray-400 border-t border-gray-100 pt-2">معتمد إلكترونياً عبر صندوق الخزينة</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={downloadReceipt}><Download className="w-3.5 h-3.5" />تنزيل</Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={printReceipt}><Printer className="w-3.5 h-3.5" />طباعة</Button>
                  <Button size="sm" className="text-xs gap-1 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold" onClick={sendViaWhatsApp} disabled={sendingReceipt}>
                    {sendingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}واتساب
                  </Button>
                  {(selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id) && (
                    <Button size="sm" className="text-xs gap-1 bg-[#0088cc] hover:bg-[#0077b5] text-white font-bold" onClick={sendViaTelegram} disabled={sendingTelegram}>
                      {sendingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}تلجرام
                    </Button>
                  )}
                </div>

                <Button variant="ghost" className="w-full text-xs mt-1" onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }}>إغلاق</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================ مودال إنشاء فاتورة ================ */}
      <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-sky-600" />إنشاء فاتورة جديدة</DialogTitle></DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">اسم المريض</label>
                <Input value={invPatientName} onChange={(e) => setInvPatientName(e.target.value)} placeholder="اسم المريض (اختياري)" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">رقم الهاتف</label>
                <Input value={invPatientPhone} onChange={(e) => setInvPatientPhone(e.target.value)} placeholder="مثال: 771234567" dir="ltr" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-foreground">البنود</label>
                <Button size="sm" variant="outline" onClick={addInvoiceItem} className="gap-1"><Plus className="w-3.5 h-3.5" />إضافة بند</Button>
              </div>
              <div className="space-y-2">
                {invItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_70px_90px_40px] gap-2 items-center">
                    <Input value={it.name} onChange={(e) => updateInvoiceItem(idx, { name: e.target.value })} placeholder="اسم الخدمة/البند" className="text-sm" />
                    <Input type="number" value={it.qty} onChange={(e) => updateInvoiceItem(idx, { qty: parseInt(e.target.value) || 0 })} placeholder="الكمية" className="text-sm text-center" min={1} />
                    <Input type="number" value={it.price} onChange={(e) => updateInvoiceItem(idx, { price: parseFloat(e.target.value) || 0 })} placeholder="السعر" className="text-sm" min={0} />
                    <Button size="sm" variant="ghost" onClick={() => removeInvoiceItem(idx)} disabled={invItems.length === 1} className="text-red-600 hover:text-red-700 p-0 h-9">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/30 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المجموع الفرعي:</span>
                <span className="font-bold">{calcInvoiceSubtotal().toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr_auto] gap-2 items-center">
                <select value={invDiscountType} onChange={(e) => setInvDiscountType(e.target.value as any)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="fixed">مبلغ ثابت</option>
                  <option value="percentage">نسبة %</option>
                </select>
                <Input type="number" value={invDiscountValue} onChange={(e) => setInvDiscountValue(e.target.value)} placeholder="0" min={0} />
                <span className="text-sm font-bold text-red-500 whitespace-nowrap">-{calcInvoiceDiscount(calcInvoiceSubtotal()).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border/60">
                <span className="font-bold text-foreground">الإجمالي:</span>
                <span className="font-black text-emerald-600 text-xl">{Math.max(0, calcInvoiceSubtotal() - calcInvoiceDiscount(calcInvoiceSubtotal())).toLocaleString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">طريقة الدفع</label>
                <div className="grid grid-cols-3 gap-1">
                  {["نقدي", "تحويل", "بطاقة"].map(m => (
                    <button key={m} onClick={() => setInvPaymentMethod(m)} className={`px-2 py-2 rounded-lg text-xs font-bold border transition ${invPaymentMethod === m ? "bg-primary text-white border-primary" : "bg-background border-border"}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">ملاحظات</label>
                <Input value={invNotes} onChange={(e) => setInvNotes(e.target.value)} placeholder="اختياري" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateInvoiceOpen(false)} className="flex-1">إلغاء</Button>
              <Button onClick={handleSaveInvoice} disabled={invSaving} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold">
                {invSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <CheckCircle className="w-4 h-4 ml-1" />}حفظ الفاتورة
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================ مودال عرض الفاتورة اليدوية ================ */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-3xl max-w-md w-full shadow-2xl p-6 relative border border-border my-8">
            <button onClick={() => setSelectedInvoice(null)} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition"><X className="w-5 h-5" /></button>

            <div id="invoice-card-container" className="bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-xl overflow-hidden" style={{ direction: 'rtl' }}>
              <div style={{ background: "linear-gradient(135deg, #0284c7 0%, #0891b2 50%, #06b6d4 100%)", padding: "20px 24px", color: "white" }}>
                <p style={{ fontSize: "10px", opacity: 0.85, marginBottom: "4px", letterSpacing: "1.5px" }}>INVOICE</p>
                <h2 style={{ fontSize: "18px", fontWeight: 900, margin: 0 }}>{clinic?.name || "العيادة"}</h2>
                <p style={{ fontSize: "11px", opacity: 0.85, marginTop: "4px" }}>فاتورة رسمية — {selectedInvoice.invoice_number}</p>
              </div>

              <div className="p-5 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-600">التاريخ:</span><span className="font-medium">{format(new Date(selectedInvoice.created_at), "yyyy/MM/dd - HH:mm")}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">المريض:</span><span className="font-bold">{selectedInvoice.patient_name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">الهاتف:</span><span className="font-medium" dir="ltr">{selectedInvoice.patient_phone || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">طريقة الدفع:</span><span className="font-bold">{selectedInvoice.payment_method || "—"}</span></div>

                <div className="my-3 border-t border-dashed border-gray-200" />

                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-700 uppercase">البنود:</p>
                  {selectedInvoice.items.map((it, i) => (
                    <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                      <span className="font-medium">{it.name} × {it.qty}</span>
                      <span className="font-bold">{(Number(it.qty) * Number(it.price)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="my-3 border-t border-dashed border-gray-200" />

                <div className="flex justify-between"><span className="text-gray-600">المجموع الفرعي:</span><span className="font-bold">{Number(selectedInvoice.subtotal).toLocaleString()}</span></div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>الخصم {selectedInvoice.discount_type === "percentage" ? `(${selectedInvoice.discount_value}%)` : ""}:</span>
                    <span className="font-bold">-{Number(selectedInvoice.discount_amount).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-sky-50 rounded-lg p-3 border border-sky-100 mt-2">
                  <span className="font-bold text-sky-900 text-sm">الإجمالي:</span>
                  <span className="font-black text-sky-700 text-xl">{Number(selectedInvoice.total_amount).toLocaleString()}</span>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-gray-700">رمز التحقق:</p>
                    <p className="text-[9px] font-mono text-gray-400">{selectedInvoice.invoice_number}</p>
                  </div>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x100&data=${encodeURIComponent(selectedInvoice.invoice_number)}`} alt="QR" className="w-12 h-12" crossOrigin="anonymous" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3">
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={async () => {
                try {
                  const el = document.getElementById("invoice-card-container");
                  if (!el) return;
                  const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
                  const imgData = canvas.toDataURL("image/png");
                  const link = document.createElement("a");
                  link.href = imgData;
                  link.download = `فاتورة_${selectedInvoice.invoice_number}.png`;
                  link.click();
                } catch { toast({ title: "خطأ في التنزيل", variant: "destructive" }); }
              }}>
                <Download className="w-3.5 h-3.5" />تنزيل
              </Button>
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={async () => {
                try {
                  const el = document.getElementById("invoice-card-container");
                  if (!el) return;
                  const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
                  const imgData = canvas.toDataURL("image/png");
                  const win = window.open("", "_blank");
                  if (win) { win.document.write(`<html><head><title>طباعة فاتورة</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f4f4f5;"><img src="${imgData}" style="max-width:100%;height:auto;" onload="window.print();window.close();" /></body></html>`); win.document.close(); }
                } catch { toast({ title: "خطأ في الطباعة", variant: "destructive" }); }
              }}>
                <Printer className="w-3.5 h-3.5" />طباعة
              </Button>
            </div>

            <Button variant="ghost" className="w-full text-xs mt-2" onClick={() => setSelectedInvoice(null)}>إغلاق</Button>
          </div>
        </div>
      )}

      {/* مودال مريض مباشر */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إضافة مريض مباشر (Walk-In)</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input value={patientNameInput} onChange={(e) => setPatientNameInput(e.target.value)} placeholder="اسم المريض بالكامل" />
            <Input value={patientPhoneInput} onChange={(e) => setPatientPhoneInput(e.target.value)} placeholder="رقم الهاتف (مثال: 967715365516)" />
            <Button onClick={addWalkIn} className="w-full bg-primary"><UserPlus className="w-4 h-4 ml-1" />إضافة وتسجيل الحجز</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* مودال مصروف جديد (مع تاريخ ووقت) */}
      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-1"><MinusCircle className="w-5 h-5" /> تسجيل مصروف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">البيان / سبب المصروف</label>
              <Input value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} placeholder="مثلاً: شراء أدوات طبية" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">المبلغ</label>
                <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">التاريخ</label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">الوقت</label>
                <Input type="time" value={expenseTime} onChange={(e) => setExpenseTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">الفئة</label>
              <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full">
                <option value="نثريات">نثريات</option>
                <option value="أدوات طبية">أدوات طبية</option>
                <option value="صيانة">صيانة</option>
                <option value="كهرباء/ماء">كهرباء/ماء</option>
                <option value="إيجار">إيجار</option>
                <option value="رواتب">رواتب</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>
            <Button onClick={handleAddExpense} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold">
              <MinusCircle className="w-4 h-4 ml-1" />قيد المصروف
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

// ============================================================
// CashierStats — 4 رسوم بيانية
// ============================================================
function CashierStats({ appointments, expenses }: { appointments: Appointment[]; expenses: Expense[] }) {
  const paid = appointments.filter((a) => a.payment_status === "paid");

  const amountFor = (a: Appointment) => typeof a.paid_amount === "number" ? a.paid_amount : (a.final_price ?? a.services?.price ?? 0);

  const totalRevenue = paid.reduce((s, a) => s + amountFor(a), 0);
  const totalDiscount = paid.reduce((s, a) => s + (a.discount_amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  const netInDrawer = totalRevenue - totalExpenses;
  const avgTicket = paid.length ? Math.round(totalRevenue / paid.length) : 0;

  const financialFlow = useMemo(() => {
    const buckets: Record<number, { revenue: number; expense: number }> = {};
    for (let h = 8; h <= 20; h++) buckets[h] = { revenue: 0, expense: 0 };

    paid.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h].revenue += amountFor(a);
    });

    expenses.forEach((e) => {
      const h = parseInt(String(e.expense_time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h].expense += Number(e.amount || 0);
    });

    return Object.entries(buckets).map(([h, data]) => ({ hour: `${h}:00`, ...data }));
  }, [paid, expenses]);

  const byService = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach((a) => {
      const key = a.services?.name || "بدون خدمة";
      map[key] = (map[key] || 0) + amountFor(a);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid]);

  // ✏️ [V38.6] طرق الدفع
  const byPaymentMethod = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach((a) => {
      const key = a.payment_method || "غير محدد";
      map[key] = (map[key] || 0) + amountFor(a);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid]);

  // ✏️ [V38.6] فئات المصروفات
  const byExpenseCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      const key = e.category || "نثريات";
      map[key] = (map[key] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(152 69% 40%)", "hsl(38 92% 50%)", "#8b5cf6", "#06b6d4", "#ec4899", "#f59e0b"];

  const stats = [
    { label: "إجمالي المقبوضات", value: totalRevenue.toLocaleString(), icon: ArrowUpCircle, tint: "from-emerald-500/20 to-emerald-500/5", iconClass: "text-emerald-500" },
    { label: "إجمالي الخصومات", value: totalDiscount.toLocaleString(), icon: Receipt, tint: "from-amber-500/20 to-amber-500/5", iconClass: "text-amber-500" },
    { label: "إجمالي المصروفات", value: totalExpenses.toLocaleString(), icon: ArrowDownCircle, tint: "from-red-500/20 to-red-500/5", iconClass: "text-red-500" },
    { label: "صافي الصندوق", value: netInDrawer.toLocaleString(), icon: Wallet, tint: "from-primary/20 to-primary/5", iconClass: "text-primary" },
    { label: "متوسط الفاتورة", value: avgTicket.toLocaleString(), icon: TrendingUp, tint: "from-violet-500/20 to-violet-500/5", iconClass: "text-violet-500" },
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
              <div className="w-11 h-11 rounded-2xl bg-background/60 flex items-center justify-center backdrop-blur"><s.icon className={`w-5 h-5 ${s.iconClass}`} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* صف 1: تدفق + حسب الخدمات */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><DollarSign className="w-4 h-4 text-emerald-500" /><h3 className="font-bold text-foreground">تدفق الإيرادات والمصروفات</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={financialFlow} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
              <Bar dataKey="revenue" name="إيرادات" fill="hsl(152 69% 40%)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="expense" name="مصروفات" fill="hsl(0 84% 60%)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><Receipt className="w-4 h-4 text-primary" /><h3 className="font-bold text-foreground">الإيرادات حسب الخدمات</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byService} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={4} stroke="hsl(var(--background))" strokeWidth={2}>
                {byService.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
              <Legend wrapperStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* صف 2: طرق الدفع + فئات المصروفات */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><CreditCard className="w-4 h-4 text-violet-500" /><h3 className="font-bold text-foreground">طرق الدفع</h3></div>
          {byPaymentMethod.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">لا توجد بيانات بعد</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byPaymentMethod} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={4} stroke="hsl(var(--background))" strokeWidth={2}>
                  {byPaymentMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Legend wrapperStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><PieIcon className="w-4 h-4 text-red-500" /><h3 className="font-bold text-foreground">توزيع المصروفات حسب الفئة</h3></div>
          {byExpenseCategory.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">لا توجد مصروفات بعد</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byExpenseCategory} layout="vertical" margin={{ top: 5, right: 8, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Bar dataKey="value" name="المبلغ" fill="hsl(0 84% 60%)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

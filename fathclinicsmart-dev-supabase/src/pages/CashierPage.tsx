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
  Camera, X, Loader2, AlertCircle, Image as ImageIcon, Upload, RefreshCw, Printer, Download, Clock, Plus, UserPlus, DollarSign, TrendingUp, Receipt, MessageCircle, MinusCircle, Wallet, ArrowDownCircle, ArrowUpCircle, Sparkles, Send, FileText, Gift, Tag,
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import { Html5Qrcode } from "html5-qrcode";
import html2canvas from "html2canvas";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  is_walk_in: boolean;
  notes?: string | null;
  customer_telegram_id?: string | null;
  promotion_id?: string | null;
  promo_code?: string | null;
  payment_method?: string | null; // ✅ أضفنا حقل طريقة الدفع
  patients: { id?: string; name: string; phone: string; telegram_user_id?: string } | null;
  services: { name: string; price: number | null } | null;
  promotions?: { id: string; title: string; discount_type: string; discount_value: number; code?: string } | null;
  extracted_patient_name?: string;
  extracted_patient_phone?: string;
};

type Expense = {
  id: string;
  title: string;
  amount: number;
  category: string;
  time: string;
  expense_date?: string;
};

type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
};

type Invoice = {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: 'paid' | 'unpaid' | 'partial';
  created_at: string;
};

const QR_CAMERA_ELEMENT_ID = "qr-camera-container-cashier";
const QR_FILE_ELEMENT_ID = "qr-hidden-file-reader-cashier";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const parseQRText = (text: string) => {
  let code = "";
  let name = "";
  let phone = "";
  let service = "";
  let date = "";
  let time = "";

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
    if (nameMatch && nameMatch[1] && isGenericName) name = nameMatch[1].replace(/👤/g, "").replace(/@\w+/g, "").trim();
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

const suggestedDiscountFromPromo = (a: Appointment): number => {
  const promo = a.promotions;
  if (!promo) return 0;
  const price = a.services?.price || 0;
  const val = Number(promo.discount_value) || 0;
  const d = promo.discount_type === "percentage" ? Math.round((price * val) / 100) : val;
  return Math.min(d, price || d);
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CashierPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();

  // ─── State ──────────────────────────────────────────────────────────────────
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
  const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const today = dateFilter;

  // ─── Payment Modal ──────────────────────────────────────────────────────────
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editPatientName, setEditPatientName] = useState<string>("");
  const [editPatientPhone, setEditPatientPhone] = useState<string>("");
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState<string>("نقدي");
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);

  // ─── Scanner ────────────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);

  // ─── Invoice State ──────────────────────────────────────────────────────────
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { id: '1', description: '', quantity: 1, price: 0, total: 0 },
  ]);
  const [invoicePatient, setInvoicePatient] = useState<{ id: string; name: string } | null>(null);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [invoiceTax, setInvoiceTax] = useState(0);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoicePatientSearch, setInvoicePatientSearch] = useState("");

  // ─── Effects ────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    return () => { destroyScanner(); };
  }, []);

  // ─── Data Fetching ──────────────────────────────────────────────────────────
  const APPT_SELECT = `
    id,patient_id,date,time,status,reservation_code,arrived_at,
    payment_status,paid_amount,discount_amount,promotion_id,promo_code,payment_method,
    is_walk_in,notes,customer_telegram_id,
    patients(id,name,phone,telegram_user_id),
    services(name,price),
    promotions(id,title,discount_type,discount_value,code)
  `;

  const fetchAppointments = useCallback(async () => {
    if (!clinic) return;
    const { data, error } = await supabase
      .from("appointments")
      .select(APPT_SELECT)
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  }, [clinic, today]);

  const fetchExpenses = useCallback(async () => {
    if (!clinic) return;
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("expense_date", today)
      .order("created_at", { ascending: false });
    setExpenses(((data || []) as any[]).map((e) => ({
      id: e.id,
      title: e.title,
      amount: Number(e.amount),
      category: e.category,
      time: e.created_at ? format(new Date(e.created_at), "HH:mm") : "",
      expense_date: e.expense_date,
    })));
  }, [clinic, today]);

  useEffect(() => {
    if (!clinic) return;
    fetchAppointments();
    fetchExpenses();
    const channel = supabase
      .channel(`cashier-${clinic.id}-${today}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, fetchAppointments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, today, fetchAppointments, fetchExpenses]);

  // ─── Scanner ────────────────────────────────────────────────────────────────
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
        .select(APPT_SELECT)
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
        promotions: found.promotions || null,
        payment_method: found.payment_method || null,
      };
      if (!enriched.arrived_at) {
        await markArrived(enriched.id);
        enriched.arrived_at = new Date().toISOString();
      }
      setSelectedAppointment(enriched);
      setEditPatientName(cleanName);
      setEditPatientPhone(cleanPhone === "حجز عبر تلجرام (بدون رقم)" ? "" : cleanPhone);
      const defaultPrice = enriched.services?.price || 0;
      setPaidAmountInput(enriched.paid_amount != null ? String(enriched.paid_amount) : String(defaultPrice));
      const autoDisc = enriched.discount_amount != null ? Number(enriched.discount_amount) : suggestedDiscountFromPromo(enriched);
      setDiscountInput(String(autoDisc));
      setShowReceipt(enriched.payment_status === "paid");
      if (enriched.payment_status === "paid") toast({ title: "ℹ️ مدفوع مسبقاً", description: cleanName });
      else if (enriched.promotions) toast({ title: "🎁 عرض مطبَّق", description: `${enriched.promotions.title} — خصم ${autoDisc} ر.ي` });
      else toast({ title: "✅ جاهز للدفع", description: cleanName });
      setScannerOpen(false);
      stopScanner();
    } else {
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
      try { decodedText = await fileScanner.scanFile(file, false); } catch (_) {
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

  // ─── Payment Logic ──────────────────────────────────────────────────────────
  const openPaymentModal = (appointment: Appointment) => {
    const { cleanName, cleanPhone } = extractCleanInfo(appointment);
    const appEnriched = {
      ...appointment,
      extracted_patient_name: cleanName,
      extracted_patient_phone: cleanPhone,
    };
    setSelectedAppointment(appEnriched);
    setEditPatientName(cleanName !== "مريض غير محدد" ? cleanName : "");
    setEditPatientPhone(cleanPhone === "حجز عبر تلجرام (بدون رقم)" ? "" : cleanPhone);
    const defaultPrice = appointment.services?.price || 0;
    setPaidAmountInput(appointment.paid_amount != null ? String(appointment.paid_amount) : String(defaultPrice));
    const autoDisc = appointment.discount_amount != null ? Number(appointment.discount_amount) : suggestedDiscountFromPromo(appointment);
    setDiscountInput(String(autoDisc));
    setPaymentMethod(appointment.payment_method || "نقدي");
    setShowReceipt(appointment.payment_status === "paid");
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

    const method = paymentMethod || "نقدي";

    const { error } = await supabase
      .from("appointments")
      .update({
        payment_status: "paid",
        status: "confirmed",
        department: "صندوق",
        paid_amount: paidVal,
        discount_amount: discountVal,
        payment_method: method,
      })
      .eq("id", selectedAppointment.id)
      .eq("clinic_id", clinic.id);

    if (error) {
      toast({ title: "خطأ", description: "فشل تحديث حالة الدفع", variant: "destructive" });
      setProcessingPayment(false);
      return;
    }

    toast({ title: "✅ تم تسجيل الدفع بنجاح", description: "تم تحديث الخزينة وإصدار سند الاستلام" });

    if (selectedAppointment.promotion_id && selectedAppointment.promotions) {
      await supabase.from("promo_usage").insert({
        clinic_id: clinic.id,
        patient_id: patientId,
        appointment_id: selectedAppointment.id,
        promotion_id: selectedAppointment.promotion_id,
        promo_code: selectedAppointment.promotions.code || null,
        discount_amount: discountVal,
      });
    }

    setSelectedAppointment({
      ...selectedAppointment,
      payment_status: "paid",
      paid_amount: paidVal,
      discount_amount: discountVal,
      payment_method: method,
      extracted_patient_name: editPatientName.trim() || selectedAppointment.extracted_patient_name,
      extracted_patient_phone: editPatientPhone.trim() || selectedAppointment.extracted_patient_phone,
      patients: {
        id: patientId || "",
        name: editPatientName.trim() || selectedAppointment.patients?.name || "",
        phone: editPatientPhone.trim() || selectedAppointment.patients?.phone || "",
        telegram_user_id: selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id,
      },
    });

    setShowReceipt(true);
    setProcessingPayment(false);
    fetchAppointments();
  };

  // ─── Walk-In ────────────────────────────────────────────────────────────────
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
      payment_method: "نقدي",
    });
    if (error) toast({ title: "خطأ", description: "فشل إضافة مريض مباشر", variant: "destructive" });
    else {
      toast({ title: "تمت الإضافة", description: `تم تسجيل المريض المباشر ${code}` });
      setWalkInOpen(false); setPatientNameInput(""); setPatientPhoneInput(""); fetchAppointments();
    }
  };

  // ─── Expenses ───────────────────────────────────────────────────────────────
  const handleAddExpense = async () => {
    if (!clinic) return;
    if (!expenseTitle.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
      toast({ title: "بيانات غير مكتملة", description: "يرجى إدخال اسم المصروف والمبلغ بشكل صحيح", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("expenses").insert({
      clinic_id: clinic.id,
      title: expenseTitle.trim(),
      amount: parseFloat(expenseAmount),
      category: expenseCategory,
      expense_date: expenseDate || today,
    });
    if (error) {
      toast({ title: "خطأ", description: "فشل تسجيل المصروف", variant: "destructive" });
      return;
    }
    toast({ title: "✅ تم تسجيل المصروف", description: `تم قيد (${expenseTitle}) بمبلغ ${expenseAmount} ر.ي` });
    setExpenseTitle(""); setExpenseAmount(""); setExpenseModalOpen(false);
    fetchExpenses();
  };

  // ─── Receipt ────────────────────────────────────────────────────────────────
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
    } catch (_) { toast({ title: "خطأ", description: "تعذر طباعة السند", variant: "destructive" }); }
  };

  const sendViaWhatsApp = async () => {
    if (!selectedAppointment) return;
    const rawPhone = editPatientPhone || selectedAppointment.extracted_patient_phone || selectedAppointment.patients?.phone || "";
    const waPhone = cleanPhoneForWhatsApp(rawPhone);
    if (!waPhone) {
      toast({ title: "❌ لا يوجد رقم هاتف صحيح", description: "يرجى كتابة رقم هاتف المريض الصريح في الخانة أولاً", variant: "destructive", duration: 5000 });
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
      const patientName = editPatientName || selectedAppointment.extracted_patient_name || selectedAppointment.patients?.name || "المريض";
      const finalAmt = (selectedAppointment.paid_amount || selectedAppointment.services?.price || 0) - (selectedAppointment.discount_amount || 0);
      const promoLine = selectedAppointment.promotions ? `🎁 العرض: ${selectedAppointment.promotions.title}\n` : "";
      const methodLine = selectedAppointment.payment_method ? `💳 طريقة الدفع: ${selectedAppointment.payment_method}\n` : "";
      const msg = encodeURIComponent(
        `🧾 سند دفع رسمي - ${clinic?.name || "العيادة الطبية"}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `👤 المريض: ${patientName}\n` +
        `🔖 كود الحجز: ${selectedAppointment.reservation_code}\n` +
        `💊 الخدمة: ${selectedAppointment.services?.name || "فحص طبي"}\n` +
        promoLine +
        methodLine +
        `💰 المبلغ الصافي: ${finalAmt} ر.ي\n` +
        `📅 التاريخ: ${format(new Date(), "yyyy/MM/dd - hh:mm a")}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `✅ تم حفظ صورة السند المالي بجهازك، قم بإرفاقها بالدردشة.`
      );
      setTimeout(() => { window.open(`https://wa.me/${waPhone}?text=${msg}`, "_blank"); }, 800);
      toast({ title: "✅ تم حفظ صورة السند وفتح محادثة الواتساب", description: `الرقم: ${waPhone}` });
    } catch { toast({ title: "خطأ في معالجة صورة السند للواتساب", variant: "destructive" }); } finally { setSendingReceipt(false); }
  };

  const sendViaTelegram = async () => {
    if (!selectedAppointment) return;
    const tgUserId = selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id;
    if (!tgUserId) {
      toast({ title: "❌ المريض غير مسجل عبر تليجرام", description: "تم تسجيل هذا الحجز يدوياً بالعيادة وليس عبر بوت تليجرام.", variant: "destructive" });
      return;
    }
    setSendingTelegram(true);
    try {
      const canvas = await generateReceiptCanvas();
      const receiptImageBase64 = canvas.toDataURL("image/png");
      const { cleanName } = extractCleanInfo(selectedAppointment);
      const finalAmt = (selectedAppointment.paid_amount || selectedAppointment.services?.price || 0) - (selectedAppointment.discount_amount || 0);
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
        },
      });
      if (error) throw error;
      if (data?.ok) toast({ title: "✈️ تم إرسال السند بنجاح للمريض عبر تلجرام!" });
      else toast({ title: "❌ فشل الإرسال عبر تلجرام", description: data?.error || "خطأ من سيرفر تليجرام", variant: "destructive" });
    } catch (err: any) { toast({ title: "❌ خطأ في الاتصال بالبوت", description: err.message || "تعذر التواصل مع سيرفر البوت المركزي", variant: "destructive" }); } finally { setSendingTelegram(false); }
  };

  const getUniquePaymentToken = (appointment: Appointment) => {
    const baseCode = appointment.reservation_code || "PAY";
    const netPaid = (appointment.paid_amount || 0) - (appointment.discount_amount || 0);
    return `PAY-VERIFIED|${baseCode}|${netPaid}YR|${appointment.id.slice(0, 6).toUpperCase()}`;
  };

  // ─── Invoice Logic ──────────────────────────────────────────────────────────
  const resetInvoiceForm = () => {
    setInvoiceItems([{ id: '1', description: '', quantity: 1, price: 0, total: 0 }]);
    setInvoicePatient(null);
    setInvoiceDiscount(0);
    setInvoiceTax(0);
    setInvoicePatientSearch("");
  };

  const addInvoiceItem = () => {
    setInvoiceItems([
      ...invoiceItems,
      { id: String(Date.now()), description: '', quantity: 1, price: 0, total: 0 },
    ]);
  };

  const removeInvoiceItem = (id: string) => {
    if (invoiceItems.length <= 1) return;
    setInvoiceItems(invoiceItems.filter(item => item.id !== id));
  };

  const updateInvoiceItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setInvoiceItems(invoiceItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'price') {
          updated.total = (updated.quantity || 0) * (updated.price || 0);
        }
        return updated;
      }
      return item;
    }));
  };

  const calculateInvoiceTotals = () => {
    const subtotal = invoiceItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const discountAmount = invoiceDiscount || 0;
    const taxAmount = invoiceTax || 0;
    const total = subtotal - discountAmount + taxAmount;
    return { subtotal, discountAmount, taxAmount, total };
  };

  const handleIssueInvoice = async () => {
    if (!clinic || !invoicePatient) {
      toast({ title: "خطأ", description: "اختر مريضاً أولاً", variant: "destructive" });
      return;
    }

    const validItems = invoiceItems.filter(item => item.description.trim() && item.price > 0);
    if (validItems.length === 0) {
      toast({ title: "خطأ", description: "أضف على الأقل بنداً واحداً صالحاً", variant: "destructive" });
      return;
    }

    setSavingInvoice(true);
    try {
      const { subtotal, discountAmount, taxAmount, total } = calculateInvoiceTotals();

      const year = new Date().getFullYear();
      const { data: lastInvoice } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("clinic_id", clinic.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let seq = 1;
      if (lastInvoice?.invoice_number) {
        const parts = lastInvoice.invoice_number.split('-');
        if (parts.length === 3) {
          seq = parseInt(parts[2]) + 1;
        }
      }
      const invoiceNumber = `INV-${year}-${String(seq).padStart(4, '0')}`;

      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({
          clinic_id: clinic.id,
          patient_id: invoicePatient.id,
          invoice_number: invoiceNumber,
          items: validItems,
          subtotal,
          discount_amount: discountAmount,
          tax_amount: taxAmount,
          total_amount: total,
          paid_status: 'unpaid',
          notes: `فاتورة صادرة من الكاشير - ${new Date().toLocaleDateString('ar-SA')}`,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "✅ تم إصدار الفاتورة", description: `رقم: ${invoiceNumber}` });
      setInvoiceModalOpen(false);
      resetInvoiceForm();
      fetchAppointments();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSavingInvoice(false);
    }
  };

  // ─── Filters ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => appointments.filter((a) => {
    const { cleanName, cleanPhone } = extractCleanInfo(a);
    const matchesSearch =
      a.reservation_code.toLowerCase().includes(search.toLowerCase()) ||
      cleanName.toLowerCase().includes(search.toLowerCase()) ||
      cleanPhone.includes(search);
    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return !["cancelled"].includes(a.status);
    if (statusFilter === "paid") return a.payment_status === "paid";
    if (statusFilter === "unpaid") return a.payment_status !== "paid" && a.status !== "cancelled";
    if (statusFilter === "arrived") return !!a.arrived_at;
    if (statusFilter === "waiting") return !a.arrived_at && a.status !== "cancelled";
    return true;
  }), [appointments, search, statusFilter]);

  // ─── Guards ────────────────────────────────────────────────────────────────
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

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-mesh flex flex-col" dir="rtl">
      <div id={QR_FILE_ELEMENT_ID} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-border">
            <div className="flex justify-between items-center px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold text-foreground">مسح QR للصندوق</h3>
              <button onClick={stopScanner} className="p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition"><X className="w-5 h-5" /></button>
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
                  <Button onClick={startScanner} className="bg-primary text-white text-xs" size="sm"><RefreshCw className="w-3.5 h-3.5 ml-1" /> إعادة المحاولة</Button>
                </div>
              )}
            </div>
            <div className="px-5 pb-3">
              <Button variant="outline" className="w-full gap-2 border-dashed border-primary/50 text-primary text-xs h-10" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                <ImageIcon className="w-4 h-4" /> اختيار صورة من المعرض (لقطة شاشة)
              </Button>
            </div>
            <div className="flex gap-2 px-5 pb-5"><Button variant="ghost" className="w-full text-xs" onClick={stopScanner}>إغلاق</Button></div>
          </div>
        </div>
      )}

      {/* Header */}
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

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <CashierStats appointments={appointments} expenses={expenses} />

        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المريض، كود الحجز أو رقم الهاتف" className="pr-10" />
          </div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-40">
            <option value="active">النشطة</option><option value="all">الكل</option><option value="paid">مدفوع</option>
            <option value="unpaid">بانتظار الدفع</option><option value="arrived">حاضر</option><option value="waiting">لم يصل</option>
          </select>
          <div className="flex gap-2">
            <Button onClick={() => setWalkInOpen(true)} className="bg-primary"><Plus className="w-4 h-4 ml-1" />مريض مباشر</Button>
            <Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => {
              setInvoiceModalOpen(true);
              if (selectedAppointment?.patients) {
                setInvoicePatient({
                  id: selectedAppointment.patients.id || '',
                  name: selectedAppointment.patients.name || ''
                });
              }
            }}><FileText className="w-4 h-4 ml-1" /> فاتورة جديدة</Button>
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setExpenseModalOpen(true)}><MinusCircle className="w-4 h-4 ml-1" />تسجيل مصروف</Button>
            <Button variant="outline" onClick={() => { fetchAppointments(); fetchExpenses(); }}><RefreshCw className="w-4 h-4 ml-1" />تحديث</Button>
          </div>
        </div>

        {expenses.length > 0 && (
          <div className="card-modern p-4 space-y-2 bg-red-50/30 dark:bg-red-950/10 border-red-200/50">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-red-600 flex items-center gap-1"><MinusCircle className="w-4 h-4" /> المصروفات المسجلة ({expenses.length})</h3>
              <span className="text-xs font-black text-red-600">إجمالي: {expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()} ر.ي</span>
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

        <div className="grid gap-3">
          {filtered.map((a) => {
            const isPaid = a.payment_status === "paid";
            const isArrived = !!a.arrived_at;
            const { cleanName, cleanPhone } = extractCleanInfo(a);
            return (
              <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                    {a.is_walk_in && <span className="bg-emerald-500/15 text-emerald-600 px-2 py-0.5 rounded-lg text-xs font-bold">مباشر</span>}
                    {a.promotions && <span className="bg-amber-500/15 text-amber-600 px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1"><Gift className="w-3 h-3" /> {a.promotions.title}</span>}
                    <span className="text-sm text-muted-foreground"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                    {isArrived ? <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">وصل العيادة</span> : <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">بانتظار الوصول</span>}
                    {isPaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">مدفوع</span>}
                  </div>
                  <h2 className="font-bold text-foreground">{cleanName}</h2>
                  <p className="text-sm text-muted-foreground">{cleanPhone} — الخدمة: <b>{a.services?.name || "بدون خدمة"}</b></p>
                </div>
                <div className="flex gap-2 items-center justify-end">
                  {isPaid ? (
                    <Button variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-50/50" onClick={() => openPaymentModal(a)}><CheckCircle className="w-4 h-4 ml-1" />عرض السند الفاخر</Button>
                  ) : (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openPaymentModal(a)}><Banknote className="w-4 h-4 ml-1" />تسجيل الدفع ({a.services?.price || 0} ر.ي)</Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="card-modern p-12 text-center text-muted-foreground">لا توجد حالات مسجلة اليوم</div>}
        </div>
      </main>

      {/* Payment Modal */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-3xl max-w-md w-full shadow-2xl p-6 relative border border-border my-8">
            <button onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition"><X className="w-5 h-5" /></button>
            {!showReceipt ? (
              <div className="space-y-5 pt-2">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-2"><Banknote className="w-6 h-6" /></div>
                  <h2 className="text-xl font-bold text-foreground">تأكيد تحصيل المبلغ</h2>
                  <p className="text-xs text-muted-foreground mt-1">تأكد من اسم ورقم هاتف المريض قبل السداد</p>
                </div>
                {selectedAppointment.promotions && (
                  <div className="rounded-xl border-2 border-amber-400/60 bg-amber-500/10 p-3 text-sm flex items-center gap-2">
                    <Gift className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1">
                      <p className="font-bold text-amber-600">عرض مطبَّق تلقائياً: {selectedAppointment.promotions.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedAppointment.promotions.code ? `الكود: ${selectedAppointment.promotions.code} — ` : ""}
                        خصم {selectedAppointment.promotions.discount_type === "percentage" ? `${selectedAppointment.promotions.discount_value}%` : `${selectedAppointment.promotions.discount_value} ر.ي`}
                      </p>
                    </div>
                  </div>
                )}
                <div className="card-modern p-4 bg-muted/40 space-y-3 text-sm">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">اسم المريض الصريح</label>
                    <Input value={editPatientName} onChange={(e) => setEditPatientName(e.target.value)} placeholder="أدخل اسم المريض الرباعي" className="font-bold text-sm bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">رقم الهاتف (الواتساب)</label>
                    <div className="space-y-1">
                      <Input value={editPatientPhone} onChange={(e) => setEditPatientPhone(e.target.value)} placeholder="مثال: 771234567" className="font-bold text-sm bg-background text-right" dir="ltr" />
                      {(editPatientPhone.startsWith("tg:") || !editPatientPhone || editPatientPhone === "حجز عبر تلجرام (بدون رقم)") && (
                        <p className="text-[11px] text-amber-600 font-medium">⚠️ يرجى أدخال رقم هاتف المريض الحقيقي هنا للتواصل عبر الواتساب.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">طريقة الدفع</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="نقدي">نقدي</option>
                      <option value="تحويل بنكي">تحويل بنكي</option>
                      <option value="بطاقة ائتمان">بطاقة ائتمان</option>
                      <option value="بطاقة خصم">بطاقة خصم</option>
                      <option value="تطبيق دفع">تطبيق دفع</option>
                    </select>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2 pt-1">
                    <span className="text-muted-foreground">كود الحجز</span>
                    <span className="font-mono font-bold text-primary">{selectedAppointment.reservation_code}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">الخدمة المطلوبة</span>
                    <span className="font-medium text-foreground">{selectedAppointment.services?.name || "فحص طبي"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">المبلغ المستلم (ر.ي)</label>
                      <Input type="number" value={paidAmountInput} onChange={(e) => setPaidAmountInput(e.target.value)} className="font-bold text-lg" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">الخصم (ر.ي) — تلقائي من العرض</label>
                      <Input type="number" value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} className="font-bold text-lg text-red-500" />
                    </div>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border/80 text-base">
                    <span className="font-bold text-foreground">الصافي المطلوب</span>
                    <span className="font-black text-emerald-600 text-xl">{Math.max(0, (parseFloat(paidAmountInput) || 0) - (parseFloat(discountInput) || 0))} ريال</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11 text-base font-bold" onClick={handlePayNow} disabled={processingPayment}>
                    {processingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5 ml-1" />} تأكيد الدفع وإصدار السند
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="text-center mb-1">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-200"><CheckCircle className="w-3.5 h-3.5" /> تم الدفع والسداد بنجاح</span>
                </div>
                <div id="receipt-card-container" className="bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-xl relative overflow-hidden" style={{ direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  <div style={{ background: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%)", padding: "20px 24px 18px", color: "white", display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "48px", height: "48px", background: "rgba(255,255,255,0.2)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1.5px solid rgba(255,255,255,0.3)" }}>
                      {clinic?.logo_url ? <img src={clinic.logo_url} alt="logo" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }} /> : <span style={{ fontSize: "22px" }}>🏥</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "9px", opacity: 0.8, marginBottom: "3px", letterSpacing: "1.5px" }}>OFFICIAL PAYMENT RECEIPT</p>
                      <h2 style={{ fontSize: "17px", fontWeight: 900, margin: 0, lineHeight: 1.2 }}>{clinic?.name || "العيادة الطبية Smart Clinic"}</h2>
                      <p style={{ fontSize: "10px", opacity: 0.85, marginTop: "3px" }}>سند استلام مبلغ رسمـي</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "10px", padding: "6px 10px", textAlign: "center", border: "1px solid rgba(255,255,255,0.25)" }}>
                      <p style={{ fontSize: "8px", opacity: 0.9, margin: 0 }}>الحالة</p>
                      <p style={{ fontSize: "10px", fontWeight: 800, margin: "2px 0 0" }}>مدفوع ✓</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-gray-600"><span>رقم السند / الحجز:</span><span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{selectedAppointment.reservation_code}</span></div>
                    <div className="flex justify-between items-center text-gray-600"><span>تاريخ ووقت السداد:</span><span className="font-medium text-gray-800">{format(new Date(), "yyyy/MM/dd - hh:mm a")}</span></div>
                    <div className="flex justify-between items-center text-gray-600"><span>اسم المريض الصريح:</span><span className="font-bold text-gray-900 text-sm">{editPatientName || extractCleanInfo(selectedAppointment).cleanName}</span></div>
                    <div className="flex justify-between items-center text-gray-600"><span>رقم الهاتف:</span><span className="font-medium text-gray-800">{editPatientPhone || extractCleanInfo(selectedAppointment).cleanPhone}</span></div>
                    <div className="flex justify-between items-center text-gray-600"><span>الخدمة المقدمة:</span><span className="font-medium text-gray-800">{selectedAppointment.services?.name || "فحص طبي"}</span></div>
                    {selectedAppointment.promotions && (
                      <div className="flex justify-between items-center text-amber-600">
                        <span>🎁 العرض المطبَّق: {selectedAppointment.promotions.title}{selectedAppointment.promotions.code ? ` (${selectedAppointment.promotions.code})` : ""}</span>
                      </div>
                    )}
                    {selectedAppointment.payment_method && (
                      <div className="flex justify-between items-center text-blue-600">
                        <span>💳 طريقة الدفع: {selectedAppointment.payment_method}</span>
                      </div>
                    )}
                    {(selectedAppointment.discount_amount || 0) > 0 && (
                      <div className="flex justify-between items-center text-red-600"><span>الخصم الممنوح:</span><span className="font-bold">-{selectedAppointment.discount_amount} ر.ي</span></div>
                    )}
                    <div className="my-3 border-t border-dashed border-gray-200" />
                    <div className="flex justify-between items-center bg-emerald-50/80 p-3 rounded-xl border border-emerald-100">
                      <span className="font-bold text-emerald-900 text-sm">المبلغ الصافي المستلم:</span>
                      <span className="font-black text-emerald-700 text-xl">{(selectedAppointment.paid_amount || 0) - (selectedAppointment.discount_amount || 0)} <span className="text-xs font-normal">ر.ي</span></span>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-gray-700">رمز إثبات صحة السند المالي:</p>
                        <p className="text-[9px] font-mono text-gray-400 mt-0.5">{getUniquePaymentToken(selectedAppointment)}</p>
                      </div>
                      <div className="bg-white p-1 rounded-lg border border-gray-200 shrink-0">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x100&data=${encodeURIComponent(getUniquePaymentToken(selectedAppointment))}`} alt="Payment Verification QR" className="w-12 h-12" crossOrigin="anonymous" />
                      </div>
                    </div>
                    <div className="mt-3 text-center text-[9px] text-gray-400 border-t border-gray-100 pt-2">معتمد إلكترونياً عبر صندوق الخزينة — جميع الحقوق محفوظة</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={downloadReceipt}><Download className="w-3.5 h-3.5" /> تنزيل</Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={printReceipt}><Printer className="w-3.5 h-3.5" /> طباعة</Button>
                  <Button size="sm" className="text-xs gap-1 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold" onClick={sendViaWhatsApp} disabled={sendingReceipt}>
                    {sendingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />} إرسال للواتساب
                  </Button>
                  {(selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id) && (
                    <Button size="sm" className="text-xs gap-1 bg-[#0088cc] hover:bg-[#0077b5] text-white font-bold" onClick={sendViaTelegram} disabled={sendingTelegram}>
                      {sendingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} إرسال لتلجرام ✈️
                    </Button>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-border/40">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-teal-500 flex items-center justify-center text-white shadow-sm"><Sparkles className="w-4 h-4 animate-pulse" /></div>
                      <div>
                        <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 leading-tight">Smart Clinic System</p>
                        <a href="mailto:alkhyatalkhyat79@gmail.com" className="text-[10px] text-primary hover:underline font-mono leading-tight block">alkhyatalkhyat79@gmail.com</a>
                      </div>
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 text-left">نظام إدارة العيادات الذكي</div>
                  </div>
                </div>
                <Button variant="ghost" className="w-full text-xs mt-1" onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }}>إغلاق النافذة</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Walk-In Modal */}
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

      {/* Expense Modal */}
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
                  <option value="نثريات">نثريات</option><option value="أدوات طبية">أدوات طبية</option><option value="صيانة">صيانة</option><option value="كهرباء/ماء">كهرباء/ماء</option><option value="أخرى">أخرى</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">تاريخ المصروف</label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="input-modern" />
            </div>
            <Button onClick={handleAddExpense} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"><MinusCircle className="w-4 h-4 ml-1" />قيد المصروف في الخزينة</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Modal */}
      <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>فاتورة جديدة</DialogTitle>
            <DialogDescription>أضف البنود والخدمات لإصدار فاتورة رسمية</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Patient Selection */}
            <div className="flex gap-3 items-center">
              <Label className="shrink-0">المريض:</Label>
              <Input
                value={invoicePatient?.name || invoicePatientSearch || ''}
                onChange={(e) => {
                  setInvoicePatientSearch(e.target.value);
                  const found = appointments.find(a => a.patients?.name?.includes(e.target.value));
                  if (found?.patients) {
                    setInvoicePatient({ id: found.patients.id || '', name: found.patients.name || '' });
                  }
                }}
                placeholder="ابحث باسم المريض..."
                className="flex-1"
              />
            </div>

            {/* Invoice Items */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-center">
                <Label className="font-bold">البنود والخدمات</Label>
                <Button size="sm" variant="outline" onClick={addInvoiceItem}>
                  <Plus className="w-4 h-4 ml-1" /> إضافة بند
                </Button>
              </div>

              {invoiceItems.map((item) => (
                <div key={item.id} className="flex gap-2 items-center bg-muted/30 p-2 rounded-lg">
                  <Input
                    value={item.description}
                    onChange={(e) => updateInvoiceItem(item.id, 'description', e.target.value)}
                    placeholder="البيان"
                    className="flex-1 text-sm"
                  />
                  <Input
                    type="number"
                    value={item.quantity || 1}
                    onChange={(e) => updateInvoiceItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-16 text-sm text-center"
                    min="1"
                  />
                  <Input
                    type="number"
                    value={item.price || 0}
                    onChange={(e) => updateInvoiceItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                    className="w-24 text-sm text-center"
                    min="0"
                    step="0.01"
                  />
                  <span className="text-sm font-bold w-20 text-left">
                    {(item.total || 0).toFixed(2)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => removeInvoiceItem(item.id)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              {/* Invoice Summary */}
              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>المجموع الفرعي:</span>
                  <span className="font-bold">{calculateInvoiceTotals().subtotal.toFixed(2)} ر.ي</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span>الخصم:</span>
                  <Input
                    type="number"
                    value={invoiceDiscount}
                    onChange={(e) => setInvoiceDiscount(parseFloat(e.target.value) || 0)}
                    className="w-24 text-sm"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span>الضريبة:</span>
                  <Input
                    type="number"
                    value={invoiceTax}
                    onChange={(e) => setInvoiceTax(parseFloat(e.target.value) || 0)}
                    className="w-24 text-sm"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>الإجمالي:</span>
                  <span className="text-primary">{calculateInvoiceTotals().total.toFixed(2)} ر.ي</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvoiceModalOpen(false); resetInvoiceForm(); }}>إلغاء</Button>
            <Button onClick={handleIssueInvoice} disabled={savingInvoice}>
              {savingInvoice ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
              إصدار الفاتورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

// ─── Stats Component ──────────────────────────────────────────────────────────
function CashierStats({ appointments, expenses }: { appointments: Appointment[]; expenses: Expense[] }) {
  const paid = appointments.filter((a) => a.payment_status === "paid");

  const amountFor = (a: Appointment) => {
    const gross = typeof a.paid_amount === "number" ? a.paid_amount : (a.services?.price || 0);
    const disc = a.discount_amount || 0;
    return Math.max(0, gross - disc);
  };

  const totalRevenue = paid.reduce((s, a) => s + amountFor(a), 0);
  const totalDiscount = paid.reduce((s, a) => s + (a.discount_amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netInDrawer = totalRevenue - totalDiscount - totalExpenses;
  const avgTicket = paid.length ? Math.round((totalRevenue - totalDiscount) / paid.length) : 0;

  // Chart 1: Financial Flow
  const financialFlow = useMemo(() => {
    const buckets: Record<number, { revenue: number; expense: number }> = {};
    for (let h = 8; h <= 20; h++) buckets[h] = { revenue: 0, expense: 0 };
    paid.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) {
        buckets[h].revenue += amountFor(a);
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

  // Chart 2: Service Distribution
  const byService = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach((a) => {
      const key = a.services?.name || "بدون خدمة";
      map[key] = (map[key] || 0) + amountFor(a);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid]);

  // Chart 3: Payment Methods
  const paymentMethods = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach((a) => {
      const method = (a as any).payment_method || 'نقدي';
      map[method] = (map[method] || 0) + amountFor(a);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid]);

  // Chart 4: Expense Distribution
  const expenseCategories = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [expenses]);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Financial Flow */}
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><DollarSign className="w-4 h-4 text-emerald-500" /><h3 className="font-bold text-foreground">تدفق الإيرادات والمصروفات</h3></div>
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

        {/* Chart 2: Service Distribution */}
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><Receipt className="w-4 h-4 text-primary" /><h3 className="font-bold text-foreground">الإيرادات حسب الخدمات</h3></div>
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

        {/* Chart 3: Payment Methods */}
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><Wallet className="w-4 h-4 text-blue-500" /><h3 className="font-bold text-foreground">طرق الدفع</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={paymentMethods} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={4} stroke="hsl(var(--background))" strokeWidth={2}>
                {paymentMethods.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
              <Legend wrapperStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 4: Expense Distribution */}
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><ArrowDownCircle className="w-4 h-4 text-red-500" /><h3 className="font-bold text-foreground">توزيع المصروفات</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={expenseCategories} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="value" name="المبلغ" fill="hsl(0 84% 60%)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

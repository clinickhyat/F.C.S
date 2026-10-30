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
  Camera, X, Loader2, AlertCircle, Image as ImageIcon, Upload, RefreshCw, Printer, Download, Clock, Plus, UserPlus, DollarSign, TrendingUp, Receipt, MessageCircle, MinusCircle, Wallet, ArrowDownCircle, ArrowUpCircle, Sparkles, Send, FileText, Calendar, Filter, Trash2, CreditCard, PieChart as PieIcon, Home, QrCode, ScanLine, ShieldCheck, ShieldAlert, BookOpen, Link as LinkIcon, RotateCcw, PlusCircle
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Html5Qrcode } from "html5-qrcode";
import html2canvas from "html2canvas";

// ============================================================
// Types
// ============================================================
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

type InvoiceItem = { 
  name: string; 
  qty: number; 
  price: number; 
  reference?: string;      
  linkedVisit?: string;    
};

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
  payment_reference?: string;
  linked_visit_code?: string;
};

// ============================================================
// Helpers & Constants
// ============================================================
const QR_CAMERA_ELEMENT_ID = "qr-camera-container-cashier";
const QR_FILE_ELEMENT_ID = "qr-hidden-file-reader-cashier";

const ARAB_COUNTRY_CODES = [
  { code: "+962", name: "الأردن" },
  { code: "+971", name: "الإمارات" },
  { code: "+973", name: "البحرين" },
  { code: "+213", name: "الجزائر" },
  { code: "+966", name: "السعودية" },
  { code: "+249", name: "السودان" },
  { code: "+964", name: "العراق" },
  { code: "+968", name: "عمان" },
  { code: "+974", name: "قطر" },
  { code: "+965", name: "الكويت" },
  { code: "+212", name: "المغرب" },
  { code: "+967", name: "اليمن" },
  { code: "+216", name: "تونس" },
  { code: "+963", name: "سوريا" },
  { code: "+961", name: "لبنان" },
  { code: "+218", name: "ليبيا" },
  { code: "+20", name: "مصر" },
  { code: "+222", name: "موريتانيا" }
].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

const round2 = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;

const parseQRText = (text: string) => {
  let code = "", name = "", phone = "", service = "", date = "", time = "";
  const verifiedMatch = text.match(/PAY-VERIFIED\|([^\n\r|]+)/i);
  const searchText = verifiedMatch ? verifiedMatch[1].trim() : text;

  const codeMatch =
    searchText.match(/RE-[A-Za-z0-9]+/i) ||
    searchText.match(/WI-[A-Za-z0-9]+/i) ||
    searchText.match(/INV-[A-Za-z0-9]+/i) ||
    searchText.match(/PAY-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/i);
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
  if (!phone || phone.startsWith("tg:") || phone === "بدون هاتف" || phone === ".") return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  let waPhone = digits;
  if (digits.startsWith("00")) waPhone = digits.slice(2);
  else if (digits.startsWith("0")) waPhone = "967" + digits.slice(1);
  return waPhone;
};

const extractCleanInfo = (a: Appointment) => {
  let name = a.patients?.name || a.extracted_patient_name || "";
  let phone = a.patients?.phone || a.extracted_patient_phone || "";
  const isGenericName = !name || name === "." || name.includes("غير محدد");
  const isGenericPhone = !phone || phone.startsWith("tg:") || phone === "." || phone === "بدون هاتف";

  if ((isGenericName || isGenericPhone) && a.notes) {
    const nameMatch = a.notes.match(/المريض:\s*([^(–\n\r]+)/);
    if (nameMatch && isGenericName) name = nameMatch[1].trim();
    const phoneMatch = a.notes.match(/\(([^)]+)\)/);
    if (phoneMatch && isGenericPhone) phone = phoneMatch[1].trim();
  }

  let cleanName = name.replace(/^tg:\d+/i, "").replace(/👤/g, "").replace(/@\w+/g, "").trim();
  if (!cleanName || cleanName.length < 2) cleanName = "مريض غير محدد";
  let cleanPhone = phone.trim();
  if (!cleanPhone || cleanPhone.startsWith("tg:") || cleanPhone === ".") cleanPhone = "بدون رقم";
  
  return { cleanName, cleanPhone };
};

const calcDiscountAmount = (baseAmount: number, value: number, type: string | null | undefined): number => {
  if (!value || value <= 0 || !baseAmount || baseAmount <= 0) return 0;
  if (type === "percentage") return round2(baseAmount * (value / 100));
  return Math.min(value, baseAmount);
};

const computeNetCollected = (a: Appointment): number => {
  if (typeof a.paid_amount === "number" && a.paid_amount > 0) return round2(a.paid_amount);
  if (typeof a.final_price === "number" && a.final_price > 0) return round2(a.final_price);
  if (typeof a.services?.price === "number" && a.services.price > 0) {
    const disc = calcDiscountAmount(a.services.price, a.discount_amount || 0, a.discount_type);
    return round2(Math.max(0, a.services.price - disc));
  }
  return 0;
};

const generatePaymentReference = (phone: string): string => {
  const clean = phone.replace(/\D/g, "").slice(-4) || "0000";
  const d = new Date();
  const ds = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(-2)}`;
  const uniqueSeq = String(Date.now()).slice(-4) + Math.floor(Math.random() * 10);
  return `PAY-${clean}-${ds}-${uniqueSeq}`;
};

const isPaymentRecord = (inv: Invoice): boolean => String(inv.invoice_number || "").startsWith("PAY-");
const extractLinkedVisit = (inv: Invoice): string | null => {
  const notes = inv.notes || "";
  const m = notes.match(/\[LINKED_VISIT:([A-Za-z0-9-]+)\]/);
  return m ? m[1] : null;
};

// ============================================================
// Component
// ============================================================
export default function CashierPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();

  const [activeTab, setActiveTab] = useState<"main" | "invoices" | "receipts">("main");
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
  const today = dateFilter;
  
  const [invoicesFrom, setInvoicesFrom] = useState<string>(todayStr);
  const [invoicesTo, setInvoicesTo] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editPatientName, setEditPatientName] = useState<string>("");
  const [editPatientPhone, setEditPatientPhone] = useState<string>("");
  
  const [totalCostInput, setTotalCostInput] = useState<string>(""); 
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");
  
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>("نقدي");
  const [showReceipt, setShowReceipt] = useState(false);
  
  const [processingPayment, setProcessingPayment] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);

  const [visitType, setVisitType] = useState<"normal" | "followup" | "link">("normal");
  const [linkedVisitCode, setLinkedVisitCode] = useState<string>("");
  const [patientPreviousVisits, setPatientPreviousVisits] = useState<any[]>([]);
  const [paymentDate, setPaymentDate] = useState<string>(todayStr);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [verifyScannerOpen, setVerifyScannerOpen] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ status: "idle" | "loading" | "valid" | "invalid"; message: string } | null>(null);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);

  const [invoicesSearch, setInvoicesSearch] = useState<string>("");
  const [invoicesOnlyPromo, setInvoicesOnlyPromo] = useState<boolean>(false);
  const [invoicesLoading, setInvoicesLoading] = useState<boolean>(false);
  const [invoiceAppointments, setInvoiceAppointments] = useState<Appointment[]>([]);
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([]);

  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [invPatientName, setInvPatientName] = useState("");
  const [invPatientCountryCode, setInvPatientCountryCode] = useState("+967");
  const [invPatientPhone, setInvPatientPhone] = useState("");
  const [invItems, setInvItems] = useState<InvoiceItem[]>([{ name: "", qty: 1, price: 0 }]);
  const [invDiscountType, setInvDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [invDiscountValue, setInvDiscountValue] = useState<string>("0");
  const [invPaymentMethod, setInvPaymentMethod] = useState<string>("نقدي");
  const [invNotes, setInvNotes] = useState("");
  const [invSaving, setInvSaving] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [selectedLedgerPatient, setSelectedLedgerPatient] = useState<any | null>(null);
  const [ledgerAmount, setLedgerAmount] = useState("");
  const [ledgerMethod, setLedgerMethod] = useState("نقدي");
  const [ledgerLinkedVisit, setLedgerLinkedVisit] = useState<string>("");
  const [ledgerNotes, setLedgerNotes] = useState("");
  
  const [fullPatientHistory, setFullPatientHistory] = useState<{ visits: any[], payments: any[], total: number, paid: number, remaining: number } | null>(null);

  useEffect(() => { appointmentsRef.current = appointments; }, [appointments]);
  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [authLoading, user, navigate]);
  useEffect(() => { if (clinicLoading) return; if (role === "reception") navigate("/reception", { replace: true }); }, [role, clinicLoading, navigate]);

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
    const { data, error } = await supabase.from("expenses").select("*").eq("clinic_id", clinic.id).eq("expense_date", today).order("expense_time", { ascending: false });
    if (!error) setExpenses((data || []) as Expense[]);
  }, [clinic, today]);

  const fetchInvoices = useCallback(async () => {
    if (!clinic) return;
    setInvoicesLoading(true);
    try {
      const [apptRes, invRes] = await Promise.all([
        supabase.from("appointments").select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,discount_applied,discount_type,is_walk_in,notes,customer_telegram_id,is_promo,promo_code,promotion_id,original_price,final_price,payment_method,payment_time,created_at,patients(id,name,phone,telegram_user_id),services(name,price)").eq("clinic_id", clinic.id).in("payment_status", ["paid", "partial"]).gte("date", invoicesFrom).lte("date", invoicesTo).order("date", { ascending: false }).order("time", { ascending: false }).limit(500),
        supabase.from("invoices").select("*").eq("clinic_id", clinic.id).gte("created_at", `${invoicesFrom}T00:00:00`).lte("created_at", `${invoicesTo}T23:59:59`).order("created_at", { ascending: false }).limit(500),
      ]);
      setInvoiceAppointments((apptRes.data || []) as Appointment[]);
      const enriched = (invRes.data || []).map((inv: any) => ({ ...inv, payment_reference: String(inv.invoice_number || "").startsWith("PAY-") ? inv.invoice_number : undefined, linked_visit_code: extractLinkedVisit(inv) })) as Invoice[];
      setInvoicesList(enriched);
    } finally { setInvoicesLoading(false); }
  }, [clinic, invoicesFrom, invoicesTo]);

  useEffect(() => {
    if (!clinic) return;
    fetchAppointments(); fetchExpenses();
    const channel = supabase.channel(`cashier-${clinic.id}-${today}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, fetchAppointments)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `clinic_id=eq.${clinic.id}` }, fetchExpenses)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, today, fetchAppointments, fetchExpenses]);

  useEffect(() => { if ((activeTab === "invoices" || activeTab === "receipts") && clinic) fetchInvoices(); }, [activeTab, clinic, fetchInvoices]);
  useEffect(() => { return () => { destroyScanner(); }; }, []);

  const destroyScanner = async () => {
    if (!scannerRef.current) return;
    try { if (scannerRef.current.isScanning) await scannerRef.current.stop(); scannerRef.current.clear(); }
    catch (_) {} finally { scannerRef.current = null; }
  };

  const getFriendlyError = (error: any): string => {
    const msg = String(error?.message || error || "");
    if (msg.includes("NotAllowedError")) return "🔒 لم يتم منح إذن الكاميرا.";
    if (msg.includes("NotFoundError")) return "📷 لا توجد كاميرا متصلة.";
    if (msg.includes("NotReadableError")) return "⚠️ الكاميرا مستخدمة من تطبيق آخر.";
    return `❌ فشل تشغيل الكاميرا.`;
  };

  const markArrived = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase.from("appointments").update({ arrived_at: new Date().toISOString(), department: "استقبال" }).eq("id", appointmentId).eq("clinic_id", clinic.id);
    if (!error) { toast({ title: "✅ تم تسجيل الحضور" }); fetchAppointments(); }
  };

  const fetchPatientPreviousVisits = async (patientId: string) => {
    if (!patientId) return;
    const { data } = await supabase.from("appointments").select("reservation_code, services(name), final_price, paid_amount, date").eq("patient_id", patientId).in("payment_status", ["unpaid", "partial"]).order("date", { ascending: false });
    if (data) setPatientPreviousVisits(data.map((v: any) => ({ code: v.reservation_code, service: v.services?.name || "خدمة", remaining: round2((v.final_price || 0) - (v.paid_amount || 0)) })));
  };

  const handleScannedCode = useCallback(async (rawText: string) => {
    if (verifyScannerOpen) {
      setVerifyResult({ status: "loading", message: "جاري التحقق..." });
      const qrParsed = parseQRText(rawText);
      const targetCode = qrParsed.code || rawText.trim();
      if (targetCode) {
        const { data: inv } = await supabase.from("invoices").select("*").eq("invoice_number", targetCode).maybeSingle();
        if (inv) {
          setVerifyResult({ status: "valid", message: `✅ سند صحيح\nرقم: ${inv.invoice_number}\nالمريض: ${inv.patient_name}\nالمبلغ: ${Number(inv.total_amount).toLocaleString()}` });
          setScannerOpen(false); stopScanner(); return;
        }
        const { data: appt } = await supabase.from("appointments").select("*, patients(name)").eq("reservation_code", targetCode).maybeSingle();
        if (appt) {
          setVerifyResult({ status: "valid", message: `✅ سند صحيح\nكود: ${appt.reservation_code}\nالمريض: ${appt.patients?.name || 'غير محدد'}\nالمدفوع: ${Number(appt.paid_amount || 0).toLocaleString()}` });
          setScannerOpen(false); stopScanner(); return;
        }
      }
      setVerifyResult({ status: "invalid", message: `❌ سند غير صحيح` });
      setScannerOpen(false); stopScanner(); return;
    }

    const qrParsed = parseQRText(rawText);
    const targetCode = qrParsed.code || rawText.trim();
    let found = appointmentsRef.current.find(a => a.id === targetCode || a.reservation_code.toUpperCase() === targetCode.toUpperCase());
    if (!found && clinic && targetCode) {
      const { data } = await supabase.from("appointments").select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,discount_applied,discount_type,is_walk_in,notes,customer_telegram_id,is_promo,promo_code,promotion_id,original_price,final_price,payment_method,payment_time,created_at,patients(id,name,phone,telegram_user_id),services(name,price)").eq("clinic_id", clinic.id).ilike("reservation_code", `%${targetCode}%`).maybeSingle();
      if (data) found = data as Appointment;
    }
    if (found) {
      const { cleanName, cleanPhone } = extractCleanInfo(found);
      const enriched: Appointment = { ...found, extracted_patient_name: cleanName, extracted_patient_phone: cleanPhone, patients: { id: found.patients?.id, name: cleanName, phone: cleanPhone, telegram_user_id: found.patients?.telegram_user_id }, services: found.services || (qrParsed.service ? { name: qrParsed.service, price: null } : null) };
      if (!enriched.arrived_at) { await markArrived(enriched.id); enriched.arrived_at = new Date().toISOString(); }
      openPaymentModal(enriched);
      setScannerOpen(false); stopScanner();
    } else {
      setScannerMessage(`❌ لم يتم العثور على الحجز`);
      setTimeout(() => setScannerMessage(null), 3000);
    }
  }, [clinic, verifyScannerOpen]);

  const stopScanner = useCallback(async () => {
    await destroyScanner(); setScannerOpen(false); setVerifyScannerOpen(false); setScannerStatus("idle"); setCameraError(null);
  }, []);

  const startScanner = useCallback(async (isVerify = false) => {
    await destroyScanner();
    setVerifyScannerOpen(isVerify); setVerifyResult(null); setCameraError(null); setScannerStatus("loading"); setScannerOpen(true);
    await new Promise(r => setTimeout(r, 250));
    const element = document.getElementById(QR_CAMERA_ELEMENT_ID);
    if (!element) { setCameraError("❌ تعذر تهيئة الماسح."); setScannerStatus("error"); return; }
    
    const tryStart = async (facingMode: "environment" | "user"): Promise<boolean> => {
      try {
        const scanner = new Html5Qrcode(QR_CAMERA_ELEMENT_ID, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start({ facingMode }, { fps: 10, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.85), height: Math.floor(Math.min(w, h) * 0.85) }) }, (text) => { stopScanner().then(() => handleScannedCode(text)); }, () => {});
        setScannerStatus("active");
        return true;
      } catch (e) {
        if (scannerRef.current) { try { scannerRef.current.clear(); } catch(_){} scannerRef.current = null; }
        throw e;
      }
    };
    try { await tryStart("environment"); } catch (_) {
      try { await tryStart("user"); } catch (second) { setCameraError(getFriendlyError(second)); setScannerStatus("error"); }
    }
  }, [stopScanner, handleScannedCode]);

  const processImageForQR = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d");
        if (!ctx) return reject("فشل Canvas");
        let w = img.width, h = img.height;
        if (w > 1000 || h > 1000) { if (w > h) { h = Math.round((h * 1000) / w); w = 1000; } else { w = Math.round((w * 1000) / h); h = 1000; } }
        canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => { if (blob) resolve(new File([blob], file.name, { type: "image/png" })); else reject("فشل"); }, "image/png");
      };
      img.onerror = () => reject("فشل التحميل"); img.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingImage(true); await destroyScanner();
    try {
      const fileScanner = new Html5Qrcode(QR_FILE_ELEMENT_ID, { verbose: false });
      let decodedText = "";
      try { decodedText = await fileScanner.scanFile(file, false); } catch (_) { const resized = await processImageForQR(file); decodedText = await fileScanner.scanFile(resized, false); }
      await stopScanner(); handleScannedCode(decodedText);
    } catch (err) { toast({ title: "فشل قراءة QR", description: "تأكد من وضوح الكود.", variant: "destructive" }); } finally { setUploadingImage(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const openPaymentModal = (appointment: Appointment) => {
    const { cleanName, cleanPhone } = extractCleanInfo(appointment);
    setSelectedAppointment({ ...appointment, extracted_patient_name: cleanName, extracted_patient_phone: cleanPhone });
    setEditPatientName(cleanName !== "مريض غير محدد" ? cleanName : ""); setEditPatientPhone(cleanPhone === "بدون رقم" ? "" : cleanPhone);
    const original = appointment.original_price ?? appointment.final_price ?? appointment.services?.price ?? 0;
    const discountValue = appointment.discount_amount ?? 0;
    const discountAmt = appointment.discount_applied ?? calcDiscountAmount(original, discountValue, appointment.discount_type || "fixed");
    const final = appointment.final_price ?? (original - discountAmt);
    const alreadyPaid = round2(appointment.paid_amount || 0);
    const remaining = round2(Math.max(0, final - alreadyPaid));
    setTotalCostInput(String(original)); setPaidAmountInput(String(remaining > 0 ? remaining : (final > 0 ? final : original)));
    setDiscountInput(String(discountValue)); setPaymentMethodInput(appointment.payment_method || "نقدي"); setShowReceipt(appointment.payment_status === "paid");
    setVisitType("normal"); setLinkedVisitCode(""); setPaymentDate(todayStr);
    if (appointment.patients?.id) fetchPatientPreviousVisits(appointment.patients.id); else setPatientPreviousVisits([]);
  };
// ============================================================
// دوال الإرسال إلى تليجرام (تصميم فاخر + إرسال تلقائي)
// ============================================================

const autoSendToTelegram = async (payload: {
  type: "paid" | "partial" | "promo" | "manual" | "previous" | "invoice";
  code: string; name: string; service: string; amount: number; tgId: string;
  linkedVisit?: string; original?: number; discount?: number; discountType?: string; items?: any[];
}) => {
  if (!payload.tgId) return;
  setSendingTelegram(true);
  try {
    let themeColor = "#059669"; 
    let bgLight = "#ecfdf5";
    let title = "سند استلام مبلغ";
    
    if (payload.type === "promo") { themeColor = "#7c3aed"; bgLight = "#f5f3ff"; title = "سند عرض خاص"; }
    if (payload.type === "partial") { themeColor = "#ea580c"; bgLight = "#fff7ed"; title = "سند دفع جزئي"; }
    if (payload.type === "manual") { themeColor = "#e11d48"; bgLight = "#fff1f2"; title = "سند دفعة يدوية"; }
    if (payload.type === "previous") { themeColor = "#0284c7"; bgLight = "#f0f9ff"; title = "سند سداد سابق"; }
    if (payload.type === "invoice") { themeColor = "#db2777"; bgLight = "#fdf2f8"; title = "فاتورة مبيعات"; }

    const itemsHtml = payload.items ? payload.items.map((it: any) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:10px 14px; border-radius:12px; margin-bottom:6px; border:1px solid #f1f5f9;">
        <span style="font-size:13px; color:#334155; font-weight:600;">${it.name} <span style="color:#94a3b8; font-size:11px;">× ${it.qty}</span></span>
        <span style="font-size:14px; font-weight:800; color:#0f172a;">${(Number(it.qty) * Number(it.price)).toLocaleString()}</span>
      </div>
    `).join("") : '';

    const receiptHtml = `
      <div style="width:400px; background:#ffffff; padding:0; direction:rtl; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; border-radius:28px; overflow:hidden; border:1px solid #e2e8f0; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15);">
        
        <div style="background:linear-gradient(135deg, ${themeColor} 0%, ${themeColor}dd 100%); padding:32px 28px; color:white; display:flex; justify-content:space-between; align-items:center; position:relative; overflow:hidden;">
          <div style="position:absolute; top:-30px; left:-30px; width:120px; height:120px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
          <div style="position:absolute; bottom:-20px; right:-20px; width:80px; height:80px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
          
          <div style="position:relative; z-index:10;">
            <p style="font-size:11px; opacity:0.9; margin:0 0 8px; letter-spacing:2px; font-weight:800; text-transform:uppercase;">${title}</p>
            <h2 style="font-size:24px; font-weight:900; margin:0; line-height:1.2; text-shadow:0 2px 4px rgba(0,0,0,0.1);">${clinic?.name || "العيادة"}</h2>
          </div>
          ${clinic?.logo_url ? `<img src="${clinic.logo_url}" style="width:64px; height:64px; border-radius:18px; object-fit:cover; background:white; padding:4px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); position:relative; z-index:10;" />` : `<div style="width:64px; height:64px; background:rgba(255,255,255,0.2); border-radius:18px; display:flex; align-items:center; justify-content:center; font-size:28px; position:relative; z-index:10; border:2px solid rgba(255,255,255,0.3);">🏥</div>`}
        </div>
        
        <div style="padding:28px; font-size:14px; color:#1e293b; display:flex; flex-direction:column; gap:14px;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:1px dashed #cbd5e1;">
            <div>
              <p style="margin:0 0 4px; font-size:11px; color:#64748b; font-weight:700;">رقم المستند</p>
              <b style="color:#0f172a; font-family:monospace; font-size:15px; background:#f1f5f9; padding:4px 8px; border-radius:8px; border:1px solid #e2e8f0;">${payload.code}</b>
            </div>
            <div style="text-align:left;">
              <p style="margin:0 0 4px; font-size:11px; color:#64748b; font-weight:700;">التاريخ</p>
              <b style="color:#334155; font-size:13px;">${format(new Date(), "yyyy/MM/dd - hh:mm a")}</b>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#64748b; font-weight:600;">المريض</span>
            <b style="color:#0f172a; font-size:16px;">${payload.name}</b>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#64748b; font-weight:600;">الخدمة</span>
            <b style="color:#0f172a; font-size:15px;">${payload.service}</b>
          </div>
          ${payload.linkedVisit ? `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#64748b; font-weight:600;">مرتبطة بزيارة</span>
            <b style="color:${themeColor}; background:${bgLight}; padding:4px 10px; border-radius:8px; font-size:13px; font-family:monospace; border:1px solid ${themeColor}30;">${payload.linkedVisit}</b>
          </div>` : ''}
          
          ${payload.items && payload.items.length > 0 ? `
            <div style="border-top:1px dashed #cbd5e1; margin:8px 0;"></div>
            <p style="font-size:11px; font-weight:800; color:#64748b; margin:0 0 8px; letter-spacing:1px;">تفاصيل البنود</p>
            ${itemsHtml}
          ` : ''}

          <div style="border-top:1px dashed #cbd5e1; margin:8px 0;"></div>
          
          <div style="background:linear-gradient(to bottom right, ${bgLight}, #ffffff); border:2px solid ${themeColor}30; padding:24px; border-radius:20px; display:flex; justify-content:space-between; align-items:center; box-shadow:inset 0 2px 8px 0 rgba(0,0,0,0.02), 0 8px 20px -6px ${themeColor}20;">
            <span style="font-weight:800; color:${themeColor}; font-size:16px;">المبلغ المستلم</span>
            <span style="font-size:38px; font-weight:900; color:${themeColor}; letter-spacing:-1px;">${Number(payload.amount).toLocaleString()}</span>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:16px;">
            <div>
              <p style="font-size:10px; color:#94a3b8; margin:0 0 4px; font-weight:700;">رمز التحقق الإلكتروني</p>
              <p style="font-size:11px; font-family:monospace; color:#64748b; margin:0; background:#f8fafc; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0;">PAY-VERIFIED|${payload.code}</p>
            </div>
            <div style="background:white; padding:8px; border-radius:14px; border:1px solid #e2e8f0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent("PAY-VERIFIED|" + payload.code)}" style="width:56px; height:56px; display:block;" />
            </div>
          </div>
          
          <p style="text-align:center; font-size:11px; color:#94a3b8; margin-top:20px; font-weight:600; border-top:1px solid #f1f5f9; padding-top:16px;">معتمد إلكترونياً - ${clinic?.name}</p>
        </div>
      </div>
    `;

    const tempDiv = document.createElement("div"); tempDiv.style.position = "absolute"; tempDiv.style.left = "-9999px"; tempDiv.innerHTML = receiptHtml; document.body.appendChild(tempDiv);
    const canvas = await html2canvas(tempDiv.firstElementChild as HTMLElement, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png"); document.body.removeChild(tempDiv);

    await supabase.functions.invoke("telegram-bot", {
      body: { action: "send_receipt", clinic_id: clinic?.id, chat_id: payload.tgId, receipt_image: imgData, reservation_code: payload.code, patient_name: payload.name, service_name: payload.service, amount: payload.amount, type: payload.type, clinic_name: clinic?.name || "العيادة" }
    });
  } catch (err) {
    console.warn("[AUTO-RECEIPT] فشل الإرسال:", err);
  } finally {
    setSendingTelegram(false);
  }
};

const sendTelegramLedger = async (patientName: string, phone: string): Promise<boolean> => {
  setSendingTelegram(true);
  try {
    let tgId = "";
    if (phone && phone !== "بدون رقم") {
      const { data: pData } = await supabase.from("patients").select("id, telegram_user_id").eq("clinic_id", clinic?.id).eq("phone", phone).maybeSingle();
      if (pData?.telegram_user_id) tgId = pData.telegram_user_id;
    }
    if (!tgId && patientName) {
      const pVisits = invoiceAppointments.find(a => {
        const info = extractCleanInfo(a);
        return (phone && phone !== "بدون رقم" && info.cleanPhone === phone) || (patientName && info.cleanName === patientName);
      });
      if (pVisits) tgId = pVisits.customer_telegram_id || pVisits.patients?.telegram_user_id || "";
    }
    if (!tgId) return false;

    const { data: pData2 } = await supabase.from("patients").select("id").eq("clinic_id", clinic?.id).eq("phone", phone).maybeSingle();
    let appts = [];
    if (pData2?.id) {
      const { data } = await supabase.from("appointments").select("reservation_code, date, final_price, paid_amount, services(name), payment_status").eq("clinic_id", clinic?.id).eq("patient_id", pData2.id);
      appts = data || [];
    } else if (phone && phone !== "بدون رقم") {
      const { data } = await supabase.from("appointments").select("reservation_code, date, final_price, paid_amount, services(name), payment_status, patients!inner(phone)").eq("clinic_id", clinic?.id).eq("patients.phone", phone);
      appts = data || [];
    }

    const filters = [];
    if (phone && phone !== "بدون رقم") filters.push(`patient_phone.eq.${phone}`);
    if (patientName) filters.push(`patient_name.eq.${patientName}`);
    const orFilter = filters.length ? filters.join(",") : "id.eq.00000000-0000-0000-0000-000000000000";

    const { data: invs } = await supabase.from("invoices").select("*").eq("clinic_id", clinic?.id).or(orFilter);

    const validAppts = appts.filter(a => a.payment_status === "paid" || a.payment_status === "partial" || Number(a.paid_amount) > 0);
    
    const visitsHtml = validAppts.map(a => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:16px; border-radius:16px; margin-bottom:10px; border:1px solid #f1f5f9; box-shadow:0 2px 4px 0 rgba(0,0,0,0.02);">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="font-family:monospace; font-size:12px; font-weight:bold; background:#f1f5f9; padding:2px 8px; border-radius:6px; border:1px solid #e2e8f0; color:#334155;">${a.reservation_code}</span>
            <span style="font-size:12px; color:#64748b; font-weight:600;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline; margin-left:4px; vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>${a.date}</span>
          </div>
          <span style="font-size:15px; font-weight:800; color:#0f172a;">${a.services?.name || "فحص"}</span>
        </div>
        <div style="text-align:left; background:#f8fafc; padding:8px 12px; border-radius:12px;">
          <div style="font-size:12px; color:#64748b; margin-bottom:2px; font-weight:600;">المبلغ: ${Number(a.final_price||0).toLocaleString()}</div>
          <div style="font-size:15px; font-weight:900; color:#059669;">مدفوع: ${Number(a.paid_amount||0).toLocaleString()}</div>
          <div style="font-size:12px; font-weight:bold; color:#dc2626; margin-top:2px;">باقي: ${Number((a.final_price||0)-(a.paid_amount||0)).toLocaleString()}</div>
        </div>
      </div>
    `).join("");

    const paymentsHtml = (invs || []).filter(i => isPaymentRecord(i as any)).map(i => {
      const isPrevious = i.notes?.includes("[LINKED_VISIT:");
      const linkedCode = extractLinkedVisit(i as any);
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:16px; border-radius:16px; margin-bottom:10px; border:1px solid #f1f5f9; box-shadow:0 2px 4px 0 rgba(0,0,0,0.02);">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="font-family:monospace; font-size:12px; font-weight:bold; color:#0284c7;">${i.invoice_number}</span>
            <span style="font-size:12px; color:#64748b; font-weight:600;">${i.created_at.split('T')[0]}</span>
          </div>
          <span style="font-size:12px; font-weight:bold; background:${isPrevious ? '#e0f2fe' : '#fce7f3'}; color:${isPrevious ? '#0369a1' : '#be185d'}; padding:4px 10px; border-radius:8px; display:inline-block;">
            ${isPrevious ? `دفعة سابقة للزيارة ${linkedCode}` : (i.items?.[0]?.name || "دفعة")}
          </span>
        </div>
        <div style="text-align:left; background:#f8fafc; padding:8px 12px; border-radius:12px; min-width:100px;">
          <div style="font-size:16px; font-weight:900; color:#059669;">+ ${Number(i.total_amount).toLocaleString()}</div>
          <div style="font-size:11px; color:#64748b; margin-top:4px; font-weight:bold; text-align:center; background:#e2e8f0; padding:2px 6px; border-radius:6px;">${i.payment_method || "نقدي"}</div>
        </div>
      </div>
    `}).join("");

    const total = round2(validAppts.reduce((s, v) => s + Number(v.final_price || 0), 0));
    const paid = round2(validAppts.reduce((s, v) => s + Number(v.paid_amount || 0), 0));
    const remaining = round2(Math.max(0, total - paid));

    const ledgerHtml = `
      <div style="width:800px; background:#f8fafc; padding:40px; direction:rtl; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        
        <div style="background:linear-gradient(135deg, #be123c 0%, #e11d48 50%, #f43f5e 100%); padding:40px; color:white; border-radius:28px; margin-bottom:28px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 20px 40px -10px rgba(225,29,72,0.3); position:relative; overflow:hidden;">
          <div style="position:absolute; top:-30px; right:-30px; width:200px; height:200px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
          <div style="position:absolute; bottom:-50px; left:20px; width:120px; height:120px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
          
          <div style="position:relative; z-index:1;">
            <h1 style="font-size:28px; font-weight:900; margin:0 0 12px; letter-spacing:-0.5px;">${clinic?.name} - كشف حساب شامل</h1>
            <p style="margin:0 0 6px; font-size:16px; opacity:0.95; font-weight:700;">المريض: ${patientName}</p>
            <p style="margin:0; font-size:14px; opacity:0.85; font-weight:600;">رقم الهاتف: ${phone} | تاريخ الإصدار: ${format(new Date(), "yyyy/MM/dd")}</p>
          </div>
          ${clinic?.logo_url ? `<img src="${clinic.logo_url}" style="width:90px; height:90px; border-radius:24px; object-fit:cover; background:white; padding:4px; position:relative; z-index:1; box-shadow:0 8px 16px -4px rgba(0,0,0,0.2);" />` : ''}
        </div>

        <div style="display:flex; gap:20px; margin-bottom:36px;">
          <div style="flex:1; background:rgba(255,255,255,0.9); backdrop-filter:blur(10px); padding:24px; border-radius:24px; text-align:center; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
            <div style="width:48px; height:48px; background:#f1f5f9; border-radius:16px; display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <p style="font-size:13px; color:#64748b; font-weight:800; margin:0 0 8px;">إجمالي المبالغ</p>
            <p style="font-size:32px; font-weight:900; margin:0; color:#0f172a;">${total.toLocaleString()}</p>
          </div>
          <div style="flex:1; background:rgba(255,255,255,0.9); backdrop-filter:blur(10px); padding:24px; border-radius:24px; text-align:center; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
            <div style="width:48px; height:48px; background:#ecfdf5; border-radius:16px; display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <p style="font-size:13px; color:#059669; font-weight:800; margin:0 0 8px;">إجمالي الواصل</p>
            <p style="font-size:32px; font-weight:900; margin:0; color:#059669;">${paid.toLocaleString()}</p>
          </div>
          <div style="flex:1; background:rgba(255,255,255,0.9); backdrop-filter:blur(10px); padding:24px; border-radius:24px; text-align:center; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
            <div style="width:48px; height:48px; background:#fff1f2; border-radius:16px; display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <p style="font-size:13px; color:#e11d48; font-weight:800; margin:0 0 8px;">إجمالي المتبقي</p>
            <p style="font-size:32px; font-weight:900; margin:0; color:#e11d48;">${remaining.toLocaleString()}</p>
          </div>
        </div>

        <div style="margin-bottom:36px;">
          <h3 style="font-size:20px; font-weight:900; color:#1e293b; margin:0 0 16px; display:flex; align-items:center; gap:10px;">
            <span style="display:inline-block; width:6px; height:24px; background:#e11d48; border-radius:4px;"></span> سجل الزيارات
          </h3>
          <div>${visitsHtml || '<div style="text-align:center; padding:30px; background:white; border-radius:16px; color:#94a3b8; font-weight:bold;">لا توجد زيارات مسجلة</div>'}</div>
        </div>

        <div>
          <h3 style="font-size:20px; font-weight:900; color:#1e293b; margin:0 0 16px; display:flex; align-items:center; gap:10px;">
            <span style="display:inline-block; width:6px; height:24px; background:#0ea5e9; border-radius:4px;"></span> سجل الدفعات (الإيصالات)
          </h3>
          <div>${paymentsHtml || '<div style="text-align:center; padding:30px; background:white; border-radius:16px; color:#94a3b8; font-weight:bold;">لا توجد دفعات مسجلة</div>'}</div>
        </div>

        <p style="text-align:center; font-size:14px; color:#94a3b8; margin-top:40px; border-top:1px solid #cbd5e1; padding-top:24px; font-weight:800; letter-spacing:1px;">معتمد إلكترونياً - ${clinic?.name}</p>
      </div>
    `;

    const tempDiv = document.createElement("div"); tempDiv.style.position = "absolute"; tempDiv.style.left = "-9999px"; tempDiv.innerHTML = ledgerHtml; document.body.appendChild(tempDiv);
    const canvas = await html2canvas(tempDiv.firstElementChild as HTMLElement, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png"); document.body.removeChild(tempDiv);

    await supabase.functions.invoke("telegram-bot", {
      body: { action: "send_receipt", clinic_id: clinic?.id, chat_id: tgId, receipt_image: imgData, reservation_code: "LEDGER", patient_name: patientName, service_name: "كشف حساب شامل", amount: 0, type: "ledger", clinic_name: clinic?.name || "العيادة" }
    });
    return true;
  } catch (err) {
    console.warn("[AUTO-LEDGER] فشل الإرسال:", err); return false;
  } finally { setSendingTelegram(false); }
};

const handlePayNow = async () => {
  if (!selectedAppointment || !clinic) return;
  setProcessingPayment(true);

  const totalCost = round2(parseFloat(totalCostInput) || 0);
  let paidNow = round2(parseFloat(paidAmountInput) || 0);
  const discountValue = round2(parseFloat(discountInput) || 0);
  const discType = selectedAppointment.discount_type || (selectedAppointment.is_promo ? "percentage" : "fixed");
  const discountCash = calcDiscountAmount(totalCost, discountValue, discType);
  const finalPrice = round2(Math.max(0, totalCost - discountCash));

  if (visitType !== "link") {
    const alreadyPaid = round2(selectedAppointment.paid_amount || 0);
    const maxPayable = round2(Math.max(0, finalPrice - alreadyPaid));
    if (paidNow > maxPayable) paidNow = maxPayable;
  }

  const netCollected = paidNow; 
  const patientId = selectedAppointment.patients?.id || selectedAppointment.patient_id || "";
  const tgId = selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id || "";

  if (patientId && (editPatientName.trim() || editPatientPhone.trim())) {
    const updateData: any = {};
    if (editPatientName.trim()) updateData.name = editPatientName.trim();
    if (editPatientPhone.trim() && !editPatientPhone.startsWith("tg:")) updateData.phone = editPatientPhone.trim();
    await supabase.from("patients").update(updateData).eq("id", patientId);
  }

  let typeToSend: "paid" | "partial" | "promo" | "manual" | "previous" | "invoice" = "paid";

  if (visitType === "link" && linkedVisitCode) {
    const paymentRef = generatePaymentReference(editPatientPhone || "0000");
    const notes = `تسديد دفعة للزيارة ${linkedVisitCode} [LINKED_VISIT:${linkedVisitCode}]`;
    const { error: invError } = await supabase.from("invoices").insert({
      clinic_id: clinic.id, patient_name: editPatientName.trim() || "غير محدد", patient_phone: editPatientPhone.trim() || "بدون رقم", invoice_number: paymentRef,
      items: [{ name: `تسديد دفعة (${linkedVisitCode})`, qty: 1, price: netCollected, linkedVisit: linkedVisitCode }],
      subtotal: netCollected, discount_type: "fixed", discount_value: 0, discount_amount: 0, total_amount: netCollected, paid_status: "paid", paid_amount: netCollected, payment_method: paymentMethodInput, notes, paid_at: new Date(paymentDate).toISOString(),
    });
    if (invError) { toast({ title: "خطأ", description: invError.message, variant: "destructive" }); setProcessingPayment(false); return; }

    const targetVisit = patientPreviousVisits.find(v => v.code === linkedVisitCode);
    if (targetVisit) {
      const { data: oldAppt } = await supabase.from("appointments").select("paid_amount, final_price").eq("reservation_code", linkedVisitCode).single();
      if (oldAppt) {
        const newPaid = round2((oldAppt.paid_amount || 0) + netCollected);
        await supabase.from("appointments").update({ paid_amount: newPaid, payment_status: newPaid >= (oldAppt.final_price || 0) ? "paid" : "partial" }).eq("reservation_code", linkedVisitCode);
      }
    }
    toast({ title: "✅ تم تسجيل الدفعة للسابق" });
    typeToSend = "previous";
    setSelectedAppointment(null);
  } else {
    const totalPaidNow = round2((selectedAppointment.paid_amount || 0) + netCollected);
    const isFullyPaid = totalPaidNow >= finalPrice || visitType === "followup";
    typeToSend = selectedAppointment.is_promo ? "promo" : (isFullyPaid ? "paid" : "partial");

    const updatePayload: any = {
      payment_status: isFullyPaid ? "paid" : "partial", status: "confirmed", department: "صندوق", paid_amount: totalPaidNow, discount_amount: discountValue, discount_applied: discountCash, discount_type: discType, payment_method: paymentMethodInput, payment_time: new Date(paymentDate).toISOString(), final_price: finalPrice, original_price: totalCost
    };
    if (selectedAppointment.is_promo) { updatePayload.is_promo = true; updatePayload.promo_code = selectedAppointment.promo_code; }

    const { error } = await supabase.from("appointments").update(updatePayload).eq("id", selectedAppointment.id).eq("clinic_id", clinic.id);
    if (error) { toast({ title: "خطأ", description: "فشل التحديث", variant: "destructive" }); setProcessingPayment(false); return; }

    toast({ title: isFullyPaid ? "✅ سداد كامل" : "✅ دفع جزئي", description: `الواصل: ${totalPaidNow}` });
    setSelectedAppointment({ ...selectedAppointment, payment_status: isFullyPaid ? "paid" : "partial", paid_amount: totalPaidNow, final_price: finalPrice, payment_method: paymentMethodInput });
    setShowReceipt(true);
  }

  setProcessingPayment(false);
  await fetchAppointments();
  await fetchInvoices();
  
  setTimeout(async () => {
     await autoSendToTelegram({ type: typeToSend, code: linkedVisitCode || selectedAppointment.reservation_code, name: editPatientName, service: selectedAppointment.services?.name || "فحص", amount: netCollected, tgId: tgId, linkedVisit: linkedVisitCode || undefined });
     await sendTelegramLedger(editPatientName, editPatientPhone);
  }, 1000);
};
const addInvoiceItem = () => setInvItems(prev => [...prev, { name: "", qty: 1, price: 0 }]);
const updateInvoiceItem = (index: number, patch: Partial<InvoiceItem>) => setInvItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
const removeInvoiceItem = (index: number) => setInvItems(prev => prev.filter((_, i) => i !== index));




const handleSaveInvoice = async () => {
  if (!clinic) return;
  const subtotal = calcInvoiceSubtotal();
  if (subtotal <= 0) { toast({ title: "❌ أضف بنداً", variant: "destructive" }); return; }
  setInvSaving(true);
  try {
    const discountAmount = calcInvoiceDiscount(subtotal);
    const totalAmount = round2(Math.max(0, subtotal - discountAmount));
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    const fullPhone = invPatientPhone.trim() ? `${invPatientCountryCode}${invPatientPhone.trim()}` : null;
    
    const newInvoiceData = { clinic_id: clinic.id, patient_name: invPatientName.trim() || null, patient_phone: fullPhone, invoice_number: invoiceNumber, items: invItems.filter(it => it.name.trim() && Number(it.price) > 0), subtotal, discount_type: invDiscountType, discount_value: parseFloat(invDiscountValue) || 0, discount_amount: discountAmount, total_amount: totalAmount, paid_status: "paid", paid_amount: totalAmount, payment_method: invPaymentMethod, notes: invNotes.trim() || null, paid_at: new Date().toISOString() };

    const { data: inserted, error } = await supabase.from("invoices").insert(newInvoiceData).select().single();
    if (error) throw error;
    
    toast({ title: "✅ تم إنشاء الفاتورة", description: invoiceNumber });
    setCreateInvoiceOpen(false);
    await fetchInvoices();
    
    if (inserted) { 
      setSelectedInvoice({ ...inserted, payment_reference: undefined, linked_visit_code: null } as Invoice); 
      if (fullPhone) {
        let tgId = "";
        const { data: pRow } = await supabase.from("patients").select("telegram_user_id").eq("clinic_id", clinic.id).eq("phone", fullPhone).maybeSingle();
        if (pRow?.telegram_user_id) tgId = pRow.telegram_user_id;

        if (tgId) {
          await autoSendToTelegram({ type: "invoice", code: invoiceNumber, name: invPatientName.trim() || "غير محدد", service: "فاتورة مبيعة", amount: totalAmount, tgId: tgId, items: newInvoiceData.items });
          await sendTelegramLedger(invPatientName.trim() || "غير محدد", fullPhone);
        }
        const waPhone = cleanPhoneForWhatsApp(fullPhone);
        if (waPhone) {
          const itemsText = newInvoiceData.items.map((it: any) => `• ${it.name} × ${it.qty} = ${(Number(it.qty)*Number(it.price)).toLocaleString()}`).join("\n");
          const waMsg = encodeURIComponent(`🧾 فاتورة جديدة - ${clinic.name}\n👤 ${invPatientName.trim()}\n🔖 ${invoiceNumber}\n\n${itemsText}\n\n💰 الإجمالي: ${totalAmount.toLocaleString()}`);
          setTimeout(() => { window.open(`https://wa.me/${waPhone}?text=${waMsg}`, "_blank"); }, 800);
        }
      }
    }
  } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); } finally { setInvSaving(false); }
};

const handleAddLedgerPayment = async () => {
  if (!selectedLedgerPatient || !clinic || !ledgerAmount) return;
  const amount = round2(parseFloat(ledgerAmount) || 0);
  if (amount <= 0) { toast({ title: "❌ مبلغ غير صحيح", variant: "destructive" }); return; }

  const paymentRef = generatePaymentReference(selectedLedgerPatient.phone || selectedLedgerPatient.name);
  let notes = "دفعة من دفتر الإيصالات";
  if (ledgerLinkedVisit) notes += ` [LINKED_VISIT:${ledgerLinkedVisit}]`;
  
  const { error } = await supabase.from("invoices").insert({
    clinic_id: clinic.id, patient_name: selectedLedgerPatient.name, patient_phone: selectedLedgerPatient.phone, invoice_number: paymentRef,
    items: [{ name: `دفعة${ledgerLinkedVisit ? ` للزيارة ${ledgerLinkedVisit}` : ''}`, qty: 1, price: amount, linkedVisit: ledgerLinkedVisit || undefined }],
    subtotal: amount, discount_type: "fixed", discount_value: 0, discount_amount: 0, total_amount: amount, paid_status: "paid", paid_amount: amount, payment_method: ledgerMethod, notes, paid_at: new Date().toISOString(),
  });

  if (error) { toast({ title: "خطأ", variant: "destructive" }); return; }

  if (ledgerLinkedVisit) {
    const { data: oldAppt } = await supabase.from("appointments").select("paid_amount, final_price").eq("reservation_code", ledgerLinkedVisit).single();
    if (oldAppt) {
      const newPaid = round2((oldAppt.paid_amount || 0) + amount);
      await supabase.from("appointments").update({ paid_amount: newPaid, payment_status: newPaid >= (oldAppt.final_price || 0) ? "paid" : "partial" }).eq("reservation_code", ledgerLinkedVisit);
    }
  }
  
  toast({ title: "✅ تم التسجيل" });
  setLedgerAmount(""); setLedgerLinkedVisit(""); setLedgerNotes("");
  await fetchInvoices(); await fetchAppointments();
  setLedgerModalOpen(false);

  setTimeout(async () => {
     await autoSendToTelegram({ type: "manual", code: paymentRef, name: selectedLedgerPatient.name, service: ledgerLinkedVisit ? `سداد ${ledgerLinkedVisit}` : "دفعة يدوية", amount, tgId: selectedLedgerPatient.phone, linkedVisit: ledgerLinkedVisit || undefined });
     await sendTelegramLedger(selectedLedgerPatient.name, selectedLedgerPatient.phone);
  }, 1000);
};

const addWalkIn = async () => {
  if (!clinic || !patientNameInput.trim()) return;
  const { data: patient } = await supabase.from("patients").insert({ clinic_id: clinic.id, name: patientNameInput.trim(), phone: patientPhoneInput.trim() || "بدون هاتف" }).select("id").single();
  if (patient) {
    const code = `WI-${Math.floor(1000 + Math.random() * 9000)}`;
    await supabase.from("appointments").insert({ clinic_id: clinic.id, patient_id: patient.id, date: today, time: format(new Date(), "HH:mm"), status: "confirmed", reservation_code: code, arrived_at: new Date().toISOString(), payment_status: "paid", is_walk_in: true, department: "صندوق" });
    setWalkInOpen(false); setPatientNameInput(""); setPatientPhoneInput(""); fetchAppointments();
  }
};

const handleAddExpense = async () => {
  if (!clinic) return;
  if (!expenseTitle.trim() || !expenseAmount) return;
  await supabase.from("expenses").insert({ clinic_id: clinic.id, title: expenseTitle.trim(), amount: parseFloat(expenseAmount), category: expenseCategory, expense_date: expenseDate, expense_time: expenseTime + ":00" });
  setExpenseModalOpen(false); fetchExpenses();
};

const handlePrintLedger = async () => {
  try {
    const el = document.getElementById("ledger-export-container");
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const win = window.open("", "_blank");
    if (win) { win.document.write(`<html><body style="margin:0;"><img src="${canvas.toDataURL("image/png")}" style="width:100%;" onload="window.print();window.close();"/></body></html>`); win.document.close(); }
  } catch (_) {}
};

const handlePrintReceipt = async () => {
  try {
    const el = document.getElementById("receipt-export-container");
    if (!el) { toast({ title: "❌ لا يوجد سند للطباعة", variant: "destructive" }); return; }
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(`<html><head><title>طباعة السند</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f4f4f5;"><img src="${imgData}" style="max-width:100%;height:auto;" onload="window.print();window.close();" /></body></html>`);
      win.document.close();
    }
  } catch (_) { toast({ title: "خطأ في الطباعة", variant: "destructive" }); }
};

const handleSendLedgerNow = async () => {
  if (!selectedLedgerPatient) return;
  const sent = await sendTelegramLedger(selectedLedgerPatient.name, selectedLedgerPatient.phone);
  if (sent) toast({ title: "✅ أُرسل للتليجرام" });
  else toast({ title: "⚠️ غير مسجل بتليجرام", variant: "destructive" });
};

const filtered = useMemo(() => appointments.filter((a) => {
  const { cleanName, cleanPhone } = extractCleanInfo(a);
  const matchesSearch = a.reservation_code.toLowerCase().includes(search.toLowerCase()) || cleanName.includes(search) || cleanPhone.includes(search);
  if (!matchesSearch) return false;
  if (statusFilter === "active") return a.status !== "cancelled";
  if (statusFilter === "paid") return a.payment_status === "paid";
  if (statusFilter === "unpaid") return a.payment_status !== "paid";
  return true;
}), [appointments, search, statusFilter]);

const filteredInvoices = useMemo(() => invoiceAppointments.filter((a) => {
  const q = invoicesSearch.trim().toLowerCase();
  if (!q) return true;
  return a.reservation_code.toLowerCase().includes(q) || extractCleanInfo(a).cleanName.includes(q);
}), [invoiceAppointments, invoicesSearch]);

const filteredInvoicesList = useMemo(() => invoicesList.filter((inv) => {
  const q = invoicesSearch.trim().toLowerCase();
  if (!q) return true;
  return inv.invoice_number.toLowerCase().includes(q) || (inv.patient_name || "").includes(q);
}), [invoicesList, invoicesSearch]);

const ledgerPatients = useMemo(() => {
  const map = new Map<string, any>();
  invoiceAppointments.forEach(a => {
    const { cleanName, cleanPhone } = extractCleanInfo(a);
    const key = cleanPhone !== "بدون رقم" ? cleanPhone : cleanName;
    if (!map.has(key)) map.set(key, { name: cleanName, phone: cleanPhone, visits: [], payments: [], total: 0, paid: 0, remaining: 0 });
    const p = map.get(key)!;
    const finalAmount = round2(a.final_price ?? a.paid_amount ?? 0);
    const paid = round2(a.paid_amount || 0);
    if (paid > 0 || a.payment_status === "partial") {
        p.visits.push({ code: a.reservation_code, date: a.date, service: a.services?.name || "فحص", amount: finalAmount, paid: paid });
        p.total += finalAmount; p.paid += paid;
    }
  });
  invoicesList.forEach(inv => {
    const name = inv.patient_name || "غير محدد";
    const phone = inv.patient_phone || "بدون رقم";
    const key = phone !== "بدون رقم" ? phone : name;
    if (!map.has(key)) map.set(key, { name, phone, visits: [], payments: [], total: 0, paid: 0, remaining: 0 });
    const p = map.get(key)!;
    if (isPaymentRecord(inv)) {
      p.payments.push({ ref: inv.invoice_number, date: inv.created_at.split('T')[0], amount: inv.total_amount, method: inv.payment_method || "نقدي", linkedVisit: extractLinkedVisit(inv) });
    } else {
      p.visits.push({ code: inv.invoice_number, date: inv.created_at.split('T')[0], service: 'فاتورة يدوية', amount: inv.total_amount, paid: inv.total_amount });
      p.total += inv.total_amount; p.paid += inv.total_amount;
    }
  });
  return Array.from(map.values()).map(p => ({ ...p, remaining: round2(Math.max(0, p.total - p.paid)) })).filter(p => p.total > 0);
}, [invoiceAppointments, invoicesList]);

const handleOpenLedger = (patient: any) => {
  setSelectedLedgerPatient(patient);
  setLedgerAmount(String(patient.remaining > 0 ? patient.remaining : 0)); setLedgerLinkedVisit(""); setLedgerNotes("");
  setFullPatientHistory({ visits: patient.visits, payments: patient.payments, total: patient.total, paid: patient.paid, remaining: patient.remaining });
  setLedgerModalOpen(true);
};

const calcInvoiceSubtotal = () => round2(invItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0));
const calcInvoiceDiscount = (sub: number) => calcDiscountAmount(sub, parseFloat(invDiscountValue) || 0, invDiscountType);
  if (authLoading || clinicLoading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">جاري التحميل...</div>;
  if (clinicError) return <div className="text-rose-500 text-center font-bold p-8">{clinicError}</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" dir="rtl">
      <div id={QR_FILE_ELEMENT_ID} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* --- الماسح الضوئي (شاشة كاملة) --- */}
      {scannerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/50">
            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Camera className="w-6 h-6" /> {verifyScannerOpen ? "التحقق من السندات" : "مسح الكود"}</h3>
            <button onClick={stopScanner} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"><X className="w-6 h-6" /></button>
          </div>
          
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <div id={QR_CAMERA_ELEMENT_ID} className="w-full h-full max-w-4xl" />
            
            {scannerStatus === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                <Loader2 className="w-16 h-16 animate-spin text-emerald-500 mb-4" />
                <p className="text-white text-lg font-bold">جاري تشغيل الكاميرا...</p>
              </div>
            )}
            
            {scannerStatus === "active" && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="relative w-[80vw] h-[80vw] max-w-[500px] max-h-[500px]">
                  <div className="absolute top-0 left-0 w-20 h-20 border-t-4 border-l-4 border-emerald-500 rounded-tl-3xl shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                  <div className="absolute top-0 right-0 w-20 h-20 border-t-4 border-r-4 border-emerald-500 rounded-tr-3xl shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                  <div className="absolute bottom-0 left-0 w-20 h-20 border-b-4 border-l-4 border-emerald-500 rounded-bl-3xl shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                  <div className="absolute bottom-0 right-0 w-20 h-20 border-b-4 border-r-4 border-emerald-500 rounded-br-3xl shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                  <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 shadow-[0_0_20px_#10b981] animate-[scan_2s_ease-in-out_infinite]" />
                </div>
              </div>
            )}
          </div>
          
          {scannerMessage && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg animate-in slide-in-from-top">
              {scannerMessage}
            </div>
          )}

          <div className="p-6 bg-black/50 border-t border-white/10">
            <Button variant="outline" className="w-full h-14 text-lg gap-2 bg-white/10 text-white border-white/20 hover:bg-white/20 rounded-2xl" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
              {uploadingImage ? <Loader2 className="animate-spin w-6 h-6" /> : <ImageIcon className="w-6 h-6" />} رفع صورة من المعرض
            </Button>
          </div>
        </div>
      )}

      {verifyResult && (
        <Dialog open={!!verifyResult} onOpenChange={() => setVerifyResult(null)}>
          <DialogContent className="max-w-sm text-center rounded-3xl" dir="rtl">
            <div className="py-6 space-y-4">
              {verifyResult.status === "valid" ? <ShieldCheck className="w-24 h-24 text-emerald-500 mx-auto" /> : <ShieldAlert className="w-24 h-24 text-rose-500 mx-auto" />}
              <p className={`font-bold whitespace-pre-wrap text-lg ${verifyResult.status === "valid" ? "text-emerald-700" : "text-rose-700"}`}>{verifyResult.message}</p>
              <Button onClick={() => setVerifyResult(null)} className="w-full h-12 rounded-xl">حسناً</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">الصندوق والخزينة</h1>
              <p className="text-xs font-bold text-slate-500">نظام إدارة التحصيل</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => startScanner(false)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md h-11 px-6"><Camera className="w-5 h-5 ml-2" />مسح سريع</Button>
            <Button variant="outline" onClick={() => startScanner(true)} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 rounded-xl shadow-sm h-11 px-6"><ScanLine className="w-5 h-5 ml-2" />تحقق</Button>
            <Button variant="outline" onClick={signOut} className="text-rose-600 border-rose-200 hover:bg-rose-50 rounded-xl h-11 px-4"><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[81px] z-30">
        <div className="container mx-auto px-4 flex gap-8">
          <button onClick={() => setActiveTab("main")} className={`flex items-center gap-2 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === "main" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"}`}><Wallet className="w-5 h-5" /> الخزينة</button>
          <button onClick={() => setActiveTab("invoices")} className={`flex items-center gap-2 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === "invoices" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"}`}><FileText className="w-5 h-5" /> الفواتير</button>
          <button onClick={() => setActiveTab("receipts")} className={`flex items-center gap-2 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === "receipts" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"}`}><BookOpen className="w-5 h-5" /> الإيصالات</button>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-8 space-y-6">
        {activeTab === "main" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-b-full -mr-12 -mt-12 opacity-50 z-0"></div>
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center relative z-10"><Banknote className="w-8 h-8" /></div>
                <div className="relative z-10"><p className="text-sm text-slate-500 font-bold mb-1">إجمالي المقبوضات اليوم</p><p className="text-3xl font-black text-slate-800">{appointments.filter(a=>a.payment_status === "paid").reduce((s,a)=>s+(a.paid_amount||0),0).toLocaleString()} <span className="text-sm text-slate-400">ريال</span></p></div>
              </div>
              
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-b-full -mr-12 -mt-12 opacity-50 z-0"></div>
                <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center relative z-10"><MinusCircle className="w-8 h-8" /></div>
                <div className="relative z-10"><p className="text-sm text-slate-500 font-bold mb-1">إجمالي المصروفات</p><p className="text-3xl font-black text-slate-800">{expenses.reduce((s,e)=>s+e.amount,0).toLocaleString()} <span className="text-sm text-slate-400">ريال</span></p></div>
              </div>

              <div className="bg-gradient-to-br from-primary to-indigo-700 rounded-3xl p-6 shadow-lg flex items-center gap-4 relative overflow-hidden text-white">
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center relative z-10"><Wallet className="w-8 h-8 text-white" /></div>
                <div className="relative z-10"><p className="text-sm text-white/80 font-bold mb-1">صافي الصندوق المتوقع</p><p className="text-3xl font-black">{(appointments.filter(a=>a.payment_status === "paid").reduce((s,a)=>s+(a.paid_amount||0),0) - expenses.reduce((s,e)=>s+e.amount,0)).toLocaleString()} <span className="text-sm text-white/60">ريال</span></p></div>
              </div>
            </div>

            {/* ✅ تم إضافة مكون الإحصائيات هنا ليعرض الرسوم البيانية */}
            <CashierStats appointments={appointments} expenses={expenses} />

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div className="relative w-full md:w-96"><Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم المريض أو كود الحجز..." className="pr-12 h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-primary text-base" /></div>
                <div className="flex gap-3 w-full md:w-auto">
                  <Button onClick={() => setWalkInOpen(true)} className="h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 flex-1 md:flex-none"><Plus className="w-5 h-5 ml-2" /> مريض مباشر</Button>
                  <Button variant="outline" onClick={() => setExpenseModalOpen(true)} className="h-12 rounded-2xl text-rose-600 border-rose-200 hover:bg-rose-50 flex-1 md:flex-none"><MinusCircle className="w-5 h-5 ml-2" /> مصروف</Button>
                </div>
              </div>

              <div className="grid gap-4">
                {filtered.length === 0 && <div className="text-center py-12 text-slate-400 font-bold">لا توجد حجوزات نشطة اليوم</div>}
                {filtered.map(a => {
                  const { cleanName, cleanPhone } = extractCleanInfo(a);
                  return (
                    <div key={a.id} className="bg-slate-50 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center border border-slate-200/60 hover:shadow-md transition-shadow group">
                      <div className="flex gap-4 items-center w-full sm:w-auto">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-sm ${a.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {cleanName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-lg text-slate-800">{cleanName}</h3>
                            <span className="text-xs font-mono bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">{a.reservation_code}</span>
                          </div>
                          <p className="text-sm text-slate-500 font-medium">{cleanPhone} • {a.services?.name} {a.is_promo && "• 🎁 عرض"}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full sm:w-auto gap-8 mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                        <div className="text-left hidden sm:block">
                          <p className="text-xs text-slate-400 mb-1 font-bold">الحالة</p>
                          <p className={`font-bold ${a.payment_status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{a.payment_status === 'paid' ? 'مدفوع' : (a.payment_status === 'partial' ? 'دفع جزئي' : 'معلق')}</p>
                        </div>
                        <Button onClick={() => openPaymentModal(a)} variant={a.payment_status === 'paid' ? 'outline' : 'default'} className={`rounded-xl h-11 px-6 font-bold shadow-sm ${a.payment_status === 'paid' ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'bg-primary text-white'}`}>
                          {a.payment_status === 'paid' ? 'عرض السند' : 'تحصيل المبلغ'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === "invoices" && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><FileText className="text-primary w-7 h-7" /> سجل الفواتير</h2>
              <Button onClick={() => { setInvPatientName(""); setInvPatientPhone(""); setInvItems([{name:"",qty:1,price:0}]); setCreateInvoiceOpen(true); }} className="rounded-xl bg-primary h-11 px-6 shadow-md"><Plus className="w-5 h-5 ml-2" /> فاتورة جديدة</Button>
            </div>
            <div className="grid gap-4">
              {filteredInvoicesList.length === 0 && <div className="text-center py-12 text-slate-400 font-bold">لا توجد فواتير مسجلة</div>}
              {filteredInvoicesList.map(inv => (
                <div key={inv.id} className="bg-white rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 w-full sm:w-auto mb-4 sm:mb-0">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Receipt className="w-6 h-6" /></div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg text-sm border border-indigo-100">{inv.invoice_number}</span>
                        <span className="text-xs text-slate-500 font-medium">{format(new Date(inv.created_at), "yyyy-MM-dd hh:mm a")}</span>
                      </div>
                      <h3 className="font-bold text-lg text-slate-800">{inv.patient_name || "مريض غير محدد"}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-left">
                      <p className="text-xs text-slate-400 font-bold mb-1">الإجمالي</p>
                      <p className="text-2xl font-black text-indigo-700">{Number(inv.total_amount).toLocaleString()}</p>
                    </div>
                    <Button size="lg" variant="outline" className="rounded-xl border-slate-200" onClick={()=>setSelectedInvoice(inv)}>عرض التفاصيل</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "receipts" && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><BookOpen className="text-primary w-7 h-7" /> دفتر حسابات المرضى</h2>
            </div>
            <div className="grid gap-5">
              {ledgerPatients.length === 0 && <div className="text-center py-12 text-slate-400 font-bold">لا توجد سجلات مدفوعات حتى الآن</div>}
              {ledgerPatients.map((p, idx) => (
                <div key={idx} className="bg-slate-50 rounded-3xl p-6 flex flex-col lg:flex-row justify-between items-center border border-slate-200/60 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 flex-1 mb-6 lg:mb-0 w-full">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-700 text-xl shadow-sm">{p.name.charAt(0)}</div>
                    <div>
                      <h3 className="font-bold text-xl text-slate-800 mb-1">{p.name}</h3>
                      <p className="text-sm text-slate-500 font-medium font-mono">{p.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-8 text-center bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm mb-6 lg:mb-0 lg:mr-8 w-full lg:w-auto justify-between">
                    <div><p className="text-xs text-slate-500 font-bold mb-1">الإجمالي</p><p className="font-black text-slate-800 text-lg">{p.total.toLocaleString()}</p></div>
                    <div className="w-px bg-slate-200"></div>
                    <div><p className="text-xs text-emerald-600 font-bold mb-1">الواصل</p><p className="font-black text-emerald-600 text-lg">{p.paid.toLocaleString()}</p></div>
                    <div className="w-px bg-slate-200"></div>
                    <div><p className="text-xs text-rose-600 font-bold mb-1">الباقي</p><p className="font-black text-rose-600 text-lg">{p.remaining.toLocaleString()}</p></div>
                  </div>
                  <Button onClick={() => handleOpenLedger(p)} className="w-full lg:w-auto rounded-xl bg-slate-900 hover:bg-slate-800 h-12 px-8 shadow-md">فتح الملف</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* --- مودال الدفع --- */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-xl text-slate-800">تأكيد الدفع</h3>
              <button onClick={()=>setSelectedAppointment(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {!showReceipt ? (
                <>
                  <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                    <button onClick={()=>setVisitType("normal")} className={`py-2.5 text-sm font-bold rounded-xl transition-all ${visitType === 'normal' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}>زيارة عادية</button>
                    <button onClick={()=>setVisitType("followup")} className={`py-2.5 text-sm font-bold rounded-xl transition-all ${visitType === 'followup' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}>مراجعة</button>
                    <button onClick={()=>setVisitType("link")} className={`py-2.5 text-sm font-bold rounded-xl transition-all ${visitType === 'link' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}>دفع سابق</button>
                  </div>

                  {visitType === "link" && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-2 block">اختر الزيارة السابقة</label>
                      <select value={linkedVisitCode} onChange={e=>{setLinkedVisitCode(e.target.value); const v = patientPreviousVisits.find(x=>x.code===e.target.value); if(v) setPaidAmountInput(String(v.remaining));}} className="w-full h-12 rounded-xl border-2 border-slate-200 p-3 font-bold focus:border-primary focus:ring-0">
                        <option value="">-- اختر --</option>
                        {patientPreviousVisits.map(v => <option key={v.code} value={v.code}>{v.code} - متبقي: {v.remaining}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">اسم المريض</label><Input value={editPatientName} onChange={e=>setEditPatientName(e.target.value)} className="h-12 rounded-xl border-slate-200 bg-slate-50 focus:bg-white" /></div>
                    
                    {visitType !== "link" && (
                      <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">إجمالي تكلفة الخدمة</label><Input type="number" value={totalCostInput} onChange={e=>setTotalCostInput(e.target.value)} className="h-12 rounded-xl border-slate-200 bg-slate-50 focus:bg-white font-bold text-lg" /></div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-xs font-bold text-emerald-600 mb-1.5 block">المبلغ المدفوع الآن</label><Input type="number" value={paidAmountInput} onChange={e=>setPaidAmountInput(e.target.value)} className="h-12 rounded-xl border-emerald-200 bg-emerald-50 focus:bg-white text-lg font-black text-emerald-700" /></div>
                      <div><label className="text-xs font-bold text-rose-600 mb-1.5 block">الخصم (إن وجد)</label><Input type="number" value={discountInput} onChange={e=>setDiscountInput(e.target.value)} className="h-12 rounded-xl border-rose-200 bg-rose-50 focus:bg-white text-lg font-black text-rose-700" /></div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-2 block">طريقة الدفع</label>
                      <div className="grid grid-cols-3 gap-2">
                        {["نقدي", "تحويل", "بطاقة"].map(m => <button key={m} onClick={()=>setPaymentMethodInput(m)} className={`py-2.5 text-sm font-bold rounded-xl border-2 transition-all ${paymentMethodInput === m ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}>{m}</button>)}
                      </div>
                    </div>
                  </div>

                  <Button onClick={handlePayNow} disabled={processingPayment} className="w-full h-14 rounded-2xl text-lg font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 mt-2">
                    {processingPayment ? <Loader2 className="animate-spin w-6 h-6" /> : "تأكيد التحصيل"}
                  </Button>
                </>
              ) : (
                <div className="space-y-6 text-center animate-in fade-in">
                  <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><CheckCircle className="w-12 h-12" /></div>
                  <h3 className="text-2xl font-black text-slate-800">تم التحصيل بنجاح!</h3>
                  
                  <div id="receipt-export-container" className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden text-right" dir="rtl">
                    <div className="bg-slate-900 p-5 text-white flex justify-between items-center">
                      <div><p className="text-[10px] opacity-80 mb-1">سند استلام مبلغ</p><h4 className="font-bold text-lg">{clinic?.name}</h4></div>
                      {clinic?.logo_url && <img src={clinic.logo_url} className="w-12 h-12 rounded-xl bg-white p-1" />}
                    </div>
                    <div className="p-5 space-y-3 text-sm">
                      <div className="flex justify-between border-b border-dashed border-slate-200 pb-2"><span className="text-slate-500 font-bold">المريض:</span><b className="text-slate-800">{editPatientName}</b></div>
                      <div className="flex justify-between border-b border-dashed border-slate-200 pb-2"><span className="text-slate-500 font-bold">الكود:</span><b className="font-mono">{selectedAppointment.reservation_code}</b></div>
                      <div className="flex justify-between items-center pt-2"><span className="text-slate-500 font-bold">المبلغ المستلم:</span><b className="text-emerald-600 text-2xl font-black">{paidAmountInput}</b></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* ✅ تم تصحيح الزر ليستدعي handlePrintReceipt بدلاً من handlePrintLedger */}
                    <Button variant="outline" onClick={handlePrintReceipt} className="h-12 rounded-xl border-slate-200"><Printer className="w-4 h-4 ml-2"/> طباعة</Button>
                    <Button onClick={()=>setSelectedAppointment(null)} className="h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white">إغلاق</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- مودال إنشاء فاتورة --- */}
      <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
        <DialogContent className="max-w-2xl rounded-3xl overflow-hidden p-0 gap-0" dir="rtl">
          <div className="bg-slate-50 p-6 border-b border-slate-200">
            <DialogTitle className="text-xl font-black text-slate-800 flex items-center gap-2"><FileText className="text-primary"/> إنشاء فاتورة جديدة</DialogTitle>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">اسم المريض</label><Input value={invPatientName} onChange={e=>setInvPatientName(e.target.value)} className="h-12 rounded-xl bg-slate-50 focus:bg-white" /></div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">رقم الهاتف</label>
                <div className="flex gap-2">
                  <select value={invPatientCountryCode} onChange={e=>setInvPatientCountryCode(e.target.value)} className="w-32 h-12 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm font-bold focus:border-primary">
                    {ARAB_COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                  </select>
                  <Input value={invPatientPhone} onChange={e=>setInvPatientPhone(e.target.value)} placeholder="رقم الهاتف" className="h-12 rounded-xl flex-1 bg-slate-50 focus:bg-white text-left" dir="ltr" />
                </div>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-black text-slate-700">بنود الفاتورة</label>
                <Button variant="outline" size="sm" onClick={addInvoiceItem} className="rounded-lg h-8 text-xs border-dashed border-primary text-primary hover:bg-primary/5"><Plus className="w-3.5 h-3.5 ml-1"/> إضافة بند</Button>
              </div>
              {invItems.map((it, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={it.name} onChange={e=>updateInvoiceItem(i, {name: e.target.value})} placeholder="اسم الخدمة" className="flex-1 rounded-xl bg-white" />
                  <Input type="number" value={it.price} onChange={e=>updateInvoiceItem(i, {price: Number(e.target.value)})} placeholder="السعر" className="w-28 rounded-xl bg-white font-bold" />
                  <Button variant="ghost" size="icon" onClick={()=>removeInvoiceItem(i)} className="text-rose-500 hover:bg-rose-50 shrink-0"><Trash2 className="w-5 h-5"/></Button>
                </div>
              ))}
            </div>

            <div className="bg-emerald-50 p-5 rounded-2xl flex justify-between items-center border border-emerald-100">
              <span className="font-black text-emerald-800 text-lg">الإجمالي النهائي:</span>
              <span className="text-3xl font-black text-emerald-600">{Math.max(0, calcInvoiceSubtotal() - calcInvoiceDiscount(calcInvoiceSubtotal())).toLocaleString()} <span className="text-sm">ريال</span></span>
            </div>

            <Button onClick={handleSaveInvoice} disabled={invSaving} className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-lg font-black shadow-lg shadow-indigo-200 text-white">
              {invSaving ? <Loader2 className="animate-spin w-6 h-6" /> : "حفظ وإرسال الفاتورة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- مودال عرض الفاتورة اليدوية --- */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg">تفاصيل الفاتورة</h3>
              <button onClick={()=>setSelectedInvoice(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div id="invoice-card-container" className="bg-white border text-slate-800 border-slate-200 rounded-2xl overflow-hidden shadow-sm" dir="rtl">
                <div className="bg-gradient-to-r from-pink-600 to-rose-600 p-6 text-white flex justify-between items-center">
                  <div><p className="text-xs opacity-80 mb-1">فاتورة مبيعات</p><h2 className="text-xl font-black">{clinic?.name}</h2></div>
                  {clinic?.logo_url ? <img src={clinic.logo_url} className="w-12 h-12 rounded-xl bg-white p-1" /> : <Receipt className="w-10 h-10 opacity-50"/>}
                </div>
                <div className="p-6 space-y-4 text-sm">
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-2"><span className="text-slate-500">رقم الفاتورة:</span><span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">{selectedInvoice.invoice_number}</span></div>
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-2"><span className="text-slate-500">التاريخ:</span><span className="font-bold">{format(new Date(selectedInvoice.created_at), "yyyy/MM/dd HH:mm")}</span></div>
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-2"><span className="text-slate-500">المريض:</span><span className="font-bold">{selectedInvoice.patient_name || "—"}</span></div>
                  
                  <div className="py-2 space-y-2">
                    <p className="text-xs font-bold text-slate-400">البنود:</p>
                    {selectedInvoice.items.map((it, i) => (
                      <div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                        <span>{it.name} <span className="text-slate-400 text-xs">× {it.qty}</span></span>
                        <span className="font-bold">{(Number(it.qty)*Number(it.price)).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center bg-pink-50 p-4 rounded-xl border border-pink-100 mt-4">
                    <span className="font-bold text-pink-900">الإجمالي المستلم:</span>
                    <span className="text-2xl font-black text-pink-600">{Number(selectedInvoice.total_amount).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex gap-2 justify-end">
              <Button variant="outline" onClick={()=>window.print()} className="rounded-xl"><Printer className="w-4 h-4 ml-2"/> طباعة</Button>
              <Button onClick={()=>setSelectedInvoice(null)} className="rounded-xl bg-slate-900 text-white">إغلاق</Button>
            </div>
          </div>
        </div>
      )}

      {/* --- مودال دفتر المريض (Ledger) --- */}
      <Dialog open={ledgerModalOpen} onOpenChange={setLedgerModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 gap-0" dir="rtl">
          <div className="bg-slate-900 p-6 text-white sticky top-0 z-10 flex justify-between items-center">
            <div>
              <DialogTitle className="text-2xl font-black mb-1">ملف المريض: {selectedLedgerPatient?.name}</DialogTitle>
              <p className="text-slate-400 text-sm font-mono">{selectedLedgerPatient?.phone}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSendLedgerNow} disabled={sendingTelegram} className="bg-[#0088cc] hover:bg-[#0077b5] rounded-xl h-10 px-4"><Send className="w-4 h-4 ml-2"/> إرسال</Button>
              <Button onClick={handlePrintLedger} variant="outline" className="rounded-xl h-10 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"><Printer className="w-4 h-4 ml-2"/> طباعة</Button>
            </div>
          </div>
          
          <div className="p-6 space-y-8 bg-slate-50">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PlusCircle className="w-5 h-5 text-emerald-500"/> تسجيل دفعة جديدة (يدوياً)</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input type="number" value={ledgerAmount} onChange={e=>setLedgerAmount(e.target.value)} placeholder="المبلغ" className="rounded-xl h-12 font-bold text-lg" />
                <select value={ledgerMethod} onChange={e=>setLedgerMethod(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm font-bold bg-slate-50"><option>نقدي</option><option>تحويل</option><option>بطاقة</option></select>
                <select value={ledgerLinkedVisit} onChange={e=>setLedgerLinkedVisit(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm font-bold bg-slate-50">
                  <option value="">بدون ربط بزيارة</option>
                  {fullPatientHistory?.visits.map((v:any) => <option key={v.code} value={v.code}>{v.code} - متبقي: {v.amount-v.paid}</option>)}
                </select>
                <Button onClick={handleAddLedgerPayment} className="rounded-xl h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">تسجيل الدفعة</Button>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="font-black text-lg text-slate-800 mb-3 flex items-center gap-2"><Clock className="w-5 h-5 text-primary"/> سجل الزيارات</h3>
                <div className="grid gap-3">
                  {fullPatientHistory?.visits.map((v:any, i:number) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded text-sm">{v.code}</span>
                        <span className="text-sm font-medium text-slate-600">{v.date} • {v.service}</span>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <div className="text-slate-500">المبلغ: <span className="font-bold text-slate-800">{v.amount}</span></div>
                        <div className="text-emerald-600">الواصل: <span className="font-bold">{v.paid}</span></div>
                        <div className="text-rose-600">الباقي: <span className="font-bold">{v.amount - v.paid}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-black text-lg text-slate-800 mb-3 flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600"/> سجل الدفعات (السندات)</h3>
                <div className="grid gap-3">
                  {fullPatientHistory?.payments.map((p:any, i:number) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">{p.ref}</span>
                        <span className="text-sm font-medium text-slate-600">{p.date}</span>
                        {p.linkedVisit && <span className="text-xs bg-sky-100 text-sky-700 px-2 py-1 rounded-md font-bold">مرتبطة بـ {p.linkedVisit}</span>}
                      </div>
                      <div className="flex gap-4 text-sm">
                        <div className="text-slate-500">الطريقة: <span className="font-bold text-slate-800">{p.method}</span></div>
                        <div className="text-emerald-600 font-black text-lg">{p.amount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ✅ الحاوية المخفية لكشف الحساب (ممتلئة الآن لتعمل الطباعة) */}
      {fullPatientHistory && selectedLedgerPatient && (
        <div className="absolute -left-[9999px] top-0">
          <div id="ledger-export-container" style={{ width: '800px', backgroundColor: '#f8fafc', padding: '40px', direction: 'rtl', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
            
            <div style={{ background: 'linear-gradient(135deg, #be123c 0%, #e11d48 50%, #f43f5e 100%)', padding: '40px', color: 'white', borderRadius: '28px', marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px -10px rgba(225,29,72,0.3)' }}>
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.5px' }}>{clinic?.name} - كشف حساب شامل</h1>
                <p style={{ margin: '0 0 6px', fontSize: '16px', opacity: 0.95, fontWeight: 700 }}>المريض: {selectedLedgerPatient.name}</p>
                <p style={{ margin: 0, fontSize: '14px', opacity: 0.85, fontWeight: 600 }}>رقم الهاتف: {selectedLedgerPatient.phone} | تاريخ الإصدار: {format(new Date(), 'yyyy/MM/dd')}</p>
              </div>
              {clinic?.logo_url && <img src={clinic.logo_url} style={{ width: '90px', height: '90px', borderRadius: '24px', objectFit: 'cover', background: 'white', padding: '4px' }} />}
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '36px' }}>
              <div style={{ flex: 1, background: 'white', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 800, margin: '0 0 8px' }}>إجمالي المبالغ</p>
                <p style={{ fontSize: '32px', fontWeight: 900, margin: 0, color: '#0f172a' }}>{fullPatientHistory.total.toLocaleString()}</p>
              </div>
              <div style={{ flex: 1, background: 'white', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '13px', color: '#059669', fontWeight: 800, margin: '0 0 8px' }}>إجمالي الواصل</p>
                <p style={{ fontSize: '32px', fontWeight: 900, margin: 0, color: '#059669' }}>{fullPatientHistory.paid.toLocaleString()}</p>
              </div>
              <div style={{ flex: 1, background: 'white', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '13px', color: '#e11d48', fontWeight: 800, margin: '0 0 8px' }}>إجمالي المتبقي</p>
                <p style={{ fontSize: '32px', fontWeight: 900, margin: 0, color: '#e11d48' }}>{fullPatientHistory.remaining.toLocaleString()}</p>
              </div>
            </div>

            <div style={{ marginBottom: '36px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b', margin: '0 0 16px', borderRight: '6px solid #e11d48', paddingRight: '10px' }}>سجل الزيارات</h3>
              {fullPatientHistory.visits.map((v: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '16px', borderRadius: '16px', marginBottom: '10px', border: '1px solid #f1f5f9' }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', marginLeft: '8px' }}>{v.code}</span>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{v.date}</span>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>{v.service}</div>
                  </div>
                  <div style={{ textAlign: 'left', background: '#f8fafc', padding: '8px 12px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>المبلغ: {v.amount.toLocaleString()}</div>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#059669' }}>مدفوع: {v.paid.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc2626' }}>باقي: {(v.amount - v.paid).toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {fullPatientHistory.visits.length === 0 && <div style={{ textAlign: 'center', padding: '30px', background: 'white', borderRadius: '16px', color: '#94a3b8' }}>لا توجد زيارات</div>}
            </div>

            <div>
              <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b', margin: '0 0 16px', borderRight: '6px solid #0ea5e9', paddingRight: '10px' }}>سجل الدفعات</h3>
              {fullPatientHistory.payments.map((p: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '16px', borderRadius: '16px', marginBottom: '10px', border: '1px solid #f1f5f9' }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold', color: '#0284c7' }}>{p.ref}</span>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginRight: '8px' }}>{p.date}</span>
                    {p.linkedVisit && <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', marginRight: '8px' }}>مرتبطة بـ {p.linkedVisit}</span>}
                  </div>
                  <div style={{ textAlign: 'left', background: '#f8fafc', padding: '8px 12px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>+ {p.amount.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', background: '#e2e8f0', padding: '2px 6px', borderRadius: '6px', marginTop: '4px' }}>{p.method}</div>
                  </div>
                </div>
              ))}
              {fullPatientHistory.payments.length === 0 && <div style={{ textAlign: 'center', padding: '30px', background: 'white', borderRadius: '16px', color: '#94a3b8' }}>لا توجد دفعات</div>}
            </div>

            <p style={{ textAlign: 'center', fontSize: '14px', color: '#94a3b8', marginTop: '40px', borderTop: '1px solid #cbd5e1', paddingTop: '24px', fontWeight: 800 }}>معتمد إلكترونياً - {clinic?.name}</p>
          </div>
        </div>
      )}

      {/* مودال إضافة مريض مباشر */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent className="max-w-md rounded-3xl" dir="rtl">
          <DialogHeader><DialogTitle className="text-xl font-black">مريض مباشر (Walk-in)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Input value={patientNameInput} onChange={(e) => setPatientNameInput(e.target.value)} placeholder="اسم المريض بالكامل" className="h-12 rounded-xl" />
            <Input value={patientPhoneInput} onChange={(e) => setPatientPhoneInput(e.target.value)} placeholder="رقم الهاتف" className="h-12 rounded-xl text-left" dir="ltr" />
            <Button onClick={addWalkIn} className="w-full h-12 rounded-xl bg-primary">تسجيل المريض</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* مودال المصروفات */}
      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="max-w-md rounded-3xl" dir="rtl">
          <DialogHeader><DialogTitle className="text-xl font-black text-rose-600">تسجيل مصروف</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Input value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} placeholder="سبب المصروف" className="h-12 rounded-xl" />
            <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="المبلغ" className="h-12 rounded-xl font-bold" />
            <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="w-full h-12 rounded-xl border p-2"><option>نثريات</option><option>أدوات طبية</option><option>صيانة</option><option>رواتب</option><option>أخرى</option></select>
            <Button onClick={handleAddExpense} className="w-full h-12 rounded-xl bg-rose-600 text-white">قيد المصروف</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
// ============================================================
// CashierStats (لوحة الإحصائيات والرسوم البيانية)
// ============================================================
function CashierStats({ appointments, expenses }: { appointments: Appointment[]; expenses: Expense[] }) {
  const paid = appointments.filter((a) => a.payment_status === "paid" || a.payment_status === "partial");

  const amountFor = (a: Appointment): number => {
    if (typeof a.paid_amount === "number" && a.paid_amount > 0) return a.paid_amount;
    if (typeof a.final_price === "number" && a.final_price > 0) return a.final_price;
    return a.services?.price ?? 0;
  };

  const totalRevenue = paid.reduce((s, a) => s + amountFor(a), 0);
  const totalDiscountCash = paid.reduce((s, a) => s + (a.discount_applied || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netInDrawer = totalRevenue - totalExpenses;
  const avgTicket = paid.length ? Math.round(totalRevenue / paid.length) : 0;

  const financialFlow = useMemo(() => {
    const buckets: Record<number, { revenue: number; expense: number; count: number }> = {};
    for (let h = 0; h <= 23; h++) buckets[h] = { revenue: 0, expense: 0, count: 0 };

    paid.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) {
        buckets[h].revenue += amountFor(a);
        buckets[h].count += 1;
      }
    });

    expenses.forEach((e) => {
      const h = parseInt(String(e.expense_time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h].expense += Number(e.amount || 0);
    });

    return Object.entries(buckets).map(([h, data]) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      hourShort: h,
      revenue: data.revenue,
      expense: data.expense,
      count: data.count,
    }));
  }, [paid, expenses]);

  const byService = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach((a) => {
      const key = a.services?.name || "بدون خدمة";
      map[key] = (map[key] || 0) + amountFor(a);
    });
    const entries = Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const top = entries.slice(0, 6);
    const others = entries.slice(6).reduce((s, e) => s + e.value, 0);
    if (others > 0) top.push({ name: "أخرى", value: others });
    return top;
  }, [paid]);

  const byPaymentMethod = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach((a) => {
      const key = a.payment_method || "نقدي";
      map[key] = (map[key] || 0) + amountFor(a);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid]);

  const byExpenseCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      const key = e.category || "نثريات";
      map[key] = (map[key] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const PIE_COLORS = ["#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#f43f5e", "#84cc16", "#0ea5e9"];

  const stats = [
    { label: "إجمالي المقبوضات", value: totalRevenue.toLocaleString(), icon: ArrowUpCircle, tint: "from-emerald-500/20 to-emerald-500/5", iconClass: "text-emerald-500" },
    { label: "الخصومات الممنوحة", value: totalDiscountCash.toLocaleString(), icon: Receipt, tint: "from-amber-500/20 to-amber-500/5", iconClass: "text-amber-500" },
    { label: "إجمالي المصروفات", value: totalExpenses.toLocaleString(), icon: ArrowDownCircle, tint: "from-rose-500/20 to-rose-500/5", iconClass: "text-rose-500" },
    { label: "صافي الصندوق", value: netInDrawer.toLocaleString(), icon: Wallet, tint: "from-primary/20 to-primary/5", iconClass: "text-primary" },
    { label: "متوسط الفاتورة", value: avgTicket.toLocaleString(), icon: TrendingUp, tint: "from-violet-500/20 to-violet-500/5", iconClass: "text-violet-500" },
  ];

  const paymentTotal = byPaymentMethod.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-6">
      {/* البطاقات العلوية */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`card-modern p-5 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden`}>
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${s.tint} rounded-bl-full opacity-50 z-0`}></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-xs text-slate-500 font-bold mb-1">{s.label}</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{s.value} <span className="text-[10px] text-slate-400">ريال</span></p>
              </div>
              <div className={`w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center`}>
                <s.icon className={`w-6 h-6 ${s.iconClass}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* الرسوم البيانية (الجزء الأول) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
              <div>
                <h3 className="font-bold text-slate-800">تدفق الإيرادات والمصروفات</h3>
                <p className="text-xs text-slate-500">على مدار 24 ساعة</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }} /> إيرادات</span>
              <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: "linear-gradient(135deg, #f43f5e, #f59e0b)" }} /> مصروفات</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={financialFlow} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="hourShort" tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 16, fontSize: 13, direction: "rtl", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", fontWeight: "bold" }}
                labelFormatter={(v: any) => `الساعة ${v}:00`}
              />
              <Area type="monotone" dataKey="revenue" name="إيرادات" stroke="#10b981" strokeWidth={3} fill="url(#revenueGrad)" />
              <Area type="monotone" dataKey="expense" name="مصروفات" stroke="#f43f5e" strokeWidth={3} fill="url(#expenseGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center"><CreditCard className="w-5 h-5 text-violet-600" /></div>
            <h3 className="font-bold text-slate-800">توزيع طرق الدفع</h3>
          </div>
          {byPaymentMethod.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 font-bold">لا توجد مدفوعات بعد</div>
          ) : (
            <div className="relative flex-1 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={byPaymentMethod} dataKey="value" nameKey="name" innerRadius={60} outerRadius={85} paddingAngle={6} stroke="none">
                    {byPaymentMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12, direction: "rtl", fontWeight: "bold" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mb-4">
                <p className="text-[10px] text-slate-400 font-bold mb-1">الإجمالي</p>
                <p className="text-2xl font-black text-slate-800">{paymentTotal.toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center mt-4 w-full">
                {byPaymentMethod.map((m, i) => (
                  <span key={m.name} className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {m.name}: {m.value.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* الرسوم البيانية (الجزء الثاني) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-primary" /></div>
            <h3 className="font-bold text-slate-800">الإيرادات حسب الخدمات</h3>
          </div>
          {byService.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400 font-bold">لا توجد إيرادات بعد</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byService} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="serviceGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: "bold" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#334155", fontSize: 12, fontWeight: "bold" }} tickLine={false} axisLine={false} width={120} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12, direction: "rtl", fontWeight: "bold" }} />
                <Bar dataKey="value" name="الإيراد" fill="url(#serviceGrad)" radius={[0, 8, 8, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center"><PieIcon className="w-5 h-5 text-rose-500" /></div>
            <h3 className="font-bold text-slate-800">توزيع المصروفات حسب الفئة</h3>
          </div>
          {byExpenseCategory.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400 font-bold">لا توجد مصروفات بعد</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byExpenseCategory} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="expenseCatGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: "bold" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#334155", fontSize: 12, fontWeight: "bold" }} tickLine={false} axisLine={false} width={120} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12, direction: "rtl", fontWeight: "bold" }} />
                <Bar dataKey="value" name="المبلغ" fill="url(#expenseCatGrad)" radius={[0, 8, 8, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}


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
  { code: "+962", name: "الأردن" }, { code: "+971", name: "الإمارات" }, { code: "+973", name: "البحرين" }, { code: "+213", name: "الجزائر" },
  { code: "+966", name: "السعودية" }, { code: "+249", name: "السودان" }, { code: "+964", name: "العراق" }, { code: "+968", name: "عمان" },
  { code: "+974", name: "قطر" }, { code: "+965", name: "الكويت" }, { code: "+212", name: "المغرب" }, { code: "+967", name: "اليمن" },
  { code: "+216", name: "تونس" }, { code: "+963", name: "سوريا" }, { code: "+961", name: "لبنان" }, { code: "+218", name: "ليبيا" },
  { code: "+20", name: "مصر" }, { code: "+222", name: "موريتانيا" }
].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

const round2 = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;

const parseQRText = (text: string) => {
  let code = "", name = "", phone = "", service = "", date = "", time = "";
  const verifiedMatch = text.match(/PAY-VERIFIED\|([^\n\r|]+)/i);
  const searchText = verifiedMatch ? verifiedMatch[1].trim() : text;
  const codeMatch = searchText.match(/RE-[A-Za-z0-9]+/i) || searchText.match(/WI-[A-Za-z0-9]+/i) || searchText.match(/INV-[A-Za-z0-9]+/i) || searchText.match(/PAY-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/i);
  if (codeMatch) code = codeMatch[0];
  const nameMatch = text.match(/المريض:\s*([^\n\r]+)/); if (nameMatch) name = nameMatch[1].trim();
  const phoneMatch = text.match(/الهاتف:\s*([^\n\r]+)/); if (phoneMatch) phone = phoneMatch[1].trim();
  const serviceMatch = text.match(/الخدمة:\s*([^\n\r]+)/); if (serviceMatch) service = serviceMatch[1].trim();
  const dateMatch = text.match(/التاريخ:\s*([^\n\r]+)/); if (dateMatch) date = dateMatch[1].trim();
  const timeMatch = text.match(/الوقت:\s*([^\n\r]+)/); if (timeMatch) time = timeMatch[1].trim();
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
    const nameMatch = a.notes.match(/المريض:\s*([^(–\n\r]+)/); if (nameMatch && isGenericName) name = nameMatch[1].trim();
    const phoneMatch = a.notes.match(/\(([^)]+)\)/); if (phoneMatch && isGenericPhone) phone = phoneMatch[1].trim();
  }
  let cleanName = name.replace(/^tg:\d+/i, "").trim();
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
    const { data, error } = await supabase.from("appointments").select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,discount_applied,discount_type,is_walk_in,notes,customer_telegram_id,is_promo,promo_code,promotion_id,original_price,final_price,payment_method,payment_time,created_at,patients(id,name,phone,telegram_user_id),services(name,price)").eq("clinic_id", clinic.id).eq("date", today).order("time", { ascending: true });
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
      setInvoicesList((invRes.data || []).map((inv: any) => ({ ...inv, payment_reference: String(inv.invoice_number || "").startsWith("PAY-") ? inv.invoice_number : undefined, linked_visit_code: extractLinkedVisit(inv) })) as Invoice[]);
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
    try { if (scannerRef.current.isScanning) await scannerRef.current.stop(); scannerRef.current.clear(); } catch (_) {} finally { scannerRef.current = null; }
  };

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
      try { await tryStart("user"); } catch (second) { setCameraError("❌ فشل تشغيل الكاميرا."); setScannerStatus("error"); }
    }
  }, [stopScanner]);

  const handleScannedCode = useCallback(async (rawText: string) => {
    if (verifyScannerOpen) {
      setVerifyResult({ status: "loading", message: "جاري التحقق..." });
      const targetCode = parseQRText(rawText).code || rawText.trim();
      if (targetCode) {
        const { data: inv } = await supabase.from("invoices").select("*").eq("invoice_number", targetCode).maybeSingle();
        if (inv) { setVerifyResult({ status: "valid", message: `✅ سند صحيح\nرقم: ${inv.invoice_number}\nالمريض: ${inv.patient_name}\nالمبلغ: ${Number(inv.total_amount).toLocaleString()}` }); setScannerOpen(false); stopScanner(); return; }
        const { data: appt } = await supabase.from("appointments").select("*, patients(name)").eq("reservation_code", targetCode).maybeSingle();
        if (appt) { setVerifyResult({ status: "valid", message: `✅ سند صحيح\nكود: ${appt.reservation_code}\nالمريض: ${appt.patients?.name || 'غير محدد'}\nالمدفوع: ${Number(appt.paid_amount || 0).toLocaleString()}` }); setScannerOpen(false); stopScanner(); return; }
      }
      setVerifyResult({ status: "invalid", message: `❌ سند غير صحيح` }); setScannerOpen(false); stopScanner(); return;
    }
    const targetCode = parseQRText(rawText).code || rawText.trim();
    let found = appointmentsRef.current.find(a => a.id === targetCode || a.reservation_code.toUpperCase() === targetCode.toUpperCase());
    if (!found && clinic && targetCode) {
      const { data } = await supabase.from("appointments").select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,discount_applied,discount_type,is_walk_in,notes,customer_telegram_id,is_promo,promo_code,original_price,final_price,payment_method,payment_time,patients(id,name,phone,telegram_user_id),services(name,price)").eq("clinic_id", clinic.id).ilike("reservation_code", `%${targetCode}%`).maybeSingle();
      if (data) found = data as Appointment;
    }
    if (found) {
      const { cleanName, cleanPhone } = extractCleanInfo(found);
      openPaymentModal({ ...found, extracted_patient_name: cleanName, extracted_patient_phone: cleanPhone, patients: { id: found.patients?.id, name: cleanName, phone: cleanPhone, telegram_user_id: found.patients?.telegram_user_id } });
      setScannerOpen(false); stopScanner();
    } else {
      alert("❌ لم يتم العثور على الحجز"); setScannerOpen(false); stopScanner();
    }
  }, [clinic, verifyScannerOpen]);

  const openPaymentModal = (appointment: Appointment) => {
    const { cleanName, cleanPhone } = extractCleanInfo(appointment);
    setSelectedAppointment({ ...appointment, extracted_patient_name: cleanName, extracted_patient_phone: cleanPhone });
    setEditPatientName(cleanName !== "مريض غير محدد" ? cleanName : ""); setEditPatientPhone(cleanPhone === "بدون رقم" ? "" : cleanPhone);
    const original = appointment.original_price ?? appointment.final_price ?? appointment.services?.price ?? 0;
    const discountValue = appointment.discount_amount ?? 0;
    const discountAmt = appointment.discount_applied ?? calcDiscountAmount(original, discountValue, appointment.discount_type || "fixed");
    const final = appointment.final_price ?? (original - discountAmt);
    const alreadyPaid = round2(appointment.paid_amount || 0);
    setTotalCostInput(String(original)); setPaidAmountInput(String(round2(Math.max(0, final - alreadyPaid))));
    setDiscountInput(String(discountValue)); setPaymentMethodInput(appointment.payment_method || "نقدي"); setShowReceipt(appointment.payment_status === "paid");
    setVisitType("normal"); setLinkedVisitCode(""); setPaymentDate(todayStr);
    if (appointment.patients?.id) {
      supabase.from("appointments").select("reservation_code, services(name), final_price, paid_amount, date").eq("patient_id", appointment.patients.id).in("payment_status", ["unpaid", "partial"]).order("date", { ascending: false }).then(({ data }) => {
        if (data) setPatientPreviousVisits(data.map((v: any) => ({ code: v.reservation_code, service: v.services?.name || "خدمة", remaining: round2((v.final_price || 0) - (v.paid_amount || 0)) })));
      });
    }
  };
  // دالة مساعدة لجلب ID التليجرام بشكل موثوق 100%
  const resolveTelegramId = async (phone: string, patientId?: string) => {
    if (patientId) {
      const { data } = await supabase.from("patients").select("telegram_user_id").eq("id", patientId).maybeSingle();
      if (data?.telegram_user_id) return data.telegram_user_id;
    }
    if (phone && phone !== "بدون رقم") {
      const { data } = await supabase.from("patients").select("telegram_user_id").eq("clinic_id", clinic?.id).eq("phone", phone).maybeSingle();
      if (data?.telegram_user_id) return data.telegram_user_id;
    }
    return "";
  };

  const autoSendToTelegram = async (payload: {
    type: "paid" | "partial" | "promo" | "manual" | "previous" | "invoice";
    code: string; name: string; service: string; amount: number; tgId: string;
    linkedVisit?: string; items?: any[];
  }) => {
    if (!payload.tgId) return;
    setSendingTelegram(true);
    try {
      let themeColor = "#10b981"; let themeDark = "#047857"; let title = "سند استلام مبلغ";
      if (payload.type === "promo") { themeColor = "#8b5cf6"; themeDark = "#5b21b6"; title = "سند عرض خاص"; }
      if (payload.type === "partial") { themeColor = "#f97316"; themeDark = "#c2410c"; title = "سند دفع جزئي"; }
      if (payload.type === "manual") { themeColor = "#f43f5e"; themeDark = "#be123c"; title = "سند دفعة يدوية"; }
      if (payload.type === "previous") { themeColor = "#0ea5e9"; themeDark = "#0369a1"; title = "سند سداد سابق"; }
      if (payload.type === "invoice") { themeColor = "#d946ef"; themeDark = "#a21caf"; title = "فاتورة مبيعات"; }

      const itemsHtml = payload.items ? payload.items.map((it: any) => `
        <tr>
          <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.1); font-size:13px; color:#cbd5e1;">${it.name} <span style="color:#94a3b8; font-size:11px;">× ${it.qty}</span></td>
          <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.1); font-size:14px; font-weight:800; color:#ffffff; text-align:left;">${(Number(it.qty) * Number(it.price)).toLocaleString()}</td>
        </tr>
      `).join("") : '';

      // تصميم Glassmorphism 3D الفاخر
      const receiptHtml = `
        <div style="width:400px; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding:30px; direction:rtl; font-family:'Tajawal', Tahoma, sans-serif; border-radius:28px; overflow:hidden; border:1px solid rgba(255,255,255,0.15); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); margin:0 auto; position:relative;">
          
          <div style="position:absolute; top:-50px; left:-50px; width:200px; height:200px; background:${themeColor}; filter:blur(80px); opacity:0.4; border-radius:50%;"></div>
          <div style="position:absolute; bottom:-50px; right:-50px; width:200px; height:200px; background:${themeDark}; filter:blur(80px); opacity:0.4; border-radius:50%;"></div>

          <div style="text-align:center; margin-bottom:24px; position:relative; z-index:10;">
            <div style="width:80px; height:80px; margin:0 auto 12px; border-radius:50%; background:rgba(255,255,255,0.1); border:2px solid rgba(255,255,255,0.2); padding:4px; box-shadow:0 0 20px ${themeColor}50;">
              ${clinic?.logo_url ? `<img src="${clinic.logo_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />` : `<div style="width:100%; height:100%; border-radius:50%; background:${themeColor}; display:flex; align-items:center; justify-content:center; font-size:32px;">🏥</div>`}
            </div>
            <h2 style="font-size:24px; font-weight:900; margin:0; color:#ffffff; text-shadow:0 2px 10px rgba(255,255,255,0.3);">${clinic?.name || "العيادة"}</h2>
            <p style="font-size:12px; color:${themeColor}; font-weight:800; margin:4px 0 0; letter-spacing:1px;">${title}</p>
          </div>

          <table style="width:100%; border-collapse:separate; border-spacing:0 10px; position:relative; z-index:10;">
            <tr>
              <td style="width:48%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; text-align:center;">
                <p style="margin:0 0 4px; font-size:10px; color:#94a3b8; font-weight:700;">رقم المستند</p>
                <p style="margin:0; font-family:monospace; font-size:14px; font-weight:bold; color:#ffffff;">${payload.code}</p>
              </td>
              <td style="width:4%;"></td>
              <td style="width:48%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; text-align:center;">
                <p style="margin:0 0 4px; font-size:10px; color:#94a3b8; font-weight:700;">التاريخ</p>
                <p style="margin:0; font-size:13px; font-weight:bold; color:#ffffff;">${format(new Date(), "yyyy/MM/dd")}</p>
              </td>
            </tr>
            <tr>
              <td style="width:48%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; text-align:center;">
                <p style="margin:0 0 4px; font-size:10px; color:#94a3b8; font-weight:700;">المريض</p>
                <p style="margin:0; font-size:14px; font-weight:bold; color:#ffffff;">${payload.name}</p>
              </td>
              <td style="width:4%;"></td>
              <td style="width:48%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; text-align:center;">
                <p style="margin:0 0 4px; font-size:10px; color:#94a3b8; font-weight:700;">الخدمة</p>
                <p style="margin:0; font-size:14px; font-weight:bold; color:#ffffff;">${payload.service}</p>
              </td>
            </tr>
            ${payload.linkedVisit ? `
            <tr>
              <td colspan="3" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; text-align:center;">
                <p style="margin:0; font-size:12px; font-weight:bold; color:#94a3b8;">مرتبطة بزيارة: <span style="color:${themeColor};">${payload.linkedVisit}</span></p>
              </td>
            </tr>` : ''}
          </table>

          ${payload.items && payload.items.length > 0 ? `
            <div style="background:rgba(0,0,0,0.2); border-radius:16px; padding:10px; margin:16px 0; position:relative; z-index:10;">
              <table style="width:100%; border-collapse:collapse;">${itemsHtml}</table>
            </div>
          ` : ''}

          <!-- المبلغ المضيء 3D -->
          <div style="background:linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%); border:2px solid rgba(255,255,255,0.2); border-radius:20px; padding:24px; text-align:center; position:relative; z-index:10; box-shadow: inset 0 0 20px rgba(255,255,255,0.05);">
            <p style="margin:0 0 8px; font-weight:800; color:${themeColor}; font-size:14px; letter-spacing:1px;">المبلغ المستلم</p>
            <p style="margin:0; font-size:52px; font-weight:900; color:#ffffff; text-shadow: 0 0 20px ${themeColor}, 0 0 40px ${themeColor}80; line-height:1;">${Number(payload.amount).toLocaleString()}</p>
          </div>

          <table style="width:100%; border-collapse:collapse; margin-top:24px; position:relative; z-index:10;">
            <tr>
              <td style="vertical-align:bottom;">
                <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:6px 10px; display:inline-block;">
                  <p style="font-size:9px; color:#94a3b8; margin:0 0 2px; font-weight:700;">رمز التحقق</p>
                  <p style="font-size:11px; font-family:monospace; color:#cbd5e1; margin:0;">PAY-VERIFIED|${payload.code}</p>
                </div>
              </td>
              <td style="text-align:left; vertical-align:bottom;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent("PAY-VERIFIED|" + payload.code)}" style="width:60px; height:60px; border-radius:12px; border:2px solid rgba(255,255,255,0.2); padding:4px; background:white;" />
              </td>
            </tr>
          </table>
          
          <p style="text-align:center; font-size:11px; color:#64748b; margin:24px 0 0; font-weight:600; position:relative; z-index:10;">معتمد إلكترونياً - ${clinic?.name}</p>
        </div>
      `;

      const tempDiv = document.createElement("div"); tempDiv.style.position = "absolute"; tempDiv.style.left = "-9999px"; tempDiv.innerHTML = receiptHtml; document.body.appendChild(tempDiv);
      const canvas = await html2canvas(tempDiv.firstElementChild as HTMLElement, { scale: 3, useCORS: true, backgroundColor: "#0f172a" });
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
      const tgId = await resolveTelegramId(phone);
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
      
      // تصميم كشف الحساب المنظم (جداول صلبة)
      const visitsHtml = validAppts.map(a => `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:14px 12px; font-family:monospace; font-size:13px; font-weight:bold; color:#334155;">${a.reservation_code}</td>
          <td style="padding:14px 12px; font-size:13px; color:#64748b;">${a.date}</td>
          <td style="padding:14px 12px; font-size:14px; font-weight:800; color:#0f172a;">${a.services?.name || "فحص"}</td>
          <td style="padding:14px 12px; font-size:14px; color:#64748b; text-align:left;">${Number(a.final_price||0).toLocaleString()}</td>
          <td style="padding:14px 12px; font-size:14px; font-weight:900; color:#059669; text-align:left;">${Number(a.paid_amount||0).toLocaleString()}</td>
          <td style="padding:14px 12px; font-size:14px; font-weight:bold; color:#dc2626; text-align:left;">${Number((a.final_price||0)-(a.paid_amount||0)).toLocaleString()}</td>
        </tr>
      `).join("");

      const paymentsHtml = (invs || []).filter(i => isPaymentRecord(i as any)).map(i => {
        const isPrevious = i.notes?.includes("[LINKED_VISIT:");
        const linkedCode = extractLinkedVisit(i as any);
        return `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:14px 12px; font-family:monospace; font-size:13px; color:#0284c7; font-weight:bold;">${i.invoice_number}</td>
          <td style="padding:14px 12px; font-size:13px; color:#64748b;">${i.created_at.split('T')[0]}</td>
          <td style="padding:14px 12px; text-align:left;"><b style="font-size:15px; color:#059669;">+ ${Number(i.total_amount).toLocaleString()}</b></td>
          <td style="padding:14px 12px; font-size:13px; color:#64748b; text-align:center;">${i.payment_method || "نقدي"}</td>
          <td style="padding:14px 12px; font-size:12px; font-weight:bold; text-align:left;">
            ${isPrevious ? `<span style="background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:6px;">سداد سابق (${linkedCode})</span>` : `<span style="background:#fce7f3; color:#be185d; padding:4px 10px; border-radius:6px;">دفعة مباشرة</span>`}
          </td>
        </tr>
      `}).join("");

      const total = round2(validAppts.reduce((s, v) => s + Number(v.final_price || 0), 0));
      const paid = round2(validAppts.reduce((s, v) => s + Number(v.paid_amount || 0), 0));
      const remaining = round2(Math.max(0, total - paid));

      const ledgerHtml = `
        <div style="width:800px; background:#ffffff; padding:40px; direction:rtl; font-family:'Tajawal', Tahoma, sans-serif; margin: 0 auto; box-sizing:border-box;">
          
          <div style="background:linear-gradient(135deg, #be123c 0%, #e11d48 100%); padding:40px; color:white; border-radius:24px; margin-bottom:32px;">
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <td>
                  <h1 style="font-size:26px; font-weight:900; margin:0 0 12px; color:white;">${clinic?.name} - كشف حساب</h1>
                  <p style="margin:0 0 6px; font-size:16px; opacity:0.95; font-weight:700; color:white;">المريض: ${patientName}</p>
                  <p style="margin:0; font-size:14px; opacity:0.85; font-weight:600; color:white;">الهاتف: ${phone} | تاريخ: ${format(new Date(), "yyyy/MM/dd")}</p>
                </td>
                <td style="text-align:left; vertical-align:middle;">
                  ${clinic?.logo_url ? `<img src="${clinic.logo_url}" style="width:90px; height:90px; border-radius:20px; object-fit:cover; background:white; padding:4px;" />` : ''}
                </td>
              </tr>
            </table>
          </div>

          <table style="width:100%; border-collapse:separate; border-spacing:16px 0; margin-bottom:32px; margin-left:-16px; margin-right:-16px;">
            <tr>
              <td style="width:33%; background:#f8fafc; padding:24px; border-radius:20px; text-align:center; border:1px solid #e2e8f0;">
                <p style="font-size:14px; color:#64748b; font-weight:800; margin:0 0 8px;">إجمالي المبالغ</p>
                <p style="font-size:32px; font-weight:900; margin:0; color:#0f172a;">${total.toLocaleString()}</p>
              </td>
              <td style="width:33%; background:#ecfdf5; padding:24px; border-radius:20px; text-align:center; border:1px solid #d1fae5;">
                <p style="font-size:14px; color:#059669; font-weight:800; margin:0 0 8px;">إجمالي الواصل</p>
                <p style="font-size:32px; font-weight:900; margin:0; color:#059669;">${paid.toLocaleString()}</p>
              </td>
              <td style="width:33%; background:#fff1f2; padding:24px; border-radius:20px; text-align:center; border:1px solid #ffe4e6;">
                <p style="font-size:14px; color:#e11d48; font-weight:800; margin:0 0 8px;">إجمالي المتبقي</p>
                <p style="font-size:32px; font-weight:900; margin:0; color:#e11d48;">${remaining.toLocaleString()}</p>
              </td>
            </tr>
          </table>

          <div style="margin-bottom:32px;">
            <h3 style="font-size:18px; font-weight:900; color:#1e293b; margin:0 0 16px;">سجل الزيارات</h3>
            <table style="width:100%; border-collapse:collapse; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">
              <thead style="background:#f1f5f9;">
                <tr>
                  <th style="padding:14px 12px; text-align:right; font-size:13px; color:#475569;">الزيارة</th>
                  <th style="padding:14px 12px; text-align:right; font-size:13px; color:#475569;">التاريخ</th>
                  <th style="padding:14px 12px; text-align:right; font-size:13px; color:#475569;">الخدمة</th>
                  <th style="padding:14px 12px; text-align:left; font-size:13px; color:#475569;">المبلغ</th>
                  <th style="padding:14px 12px; text-align:left; font-size:13px; color:#475569;">الواصل</th>
                  <th style="padding:14px 12px; text-align:left; font-size:13px; color:#475569;">الباقي</th>
                </tr>
              </thead>
              <tbody>${visitsHtml || '<tr><td colspan="6" style="padding:30px; text-align:center; color:#94a3b8;">لا توجد زيارات</td></tr>'}</tbody>
            </table>
          </div>

          <div>
            <h3 style="font-size:18px; font-weight:900; color:#1e293b; margin:0 0 16px;">سجل الدفعات</h3>
            <table style="width:100%; border-collapse:collapse; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">
              <thead style="background:#f1f5f9;">
                <tr>
                  <th style="padding:14px 12px; text-align:right; font-size:13px; color:#475569;">المرجع</th>
                  <th style="padding:14px 12px; text-align:right; font-size:13px; color:#475569;">التاريخ</th>
                  <th style="padding:14px 12px; text-align:left; font-size:13px; color:#475569;">المبلغ</th>
                  <th style="padding:14px 12px; text-align:center; font-size:13px; color:#475569;">الطريقة</th>
                  <th style="padding:14px 12px; text-align:left; font-size:13px; color:#475569;">نوع الدفعة</th>
                </tr>
              </thead>
              <tbody>${paymentsHtml || '<tr><td colspan="5" style="padding:30px; text-align:center; color:#94a3b8;">لا توجد دفعات</td></tr>'}</tbody>
            </table>
          </div>

          <p style="text-align:center; font-size:13px; color:#94a3b8; margin-top:40px; border-top:1px solid #e2e8f0; padding-top:24px; font-weight:800;">معتمد إلكترونياً - ${clinic?.name}</p>
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
    const finalTgId = await resolveTelegramId(editPatientPhone, patientId);

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
      await supabase.from("invoices").insert({
        clinic_id: clinic.id, patient_name: editPatientName.trim() || "غير محدد", patient_phone: editPatientPhone.trim() || "بدون رقم", invoice_number: paymentRef,
        items: [{ name: `تسديد دفعة (${linkedVisitCode})`, qty: 1, price: netCollected, linkedVisit: linkedVisitCode }],
        subtotal: netCollected, discount_type: "fixed", discount_value: 0, discount_amount: 0, total_amount: netCollected, paid_status: "paid", paid_amount: netCollected, payment_method: paymentMethodInput, notes, paid_at: new Date(paymentDate).toISOString(),
      });

      const { data: oldAppt } = await supabase.from("appointments").select("paid_amount, final_price").eq("reservation_code", linkedVisitCode).single();
      if (oldAppt) {
        const newPaid = round2((oldAppt.paid_amount || 0) + netCollected);
        await supabase.from("appointments").update({ paid_amount: newPaid, payment_status: newPaid >= (oldAppt.final_price || 0) ? "paid" : "partial" }).eq("reservation_code", linkedVisitCode);
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

      await supabase.from("appointments").update(updatePayload).eq("id", selectedAppointment.id).eq("clinic_id", clinic.id);
      toast({ title: isFullyPaid ? "✅ سداد كامل" : "✅ دفع جزئي", description: `الواصل: ${totalPaidNow}` });
      setSelectedAppointment({ ...selectedAppointment, payment_status: isFullyPaid ? "paid" : "partial", paid_amount: totalPaidNow, final_price: finalPrice, payment_method: paymentMethodInput });
      setShowReceipt(true);
    }

    setProcessingPayment(false);
    await fetchAppointments();
    await fetchInvoices();
    
    if (finalTgId) {
      await autoSendToTelegram({ type: typeToSend, code: linkedVisitCode || selectedAppointment.reservation_code, name: editPatientName, service: selectedAppointment.services?.name || "فحص", amount: netCollected, tgId: finalTgId, linkedVisit: linkedVisitCode || undefined });
      await sendTelegramLedger(editPatientName, editPatientPhone);
    } else {
      toast({ title: "⚠️ المريض غير مسجل بتليجرام", description: "لم يتم إرسال السندات تلقائياً.", variant: "destructive" });
    }
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

      await supabase.from("invoices").insert(newInvoiceData);
      toast({ title: "✅ تم إنشاء الفاتورة", description: invoiceNumber });
      setCreateInvoiceOpen(false);
      await fetchInvoices();
      
      if (fullPhone) {
        const finalTgId = await resolveTelegramId(fullPhone);
        if (finalTgId) {
          await autoSendToTelegram({ type: "invoice", code: invoiceNumber, name: invPatientName.trim() || "غير محدد", service: "فاتورة مبيعة", amount: totalAmount, tgId: finalTgId, items: newInvoiceData.items });
          await sendTelegramLedger(invPatientName.trim() || "غير محدد", fullPhone);
        }
        const waPhone = cleanPhoneForWhatsApp(fullPhone);
        if (waPhone) {
          const itemsText = newInvoiceData.items.map((it: any) => `• ${it.name} × ${it.qty} = ${(Number(it.qty)*Number(it.price)).toLocaleString()}`).join("\n");
          const waMsg = encodeURIComponent(`🧾 فاتورة جديدة - ${clinic.name}\n👤 ${invPatientName.trim()}\n🔖 ${invoiceNumber}\n\n${itemsText}\n\n💰 الإجمالي: ${totalAmount.toLocaleString()}`);
          setTimeout(() => { window.open(`https://wa.me/${waPhone}?text=${waMsg}`, "_blank"); }, 800);
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
    
    await supabase.from("invoices").insert({
      clinic_id: clinic.id, patient_name: selectedLedgerPatient.name, patient_phone: selectedLedgerPatient.phone, invoice_number: paymentRef,
      items: [{ name: `دفعة${ledgerLinkedVisit ? ` للزيارة ${ledgerLinkedVisit}` : ''}`, qty: 1, price: amount, linkedVisit: ledgerLinkedVisit || undefined }],
      subtotal: amount, discount_type: "fixed", discount_value: 0, discount_amount: 0, total_amount: amount, paid_status: "paid", paid_amount: amount, payment_method: ledgerMethod, notes, paid_at: new Date().toISOString(),
    });

    if (ledgerLinkedVisit) {
      const { data: oldAppt } = await supabase.from("appointments").select("paid_amount, final_price").eq("reservation_code", ledgerLinkedVisit).single();
      if (oldAppt) {
        const newPaid = round2((oldAppt.paid_amount || 0) + amount);
        await supabase.from("appointments").update({ paid_amount: newPaid, payment_status: newPaid >= (oldAppt.final_price || 0) ? "paid" : "partial" }).eq("reservation_code", linkedVisit);
      }
    }
    
    toast({ title: "✅ تم التسجيل" });
    setLedgerAmount(""); setLedgerLinkedVisit(""); setLedgerModalOpen(false);
    await fetchInvoices(); await fetchAppointments();

    const finalTgId = await resolveTelegramId(selectedLedgerPatient.phone);
    if (finalTgId) {
      await autoSendToTelegram({ type: "manual", code: paymentRef, name: selectedLedgerPatient.name, service: ledgerLinkedVisit ? `سداد ${ledgerLinkedVisit}` : "دفعة يدوية", amount, tgId: finalTgId, linkedVisit: ledgerLinkedVisit || undefined });
      await sendTelegramLedger(selectedLedgerPatient.name, selectedLedgerPatient.phone);
    } else {
      toast({ title: "⚠️ المريض غير مسجل بتليجرام", variant: "destructive" });
    }
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
    if (!clinic || !expenseTitle.trim() || !expenseAmount) return;
    await supabase.from("expenses").insert({ clinic_id: clinic.id, title: expenseTitle.trim(), amount: parseFloat(expenseAmount), category: expenseCategory, expense_date: expenseDate, expense_time: expenseTime + ":00" });
    setExpenseModalOpen(false); fetchExpenses();
  };

  const handleSendLedgerNow = async () => {
    if (!selectedLedgerPatient) return;
    const sent = await sendTelegramLedger(selectedLedgerPatient.name, selectedLedgerPatient.phone);
    if (sent) toast({ title: "✅ أُرسل للتليجرام" });
    else toast({ title: "⚠️ المريض غير مسجل بتليجرام", variant: "destructive" });
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
    setSelectedLedgerPatient(patient); setLedgerAmount(String(patient.remaining > 0 ? patient.remaining : 0)); setLedgerLinkedVisit(""); setLedgerNotes("");
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

      {scannerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-6 border-b border-white/10 bg-black/50">
            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Camera className="w-6 h-6" /> {verifyScannerOpen ? "التحقق من السندات" : "مسح الكود"}</h3>
            <button onClick={stopScanner} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <div id={QR_CAMERA_ELEMENT_ID} className="w-full h-full max-w-4xl" />
            {(scannerStatus === "loading" || uploadingImage) && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20"><Loader2 className="w-14 h-14 animate-spin text-emerald-500 mb-3" /><p className="text-white text-base">{uploadingImage ? "جاري قراءة الصورة..." : "جاري تشغيل الكاميرا..."}</p></div>)}
            {scannerStatus === "active" && !uploadingImage && (<div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10"><div className="relative w-72 h-72 sm:w-96 sm:h-96"><div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-emerald-500 rounded-tl-lg shadow-[0_0_20px_rgba(16,185,129,0.5)]" /><div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-emerald-500 rounded-tr-lg shadow-[0_0_20px_rgba(16,185,129,0.5)]" /><div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-emerald-500 rounded-bl-lg shadow-[0_0_20px_rgba(16,185,129,0.5)]" /><div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-emerald-500 rounded-br-lg shadow-[0_0_20px_rgba(16,185,129,0.5)]" /><div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500 animate-bounce shadow-[0_0_20px_#10b981]" style={{ animationDuration: "1.5s" }} /></div></div>)}
            {scannerStatus === "error" && !uploadingImage && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-5 text-center z-20"><AlertCircle className="w-14 h-14 text-red-400 mb-3" /><p className="text-white text-base mb-4">{cameraError}</p><Button onClick={() => startScanner(verifyScannerOpen)} className="bg-primary text-white" size="lg"><RefreshCw className="w-5 h-5 ml-1" />إعادة المحاولة</Button></div>)}
          </div>
          <div className="px-6 pb-3 shrink-0"><Button variant="outline" className="w-full gap-2 border-dashed border-primary/50 text-primary h-12 font-bold bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}><ImageIcon className="w-5 h-5" />رفع صورة QR من المعرض</Button></div>
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
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-primary flex items-center justify-center shadow-lg shadow-primary/20"><Stethoscope className="w-6 h-6 text-white" /></div>
            <div><h1 className="text-2xl font-black text-slate-800">الصندوق والخزينة</h1><p className="text-xs font-bold text-slate-500">نظام إدارة التحصيل</p></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => startScanner(false)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md h-11 px-6"><Camera className="w-5 h-5 ml-2" />مسح سريع</Button>
            <Button variant="outline" onClick={() => startScanner(true)} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 rounded-xl shadow-sm h-11 px-6"><ScanLine className="w-5 h-5 ml-2" />تحقق</Button>
            <Button variant="outline" onClick={signOut} className="text-rose-600 border-rose-200 hover:bg-rose-50 rounded-xl h-11 px-4"><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

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
            <CashierStats appointments={appointments} expenses={expenses} />
            <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div className="relative flex-1"><Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المريض أو كود الحجز" className="pr-12 h-12 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-primary" /></div>
              <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44 h-12 rounded-2xl bg-slate-50 border-transparent" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-12 rounded-2xl border-transparent bg-slate-50 px-3 text-sm md:w-40 font-bold">
                <option value="active">النشطة</option><option value="all">الكل</option><option value="paid">مدفوع</option><option value="unpaid">بانتظار الدفع</option><option value="arrived">حاضر</option><option value="waiting">لم يصل</option>
              </select>
              <div className="flex gap-2">
                <Button onClick={() => setWalkInOpen(true)} className="bg-primary h-12 rounded-2xl px-6"><Plus className="w-4 h-4 ml-1" />مريض مباشر</Button>
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 h-12 rounded-2xl px-6" onClick={() => setExpenseModalOpen(true)}><MinusCircle className="w-4 h-4 ml-1" />مصروف</Button>
                <Button variant="outline" onClick={() => { fetchAppointments(); fetchExpenses(); }} className="h-12 rounded-2xl"><RefreshCw className="w-4 h-4 ml-1" />تحديث</Button>
              </div>
            </div>

            {expenses.length > 0 && (
              <div className="bg-white rounded-3xl p-4 space-y-2 border border-red-100 shadow-sm">
                <div className="flex items-center justify-between"><h3 className="text-xs font-bold text-red-600 flex items-center gap-1"><MinusCircle className="w-4 h-4" /> مصروفات اليوم ({expenses.length})</h3><span className="text-xs font-black text-red-600">إجمالي: {expenses.reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}</span></div>
                <div className="flex gap-2 overflow-x-auto pb-1">{expenses.map((exp) => (<div key={exp.id} className="bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl text-xs shrink-0 flex items-center gap-2"><span className="font-bold text-red-800">{exp.title}</span><span className="text-red-500 font-bold">{exp.amount}</span><span className="text-[10px] text-red-400">{String(exp.expense_time).slice(0, 5)}</span></div>))}</div>
              </div>
            )}

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="grid gap-4">
                {filtered.map((a) => {
                  const isPaid = a.payment_status === "paid";
                  const isArrived = !!a.arrived_at;
                  const isPromo = a.is_promo === true;
                  const { cleanName, cleanPhone } = extractCleanInfo(a);
                  const netAmt = computeNetCollected(a);

                  return (
                    <div key={a.id} className={`rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center gap-3 border transition-all ${isPromo ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50 hover:shadow-md"}`}>
                      <div className="space-y-2 w-full sm:w-auto">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                          {isPromo && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg text-xs font-bold">🎁 عرض</span>}
                          {a.is_walk_in && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg text-xs font-bold">مباشر</span>}
                          <span className="text-sm text-slate-500 font-medium"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                          {isArrived ? <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-100 text-emerald-700 font-bold">وصل</span> : <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-100 text-amber-700 font-bold">بانتظار</span>}
                          {isPaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-100 text-blue-700 font-bold">مدفوع</span>}
                          {a.payment_status === "partial" && <span className="px-2 py-0.5 rounded-lg text-xs bg-orange-100 text-orange-700 font-bold">دفع جزئي</span>}
                        </div>
                        <div>
                          <h2 className="font-bold text-lg text-slate-800">{cleanName}</h2>
                          <p className="text-sm text-slate-500 font-medium">{cleanPhone} — <b>{a.services?.name || "بدون خدمة"}</b></p>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center justify-end w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                        {isPaid ? (
                          <Button variant="outline" className="w-full sm:w-auto text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-xl h-11 px-6" onClick={() => openPaymentModal(a)}><CheckCircle className="w-4 h-4 ml-1" />عرض السند</Button>
                        ) : (
                          <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 px-6 font-bold shadow-sm" onClick={() => openPaymentModal(a)}><Banknote className="w-4 h-4 ml-1" />تسجيل الدفع</Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && <div className="text-center py-12 text-slate-400 font-bold">لا توجد حالات اليوم</div>}
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
              {filteredInvoicesList.map(inv => (
                <div key={inv.id} className="bg-white rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 w-full sm:w-auto mb-4 sm:mb-0">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><FileText className="w-6 h-6" /></div>
                    <div>
                      <div className="flex items-center gap-3 mb-1"><span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg text-sm border border-indigo-100">{inv.invoice_number}</span><span className="text-xs text-slate-500 font-medium">{format(new Date(inv.created_at), "yyyy-MM-dd hh:mm a")}</span></div>
                      <h3 className="font-bold text-lg text-slate-800">{inv.patient_name || "مريض غير محدد"}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-left"><p className="text-xs text-slate-400 font-bold mb-1">الإجمالي</p><p className="text-2xl font-black text-indigo-700">{Number(inv.total_amount).toLocaleString()}</p></div>
                    <Button size="lg" variant="outline" className="rounded-xl border-slate-200" onClick={()=>setSelectedInvoice(inv)}>عرض التفاصيل</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "receipts" && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8"><h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><BookOpen className="text-primary w-7 h-7" /> دفتر حسابات المرضى</h2></div>
            <div className="grid gap-5">
              {ledgerPatients.map((p, idx) => (
                <div key={idx} className="bg-slate-50 rounded-3xl p-6 flex flex-col lg:flex-row justify-between items-center border border-slate-200/60 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 flex-1 mb-6 lg:mb-0 w-full">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-700 text-xl shadow-sm">{p.name.charAt(0)}</div>
                    <div><h3 className="font-bold text-xl text-slate-800 mb-1">{p.name}</h3><p className="text-sm text-slate-500 font-medium font-mono">{p.phone}</p></div>
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
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50"><h3 className="font-black text-xl text-slate-800">تأكيد الدفع</h3><button onClick={()=>setSelectedAppointment(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition"><X className="w-5 h-5" /></button></div>
            <div className="p-6 overflow-y-auto space-y-6">
              {!showReceipt ? (
                <>
                  <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                    <button onClick={()=>setVisitType("normal")} className={`py-2.5 text-sm font-bold rounded-xl transition-all ${visitType === 'normal' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'}`}>زيارة عادية</button>
                    <button onClick={()=>setVisitType("followup")} className={`py-2.5 text-sm font-bold rounded-xl transition-all ${visitType === 'followup' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'}`}>مراجعة</button>
                    <button onClick={()=>setVisitType("link")} className={`py-2.5 text-sm font-bold rounded-xl transition-all ${visitType === 'link' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'}`}>دفع سابق</button>
                  </div>
                  {visitType === "link" && (
                    <div><label className="text-xs font-bold text-slate-500 mb-2 block">اختر الزيارة السابقة</label><select value={linkedVisitCode} onChange={e=>{setLinkedVisitCode(e.target.value); const v = patientPreviousVisits.find(x=>x.code===e.target.value); if(v) setPaidAmountInput(String(v.remaining));}} className="w-full h-12 rounded-xl border-2 border-slate-200 p-3 font-bold focus:border-primary"><option value="">-- اختر --</option>{patientPreviousVisits.map(v => <option key={v.code} value={v.code}>{v.code} - متبقي: {v.remaining}</option>)}</select></div>
                  )}
                  <div className="space-y-4">
                    <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">اسم المريض</label><Input value={editPatientName} onChange={e=>setEditPatientName(e.target.value)} className="h-12 rounded-xl border-slate-200 bg-slate-50" /></div>
                    {visitType !== "link" && (<div><label className="text-xs font-bold text-slate-500 mb-1.5 block">إجمالي الخدمة</label><Input type="number" value={totalCostInput} onChange={e=>setTotalCostInput(e.target.value)} className="h-12 rounded-xl border-slate-200 bg-slate-50 font-bold text-lg" /></div>)}
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-xs font-bold text-emerald-600 mb-1.5 block">المدفوع الآن</label><Input type="number" value={paidAmountInput} onChange={e=>setPaidAmountInput(e.target.value)} className="h-12 rounded-xl border-emerald-200 bg-emerald-50 text-lg font-black text-emerald-700" /></div>
                      <div><label className="text-xs font-bold text-rose-600 mb-1.5 block">الخصم</label><Input type="number" value={discountInput} onChange={e=>setDiscountInput(e.target.value)} className="h-12 rounded-xl border-rose-200 bg-rose-50 text-lg font-black text-rose-700" /></div>
                    </div>
                  </div>
                  <Button onClick={handlePayNow} disabled={processingPayment} className="w-full h-14 rounded-2xl text-lg font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg mt-2">
                    {processingPayment ? <Loader2 className="animate-spin w-6 h-6" /> : "تأكيد التحصيل"}
                  </Button>
                </>
              ) : (
                <div className="space-y-6 text-center animate-in fade-in">
                  <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><CheckCircle className="w-12 h-12" /></div>
                  <h3 className="text-2xl font-black text-slate-800">تم التحصيل بنجاح!</h3>
                  <p className="text-sm text-slate-500">تم إرسال السند وكشف الحساب للتليجرام.</p>
                  <Button onClick={()=>setSelectedAppointment(null)} className="w-full h-12 rounded-xl bg-slate-900 text-white">إغلاق</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
        <DialogContent className="max-w-2xl rounded-3xl overflow-hidden p-0 gap-0" dir="rtl">
          <div className="bg-slate-50 p-6 border-b border-slate-200"><DialogTitle className="text-xl font-black text-slate-800 flex items-center gap-2"><FileText className="text-primary"/> إنشاء فاتورة جديدة</DialogTitle></div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">اسم المريض</label><Input value={invPatientName} onChange={e=>setInvPatientName(e.target.value)} className="h-12 rounded-xl bg-slate-50" /></div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 block">رقم الهاتف</label>
                <div className="flex gap-2">
                  <select value={invPatientCountryCode} onChange={e=>setInvPatientCountryCode(e.target.value)} className="w-32 h-12 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm font-bold">{ARAB_COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select>
                  <Input value={invPatientPhone} onChange={e=>setInvPatientPhone(e.target.value)} placeholder="رقم الهاتف" className="h-12 rounded-xl flex-1 bg-slate-50 text-left" dir="ltr" />
                </div>
              </div>
            </div>
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-center mb-2"><label className="text-sm font-black text-slate-700">بنود الفاتورة</label><Button variant="outline" size="sm" onClick={addInvoiceItem} className="rounded-lg h-8 text-xs"><Plus className="w-3.5 h-3.5 ml-1"/> إضافة بند</Button></div>
              {invItems.map((it, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={it.name} onChange={e=>updateInvoiceItem(i, {name: e.target.value})} placeholder="اسم الخدمة" className="flex-1 rounded-xl bg-white" />
                  <Input type="number" value={it.price} onChange={e=>updateInvoiceItem(i, {price: Number(e.target.value)})} placeholder="السعر" className="w-28 rounded-xl bg-white font-bold" />
                  <Button variant="ghost" size="icon" onClick={()=>removeInvoiceItem(i)} className="text-rose-500 shrink-0"><Trash2 className="w-5 h-5"/></Button>
                </div>
              ))}
            </div>
            <Button onClick={handleSaveInvoice} disabled={invSaving} className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-lg font-black shadow-lg text-white">
              {invSaving ? <Loader2 className="animate-spin w-6 h-6" /> : "حفظ وإرسال الفاتورة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold text-lg">تفاصيل الفاتورة</h3><button onClick={()=>setSelectedInvoice(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full"><X className="w-5 h-5"/></button></div>
            <div className="p-6 overflow-y-auto">
              <div className="bg-white border text-slate-800 border-slate-200 rounded-2xl overflow-hidden shadow-sm" dir="rtl">
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
                  <div className="flex justify-between items-center bg-pink-50 p-4 rounded-xl border border-pink-100 mt-4"><span className="font-bold text-pink-900">الإجمالي المستلم:</span><span className="text-2xl font-black text-pink-600">{Number(selectedInvoice.total_amount).toLocaleString()}</span></div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <Button onClick={()=>setSelectedInvoice(null)} className="rounded-xl bg-slate-900 text-white">إغلاق</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={ledgerModalOpen} onOpenChange={setLedgerModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 gap-0" dir="rtl">
          <div className="bg-slate-900 p-6 text-white sticky top-0 z-10 flex justify-between items-center">
            <div><DialogTitle className="text-2xl font-black mb-1">ملف المريض: {selectedLedgerPatient?.name}</DialogTitle><p className="text-slate-400 text-sm font-mono">{selectedLedgerPatient?.phone}</p></div>
            <Button onClick={handleSendLedgerNow} disabled={sendingTelegram} className="bg-[#0088cc] hover:bg-[#0077b5] rounded-xl h-10 px-4"><Send className="w-4 h-4 ml-2"/> إرسال للتليجرام</Button>
          </div>
          <div className="p-6 space-y-8 bg-slate-50">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PlusCircle className="w-5 h-5 text-emerald-500"/> تسجيل دفعة جديدة (يدوياً)</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input type="number" value={ledgerAmount} onChange={e=>setLedgerAmount(e.target.value)} placeholder="المبلغ" className="rounded-xl h-12 font-bold text-lg" />
                <select value={ledgerMethod} onChange={e=>setLedgerMethod(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm font-bold bg-slate-50"><option>نقدي</option><option>تحويل</option><option>بطاقة</option></select>
                <select value={ledgerLinkedVisit} onChange={e=>setLedgerLinkedVisit(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm font-bold bg-slate-50"><option value="">بدون ربط بزيارة</option>{fullPatientHistory?.visits.map((v:any) => <option key={v.code} value={v.code}>{v.code} - متبقي: {v.amount-v.paid}</option>)}</select>
                <Button onClick={handleAddLedgerPayment} className="rounded-xl h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">تسجيل الدفعة</Button>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="font-black text-lg text-slate-800 mb-3 flex items-center gap-2"><Clock className="w-5 h-5 text-primary"/> سجل الزيارات</h3>
                <div className="grid gap-3">
                  {fullPatientHistory?.visits.map((v:any, i:number) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 justify-between items-center">
                      <div className="flex items-center gap-3"><span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded text-sm">{v.code}</span><span className="text-sm font-medium text-slate-600">{v.date} • {v.service}</span></div>
                      <div className="flex gap-4 text-sm"><div className="text-slate-500">المبلغ: <span className="font-bold text-slate-800">{v.amount}</span></div><div className="text-emerald-600">الواصل: <span className="font-bold">{v.paid}</span></div><div className="text-rose-600">الباقي: <span className="font-bold">{v.amount - v.paid}</span></div></div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-black text-lg text-slate-800 mb-3 flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600"/> سجل الدفعات (السندات)</h3>
                <div className="grid gap-3">
                  {fullPatientHistory?.payments.map((p:any, i:number) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 justify-between items-center">
                      <div className="flex items-center gap-3"><span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">{p.ref}</span><span className="text-sm font-medium text-slate-600">{p.date}</span>{p.linkedVisit && <span className="text-xs bg-sky-100 text-sky-700 px-2 py-1 rounded-md font-bold">مرتبطة بـ {p.linkedVisit}</span>}</div>
                      <div className="flex gap-4 text-sm"><div className="text-slate-500">الطريقة: <span className="font-bold text-slate-800">{p.method}</span></div><div className="text-emerald-600 font-black text-lg">{p.amount}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`card-modern p-5 rounded-3xl bg-white border border-slate-100 shadow-sm relative overflow-hidden`}>
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${s.tint} rounded-bl-full opacity-50 z-0`}></div>
            <div className="flex items-center justify-between relative z-10">
              <div><p className="text-xs text-slate-500 font-bold mb-1">{s.label}</p><p className="text-2xl font-black text-slate-800 mt-1">{s.value} <span className="text-[10px] text-slate-400">ريال</span></p></div>
              <div className={`w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center`}><s.icon className={`w-6 h-6 ${s.iconClass}`} /></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div><div><h3 className="font-bold text-slate-800">تدفق الإيرادات والمصروفات</h3><p className="text-xs text-slate-500">على مدار 24 ساعة</p></div></div>
            <div className="flex items-center gap-4 text-xs font-bold"><span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }} /> إيرادات</span><span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: "linear-gradient(135deg, #f43f5e, #f59e0b)" }} /> مصروفات</span></div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={financialFlow} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.6} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.05} /></linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.6} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="hourShort" tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 16, fontSize: 13, direction: "rtl", fontWeight: "bold" }} labelFormatter={(v: any) => `الساعة ${v}:00`} />
              <Area type="monotone" dataKey="revenue" name="إيرادات" stroke="#10b981" strokeWidth={3} fill="url(#revenueGrad)" />
              <Area type="monotone" dataKey="expense" name="مصروفات" stroke="#f43f5e" strokeWidth={3} fill="url(#expenseGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center"><CreditCard className="w-5 h-5 text-violet-600" /></div><h3 className="font-bold text-slate-800">توزيع طرق الدفع</h3></div>
          {byPaymentMethod.length === 0 ? (<div className="flex-1 flex items-center justify-center text-sm text-slate-400 font-bold">لا توجد مدفوعات بعد</div>) : (
            <div className="relative flex-1 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={byPaymentMethod} dataKey="value" nameKey="name" innerRadius={60} outerRadius={85} paddingAngle={6} stroke="none">{byPaymentMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl", fontWeight: "bold" }} /></PieChart></ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mb-4"><p className="text-[10px] text-slate-400 font-bold mb-1">الإجمالي</p><p className="text-2xl font-black text-slate-800">{paymentTotal.toLocaleString()}</p></div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center mt-4 w-full">{byPaymentMethod.map((m, i) => (<span key={m.name} className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{m.name}: {m.value.toLocaleString()}</span>))}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-primary" /></div><h3 className="font-bold text-slate-800">الإيرادات حسب الخدمات</h3></div>
          {byService.length === 0 ? (<div className="h-[250px] flex items-center justify-center text-sm text-slate-400 font-bold">لا توجد إيرادات بعد</div>) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byService} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <defs><linearGradient id="serviceGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#10b981" stopOpacity={0.8} /><stop offset="100%" stopColor="#06b6d4" stopOpacity={0.8} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: "bold" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#334155", fontSize: 12, fontWeight: "bold" }} tickLine={false} axisLine={false} width={120} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl", fontWeight: "bold" }} />
                <Bar dataKey="value" name="الإيراد" fill="url(#serviceGrad)" radius={[0, 8, 8, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center"><PieIcon className="w-5 h-5 text-rose-500" /></div><h3 className="font-bold text-slate-800">توزيع المصروفات حسب الفئة</h3></div>
          {byExpenseCategory.length === 0 ? (<div className="h-[250px] flex items-center justify-center text-sm text-slate-400 font-bold">لا توجد مصروفات بعد</div>) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byExpenseCategory} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <defs><linearGradient id="expenseCatGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.8} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0.8} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: "bold" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#334155", fontSize: 12, fontWeight: "bold" }} tickLine={false} axisLine={false} width={120} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl", fontWeight: "bold" }} />
                <Bar dataKey="value" name="المبلغ" fill="url(#expenseCatGrad)" radius={[0, 8, 8, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

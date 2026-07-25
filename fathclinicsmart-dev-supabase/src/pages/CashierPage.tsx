
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
import { Banknote, CheckCircle, LogOut, Search, ShieldCheck, Stethoscope, Users, Camera, X, Loader2, AlertCircle, Image as ImageIcon, Upload, RefreshCw, Printer, Download, Clock, Plus, UserPlus, DollarSign, TrendingUp, Receipt, MessageCircle, MinusCircle, Wallet, ArrowDownCircle, ArrowUpCircle, Sparkles, Send } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Html5Qrcode } from "html5-qrcode";
import html2canvas from "html2canvas";

const QR_CAMERA_ELEMENT_ID = "qr-camera-container-cashier";
const QR_FILE_ELEMENT_ID = "qr-hidden-file-reader-cashier";

type Appointment = {
  id: string; patient_id?: string; date: string; time: string; status: string; reservation_code: string;
  arrived_at: string | null; payment_status: string; paid_amount?: number | null; discount_amount?: number | null;
  is_walk_in: boolean; customer_telegram_id?: string | null;
  patients: { id?: string; name: string; phone: string; telegram_user_id?: string } | null;
  services: { name: string; price: number | null } | null;
  extracted_patient_name?: string; extracted_patient_phone?: string;
};

type Expense = { id: string; title: string; amount: number; category: string; time: string; };

const parseQRText = (text: string) => {
  let code = "", name = "", phone = "", service = "", date = "", time = "";
  const codeMatch = text.match(/RE-[A-Za-z0-9]+/i) || text.match(/WI-[A-Za-z0-9]+/i);
  if (codeMatch) code = codeMatch[0];
  const nameMatch = text.match(/ط§ظ„ظ…ط±ظٹط¶:\s*([^\n\r]+)/);
  if (nameMatch) name = nameMatch[1].replace(/ًں‘¤/g, "").replace(/@\w+/g, "").trim();
  const phoneMatch = text.match(/ط§ظ„ظ‡ط§طھظپ:\s*([^\n\r]+)/);
  if (phoneMatch) phone = phoneMatch[1].replace(/ًں“±/g, "").trim();
  const serviceMatch = text.match(/ط§ظ„ط®ط¯ظ…ط©:\s*([^\n\r]+)/);
  if (serviceMatch) service = serviceMatch[1].replace(/ًںڈ·ï¸ڈ/g, "").trim();
  const dateMatch = text.match(/ط§ظ„طھط§ط±ظٹط®:\s*([^\n\r]+)/);
  if (dateMatch) date = dateMatch[1].replace(/ًں“…/g, "").trim();
  const timeMatch = text.match(/ط§ظ„ظˆظ‚طھ:\s*([^\n\r]+)/);
  if (timeMatch) time = timeMatch[1].replace(/âڈ°/g, "").trim();
  return { code, name, phone, service, date, time };
};

const cleanPhoneForWhatsApp = (phone?: string): string => {
  if (!phone || phone.startsWith("tg:") || phone.startsWith("TG:") || phone === "ط¨ط¯ظˆظ† ظ‡ط§طھظپ" || phone === ".") return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  let waPhone = digits;
  if (digits.startsWith("00")) waPhone = digits.slice(2);
  else if (digits.startsWith("0")) waPhone = "967" + digits.slice(1);
  else if (!digits.startsWith("967") && digits.length === 9) waPhone = "967" + digits;
  return waPhone;
};

const getCleanPhone = (dbPhone: string | undefined, qrPhone: string): string => {
  if (!dbPhone || dbPhone.startsWith("tg:") || dbPhone.startsWith("TG:") || dbPhone === "ط¨ط¯ظˆظ† ظ‡ط§طھظپ" || dbPhone === ".") return qrPhone || "";
  return dbPhone;
};

const getCleanName = (dbName: string | undefined, qrName: string): string => {
  if (!dbName || dbName === "." || dbName.trim().length < 2 || dbName.startsWith("tg:") || dbName.startsWith("TG:") || dbName.includes("@")) return qrName || "ط؛ظٹط± ظ…ط­ط¯ط¯";
  return dbName.replace(/^tg:\d+/i, "").replace(/ًں‘¤/g, "").trim();
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
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientPhoneInput, setPatientPhoneInput] = useState("");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("ظ†ط«ط±ظٹط§طھ");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const today = dateFilter;

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editPatientName, setEditPatientName] = useState<string>("");
  const [editPatientPhone, setEditPatientPhone] = useState<string>("");
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);

  useEffect(() => { appointmentsRef.current = appointments; }, [appointments]);
  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [authLoading, user, navigate]);
  useEffect(() => {
    if (clinicLoading) return;
    if (role === "owner" || role === "cashier") setUnlocked(true);
    if (role === "reception") navigate("/reception", { replace: true });
  }, [role, clinicLoading, navigate]);

  const fetchAppointments = useCallback(async () => {
    if (!clinic || !unlocked) return;
    const { data, error } = await supabase.from("appointments").select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,is_walk_in,customer_telegram_id,patients(id,name,phone,telegram_user_id),services(name,price)").eq("clinic_id", clinic!.id).eq("date", today).order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  }, [clinic, unlocked, today]);

  useEffect(() => {
    if (!clinic || !unlocked) return;
    fetchAppointments();
    const channel = supabase.channel(`cashier-${clinic.id}-${today}`).on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, fetchAppointments).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, unlocked, today, fetchAppointments]);

  useEffect(() => { return () => { destroyScanner(); }; }, []);

  const destroyScanner = async () => {
    if (!scannerRef.current) return;
    try { if (scannerRef.current.isScanning) await scannerRef.current.stop(); scannerRef.current.clear(); } catch (_) {}
    finally { scannerRef.current = null; }
  };

  const getFriendlyError = (error: any): string => {
    const msg = String(error?.message || error || "");
    if (msg.includes("NotAllowedError") || msg.includes("Permission")) return "ًں”’ ظ„ظ… ظٹطھظ… ظ…ظ†ط­ ط¥ط°ظ† ط§ظ„ظƒط§ظ…ظٹط±ط§.";
    if (msg.includes("NotFoundError") || msg.includes("DevicesNotFoundError")) return "ًں“· ظ„ط§ طھظˆط¬ط¯ ظƒط§ظ…ظٹط±ط§ ظ…طھطµظ„ط©.";
    if (msg.includes("NotReadableError") || msg.includes("TrackStartError")) return "âڑ ï¸ڈ ط§ظ„ظƒط§ظ…ظٹط±ط§ ظ…ط³طھط®ط¯ظ…ط© ظ…ظ† طھط·ط¨ظٹظ‚ ط¢ط®ط±.";
    return `â‌Œ ظپط´ظ„ طھط´ط؛ظٹظ„ ط§ظ„ظƒط§ظ…ظٹط±ط§. ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰ ط£ظˆ ط§ط±ظپط¹ طµظˆط±ط© ط§ظ„ظ…ظˆط¹ط¯.`;
  };

  const markArrived = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase.from("appointments").update({ arrived_at: new Date().toISOString(), department: "ط§ط³طھظ‚ط¨ط§ظ„" }).eq("id", appointmentId).eq("clinic_id", clinic.id);
    if (!error) { toast({ title: "âœ… طھظ… طھط³ط¬ظٹظ„ ط§ظ„ط­ط¶ظˆط±", description: "طھط­ظˆظ„ ط§ظ„ظ…ظˆط¹ط¯ ط¥ظ„ظ‰ ط­ط§ظ„ط© (ظˆطµظ„)" }); fetchAppointments(); }
  };

  const handleScannedCode = useCallback(async (rawText: string) => {
    const qrParsed = parseQRText(rawText);
    const targetCode = qrParsed.code || rawText.trim();
    let found: Appointment | undefined;
    const current = appointmentsRef.current;
    found = current.find(a => a.id === targetCode || a.reservation_code.toUpperCase() === targetCode.toUpperCase() || rawText.toUpperCase().includes(a.reservation_code.toUpperCase()));
    if (!found && clinic && targetCode) {
      const { data } = await supabase.from("appointments").select("id,patient_id,date,time,status,reservation_code,arrived_at,payment_status,paid_amount,discount_amount,is_walk_in,customer_telegram_id,patients(id,name,phone,telegram_user_id),services(name,price)").eq("clinic_id", clinic.id).ilike("reservation_code", `%${targetCode}%`).maybeSingle();
      if (data) found = data as Appointment;
    }
    if (found) {
      const cleanPhone = getCleanPhone(found.patients?.phone, qrParsed.phone);
      const cleanName = getCleanName(found.patients?.name, qrParsed.name);
      const enriched: Appointment = { ...found, extracted_patient_name: cleanName, extracted_patient_phone: cleanPhone, patients: { id: found.patients?.id, name: cleanName, phone: cleanPhone, telegram_user_id: found.patients?.telegram_user_id }, services: found.services || (qrParsed.service ? { name: qrParsed.service, price: null } : null) };
      if (!enriched.arrived_at) { await markArrived(enriched.id); enriched.arrived_at = new Date().toISOString(); }
      setSelectedAppointment(enriched);
      setEditPatientName(cleanName);
      setEditPatientPhone(cleanPhone);
      const defaultPrice = enriched.services?.price || 0;
      setPaidAmountInput(enriched.paid_amount != null ? String(enriched.paid_amount) : String(defaultPrice));
      setDiscountInput(enriched.discount_amount != null ? String(enriched.discount_amount) : "0");
      setShowReceipt(enriched.payment_status === "paid");
      if (enriched.payment_status === "paid") {
        toast({ title: "â„¹ï¸ڈ ظ…ط¯ظپظˆط¹ ظ…ط³ط¨ظ‚ط§ظ‹", description: cleanName });
      } else {
        toast({ title: "âœ… ط¬ط§ظ‡ط² ظ„ظ„ط¯ظپط¹", description: cleanName });
      }
      setScannerOpen(false); stopScanner();
    } else {
      toast({ title: "â‌Œ ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ…ظˆط¹ط¯", description: `ط§ظ„ظƒظˆط¯ ط§ظ„ظ…ط³طھط®ط±ط¬: ${targetCode}`, variant: "destructive" });
    }
  }, [clinic]);

  const stopScanner = useCallback(async () => { await destroyScanner(); setScannerOpen(false); setScannerStatus("idle"); setCameraError(null); }, []);
  const startScanner = useCallback(async () => {
    await destroyScanner(); setCameraError(null); setScannerStatus("loading"); setScannerOpen(true); await new Promise(r => setTimeout(r, 250));
    const element = document.getElementById(QR_CAMERA_ELEMENT_ID); if (!element) { setCameraError("â‌Œ طھط¹ط°ط± طھظ‡ظٹط¦ط© ط§ظ„ظ…ط§ط³ط­."); setScannerStatus("error"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError("ًںŒگ ط§ظ„ظ…طھطµظپط­ ظ„ط§ ظٹط¯ط¹ظ… ط§ظ„ظƒط§ظ…ظٹط±ط§."); setScannerStatus("error"); return; }
    const tryStart = async (facingMode: "environment" | "user"): Promise<boolean> => {
      try {
        const scanner = new Html5Qrcode(QR_CAMERA_ELEMENT_ID, { verbose: false }); scannerRef.current = scanner;
        await scanner.start({ facingMode }, { fps: 10, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.7), height: Math.floor(Math.min(w, h) * 0.7) }), aspectRatio: 1.0 }, (text) => { stopScanner().then(() => handleScannedCode(text)); }, () => {});
        setScannerStatus("active"); return true;
      } catch (e) { if (scannerRef.current) { try { scannerRef.current.clear(); } catch (_) {} scannerRef.current = null; } throw e; }
    };
    try { await tryStart("environment"); return; } catch (_) { try { await new Promise(r => setTimeout(r, 150)); await tryStart("user"); return; } catch (second) { setCameraError(getFriendlyError(second)); setScannerStatus("error"); } }
  }, [stopScanner, handleScannedCode]);

  const processImageForQR = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => {
        const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d"); if (!ctx) return reject("ظپط´ظ„ Canvas");
        let w = img.width, h = img.height; const maxDim = 1000;
        if (w > maxDim || h > maxDim) { if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; } else { w = Math.round((w * maxDim) / h); h = maxDim; } }
        canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => { if (blob) resolve(new File([blob], file.name, { type: "image/png" })); else reject("ظپط´ظ„ ط§ظ„طھط­ظˆظٹظ„"); }, "image/png");
      };
      img.onerror = () => reject("ظپط´ظ„ ط§ظ„طھط­ظ…ظٹظ„"); img.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploadingImage(true); await destroyScanner();
    try {
      const fileScanner = new Html5Qrcode(QR_FILE_ELEMENT_ID, { verbose: false }); let decodedText = "";
      try { decodedText = await fileScanner.scanFile(file, false); } catch (_) { const resized = await processImageForQR(file); decodedText = await fileScanner.scanFile(resized, false); }
      await stopScanner(); handleScannedCode(decodedText);
    } catch (err) { toast({ title: "ظپط´ظ„ ظ‚ط±ط§ط،ط© QR", description: "طھط£ظƒط¯ ظ…ظ† ظˆط¶ظˆط­ ظƒظˆط¯ QR ظپظٹ ط§ظ„طµظˆط±ط©.", variant: "destructive" }); } finally { setUploadingImage(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const unlock = () => { if (pin === (clinic?.cashier_pin || "5678")) setUnlocked(true); else toast({ title: "ط±ظ…ط² ط؛ظٹط± طµط­ظٹط­", description: "طھط­ظ‚ظ‚ ظ…ظ† ط±ظ…ط² ط§ظ„طµظ†ط¯ظˆظ‚ ظپظٹ ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ", variant: "destructive" }); };

  // FIXED openPaymentModal: preferring real names/numbers over Telegram account info
  const openPaymentModal = (appointment: Appointment) => {
    const extractedName = appointment.extracted_patient_name || "";
    const extractedPhone = appointment.extracted_patient_phone || "";
    const dbNameRaw = appointment.patients?.name || "";
    const dbPhoneRaw = appointment.patients?.phone || "";
    let finalName = dbNameRaw;
    if (!finalName || finalName.trim().length < 2 || finalName.startsWith("tg:") || finalName.startsWith("TG:") || finalName === "." || finalName.includes("@")) {
      finalName = extractedName || "ط؛ظٹط± ظ…ط­ط¯ط¯";
    }
    finalName = finalName.replace(/^tg:\d+/i, "").replace(/ًں‘¤/g, "").trim();
    let finalPhone = dbPhoneRaw;
    if (!finalPhone || finalPhone.trim().length < 5 || finalPhone.startsWith("tg:") || finalPhone.startsWith("TG:") || finalPhone === "." || finalPhone === "ط¨ط¯ظˆظ† ظ‡ط§طھظپ") {
      finalPhone = extractedPhone || "";
    }
    if (finalPhone.startsWith("tg:") || finalPhone.startsWith("TG:")) finalPhone = "";
    const cleanName = finalName || "ط؛ظٹط± ظ…ط­ط¯ط¯";
    const cleanPhone = finalPhone || "";
    const appEnriched: Appointment = {
      ...appointment,
      extracted_patient_name: cleanName,
      extracted_patient_phone: cleanPhone,
      patients: {
        id: appointment.patients?.id || appointment.patient_id || "",
        name: cleanName,
        phone: cleanPhone,
        telegram_user_id: appointment.patients?.telegram_user_id || appointment.customer_telegram_id || null,
      },
    };
    setSelectedAppointment(appEnriched);
    setEditPatientName(cleanName !== "ط؛ظٹط± ظ…ط­ط¯ط¯" ? cleanName : "");
    setEditPatientPhone(cleanPhone);
    const defaultPrice = appointment.services?.price || 0;
    setPaidAmountInput(appEnriched.paid_amount != null ? String(appEnriched.paid_amount) : String(defaultPrice));
    setDiscountInput(appEnriched.discount_amount != null ? String(appEnriched.discount_amount) : "0");
    setShowReceipt(appEnriched.payment_status === "paid");
  };

  const handlePayNow = async () => {
    if (!selectedAppointment || !clinic) return; setProcessingPayment(true);
    const paidVal = parseFloat(paidAmountInput) || 0;
    const discountVal = parseFloat(discountInput) || 0;
    const patientId = selectedAppointment.patients?.id || selectedAppointment.patient_id;
    if (patientId && (editPatientName.trim() || editPatientPhone.trim())) {
      const updateData: any = {};
      if (editPatientName.trim()) updateData.name = editPatientName.trim();
      if (editPatientPhone.trim() && !editPatientPhone.startsWith("tg:")) updateData.phone = editPatientPhone.trim();
      await supabase.from("patients").update(updateData).eq("id", patientId);
    }
    const { error } = await supabase.from("appointments").update({
      payment_status: "paid", status: "confirmed", department: "طµظ†ط¯ظˆظ‚",
      paid_amount: paidVal, discount_amount: discountVal
    }).eq("id", selectedAppointment.id).eq("clinic_id", clinic.id);
    if (error) { toast({ title: "ط®ط·ط£", description: "ظپط´ظ„ طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ط¯ظپط¹", variant: "destructive" }); setProcessingPayment(false); return; }
    toast({ title: "âœ… طھظ… طھط³ط¬ظٹظ„ ط§ظ„ط¯ظپط¹ ط¨ظ†ط¬ط§ط­", description: "طھظ… طھط­ط¯ظٹط« ط§ظ„ط®ط²ظٹظ†ط© ظˆط¥طµط¯ط§ط± ط³ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ…" });
    setSelectedAppointment({ ...selectedAppointment, payment_status: "paid", paid_amount: paidVal, discount_amount: discountVal, extracted_patient_name: editPatientName.trim() || selectedAppointment.extracted_patient_name, extracted_patient_phone: editPatientPhone.trim() || selectedAppointment.extracted_patient_phone, patients: { id: patientId || "", name: editPatientName.trim() || selectedAppointment.patients?.name || "", phone: editPatientPhone.trim() || selectedAppointment.patients?.phone || "" } });
    setShowReceipt(true); setProcessingPayment(false); fetchAppointments();
  };

  const addWalkIn = async () => {
    if (!clinic || !patientNameInput.trim()) return;
    const { data: patient, error: patientError } = await supabase.from("patients").insert({ clinic_id: clinic.id, name: patientNameInput.trim(), phone: patientPhoneInput.trim() || "ط¨ط¯ظˆظ† ظ‡ط§طھظپ" }).select("id").single();
    if (patientError || !patient) { toast({ title: "ط®ط·ط£", description: "ظپط´ظ„ ط¥ط¶ط§ظپط© ط§ظ„ظ…ط±ظٹط¶", variant: "destructive" }); return; }
    const code = `WI-${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await supabase.from("appointments").insert({
      clinic_id: clinic.id, patient_id: patient.id, date: today, time: format(new Date(), "HH:mm"), status: "confirmed",
      reservation_code: code, arrived_at: new Date().toISOString(), payment_status: "paid", is_walk_in: true, department: "طµظ†ط¯ظˆظ‚",
    });
    if (error) toast({ title: "ط®ط·ط£", description: "ظپط´ظ„ ط¥ط¶ط§ظپط© ظ…ط±ظٹط¶ ظ…ط¨ط§ط´ط±", variant: "destructive" });
    else { toast({ title: "طھظ…طھ ط§ظ„ط¥ط¶ط§ظپط©", description: `طھظ… طھط³ط¬ظٹظ„ ط§ظ„ظ…ط±ظٹط¶ ط§ظ„ظ…ط¨ط§ط´ط± ${code}` }); setWalkInOpen(false); setPatientNameInput(""); setPatientPhoneInput(""); fetchAppointments(); }
  };

  const handleAddExpense = () => {
    if (!expenseTitle.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) { toast({ title: "ط¨ظٹط§ظ†ط§طھ ط؛ظٹط± ظ…ظƒطھظ…ظ„ط©", description: "ظٹط±ط¬ظ‰ ط¥ط¯ط®ط§ظ„ ط§ط³ظ… ط§ظ„ظ…طµط±ظˆظپ ظˆط§ظ„ظ…ط¨ظ„ط؛ ط¨ط´ظƒظ„ طµط­ظٹط­", variant: "destructive" }); return; }
    const newExpense: Expense = { id: `exp-${Date.now()}`, title: expenseTitle.trim(), amount: parseFloat(expenseAmount), category: expenseCategory, time: format(new Date(), "HH:mm") };
    setExpenses(prev => [newExpense, ...prev]);
    toast({ title: "âœ… طھظ… طھط³ط¬ظٹظ„ ط§ظ„ظ…طµط±ظˆظپ", description: `طھظ… ظ‚ظٹط¯ (${expenseTitle}) ط¨ظ…ط¨ظ„ط؛ ${expenseAmount} ط±.ظٹ` });
    setExpenseTitle(""); setExpenseAmount(""); setExpenseModalOpen(false);
  };

  const generateReceiptCanvas = async (): Promise<HTMLCanvasElement> => {
    const element = document.getElementById("receipt-card-container");
    if (!element) throw new Error("ط¹ظ†طµط± ط§ظ„ط³ظ†ط¯ ط؛ظٹط± ظ…طھظˆظپط±");
    return await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
  };

  const downloadReceipt = async () => {
    try { const canvas = await generateReceiptCanvas(); const imgData = canvas.toDataURL("image/png"); const link = document.createElement("a"); link.href = imgData; link.download = `ط³ظ†ط¯_ط¯ظپط¹_${selectedAppointment?.reservation_code || "receipt"}.png`; link.click(); } catch (_) { toast({ title: "ط®ط·ط£", description: "طھط¹ط°ط± طھظ†ط²ظٹظ„ ط§ظ„ط³ظ†ط¯", variant: "destructive" }); }
  };

  const printReceipt = async () => {
    try {
      const canvas = await generateReceiptCanvas(); const imgData = canvas.toDataURL("image/png"); const win = window.open("", "_blank");
      if (win) { win.document.write(`<html><head><title>ط·ط¨ط§ط¹ط© ط³ظ†ط¯ ط§ظ„ط¯ظپط¹</title></head><body style="margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f4f4f5;"><img src="${imgData}" style="max-width:100%; height:auto;" onload="window.print();window.close();" /></body></html>`); win.document.close(); }
    } catch (_) { toast({ title: "ط®ط·ط£", description: "طھط¹ط°ط± ط·ط¨ط§ط¹ط© ط§ظ„ط³ظ†ط¯", variant: "destructive" }); }
  };

  // FIXED WhatsApp: ensures real number and image download
  const sendViaWhatsApp = async () => {
    if (!selectedAppointment) return;
    const rawPhone = editPatientPhone || selectedAppointment.extracted_patient_phone || selectedAppointment.patients?.phone || "";
    let cleanRaw = rawPhone;
    if (cleanRaw.startsWith("tg:") || cleanRaw.startsWith("TG:") || cleanRaw === "." || cleanRaw === "ط¨ط¯ظˆظ† ظ‡ط§طھظپ" || cleanRaw.trim().length < 5) cleanRaw = "";
    const waPhone = cleanPhoneForWhatsApp(cleanRaw);
    if (!waPhone) { toast({ title: "â‌Œ ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظ‡ط§طھظپ طµط­ظٹط­", description: "ظٹط±ط¬ظ‰ ظƒطھط§ط¨ط© ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ ط§ظ„ظ…ط¨ط§ط´ط± ظ„ظ„ظ…ط±ظٹط¶ ظپظٹ ط§ظ„ط®ط§ظ†ط© ط£ظˆظ„ط§ظ‹ ط«ظ… ط§ظ„ظ†ظ‚ط± ط¹ظ„ظ‰ ط²ط± ط§ظ„ظˆط§طھط³ط§ط¨.", variant: "destructive", duration: 5000 }); return; }
    setSendingReceipt(true);
    try {
      const canvas = await generateReceiptCanvas(); const imgData = canvas.toDataURL("image/png");
      const link = document.createElement("a"); link.href = imgData; link.download = `ط³ظ†ط¯_${selectedAppointment.reservation_code}.png`; link.click();
      const patientName = editPatientName || selectedAppointment.extracted_patient_name || selectedAppointment.patients?.name || "ط§ظ„ظ…ط±ظٹط¶";
      const finalAmt = (selectedAppointment.paid_amount || selectedAppointment.services?.price || 0) - (selectedAppointment.discount_amount || 0);
      const msg = encodeURIComponent(`ًں§¾ ط³ظ†ط¯ ط¯ظپط¹ ط±ط³ظ…ظٹ - ${clinic?.name || "ط§ظ„ط¹ظٹط§ط¯ط© ط§ظ„ط·ط¨ظٹط©"}\nâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پ\nًں‘¤ ط§ظ„ظ…ط±ظٹط¶: ${patientName}\nًں”– ظƒظˆط¯ ط§ظ„ط­ط¬ط²: ${selectedAppointment.reservation_code}\nًں’ٹ ط§ظ„ط®ط¯ظ…ط©: ${selectedAppointment.services?.name || "ظپط­طµ ط·ط¨ظٹ"}\nًں’° ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„طµط§ظپظٹ: ${finalAmt} ط±.ظٹ\nًں“… ط§ظ„طھط§ط±ظٹط®: ${format(new Date(), "yyyy/MM/dd - hh:mm a")}\nâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پâ”پ\nâœ… طھظ… طھظ†ط²ظٹظ„ طµظˆط±ط© ط§ظ„ط³ظ†ط¯ ط§ظ„ظ…ط§ظ„ظٹ ط§ظ„ط±ط³ظ…ظٹط© ط¨ط¬ظ‡ط§ط²ظƒطŒ ظ‚ظ… ط¨ط¥ط±ظپط§ظ‚ظ‡ط§ ط¨ط§ظ„ط¯ط±ط¯ط´ط©.`);
      setTimeout(() => { window.open(`https://wa.me/${waPhone}?text=${msg}`, "_blank"); }, 800);
      toast({ title: "âœ… طھظ… ط­ظپط¸ طµظˆط±ط© ط§ظ„ط³ظ†ط¯ ظˆظپطھط­ ظ…ط­ط§ط¯ط«ط© ط§ظ„ظˆط§طھط³ط§ط¨", description: `ط§ظ„ط±ظ‚ظ…: ${waPhone}` });
    } catch { toast({ title: "ط®ط·ط£ ظپظٹ ظ…ط¹ط§ظ„ط¬ط© طµظˆط±ط© ط§ظ„ط³ظ†ط¯ ظ„ظ„ظˆط§طھط³ط§ط¨", variant: "destructive" }); } finally { setSendingReceipt(false); }
  };

  // FIXED Telegram send: uses clinic bot_token properly
  const sendViaTelegram = async () => {
    if (!selectedAppointment) return;
    const tgUserId = selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id;
    if (!tgUserId) { toast({ title: "â‌Œ ط§ظ„ظ…ط±ظٹط¶ ط؛ظٹط± ظ…ط³ط¬ظ„ ط¹ط¨ط± طھظ„ظٹط¬ط±ط§ظ…", description: "طھظ… طھط³ط¬ظٹظ„ ظ‡ط°ط§ ط§ظ„ط­ط¬ط² ظٹط¯ظˆظٹط§ظ‹ ظˆظ„ظٹط³ ط¹ط¨ط± ط¨ظˆطھ طھظ„ظٹط¬ط±ط§ظ….", variant: "destructive" }); return; }
    setSendingTelegram(true);
    try {
      const canvas = await generateReceiptCanvas(); const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error("ظپط´ظ„ طھط­ظˆظٹظ„ ط§ظ„ط³ظ†ط¯ ظ„طµظˆط±ط©");
      const botToken = clinic?.bot_token || "";
      if (!botToken || botToken.trim().length < 10) { toast({ title: "âڑ ï¸ڈ ظ„ظ… ظٹطھظ… ط¶ط¨ط· ط¨ظˆطھ طھظ„ظٹط¬ط±ط§ظ… ظ„ظ„ط¹ظٹط§ط¯ط© â€” ظٹط±ط¬ظ‰ ظ…ط±ط§ط¬ط¹ط© ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¹ظٹط§ط¯ط© ظ…ظ† ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ… ظˆط¥ط¶ط§ظپط© ظ…ظپطھط§ط­ ط§ظ„ط¨ظˆطھ.", variant: "destructive" }); return; }
      const patientName = editPatientName || selectedAppointment.extracted_patient_name || selectedAppointment.patients?.name || "ط§ظ„ظ…ط±ظٹط¶";
      const finalAmt = (selectedAppointment.paid_amount || selectedAppointment.services?.price || 0) - (selectedAppointment.discount_amount || 0);
      const caption = `ًں§¾ <b>ط³ظ†ط¯ ط¯ظپط¹ ط±ط³ظ…ظٹ ظ…ط¤ظƒط¯ â€” ${clinic?.name || "ط§ظ„ط¹ظٹط§ط¯ط© ط§ظ„ط·ط¨ظٹط©"}</b>\n\nًں‘¤ ط§ظ„ظ…ط±ظٹط¶: <b>${patientName}</b>\nًں”– ظƒظˆط¯ ط§ظ„ط­ط¬ط²: <code>${selectedAppointment.reservation_code}</code>\nًں’ٹ ط§ظ„ط®ط¯ظ…ط©: <b>${selectedAppointment.services?.name || "ظپط­طµ ط·ط¨ظٹ"}</b>\nًں’° ط§ظ„طµط§ظپظٹ ط§ظ„ظ…ط¯ظپظˆط¹: <b>${finalAmt} ط±.ظٹ</b>\nًں“… ط§ظ„طھط§ط±ظٹط®: <b>${format(new Date(), "yyyy/MM/dd - hh:mm a")}</b>\n\nط´ظƒط±ط§ظ‹ ظ„طھط³ط¯ظٹط¯ظƒظ…طŒ ظ†طھظ…ظ†ظ‰ ظ„ظƒظ… ط¯ظˆط§ظ… ط§ظ„طµط­ط© ظˆط§ظ„ط¹ط§ظپظٹط© ًںŒ·`;
      const fd = new FormData(); fd.append("chat_id", tgUserId); fd.append("photo", blob, `receipt_${selectedAppointment.reservation_code}.png`); fd.append("caption", caption); fd.append("parse_mode", "HTML");
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: "POST", body: fd }); const resData = await res.json();
      if (resData.ok) { toast({ title: "âœˆï¸ڈ طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط³ظ†ط¯ ظ„ظ„ظ…ط±ظٹط¶ ط¹ط¨ط± طھظ„ط¬ط±ط§ظ… ط¨ظ†ط¬ط§ط­!" }); } else { toast({ title: "â‌Œ ظپط´ظ„ ط¥ط±ط³ط§ظ„ طھظ„ط¬ط±ط§ظ…", description: resData.description, variant: "destructive" }); }
    } catch { toast({ title: "ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ط±ط³ط§ظ„ طµظˆط±ط© ط§ظ„ط³ظ†ط¯ ظ„طھظ„ط¬ط±ط§ظ…", variant: "destructive" }); } finally { setSendingTelegram(false); }
  };

  const getUniquePaymentToken = (appointment: Appointment) => {
    const baseCode = appointment.reservation_code || "PAY";
    const netPaid = (appointment.paid_amount || 0) - (appointment.discount_amount || 0);
    return `PAY-VERIFIED|${baseCode}|${netPaid}YR|${appointment.id.slice(0, 6).toUpperCase()}`;
  };

  const filtered = useMemo(() => appointments.filter((a) => {
    const patientName = getCleanName(a.patients?.name, a.extracted_patient_name || "");
    const patientPhone = getCleanPhone(a.patients?.phone, a.extracted_patient_phone || "");
    const matchesSearch = a.reservation_code.toLowerCase().includes(search.toLowerCase()) || patientName.toLowerCase().includes(search.toLowerCase()) || patientPhone.includes(search);
    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return !["cancelled"].includes(a.status);
    if (statusFilter === "paid") return a.payment_status === "paid";
    if (statusFilter === "unpaid") return a.payment_status !== "paid" && a.status !== "cancelled";
    if (statusFilter === "arrived") return !!a.arrived_at;
    if (statusFilter === "waiting") return !a.arrived_at && a.status !== "cancelled";
    return true;
  }), [appointments, search, statusFilter]);

  if (authLoading || clinicLoading) return <div className="min-h-screen bg-mesh flex items-center justify-center text-muted-foreground">ط¬ط§ط±ظٹ ط§ظ„طھط­ظ…ظٹظ„...</div>;
  if (clinicError) return <div className="min-h-screen bg-mesh flex items-center justify-center text-destructive font-bold">{clinicError}</div>;
  if (isTrialExpired && role !== "owner") {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
        <div className="card-modern p-8 max-w-md text-center space-y-4">
          <div className="text-3xl">â›”</div>
          <h1 className="text-xl font-black">ظ„ط§ ظٹظ…ظƒظ† ط§ظ„ط¯ط®ظˆظ„</h1>
          <p className="text-sm text-muted-foreground">ط§ظ„ط¹ظٹط§ط¯ط© ظ…ظ†طھظ‡ظٹط© ط§ظ„ط§ط´طھط±ط§ظƒ. ظٹط±ط¬ظ‰ ظ…ط±ط§ط¬ط¹ط© ط¥ط¯ط§ط±ط© ط§ظ„ط¹ظٹط§ط¯ط©.</p>
          <Button onClick={signOut} className="w-full">طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col" dir="rtl">
      <div id={QR_FILE_ELEMENT_ID} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden border border-border">
            <div className="flex justify-between items-center px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold text-foreground">ظ…ط³ط­ QR ظ„ظ„طµظ†ط¯ظˆظ‚</h3>
              <button onClick={stopScanner} className="p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="relative mx-5 mb-4 rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "1/1" }}>
              <div id={QR_CAMERA_ELEMENT_ID} className="w-full h-full" />
              {(scannerStatus === "loading" || uploadingImage) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                  <p className="text-white text-sm font-medium">{uploadingImage ? "ط¬ط§ط±ظٹ ظ‚ط±ط§ط،ط© ط§ظ„طµظˆط±ط©..." : "ط¬ط§ط±ظٹ طھط´ط؛ظٹظ„ ط§ظ„ظƒط§ظ…ظٹط±ط§..."}</p>
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
                  <Button onClick={startScanner} className="bg-primary text-white text-xs" size="sm"><RefreshCw className="w-3.5 h-3.5 ml-1" /> ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط©</Button>
                </div>
              )}
            </div>
            <div className="px-5 pb-3">
              <Button variant="outline" className="w-full gap-2 border-dashed border-primary/50 text-primary text-xs h-10" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                <ImageIcon className="w-4 h-4" /> ط§ط®طھظٹط§ط± طµظˆط±ط© ظ…ظ† ط§ظ„ظ…ط¹ط±ط¶ (ظ„ظ‚ط·ط© ط´ط§ط´ط©)
              </Button>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <Button variant="ghost" className="w-full text-xs" onClick={stopScanner}>ط¥ط؛ظ„ط§ظ‚</Button>
            </div>
          </div>
        </div>
      )}

      {!unlocked && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="card-modern p-8 w-full max-w-sm text-center space-y-5">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-black text-foreground">ط¨ظˆط§ط¨ط© ط§ظ„طµظ†ط¯ظˆظ‚</h1>
            <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} placeholder="ط±ظ…ط² PIN" className="text-center text-xl tracking-widest" />
            <Button onClick={unlock} className="w-full">ط¯ط®ظˆظ„</Button>
          </div>
        </div>
      )}

      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4 h-18 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow"><Stethoscope className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-xl font-bold text-foreground">ط§ظ„طµظ†ط¯ظˆظ‚ ط§ظ„ط®ط²ظٹظ†ط©</h1><p className="text-xs text-muted-foreground">طھط­طµظٹظ„ ظˆظ…طµط±ظˆظپط§طھ ط§ظ„ظٹظˆظ…</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={startScanner} title="ظ…ط³ط­ QR"><Camera className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title="ط±ظپط¹ طµظˆط±ط©"><Upload className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/reception")} title="ط§ظ„ط§ط³طھظ‚ط¨ط§ظ„"><Users className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <CashierStats appointments={appointments} expenses={expenses} />
        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ط¨ط­ط« ط¨ط§ط³ظ… ط§ظ„ظ…ط±ظٹط¶طŒ ظƒظˆط¯ ط§ظ„ط­ط¬ط² ط£ظˆ ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ" className="pr-10" /></div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-40">
            <option value="active">ط§ظ„ظ†ط´ط·ط©</option><option value="all">ط§ظ„ظƒظ„</option><option value="paid">ظ…ط¯ظپظˆط¹</option><option value="unpaid">ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط¯ظپط¹</option><option value="arrived">ط­ط§ط¶ط±</option><option value="waiting">ظ„ظ… ظٹطµظ„</option>
          </select>
          <div className="flex gap-2">
            <Button onClick={() => setWalkInOpen(true)} className="bg-primary"><Plus className="w-4 h-4 ml-1" />ظ…ط±ظٹط¶ ظ…ط¨ط§ط´ط±</Button>
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setExpenseModalOpen(true)}><MinusCircle className="w-4 h-4 ml-1" />طھط³ط¬ظٹظ„ ظ…طµط±ظˆظپ</Button>
            <Button variant="outline" onClick={fetchAppointments}><RefreshCw className="w-4 h-4 ml-1" />طھط­ط¯ظٹط«</Button>
          </div>
        </div>

        {expenses.length > 0 && (
          <div className="card-modern p-4 space-y-2 bg-red-50/30 dark:bg-red-950/10 border-red-200/50">
            <div className="flex items-center justify-between"><h3 className="text-xs font-bold text-red-600 flex items-center gap-1"><MinusCircle className="w-4 h-4" /> ط§ظ„ظ…طµط±ظˆظپط§طھ ط§ظ„ظ…ط³ط¬ظ„ط© ط§ظ„ظٹظˆظ… ({expenses.length})</h3><span className="text-xs font-black text-red-600">ط¥ط¬ظ…ط§ظ„ظٹ: {expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()} ط±.ظٹ</span></div>
            <div className="flex gap-2 overflow-x-auto pb-1">{expenses.map((exp) => (<div key={exp.id} className="bg-background border border-border px-3 py-1.5 rounded-xl text-xs shrink-0 flex items-center gap-2"><span className="font-bold text-foreground">{exp.title}</span><span className="text-muted-foreground">({exp.category})</span><span className="font-black text-red-500">{exp.amount} ط±.ظٹ</span></div>))}</div>
          </div>
        )}

        <div className="grid gap-3">
          {filtered.map((a) => {
            const isPaid = a.payment_status === "paid"; const isArrived = !!a.arrived_at;
            const patientNameClean = getCleanName(a.patients?.name, a.extracted_patient_name || "");
            const patientPhoneClean = getCleanPhone(a.patients?.phone, a.extracted_patient_phone || "");
            return (
              <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                    {a.is_walk_in && <span className="bg-emerald-500/15 text-emerald-600 px-2 py-0.5 rounded-lg text-xs font-bold">ظ…ط¨ط§ط´ط±</span>}
                    <span className="text-sm text-muted-foreground"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                    {isArrived ? <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">ظˆطµظ„ ط§ظ„ط¹ظٹط§ط¯ط©</span> : <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظˆطµظˆظ„</span>}
                    {isPaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">ظ…ط¯ظپظˆط¹</span>}
                  </div>
                  <h2 className="font-bold text-foreground">{patientNameClean}</h2>
                  <p className="text-sm text-muted-foreground">{patientPhoneClean} â€” ط§ظ„ط®ط¯ظ…ط©: <b>{a.services?.name || "ط¨ط¯ظˆظ† ط®ط¯ظ…ط©"}</b></p>
                </div>
                <div className="flex gap-2 items-center justify-end">
                  {isPaid ? (
                    <Button variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-50/50" onClick={() => openPaymentModal(a)}><CheckCircle className="w-4 h-4 ml-1" />ط¹ط±ط¶ ط§ظ„ط³ظ†ط¯ ط§ظ„ظپط§ط®ط±</Button>
                  ) : (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openPaymentModal(a)}><Banknote className="w-4 h-4 ml-1" />طھط³ط¬ظٹظ„ ط§ظ„ط¯ظپط¹ ({a.services?.price || 0} ط±.ظٹ)</Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="card-modern p-12 text-center text-muted-foreground">ظ„ط§ طھظˆط¬ط¯ ط­ط§ظ„ط§طھ ظ…ط³ط¬ظ„ط© ط§ظ„ظٹظˆظ…</div>}
        </div>
      </main>

      {selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-3xl max-w-md w-full shadow-2xl p-6 relative border border-border my-8">
            <button onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted hover:bg-muted/80 text-foreground transition"><X className="w-5 h-5" /></button>
            {!showReceipt ? (
              <div className="space-y-5 pt-2">
                <div className="text-center"><div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-2"><Banknote className="w-6 h-6" /></div><h2 className="text-xl font-bold text-foreground">طھط£ظƒظٹط¯ طھط­طµظٹظ„ ط§ظ„ظ…ط¨ظ„ط؛</h2><p className="text-xs text-muted-foreground mt-1">طھط£ظƒط¯ ظ…ظ† ط§ط³ظ… ظˆط±ظ‚ظ… ظ‡ط§طھظپ ط§ظ„ظ…ط±ظٹط¶ ظ‚ط¨ظ„ ط§ظ„ط³ط¯ط§ط¯</p></div>
                <div className="card-modern p-4 bg-muted/40 space-y-3 text-sm">
                  <div><label className="text-xs font-semibold text-muted-foreground block mb-1">ط§ط³ظ… ط§ظ„ظ…ط±ظٹط¶ ط§ظ„طµط±ظٹط­</label><Input value={editPatientName} onChange={(e) => setEditPatientName(e.target.value)} placeholder="ط£ط¯ط®ظ„ ط§ط³ظ… ط§ظ„ظ…ط±ظٹط¶ ط§ظ„ط±ط¨ط§ط¹ظٹ" className="font-bold text-sm bg-background" /></div>
                  <div><label className="text-xs font-semibold text-muted-foreground block mb-1">ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ (ط§ظ„ظˆط§طھط³ط§ط¨)</label><div className="space-y-1"><Input value={editPatientPhone} onChange={(e) => setEditPatientPhone(e.target.value)} placeholder="ظ…ط«ط§ظ„: 967715365516" className="font-bold text-sm bg-background dir-ltr text-right" />{(editPatientPhone.startsWith("tg:") || !editPatientPhone || editPatientPhone === "ط­ط¬ط² ط¹ط¨ط± طھظ„ط¬ط±ط§ظ… (ط¨ط¯ظˆظ† ط±ظ‚ظ…)") && <p className="text-[11px] text-amber-600 font-medium">âڑ ï¸ڈ ظٹط±ط¬ظ‰ ط¥ط¯ط®ط§ظ„ ط±ظ‚ظ… ظ‡ط§طھظپ ط§ظ„ظ…ط±ظٹط¶ ط§ظ„ط­ظ‚ظٹظ‚ظٹ ظ‡ظ†ط§ ظ„ظ„طھظˆط§طµظ„ ط¹ط¨ط± ط§ظ„ظˆط§طھط³ط§ط¨.</p>}</div></div>
                  <div className="flex justify-between border-b border-border/60 pb-2 pt-1"><span className="text-muted-foreground">ظƒظˆط¯ ط§ظ„ط­ط¬ط²</span><span className="font-mono font-bold text-primary">{selectedAppointment.reservation_code}</span></div>
                  <div className="flex justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">ط§ظ„ط®ط¯ظ…ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©</span><span className="font-medium text-foreground">{selectedAppointment.services?.name || "ظپط­طµ ط·ط¨ظٹ"}</span></div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div><label className="text-xs font-semibold text-muted-foreground block mb-1">ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ظ…ط³طھظ„ظ… (ط±.ظٹ)</label><Input type="number" value={paidAmountInput} onChange={(e) => setPaidAmountInput(e.target.value)} className="font-bold text-lg" /></div>
                    <div><label className="text-xs font-semibold text-muted-foreground block mb-1">ط§ظ„ط®طµظ… (ط±.ظٹ)</label><Input type="number" value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} className="font-bold text-lg text-red-500" /></div>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border/80 text-base"><span className="font-bold text-foreground">ط§ظ„طµط§ظپظٹ ط§ظ„ظ…ط·ظ„ظˆط¨</span><span className="font-black text-emerald-600 text-xl">{Math.max(0, (parseFloat(paidAmountInput) || 0) - (parseFloat(discountInput) || 0))} ط±ظٹط§ظ„</span></div>
                </div>
                <div className="flex gap-2"><Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11 text-base font-bold" onClick={handlePayNow} disabled={processingPayment}>{processingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5 ml-1" />}طھط£ظƒظٹط¯ ط§ظ„ط¯ظپط¹ ظˆط¥طµط¯ط§ط± ط§ظ„ط³ظ†ط¯</Button></div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="text-center mb-1"><span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-200"><CheckCircle className="w-3.5 h-3.5" /> طھظ… ط§ظ„ط¯ظپط¹ ظˆط§ظ„ط³ط¯ط§ط¯ ط¨ظ†ط¬ط§ط­</span></div>
                <div id="receipt-card-container" className="bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-xl relative overflow-hidden" style={{ direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  <div style={{ background: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%)", padding: "20px 24px 18px", color: "white", display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "48px", height: "48px", background: "rgba(255,255,255,0.2)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1.5px solid rgba(255,255,255,0.3)" }}>
                      {clinic?.logo_url ? <img src={clinic.logo_url} alt="logo" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }} /> : <span style={{ fontSize: "22px" }}>ًںڈ¥</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "9px", opacity: 0.8, marginBottom: "3px", letterSpacing: "1.5px" }}>OFFICIAL PAYMENT RECEIPT</p>
                      <h2 style={{ fontSize: "17px", fontWeight: 900, margin: 0, lineHeight: 1.2 }}>{clinic?.name || "ط§ظ„ط¹ظٹط§ط¯ط© ط§ظ„ط·ط¨ظٹط© Smart Clinic"}</h2>
                      <p style={{ fontSize: "10px", opacity: 0.85, marginTop: "3px" }}>ط³ظ†ط¯ ط§ط³طھظ„ط§ظ… ظ…ط¨ظ„ط؛ ط±ط³ظ…ظ€ظٹ</p>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "10px", padding: "6px 10px", textAlign: "center", border: "1px solid rgba(255,255,255,0.25)" }}>
                      <p style={{ fontSize: "8px", opacity: 0.9, margin: 0 }}>ط§ظ„ط­ط§ظ„ط©</p>
                      <p style={{ fontSize: "10px", fontWeight: 800, margin: "2px 0 0" }}>ظ…ط¯ظپظˆط¹ âœ“</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-gray-600"><span>ط±ظ‚ظ… ط§ظ„ط³ظ†ط¯ / ط§ظ„ط­ط¬ط²:</span><span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{selectedAppointment.reservation_code}</span></div>
                    <div className="flex justify-between items-center text-gray-600"><span>طھط§ط±ظٹط® ظˆظˆظ‚طھ ط§ظ„ط³ط¯ط§ط¯:</span><span className="font-medium text-gray-800">{format(new Date(), "yyyy/MM/dd - hh:mm a")}</span></div>
                    <div className="flex justify-between items-center text-gray-600"><span>ط§ط³ظ… ط§ظ„ظ…ط±ظٹط¶ ط§ظ„طµط±ظٹط­:</span><span className="font-bold text-gray-900 text-sm">{editPatientName || getCleanName(selectedAppointment.patients?.name, selectedAppointment.extracted_patient_name || "")}</span></div>
                    <div className="flex justify-between items-center text-gray-600"><span>ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ:</span><span className="font-medium text-gray-800">{editPatientPhone || getCleanPhone(selectedAppointment.patients?.phone, selectedAppointment.extracted_patient_phone || "")}</span></div>
                    <div className="flex justify-between items-center text-gray-600"><span>ط§ظ„ط®ط¯ظ…ط© ط§ظ„ظ…ظ‚ط¯ظ…ط©:</span><span className="font-medium text-gray-800">{selectedAppointment.services?.name || "ظپط­طµ ط·ط¨ظٹ"}</span></div>
                    {(selectedAppointment.discount_amount || 0) > 0 && <div className="flex justify-between items-center text-red-600"><span>ط§ظ„ط®طµظ… ط§ظ„ظ…ظ…ظ†ظˆط­:</span><span className="font-bold">-{selectedAppointment.discount_amount} ط±.ظٹ</span></div>}
                    <div className="my-3 border-t border-dashed border-gray-200" />
                    <div className="flex justify-between items-center bg-emerald-50/80 p-3 rounded-xl border border-emerald-100"><span className="font-bold text-emerald-900 text-sm">ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„طµط§ظپظٹ ط§ظ„ظ…ط³طھظ„ظ…:</span><span className="font-black text-emerald-700 text-xl">{(selectedAppointment.paid_amount || 0) - (selectedAppointment.discount_amount || 0)} <span className="text-xs font-normal">ط±.ظٹ</span></span></div>
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div><p className="text-[10px] font-bold text-gray-700">ط±ظ…ط² ط¥ط«ط¨ط§طھ طµط­ط© ط§ظ„ط³ظ†ط¯ ط§ظ„ظ…ط§ظ„ظٹ:</p><p className="text-[9px] font-mono text-gray-400 mt-0.5">{getUniquePaymentToken(selectedAppointment)}</p></div>
                      <div className="bg-white p-1 rounded-lg border border-gray-200 shrink-0"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x100&data=${encodeURIComponent(getUniquePaymentToken(selectedAppointment))}`} alt="Payment Verification QR" className="w-12 h-12" crossOrigin="anonymous" /></div>
                    </div>
                    <div className="mt-3 text-center text-[9px] text-gray-400 border-t border-gray-100 pt-2">ظ…ط¹طھظ…ط¯ ط¥ظ„ظƒطھط±ظˆظ†ظٹط§ظ‹ ط¹ط¨ط± طµظ†ط¯ظˆظ‚ ط§ظ„ط®ط²ظٹظ†ط© â€” ط¬ظ…ظٹط¹ ط§ظ„ط­ظ‚ظˆظ‚ ظ…ط­ظپظˆط¸ط©</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={downloadReceipt}><Download className="w-3.5 h-3.5" />طھظ†ط²ظٹظ„</Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={printReceipt}><Printer className="w-3.5 h-3.5" />ط·ط¨ط§ط¹ط©</Button>
                  <Button size="sm" className="text-xs gap-1 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold" onClick={sendViaWhatsApp} disabled={sendingReceipt}>{sendingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}ط¥ط±ط³ط§ظ„ ظ„ظ„ظˆط§طھط³ط§ط¨</Button>
                  {(selectedAppointment.customer_telegram_id || selectedAppointment.patients?.telegram_user_id) && (
                    <Button size="sm" className="text-xs gap-1 bg-[#0088cc] hover:bg-[#0077b5] text-white font-bold" onClick={sendViaTelegram} disabled={sendingTelegram}>{sendingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}ط¥ط±ط³ط§ظ„ ظ„طھظ„ط¬ط±ط§ظ… âœˆï¸ڈ</Button>
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
                    <div className="text-[9px] font-bold text-slate-400 text-left">ظ†ط¸ط§ظ… ط¥ط¯ط§ط±ط© ط§ظ„ط¹ظٹط§ط¯ط§طھ ط§ظ„ط°ظƒظٹ</div>
                  </div>
                </div>
                <Button variant="ghost" className="w-full text-xs mt-1" onClick={() => { setSelectedAppointment(null); setShowReceipt(false); }}>ط¥ط؛ظ„ط§ظ‚ ط§ظ„ظ†ط§ظپط°ط©</Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>ط¥ط¶ط§ظپط© ظ…ط±ظٹط¶ ظ…ط¨ط§ط´ط± (Walk-In)</DialogTitle></DialogHeader><div className="space-y-3 pt-2"><Input value={patientNameInput} onChange={(e) => setPatientNameInput(e.target.value)} placeholder="ط§ط³ظ… ط§ظ„ظ…ط±ظٹط¶ ط¨ط§ظ„ظƒط§ظ…ظ„" /><Input value={patientPhoneInput} onChange={(e) => setPatientPhoneInput(e.target.value)} placeholder="ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ (ظ…ط«ط§ظ„: 967715365516)" /><Button onClick={addWalkIn} className="w-full bg-primary"><UserPlus className="w-4 h-4 ml-1" />ط¥ط¶ط§ظپط© ظˆطھط³ط¬ظٹظ„ ط§ظ„ط­ط¬ط²</Button></div></DialogContent></Dialog>
      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle className="text-red-600 flex items-center gap-1"><MinusCircle className="w-5 h-5" /> طھط³ط¬ظ€ظٹظ„ ظ…طµط±ظˆظپ ط¬ط¯ظٹط¯</DialogTitle></DialogHeader><div className="space-y-3 pt-2"><div><label className="text-xs font-semibold text-muted-foreground block mb-1">ط§ظ„ط¨ظٹط§ظ† / ط³ط¨ط¨ ط§ظ„ظ…طµط±ظˆظپ</label><Input value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} placeholder="ظ…ط«ظ„ط§ظ‹: ط´ط±ط§ط، ط£ط¯ظˆط§طھ ط·ط¨ظٹط© / ط¥ظٹط¬ط§ط± / ظƒظ‡ط±ط¨ط§ط،" /></div><div className="grid grid-cols-2 gap-2"><div><label className="text-xs font-semibold text-muted-foreground block mb-1">ط§ظ„ظ…ط¨ظ„ط؛ (ط±.ظٹ)</label><Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0.00" /></div><div><label className="text-xs font-semibold text-muted-foreground block mb-1">ط§ظ„ظپط¦ط©</label><select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-xs w-full"><option value="ظ†ط«ط±ظٹط§طھ">ظ†ط«ط±ظٹط§طھ</option><option value="ط£ط¯ظˆط§طھ ط·ط¨ظٹط©">ط£ط¯ظˆط§طھ ط·ط¨ظٹط©</option><option value="طµظٹط§ظ†ط©">طµظٹط§ظ†ط©</option><option value="ظƒظ‡ط±ط¨ط§ط،/ظ…ط§ط،">ظƒظ‡ط±ط¨ط§ط،/ظ…ط§ط،</option><option value="ط£ط®ط±ظ‰">ط£ط®ط±ظ‰</option></select></div></div><Button onClick={handleAddExpense} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"><MinusCircle className="w-4 h-4 ml-1" />ظ‚ظٹط¯ ط§ظ„ظ…طµط±ظˆظپ ظپظٹ ط§ظ„ط®ط²ظٹظ†ط©</Button></div></DialogContent></Dialog>
      <Footer />
    </div>
  );
}

function CashierStats({ appointments, expenses }: { appointments: Appointment[]; expenses: Expense[] }) {
  const paid = appointments.filter(a => a.payment_status === "paid");
  const amountFor = (a: Appointment) => typeof a.paid_amount === "number" ? a.paid_amount : (a.services?.price || 0);
  const totalRevenue = paid.reduce((s, a) => s + amountFor(a), 0);
  const totalDiscount = paid.reduce((s, a) => s + (a.discount_amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netRevenue = totalRevenue - totalDiscount;
  const netInDrawer = netRevenue - totalExpenses;
  const avgTicket = paid.length ? Math.round(netRevenue / paid.length) : 0;
  const financialFlow = useMemo(() => {
    const buckets: Record<number, { revenue: number; expense: number }> = {};
    for (let h = 8; h <= 20; h++) buckets[h] = { revenue: 0, expense: 0 };
    paid.forEach(a => { const h = parseInt(String(a.time).slice(0, 2), 10); if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h].revenue += (amountFor(a) - (a.discount_amount || 0)); });
    expenses.forEach(e => { const h = parseInt(String(e.time).slice(0, 2), 10); if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h].expense += e.amount; });
    return Object.entries(buckets).map(([h, data]) => ({ hour: `${h}:00`, ...data }));
  }, [paid, expenses]);
  const byService = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach(a => { const key = a.services?.name || "ط¨ط¯ظˆظ† ط®ط¯ظ…ط©"; map[key] = (map[key] || 0) + (amountFor(a) - (a.discount_amount || 0)); });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid]);
  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(152 69% 40%)", "hsl(38 92% 50%)"];
  const stats = [
    { label: "ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ظ‚ط¨ظˆط¶ط§طھ", value: `${totalRevenue.toLocaleString()} ط±.ظٹ`, icon: ArrowUpCircle, tint: "from-emerald-500/20 to-emerald-500/5", iconClass: "text-emerald-500" },
    { label: "ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط®طµظˆظ…ط§طھ", value: `${totalDiscount.toLocaleString()} ط±.ظٹ`, icon: Receipt, tint: "from-amber-500/20 to-amber-500/5", iconClass: "text-amber-500" },
    { label: "ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…طµط±ظˆظپط§طھ", value: `${totalExpenses.toLocaleString()} ط±.ظٹ`, icon: ArrowDownCircle, tint: "from-red-500/20 to-red-500/5", iconClass: "text-red-500" },
    { label: "طµط§ظپظٹ ط§ظ„طµظ†ط¯ظˆظ‚ (ط§ظ„ط®ط²ظٹظ†ط©)", value: `${netInDrawer.toLocaleString()} ط±.ظٹ`, icon: Wallet, tint: "from-primary/20 to-primary/5", iconClass: "text-primary" },
    { label: "ظ…طھظˆط³ط· ط§ظ„ظپط§طھظˆط±ط©", value: `${avgTicket.toLocaleString()} ط±.ظٹ`, icon: TrendingUp, tint: "from-violet-500/20 to-violet-500/5", iconClass: "text-violet-500" },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className={`card-modern p-4 bg-gradient-to-br ${s.tint} border border-border/60`}>
            <div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground font-medium">{s.label}</p><p className="text-2xl font-black text-foreground mt-1">{s.value}</p></div><div className="w-11 h-11 rounded-2xl bg-background/60 flex items-center justify-center backdrop-blur"><s.icon className={`w-5 h-5 ${s.iconClass}`} /></div></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><DollarSign className="w-4 h-4 text-emerald-500" /><h3 className="font-bold text-foreground">طھط¯ظپظ‚ ط§ظ„ط¥ظٹط±ط§ط¯ط§طھ ظˆط§ظ„ظ…طµط±ظˆظپط§طھ</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={financialFlow} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="revenue" name="ط¥ظٹط±ط§ط¯ط§طھ" fill="hsl(152 69% 40%)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="expense" name="ظ…طµط±ظˆظپط§طھ" fill="hsl(0 84% 60%)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4"><Receipt className="w-4 h-4 text-primary" /><h3 className="font-bold text-foreground">ط§ظ„ط¥ظٹط±ط§ط¯ط§طھ ط­ط³ط¨ ط§ظ„ط®ط¯ظ…ط§طھ</h3></div>
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

// End of CashierPage - corrected with real name/phone, receipt details, WhatsApp/Telegram fixes, charts with discounts/expenses

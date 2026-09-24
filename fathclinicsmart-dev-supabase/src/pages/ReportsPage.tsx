import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend, RadialBarChart, RadialBar,
  ComposedChart, Line, LabelList,
} from "recharts";
import {
  Users, Calendar, TrendingUp, DollarSign, Loader2, Download, FileText,
  Activity, Filter, Award, Printer, Building2, RefreshCw, Clock,
  ChevronLeft, CheckCircle2, TrendingDown, Receipt, Ticket, UserPlus,
  UserCheck, PieChart as PieIcon, Wallet, Percent, BarChart3, CreditCard,
  Banknote, X, Camera,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import html2canvas from "html2canvas";

// ========== الهوية البصرية الفاخرة (سماوي احترافي) ==========
const C = {
  // Sky Blue Palette
  sky1: "#e0f2fe",
  sky2: "#bae6fd",
  sky3: "#7dd3fc",
  sky4: "#38bdf8",
  sky5: "#0ea5e9",
  sky6: "#0284c7",
  sky7: "#0369a1",
  sky8: "#075985",
  sky9: "#0c4a6e",
  // Primary (deep navy for contrast)
  primary: "#0c4a6e",
  primaryLight: "#075985",
  // Gold accent (for special elements)
  gold: "#b45309",
  goldLight: "#f59e0b",
  goldGradient: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
  // Complementary
  blue: "#3b82f6",
  green: "#10b981",
  emerald: "#059669",
  purple: "#8b5cf6",
  rose: "#f43f5e",
  cyan: "#06b6d4",
  orange: "#f97316",
  teal: "#14b8a6",
  indigo: "#6366f1",
  slate: "#64748b",
  bg: "#f0f9ff",
  bgGradient: "linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 40%, #f8fafc 100%)",
  white: "#ffffff",
  border: "#bae6fd",
  text: "#0c4a6e",
  muted: "#64748b",
  red: "#dc2626",
};

const PIE_COLORS = [
  C.sky5, C.green, C.goldLight, C.purple, C.rose,
  C.cyan, C.orange, C.teal, C.indigo, "#ec4899"
];

// ========== الواجهات ==========
interface FinancialData {
  totalRevenue: number;
  totalInvoicesRevenue: number;
  totalAppointmentsRevenue: number;
  totalExpenses: number;
  totalDiscountCash: number;
  totalDiscountPercent: number;
  netProfit: number;
  promoUsageCount: number;
  promoDiscountTotal: number;
  invoicesCount: number;
  invoicesPendingCount: number;
  invoicesPaidCount: number;
  invoicesPendingAmount: number;
  expensesCount: number;
}

interface PatientData {
  totalPatients: number;
  newPatients: number;
  returningPatients: number;
  totalAppointments: number;
  attendanceRate: number;
  cancelledCount: number;
  completedCount: number;
  averagePerDay: number;
  noShowCount: number;
}

interface ChartData {
  dailyRevenue: { date: string; amount: number }[];
  dailyExpenses: { date: string; amount: number }[];
  dailyNet: { date: string; revenue: number; expenses: number; net: number }[];
  dailyAppointments: { date: string; count: number }[];
  expensesByCategory: { name: string; value: number }[];
  serviceDistribution: { name: string; value: number }[];
  topServices: { name: string; value: number }[];
  paymentMethods: { name: string; value: number }[];
  promoUsage: { name: string; code: string; count: number; totalDiscount: number }[];
  attendanceChart: { name: string; value: number; fill: string }[];
  monthlyTrend: { month: string; revenue: number; expenses: number; net: number }[];
}

// ========== دوال مساعدة ==========
function fmt(n: number): string {
  return Number(n || 0).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
}
function shortDate(d: string): string {
  return d ? d.slice(5) : "";
}
function monthLabel(m: string): string {
  const names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const idx = parseInt(m.slice(5, 7)) - 1;
  return names[idx] + " " + m.slice(0, 4);
}
function getMonthEnd(month: string): string {
  const y = parseInt(month.slice(0, 4));
  const m = parseInt(month.slice(5, 7));
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [financial, setFinancial] = useState<FinancialData | null>(null);
  const [patients, setPatients] = useState<PatientData | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [activeClinicId, setActiveClinicId] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<"month" | "year" | "range">("month");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const [capturing, setCapturing] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; type?: "ok" | "err" } | null>(null);

  const reportRef = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // ===== جلب بيانات العيادة =====
  useEffect(() => {
    if (!authLoading && !user) { navigate("/auth"); return; }
    const init = async () => {
      if (!user) return;
      const { data: clinic } = await supabase.from("clinics")
        .select("id, name, logo_url, bot_username")
        .eq("owner_id", user.id).maybeSingle();
      if (!clinic) { navigate("/dashboard"); return; }
      setActiveClinicId(clinic.id);
      setClinicName(clinic.name);
      setClinicLogo(clinic.logo_url || null);
      setBotUsername(clinic.bot_username || "SmartClinc_bot");
    };
    init();
  }, [user, authLoading, navigate]);

  // ===== حساب النطاق الزمني =====
  const dateRange = useMemo(() => {
    if (filterType === "month") {
      return { start: selectedMonth + "-01", end: getMonthEnd(selectedMonth) };
    } else if (filterType === "year") {
      return { start: selectedYear + "-01-01", end: selectedYear + "-12-31" };
    }
    return { start: startDate, end: endDate };
  }, [filterType, selectedMonth, selectedYear, startDate, endDate]);

  // ===== جلب البيانات الشاملة =====
  const fetchAllData = async (clinicId: string) => {
    setLoading(true);
    try {
      const { start, end } = dateRange;

      const { data: appointments } = await supabase
        .from("appointments")
        .select("id, date, time, status, payment_status, arrived_at, patient_id, service_id, paid_amount, discount_amount, discount_applied, discount_type, is_promo, promotion_id, promo_code, payment_method, customer_telegram_id, services(name), patients(id, name, phone)")
        .eq("clinic_id", clinicId)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });

      const appts = (appointments || []) as any[];

      const { data: expenses } = await supabase
        .from("expenses")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("expense_date", start)
        .lte("expense_date", end);

      const exps = (expenses || []) as any[];

      const { data: invoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("clinic_id", clinicId)
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59`);

      const invs = (invoices || []) as any[];

      const { data: promotions } = await supabase
        .from("promotions")
        .select("id, title, code, discount_type, discount_value")
        .eq("clinic_id", clinicId);

      const promos = (promotions || []) as any[];

      // ========== الحسابات المالية ==========
      const paidAppts = appts.filter((a) => a.payment_status === "paid");
      const appointmentsRevenue = paidAppts.reduce((s, a) => s + Number(a.paid_amount || 0), 0);
      const invoicesRevenue = invs.filter((i) => i.paid_status === "paid").reduce((s, i) => s + Number(i.total_amount || 0), 0);
      const totalRevenue = appointmentsRevenue + invoicesRevenue;

      const totalExpenses = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
      const totalDiscountCash = paidAppts.reduce((s, a) => s + Number(a.discount_applied || 0), 0)
        + invs.reduce((s, i) => s + Number(i.discount_amount || 0), 0);
      const totalDiscountPercent = paidAppts.filter((a) => a.discount_type === "percentage").length;

      const netProfit = totalRevenue - totalExpenses;

      const promoAppts = paidAppts.filter((a) => a.is_promo);
      const promoUsageCount = promoAppts.length;
      const promoDiscountTotal = promoAppts.reduce((s, a) => s + Number(a.discount_applied || 0), 0);

      const invoicesCount = invs.length + paidAppts.filter((a) => !a.is_walk_in).length;
      const invoicesPendingCount = invs.filter((i) => i.paid_status !== "paid").length;
      const invoicesPaidCount = invs.filter((i) => i.paid_status === "paid").length + paidAppts.length;
      const invoicesPendingAmount = invs.filter((i) => i.paid_status !== "paid").reduce((s, i) => s + Number(i.total_amount || 0), 0);

      setFinancial({
        totalRevenue,
        totalInvoicesRevenue: invoicesRevenue,
        totalAppointmentsRevenue: appointmentsRevenue,
        totalExpenses,
        totalDiscountCash,
        totalDiscountPercent,
        netProfit,
        promoUsageCount,
        promoDiscountTotal,
        invoicesCount,
        invoicesPendingCount,
        invoicesPaidCount,
        invoicesPendingAmount,
        expensesCount: exps.length,
      });

      // ========== حسابات المرضى ==========
      const uniquePatientIds = new Set(appts.map((a) => a.patient_id).filter(Boolean));
      const totalPatients = uniquePatientIds.size;

      let newPatients = 0;
      let returningPatients = 0;
      for (const pid of uniquePatientIds) {
        const { count } = await supabase.from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("patient_id", pid)
          .lt("date", start);
        if (!count || count === 0) newPatients++;
        else returningPatients++;
      }

      const attended = appts.filter((a) => a.arrived_at).length;
      const cancelledCount = appts.filter((a) => a.status === "cancelled").length;
      const completedCount = appts.filter((a) => a.payment_status === "paid").length;
      const noShowCount = appts.filter((a) => !a.arrived_at && a.status !== "cancelled" && a.date < new Date().toISOString().slice(0, 10)).length;
      const attendanceRate = appts.length > 0 ? Math.round((attended / appts.length) * 100) : 0;

      const daysDiff = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)));
      const averagePerDay = appts.length > 0 ? Math.round(appts.length / daysDiff) : 0;

      setPatients({
        totalPatients,
        newPatients,
        returningPatients,
        totalAppointments: appts.length,
        attendanceRate,
        cancelledCount,
        completedCount,
        averagePerDay,
        noShowCount,
      });

      // ========== الرسوم البيانية ==========
      const revenueMap: Record<string, number> = {};
      paidAppts.forEach((a) => {
        revenueMap[a.date] = (revenueMap[a.date] || 0) + Number(a.paid_amount || 0);
      });
      invs.filter((i) => i.paid_status === "paid").forEach((i) => {
        const d = i.created_at.slice(0, 10);
        revenueMap[d] = (revenueMap[d] || 0) + Number(i.total_amount || 0);
      });
      const dailyRevenue = Object.entries(revenueMap).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));

      const expenseMap: Record<string, number> = {};
      exps.forEach((e) => {
        expenseMap[e.expense_date] = (expenseMap[e.expense_date] || 0) + Number(e.amount || 0);
      });
      const dailyExpenses = Object.entries(expenseMap).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));

      const allDates = new Set([...dailyRevenue.map((d) => d.date), ...dailyExpenses.map((d) => d.date)]);
      const dailyNet = Array.from(allDates).sort().map((date) => {
        const rev = dailyRevenue.find((r) => r.date === date)?.amount || 0;
        const exp = dailyExpenses.find((e) => e.date === date)?.amount || 0;
        return { date, revenue: rev, expenses: exp, net: rev - exp };
      });

      const apptMap: Record<string, number> = {};
      appts.forEach((a) => { apptMap[a.date] = (apptMap[a.date] || 0) + 1; });
      const dailyAppointments = Object.entries(apptMap).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

      const expCatMap: Record<string, number> = {};
      exps.forEach((e) => { const k = e.category || "نثريات"; expCatMap[k] = (expCatMap[k] || 0) + Number(e.amount || 0); });
      const expensesByCategory = Object.entries(expCatMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

      const svcMap: Record<string, number> = {};
      appts.forEach((a) => {
        const k = a.services?.name || "غير محدد";
        svcMap[k] = (svcMap[k] || 0) + 1;
      });
      const serviceDistribution = Object.entries(svcMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      const topServices = serviceDistribution.slice(0, 6);

      const pmMap: Record<string, number> = {};
      paidAppts.forEach((a) => {
        const k = a.payment_method || "نقدي";
        pmMap[k] = (pmMap[k] || 0) + Number(a.paid_amount || 0);
      });
      invs.filter((i) => i.paid_status === "paid").forEach((i) => {
        const k = i.payment_method || "نقدي";
        pmMap[k] = (pmMap[k] || 0) + Number(i.total_amount || 0);
      });
      const paymentMethods = Object.entries(pmMap).map(([name, value]) => ({ name, value }));

      const promoMap: Record<string, { count: number; totalDiscount: number; code: string }> = {};
      promoAppts.forEach((a) => {
        const promo = promos.find((p) => p.id === a.promotion_id);
        const key = promo?.title || "عرض";
        if (!promoMap[key]) promoMap[key] = { count: 0, totalDiscount: 0, code: promo?.code || a.promo_code || "" };
        promoMap[key].count += 1;
        promoMap[key].totalDiscount += Number(a.discount_applied || 0);
      });
      const promoUsage = Object.entries(promoMap)
        .map(([name, v]) => ({ name, code: v.code, count: v.count, totalDiscount: v.totalDiscount }))
        .sort((a, b) => b.count - a.count);

      const attendanceChart = [
        { name: "حضر", value: attended, fill: C.green },
        { name: "لم يحضر", value: Math.max(0, appts.length - attended - cancelledCount), fill: C.orange },
        { name: "ملغي", value: cancelledCount, fill: C.red },
      ];

      const monthlyTrend: { month: string; revenue: number; expenses: number; net: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.toISOString().slice(0, 7);
        const mStart = m + "-01";
        const mEnd = getMonthEnd(m);

        const { data: mAppts } = await supabase.from("appointments")
          .select("paid_amount, payment_status")
          .eq("clinic_id", clinicId)
          .gte("date", mStart).lte("date", mEnd);

        const { data: mInvs } = await supabase.from("invoices")
          .select("total_amount, paid_status")
          .eq("clinic_id", clinicId)
          .gte("created_at", `${mStart}T00:00:00`).lte("created_at", `${mEnd}T23:59:59`);

        const { data: mExps } = await supabase.from("expenses")
          .select("amount")
          .eq("clinic_id", clinicId)
          .gte("expense_date", mStart).lte("expense_date", mEnd);

        const mRev = (mAppts || []).filter((a: any) => a.payment_status === "paid").reduce((s: number, a: any) => s + Number(a.paid_amount || 0), 0)
          + (mInvs || []).filter((i: any) => i.paid_status === "paid").reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
        const mExp = (mExps || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

        monthlyTrend.push({ month: m, revenue: mRev, expenses: mExp, net: mRev - mExp });
      }

      setCharts({
        dailyRevenue,
        dailyExpenses,
        dailyNet,
        dailyAppointments,
        expensesByCategory,
        serviceDistribution,
        topServices,
        paymentMethods,
        promoUsage,
        attendanceChart,
        monthlyTrend,
      });

      setLoading(false);
    } catch (error) {
      console.error(error);
      toast({ title: "خطأ", description: "فشل في جلب بيانات التقارير", variant: "destructive" });
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeClinicId) fetchAllData(activeClinicId);
  }, [activeClinicId, dateRange.start, dateRange.end]);

  // ===== الطباعة =====
  const handlePrint = () => {
    showToast("جاري إعداد صفحة الطباعة...");
    setTimeout(() => window.print(), 500);
  };

  // ===== CSV Export =====
  const handleDownloadCSV = () => {
    if (!charts || !financial) return;
    const rows = [
      "التقرير المالي الشامل",
      `الفترة: ${dateRange.start} → ${dateRange.end}`,
      "",
      "المؤشر,القيمة",
      `إجمالي الإيرادات,${financial.totalRevenue}`,
      `إجمالي المصروفات,${financial.totalExpenses}`,
      `إجمالي الخصومات,${financial.totalDiscountCash}`,
      `صافي الأرباح,${financial.netProfit}`,
      `عدد الفواتير,${financial.invoicesCount}`,
      `عدد المواعيد,${patients?.totalAppointments || 0}`,
      `عدد المرضى,${patients?.totalPatients || 0}`,
      "",
      "الإيرادات اليومية",
      "التاريخ,الإيراد",
      ...charts.dailyRevenue.map((d) => `${d.date},${d.amount}`),
    ];
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقرير_${dateRange.start}_${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("تم تحميل التقرير بنجاح");
  };

  // ===== التقاط صورة كاملة للتقرير (وضع سطح المكتب) =====
  const handleCaptureScreenshot = async () => {
    const element = document.getElementById("report-content");
    if (!element) {
      showToast("لم يتم العثور على محتوى التقرير", "err");
      return;
    }
    setCapturing(true);
    showToast("جاري التقاط صورة التقرير الكامل...");

    // حفظ الأنماط الأصلية
    const originalStyles = {
      width: element.style.width,
      maxWidth: element.style.maxWidth,
      margin: element.style.margin,
      padding: element.style.padding,
      background: element.style.background,
      direction: element.style.direction,
    };

    try {
      // وضع سطح المكتب بعرض 1400px
      element.style.width = "1400px";
      element.style.maxWidth = "1400px";
      element.style.margin = "0 auto";
      element.style.padding = "40px";
      element.style.background = C.bgGradient;
      element.style.direction = "rtl";

      // انتظار إعادة التخطيط والرسوم
      await new Promise((r) => setTimeout(r, 700));

      // إعادة الرسم بشكل نظيف (تجنّب مشكلة recharts)
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#e0f2fe",
        logging: false,
        windowWidth: 1400,
        onclone: (clonedDoc) => {
          const clonedEl = clonedDoc.getElementById("report-content") as HTMLElement | null;
          if (clonedEl) {
            clonedEl.style.width = "1400px";
            clonedEl.style.maxWidth = "1400px";
            clonedEl.style.padding = "40px";
            clonedEl.style.background = C.bgGradient;
          }
        },
      });

      const imgData = canvas.toDataURL("image/png", 1.0);
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `تقرير_${clinicName}_${dateRange.start}_${dateRange.end}.png`;
      link.click();

      showToast("✅ تم حفظ صورة التقرير بنجاح");
    } catch (err) {
      console.error("❌ Screenshot error:", err);
      showToast("فشل التقاط صورة التقرير", "err");
    } finally {
      // استعادة الأنماط الأصلية
      element.style.width = originalStyles.width;
      element.style.maxWidth = originalStyles.maxWidth;
      element.style.margin = originalStyles.margin;
      element.style.padding = originalStyles.padding;
      element.style.background = originalStyles.background;
      element.style.direction = originalStyles.direction;
      setCapturing(false);
    }
  };

  if (authLoading || (loading && !financial)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: C.bgGradient }}>
        <Loader2 className="w-12 h-12 animate-spin text-[#0369a1]" />
        <p className="mt-4 text-slate-600 font-bold text-sm">جاري تحليل البيانات...</p>
      </div>
    );
  }

  const effectiveBotUsername = botUsername || "SmartClinc_bot";
  const qrLink = activeClinicId ? `https://t.me/${effectiveBotUsername}?start=clinic_${activeClinicId}` : "";

  return (
    <div className="min-h-screen flex flex-col report-page" style={{ background: C.bgGradient, direction: "rtl" }}>
      
      {toastMsg && (
        <div className={`fixed bottom-6 left-6 z-[9999] px-5 py-3.5 rounded-2xl shadow-2xl text-white text-xs font-black flex items-center gap-2.5 ${toastMsg.type === "err" ? "bg-red-600" : "bg-[#0369a1]"} border border-white/20`}>
          {toastMsg.type === "err" ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
          <span>{toastMsg.msg}</span>
        </div>
      )}

      {/* ============ الهيدر ============ */}
      <header className="sticky top-0 z-50 print:hidden shadow-lg backdrop-blur-md" style={{ background: `linear-gradient(135deg, ${C.sky9} 0%, ${C.sky7} 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-4 flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1.5 text-sky-100 hover:text-white transition-all text-xs font-bold px-3 py-2 rounded-xl border border-white/20 hover:bg-white/10">
              <ChevronLeft className="w-4 h-4 rotate-180" />الرئيسية
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, #7dd3fc 0%, #0ea5e9 100%)" }}>
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-black text-sm sm:text-base leading-tight">تقارير {clinicName}</h1>
                <p className="text-sky-200 text-[10px] sm:text-xs">لوحة التحكم الشاملة</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCaptureScreenshot}
                disabled={capturing}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold text-white hover:brightness-110 active:scale-95 transition-all shadow-md disabled:opacity-60 disabled:cursor-wait"
                style={{ background: "linear-gradient(135deg, #0284c7 0%, #075985 100%)" }}
              >
                {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {capturing ? "جاري الالتقاط..." : "التقاط صورة"}
              </button>
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold text-white hover:brightness-110 active:scale-95 transition-all shadow-md" style={{ background: C.goldGradient }}>
                <Printer className="w-4 h-4" />طباعة PDF
              </button>
              <button onClick={handleDownloadCSV} className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-sky-100 border border-white/20 hover:bg-white/10 transition-all">
                <Download className="w-4 h-4" />CSV
              </button>
            </div>
          </div>
        </div>
        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${C.sky3}, ${C.sky5}, ${C.sky3})` }} />
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ============ شريط الفلترة ============ */}
        <div className="rounded-2xl shadow-sm border border-sky-100 p-5 print:hidden backdrop-blur-sm" style={{ background: "rgba(255, 255, 255, 0.85)" }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: C.sky1 }}>
                <Filter className="w-4 h-4 text-[#0369a1]" />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">تخصيص النطاق الزمني</span>
                <span className="block text-[10px] text-slate-500 font-mono">{dateRange.start} → {dateRange.end}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="border border-sky-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]" style={{ background: C.sky1 }}>
                <option value="month">شهر محدد</option>
                <option value="year">عام كامل</option>
                <option value="range">تاريخ مخصص</option>
              </select>
              {filterType === "month" && <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border border-sky-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]" style={{ background: C.sky1 }} />}
              {filterType === "year" && (
                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="border border-sky-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]" style={{ background: C.sky1 }}>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              {filterType === "range" && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-sky-200" style={{ background: C.sky1 }}>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border-none bg-transparent text-xs font-bold" />
                  <span className="text-sky-300 font-bold">←</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border-none bg-transparent text-xs font-bold" />
                </div>
              )}
              <button onClick={() => activeClinicId && fetchAllData(activeClinicId)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white hover:brightness-110 active:scale-95 transition-all shadow-sm" style={{ background: `linear-gradient(135deg, ${C.sky7}, ${C.sky9})` }}>
                <RefreshCw className="w-3.5 h-3.5" />تحديث
              </button>
            </div>
          </div>
        </div>

        {financial && patients && charts && (
          <div id="report-content" ref={reportRef} className="space-y-6">

            {/* ============ Print Header ============ */}
            <div className="hidden print:flex items-center justify-between pb-6 border-b-2 mb-4" style={{ borderColor: C.sky3 }}>
              <div className="flex items-center gap-3">
                {clinicLogo && <img src={clinicLogo} alt="logo" className="w-16 h-16 rounded-xl object-cover" />}
                <div>
                  <h2 className="text-2xl font-black" style={{ color: C.sky9 }}>{clinicName}</h2>
                  <p className="text-xs" style={{ color: C.slate }}>التقرير الشامل — {dateRange.start} → {dateRange.end}</p>
                </div>
              </div>
              <QRCodeCanvas value={qrLink} size={70} level="M" />
            </div>

            {/* ============ KPIs الرئيسية ============ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="إجمالي الإيرادات" value={fmt(financial.totalRevenue)} icon={TrendingUp} gradient="from-sky-500 to-sky-700" subtitle="مواعيد + فواتير" />
              <KpiCard label="إجمالي المصروفات" value={fmt(financial.totalExpenses)} icon={TrendingDown} gradient="from-rose-500 to-rose-700" subtitle={`${financial.expensesCount} مصروف`} />
              <KpiCard label="صافي الأرباح" value={fmt(financial.netProfit)} icon={Wallet} gradient={financial.netProfit >= 0 ? "from-emerald-500 to-teal-700" : "from-rose-600 to-red-800"} subtitle="الإيرادات - المصروفات" />
              <KpiCard label="إجمالي الخصومات" value={fmt(financial.totalDiscountCash)} icon={Percent} gradient="from-amber-500 to-orange-700" subtitle={`${financial.promoUsageCount} عرض مستخدم`} />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="عدد المواعيد" value={fmt(patients.totalAppointments)} icon={Calendar} gradient="from-indigo-500 to-indigo-700" subtitle={`معدل ${patients.averagePerDay}/يوم`} />
              <KpiCard label="إجمالي المرضى" value={fmt(patients.totalPatients)} icon={Users} gradient="from-purple-500 to-purple-700" subtitle={`${patients.newPatients} جديد`} />
              <KpiCard label="معدل الحضور" value={`${patients.attendanceRate}%`} icon={UserCheck} gradient="from-cyan-500 to-cyan-700" subtitle={`${patients.cancelledCount} ملغي`} />
              <KpiCard label="الفواتير" value={fmt(financial.invoicesCount)} icon={FileText} gradient="from-teal-500 to-teal-700" subtitle={`${financial.invoicesPendingCount} معلقة`} />
            </div>

            {/* ============ الصف المالي 1 ============ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ChartCard title="حركة الإيرادات والمصروفات" icon={Activity} className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={charts.dailyNet}>
                    <defs>
                      <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.sky5} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.sky5} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: C.slate }} />
                    <YAxis tick={{ fontSize: 10, fill: C.slate }} tickFormatter={fmt} />
                    <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${C.sky2}`, borderRadius: 12, fontSize: 12, direction: "rtl" }} formatter={(v: any) => fmt(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" name="إيرادات" fill={C.sky5} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expenses" name="مصروفات" fill={C.rose} radius={[6, 6, 0, 0]} />
                    <Line type="monotone" dataKey="net" name="الصافي" stroke={C.sky8} strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="طرق الدفع" icon={CreditCard}>
                {charts.paymentMethods.length === 0 ? (
                  <EmptyState text="لا توجد مدفوعات" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={charts.paymentMethods} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                        {charts.paymentMethods.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* ============ الصف المالي 2 ============ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ChartCard title="توزيع المصروفات حسب الفئة" icon={PieIcon}>
                {charts.expensesByCategory.length === 0 ? (
                  <EmptyState text="لا توجد مصروفات" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={charts.expensesByCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                        {charts.expensesByCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="الخدمات الأكثر طلباً" icon={Award} className="lg:col-span-2">
                {charts.topServices.length === 0 ? (
                  <EmptyState text="لا توجد خدمات" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={charts.topServices} layout="vertical" margin={{ left: 20 }}>
                      <defs>
                        <linearGradient id="gService" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={C.sky5} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={C.purple} stopOpacity={0.85} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: C.slate }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text }} width={130} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl" }} />
                      <Bar dataKey="value" name="عدد المواعيد" fill="url(#gService)" radius={[0, 8, 8, 0]}>
                        <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700, fill: C.text }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* ============ صفحة 2 — التقارير التفصيلية ============ */}
            <div className="page-break-before space-y-6">

              <ChartCard title="الاتجاه الشهري (6 أشهر)" icon={TrendingUp}>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={charts.monthlyTrend}>
                    <defs>
                      <linearGradient id="gMonthRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.sky5} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={C.sky5} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: C.slate }} />
                    <YAxis tick={{ fontSize: 10, fill: C.slate }} tickFormatter={fmt} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl" }} formatter={(v: any) => fmt(Number(v))} labelFormatter={monthLabel} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" name="إيرادات" fill={C.sky5} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expenses" name="مصروفات" fill={C.rose} radius={[6, 6, 0, 0]} />
                    <Line type="monotone" dataKey="net" name="صافي" stroke={C.sky8} strokeWidth={3} dot={{ r: 5, fill: C.sky8 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="مؤشر الحضور والالتزام" icon={UserCheck}>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="90%" data={charts.attendanceChart} startAngle={90} endAngle={-270}>
                      <RadialBar background dataKey="value" cornerRadius={8} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, direction: "rtl" }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} layout="vertical" verticalAlign="middle" align="right" />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="text-center mt-2">
                    <span className="text-3xl font-black" style={{ color: C.sky9 }}>{patients.attendanceRate}%</span>
                    <p className="text-xs font-bold" style={{ color: C.slate }}>معدل الحضور</p>
                  </div>
                </ChartCard>

                <ChartCard title="إحصائيات المرضى" icon={Users}>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <MiniStat label="مرضى جدد" value={fmt(patients.newPatients)} color={C.sky5} icon={UserPlus} />
                    <MiniStat label="مرضى عائدون" value={fmt(patients.returningPatients)} color={C.blue} icon={UserCheck} />
                    <MiniStat label="مواعيد مكتملة" value={fmt(patients.completedCount)} color={C.purple} icon={CheckCircle2} />
                    <MiniStat label="مواعيد ملغية" value={fmt(patients.cancelledCount)} color={C.rose} icon={X} />
                    <MiniStat label="لم يحضروا" value={fmt(patients.noShowCount)} color={C.orange} icon={Clock} />
                    <MiniStat label="المعدل اليومي" value={fmt(patients.averagePerDay)} color={C.teal} icon={Calendar} />
                  </div>
                </ChartCard>
              </div>

              <ChartCard title="تقرير استخدام العروض والخصومات" icon={Ticket}>
                {charts.promoUsage.length === 0 ? (
                  <EmptyState text="لم تُستخدم أي عروض في هذه الفترة" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead>
                        <tr className="border-b text-xs font-bold" style={{ background: C.sky1, color: C.sky8, borderColor: C.sky2 }}>
                          <th className="p-3">#</th>
                          <th className="p-3">العرض</th>
                          <th className="p-3">الكود</th>
                          <th className="p-3">عدد الاستخدامات</th>
                          <th className="p-3">إجمالي الخصم</th>
                          <th className="p-3">متوسط الخصم</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sky-100 text-xs font-semibold text-slate-700">
                        {charts.promoUsage.map((p, i) => (
                          <tr key={i} className="hover:bg-sky-50/50">
                            <td className="p-3 text-slate-400">{i + 1}</td>
                            <td className="p-3 font-bold">{p.name}</td>
                            <td className="p-3"><code className="px-2 py-0.5 rounded" style={{ background: "#fef3c7", color: "#92400e" }}>{p.code || "—"}</code></td>
                            <td className="p-3"><span className="px-2 py-0.5 rounded font-bold" style={{ background: "#d1fae5", color: "#065f46" }}>{p.count}</span></td>
                            <td className="p-3 font-bold" style={{ color: C.red }}>{fmt(p.totalDiscount)}</td>
                            <td className="p-3" style={{ color: C.slate }}>{fmt(Math.round(p.totalDiscount / Math.max(p.count, 1)))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="ملخص الإيرادات" icon={Banknote}>
                  <div className="space-y-3 py-2">
                    <SummaryRow label="إيرادات المواعيد" value={fmt(financial.totalAppointmentsRevenue)} color={C.sky6} />
                    <SummaryRow label="إيرادات الفواتير اليدوية" value={fmt(financial.totalInvoicesRevenue)} color={C.blue} />
                    <div className="border-t pt-2 mt-2" style={{ borderColor: C.sky2 }}>
                      <SummaryRow label="إجمالي الإيرادات" value={fmt(financial.totalRevenue)} color={C.sky8} bold />
                    </div>
                  </div>
                </ChartCard>

                <ChartCard title="ملخص الفواتير" icon={FileText}>
                  <div className="space-y-3 py-2">
                    <SummaryRow label="فواتير مدفوعة" value={fmt(financial.invoicesPaidCount)} color={C.green} />
                    <SummaryRow label="فواتير معلقة" value={fmt(financial.invoicesPendingCount)} color={C.orange} />
                    <SummaryRow label="قيمة المعلقة" value={fmt(financial.invoicesPendingAmount)} color={C.red} />
                    <div className="border-t pt-2 mt-2" style={{ borderColor: C.sky2 }}>
                      <SummaryRow label="إجمالي الفواتير" value={fmt(financial.invoicesCount)} color={C.sky8} bold />
                    </div>
                  </div>
                </ChartCard>
              </div>

              <ChartCard title="سجل الأداء اليومي التفصيلي" icon={Receipt}>
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="border-b text-xs font-bold" style={{ background: C.sky1, color: C.sky8, borderColor: C.sky2 }}>
                        <th className="p-3">التاريخ</th>
                        <th className="p-3">المواعيد</th>
                        <th className="p-3">الإيرادات</th>
                        <th className="p-3">المصروفات</th>
                        <th className="p-3">الصافي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100 text-xs font-semibold text-slate-700">
                      {charts.dailyNet.slice(-15).reverse().map((day, i) => (
                        <tr key={i} className="hover:bg-sky-50/50">
                          <td className="p-3 font-mono" style={{ color: C.slate }}>{day.date}</td>
                          <td className="p-3">{fmt(charts.dailyAppointments.find((a) => a.date === day.date)?.count || 0)}</td>
                          <td className="p-3 font-bold" style={{ color: C.green }}>{fmt(day.revenue)}</td>
                          <td className="p-3 font-bold" style={{ color: C.red }}>{fmt(day.expenses)}</td>
                          <td className="p-3 font-black" style={{ color: day.net >= 0 ? C.sky7 : C.rose }}>{fmt(day.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>

              <div className="rounded-3xl p-6 shadow-sm border flex flex-col md:flex-row items-center gap-6" style={{ background: "#fff", borderColor: C.sky2 }}>
                <div className="p-2.5 rounded-2xl border-2" style={{ background: C.sky1, borderColor: C.sky5 }}>
                  <QRCodeCanvas value={qrLink} size={110} level="H" includeMargin />
                </div>
                <div className="text-center md:text-right space-y-2 flex-1">
                  <h4 className="text-base font-extrabold" style={{ color: C.sky9 }}>منظومة الحجز الرقمي</h4>
                  <p className="text-xs leading-relaxed max-w-xl" style={{ color: C.slate }}>
                    يمكن للمرضى مسح الرمز للوصول إلى الحجز المباشر عبر تلجرام مع التأكيد الفوري.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
                    <span className="text-[10px] px-3 py-1 rounded-full font-bold" style={{ background: C.sky1, color: C.sky8 }}>✓ حجز فوري</span>
                    <span className="text-[10px] px-3 py-1 rounded-full font-bold" style={{ background: C.sky1, color: C.sky8 }}>✓ كود تحقق</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      <footer className="py-6 border-t text-center print:hidden" style={{ background: C.sky9, borderColor: C.sky8 }}>
        <p className="text-xs font-bold" style={{ color: C.sky3 }}>© {new Date().getFullYear()} {clinicName} — جميع الحقوق محفوظة</p>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        * { font-family: 'Cairo', sans-serif !important; }
        
        .report-page {
          min-height: 100vh;
        }

        /* ضمان ظهور الخلفية والألوان في الطباعة */
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body {
            background: linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 40%, #f8fafc 100%) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .report-page {
            background: linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 40%, #f8fafc 100%) !important;
          }
          .print\\:hidden { display: none !important; }
          .hidden.print\\:flex { display: flex !important; }
          #report-content { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .bg-white, [style*="background: rgb(255, 255, 255)"] { border: none !important; box-shadow: none !important; }
          .page-break-before { page-break-before: always; }
          table, tr { page-break-inside: avoid; }
          .recharts-wrapper, .recharts-surface { page-break-inside: avoid; }
          
          /* إجبار ظهور الألوان في البطاقات */
          [class*="from-"] {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        
        /* في وضع الشاشة — إضافة طبقة سماوية ناعمة */
        body {
          background: linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 40%, #f8fafc 100%);
          background-attachment: fixed;
        }
      `}</style>
    </div>
  );
}

// ========== المكونات المساعدة ==========
function KpiCard({ label, value, icon: Icon, gradient, subtitle }: any) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-md bg-gradient-to-br ${gradient} transition-transform hover:-translate-y-1 duration-300 print-exact`}>
      <div className="absolute -top-4 -left-4 w-20 h-20 rounded-full bg-white/15 blur-lg" />
      <div className="absolute -bottom-6 -right-6 w-16 h-16 rounded-full bg-white/10 blur-md" />
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-white/90">{label}</span>
          <div className="bg-white/20 rounded-lg p-1.5 backdrop-blur-sm"><Icon className="w-4 h-4" /></div>
        </div>
        <div>
          <div className="text-2xl font-black tracking-tight drop-shadow-sm">{value}</div>
          {subtitle && <div className="text-[10px] text-white/80 mt-0.5">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children, className = "" }: any) {
  return (
    <div className={`rounded-2xl shadow-sm border overflow-hidden ${className}`} style={{ background: "#ffffff", borderColor: "#bae6fd" }}>
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "#e0f2fe" }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#e0f2fe" }}>
          <Icon className="w-4 h-4" style={{ color: "#0369a1" }} />
        </div>
        <h3 className="font-extrabold text-sm" style={{ color: "#0c4a6e" }}>{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <PieIcon className="w-10 h-10 mb-2 opacity-50" />
      <p className="text-xs font-bold">{text}</p>
    </div>
  );
}

function MiniStat({ label, value, color, icon: Icon }: any) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: "#f0f9ff", borderColor: "#bae6fd" }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <div className="text-lg font-black" style={{ color: "#0c4a6e" }}>{value}</div>
        <div className="text-[10px] font-bold" style={{ color: "#64748b" }}>{label}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, color, bold = false }: any) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-xs ${bold ? "font-black" : ""}`} style={{ color: bold ? "#0c4a6e" : "#475569" }}>{label}</span>
      <span className={`${bold ? "text-lg font-black" : "text-sm font-bold"}`} style={{ color }}>{value}</span>
    </div>
  );
}

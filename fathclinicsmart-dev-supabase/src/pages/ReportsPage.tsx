import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import {
  Users,
  Calendar,
  TrendingUp,
  DollarSign,
  Loader2,
  Download,
  FileText,
  Activity,
  Filter,
  Award,
  Printer,
  Building2,
  RefreshCw,
  Clock,
  ChevronLeft,
  CheckCircle2,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

// ========== الهوية البصرية الفاخرة (أسلوب أرينا الفخم) ==========
const C = {
  primary: "#0f172a",       // الكحلي الداكن الفاخر
  primaryLight: "#1e293b",  // الكحلي المتوسط
  gold: "#b45309",          // الذهبي الدافئ
  goldLight: "#f59e0b",     // الذهبي الساطع
  goldGradient: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
  blue: "#3b82f6",
  green: "#10b981",
  purple: "#8b5cf6",
  rose: "#f43f5e",
  cyan: "#06b6d4",
  orange: "#f97316",
  teal: "#14b8a6",
  slate: "#64748b",
  bg: "#f8fafc",            // خلفية مريحة للعين
  white: "#ffffff",
  border: "#f1f5f9",
  text: "#0f172a",
  muted: "#64748b",
};

const PIE_COLORS = [C.blue, C.green, C.goldLight, C.purple, C.rose, C.cyan, C.orange, C.teal];

// ========== الواجهات ==========
interface ReportData {
  totalPatients: number;
  totalAppointments: number;
  totalRevenue: number;
  attendanceRate: number;
  newPatients: number;
  averagePerDay: number;
  dailyAppointments: { date: string; count: number }[];
  serviceDistribution: { name: string; value: number }[];
  dailyRevenue: { date: string; amount: number }[];
  monthlyComparison: { month: string; appointments: number; revenue: number }[];
  topServices: { name: string; value: number }[];
}

// ========== دوال التنسيق المساعد المباشر ==========
function fmt(n: number) {
  return n.toLocaleString("ar-SA");
}
function shortDate(d: string) {
  return d.slice(5);
}
function monthLabel(m: string) {
  const names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const idx = parseInt(m.slice(5, 7)) - 1;
  return names[idx] + " " + m.slice(0, 4);
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [activeClinicId, setActiveClinicId] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"month" | "year" | "range">("month");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const [toastMsg, setToastMsg] = useState<{ msg: string; type?: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // ===== جلب بيانات العيادة وصلاحيات المستخدم =====
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    const fetchClinicAndData = async () => {
      if (!user) return;

      const { data: clinic } = await supabase
        .from("clinics")
        .select("id, name, logo_url, bot_username")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!clinic) {
        navigate("/dashboard");
        return;
      }

      setActiveClinicId(clinic.id);
      setClinicName(clinic.name);
      setClinicLogo(clinic.logo_url || null);
      setBotUsername(clinic.bot_username || "SmartClinc_bot");

      await fetchReportData(clinic.id);
      setLoading(false);
    };

    fetchClinicAndData();
  }, [user, authLoading, navigate]);

  // ===== جلب البيانات الإحصائية والمالية الفورية من قاعدة البيانات =====
  const fetchReportData = async (clinicId: string) => {
    try {
      let start = "";
      let end = "";

      if (filterType === "month") {
        start = selectedMonth + "-01";
        const lastDay = new Date(
          new Date(selectedMonth + "-01").getFullYear(),
          new Date(selectedMonth + "-01").getMonth() + 1,
          0
        ).getDate();
        end = selectedMonth + "-" + String(lastDay).padStart(2, "0");
      } else if (filterType === "year") {
        start = selectedYear + "-01-01";
        end = selectedYear + "-12-31";
      } else {
        start = startDate;
        end = endDate;
      }

      const { data: appointments, error } = await supabase
        .from("appointments")
        .select(
          "id, date, payment_status, arrived_at, department, paid_amount, patient_id, service:services(name)"
        )
        .eq("clinic_id", clinicId)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });

      if (error) throw error;

      const totalAppointments = appointments?.length || 0;
      const uniquePatients = new Set(appointments?.map((a) => a.patient_id));
      const totalPatients = uniquePatients.size;
      const totalRevenue =
        appointments?.reduce((sum, a) => sum + (a.paid_amount || 0), 0) || 0;
      const attended = appointments?.filter((a) => a.arrived_at).length || 0;
      const attendanceRate =
        totalAppointments > 0 ? Math.round((attended / totalAppointments) * 100) : 0;

      let newPatients = 0;
      for (const pid of uniquePatients) {
        const { count } = await supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("patient_id", pid)
          .lt("date", start);
        if (count === 0) newPatients++;
      }

      const daysDiff = Math.max(
        1,
        Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
      );
      const averagePerDay = totalAppointments > 0 ? Math.round(totalAppointments / daysDiff) : 0;

      const dailyMap: Record<string, number> = {};
      appointments?.forEach((a) => {
        dailyMap[a.date] = (dailyMap[a.date] || 0) + 1;
      });
      const dailyAppointments = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

      const serviceMap: Record<string, number> = {};
      appointments?.forEach((a) => {
        const name = (a.service as any)?.name || a.department || "غير محدد";
        serviceMap[name] = (serviceMap[name] || 0) + 1;
      });
      const serviceDistribution = Object.entries(serviceMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const topServices = serviceDistribution.slice(0, 5);

      const revenueMap: Record<string, number> = {};
      appointments?.forEach((a) => {
        revenueMap[a.date] = (revenueMap[a.date] || 0) + (a.paid_amount || 0);
      });
      const dailyRevenue = Object.entries(revenueMap).map(([date, amount]) => ({ date, amount }));

      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        months.push(d.toISOString().slice(0, 7));
      }
      const monthlyComparison = [];
      for (const m of months) {
        const { data: monthData } = await supabase
          .from("appointments")
          .select("paid_amount")
          .eq("clinic_id", clinicId)
          .gte("date", m + "-01")
          .lte(
            "date",
            m +
              "-" +
              String(
                new Date(
                  new Date(m + "-01").getFullYear(),
                  new Date(m + "-01").getMonth() + 1,
                  0
                ).getDate()
              ).padStart(2, "0")
          );
        const count = monthData?.length || 0;
        const revenue = monthData?.reduce((s, a) => s + (a.paid_amount || 0), 0) || 0;
        monthlyComparison.push({
          month: m,
          appointments: count,
          revenue: revenue,
        });
      }

      setReportData({
        totalPatients,
        totalAppointments,
        totalRevenue,
        attendanceRate,
        newPatients,
        averagePerDay,
        dailyAppointments,
        serviceDistribution,
        dailyRevenue,
        monthlyComparison,
        topServices,
      });
    } catch (error) {
      console.error(error);
      toast({ title: "خطأ", description: "فشل في جلب بيانات التقارير", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (activeClinicId) {
      fetchReportData(activeClinicId);
    }
  }, [filterType, selectedMonth, selectedYear, startDate, endDate]);

  // ===== تفعيل الطباعة المباشرة والذكية للمتصفح =====
  const handlePrint = () => {
    showToast("جاري إعداد صفحة الطباعة وحفظ الـ PDF السليم...");
    setTimeout(() => {
      window.print();
    }, 500);
  };

  // ===== تصدير البيانات إلى ملف مبيعات سريع Excel/CSV =====
  const handleDownloadCSV = () => {
    if (!reportData) return;
    const rows = ["التاريخ,المواعيد,الإيرادات (ر.ي)"];
    reportData.dailyAppointments.forEach((d) => {
      const rev = reportData.dailyRevenue.find(r => r.date === d.date);
      rows.push(`${d.date},${d.count},${rev?.amount || 0}`);
    });
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("تم تحميل تقرير CSV بنجاح المباشر");
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-12 h-12 animate-spin text-[#b45309]" />
        <p className="mt-4 text-slate-600 font-bold animate-pulse text-sm">جاري جلب وتحليل مؤشرات الأداء الحالية...</p>
      </div>
    );
  }

  const effectiveBotUsername = botUsername || "SmartClinc_bot";
  const qrLink = activeClinicId
    ? `https://t.me/${effectiveBotUsername}?start=clinic_${activeClinicId}`
    : "";

  return (
    <div className="min-h-screen flex flex-col transition-all duration-300" style={{ background: C.bg, direction: "rtl" }}>
      
      {/* التنبيهات المخصصة الأنيقة */}
      {toastMsg && (
        <div className="fixed bottom-6 left-6 z-[9999] px-5 py-3.5 rounded-2xl shadow-2xl text-white text-xs font-black flex items-center gap-2.5 bg-slate-900 border border-slate-800 animate-slide-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg.msg}</span>
        </div>
      )}

      {/* ===== هيدر التحكم العلوي (يختفي تلقائياً عند الطباعة) ===== */}
      <header className="sticky top-0 z-50 print:hidden shadow-lg backdrop-blur-md bg-opacity-95" style={{ background: C.primary }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-4">
            
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-all text-xs font-bold px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              العودة للرئيسية
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: C.goldGradient }}>
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-black text-sm sm:text-base leading-tight">تقارير {clinicName}</h1>
                <p className="text-slate-400 text-[10px] sm:text-xs">المؤشرات الإحصائية والمالية الشاملة</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold text-white transition-all transform active:scale-95 hover:brightness-110 shadow-md"
                style={{ background: C.goldGradient }}
              >
                <Printer className="w-4 h-4" />
                طباعة وحفظ كـ PDF
              </button>
              
              <button
                onClick={handleDownloadCSV}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 border border-slate-700 hover:bg-slate-800 transition-all"
              >
                <Download className="w-4 h-4" />
                تنزيل CSV
              </button>
            </div>

          </div>
        </div>
        <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})` }} />
      </header>

      {/* ===== المحتوى الرئيسي للتقارير ===== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* شريط الفلترة المتقدم (يختفي عند الطباعة) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <Filter className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">تخصيص النطاق الزمني</span>
                <span className="block text-[10px] text-slate-400">حدد طريقة عرض الأداء الإحصائي للتقرير</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-[#b45309]"
              >
                <option value="month">شهر محدد</option>
                <option value="year">عام كامل</option>
                <option value="range">تاريخ مخصص</option>
              </select>

              {filterType === "month" && (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-[#b45309]"
                />
              )}

              {filterType === "year" && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-[#b45309]"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}

              {filterType === "range" && (
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border-none bg-transparent text-xs font-bold focus:outline-none"
                  />
                  <span className="text-slate-300 font-bold">←</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border-none bg-transparent text-xs font-bold focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={() => activeClinicId && fetchReportData(activeClinicId)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white hover:brightness-110 active:scale-95 transition-all shadow-sm"
                style={{ background: C.primary }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                تحديث البيانات
              </button>
            </div>

          </div>
        </div>

        {/* تنبيه ذكي لتوضيح كيفية حفظ الـ PDF بدون أخطاء خط عربي */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 print:hidden">
          <div className="text-amber-700 mt-0.5">ℹ️</div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-extrabold text-amber-900">للحصول على نسخة PDF مطبوعة ومثالية وخالية من عيوب اللغة العربية:</h4>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              انقر فوق زر <b>"طباعة وحفظ كـ PDF"</b> بالأعلى، ثم من خيارات الطابعة التي تظهر أمامك بالمتصفح؛ قم بتغيير الوجهة (Destination) إلى <b>"حفظ بتنسيق PDF" (Save as PDF)</b> للحصول على أفضل جودة ملف وتصميم.
            </p>
          </div>
        </div>

        {/* لوحة التقارير المعروضة بالكامل للطباعة والتصميم المباشر */}
        {reportData ? (
          <div id="report-content" className="space-y-6">

            {/* الهيدر المخصص للورقة والطباعة المباشرة (يظهر في الطباعة فقط) */}
            <div className="hidden print:flex items-center justify-between pb-6 border-b-2 border-slate-200 mb-4">
              <div className="flex items-center gap-3">
                <Building2 className="w-8 h-8 text-[#b45309]" />
                <div>
                  <h2 className="text-xl font-black text-slate-900">{clinicName}</h2>
                  <p className="text-xs text-slate-500">تقرير الأداء الطبي والمالي العام للفترة الحالية</p>
                </div>
              </div>
              <QRCodeCanvas value={qrLink} size={60} level="M" />
            </div>

            {/* شبكة بطاقات الأرقام والمؤشرات الحيوية (KPIs) */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {[
                { label: "إجمالي المرضى", value: fmt(reportData.totalPatients), icon: Users, gradient: "from-blue-600 to-blue-800" },
                { label: "إجمالي المواعيد", value: fmt(reportData.totalAppointments), icon: Calendar, gradient: "from-emerald-600 to-emerald-800" },
                { label: "إجمالي الإيرادات", value: fmt(reportData.totalRevenue) + " ر.ي", icon: DollarSign, gradient: "from-amber-600 to-amber-800" },
                { label: "معدل الحضور والالتزام", value: reportData.attendanceRate + "%", icon: TrendingUp, gradient: "from-purple-600 to-purple-800" },
                { label: "المرضى الجدد", value: fmt(reportData.newPatients), icon: Award, gradient: "from-rose-600 to-rose-800" },
                { label: "المعدل اليومي", value: fmt(reportData.averagePerDay), icon: Clock, gradient: "from-cyan-600 to-cyan-800" },
              ].map((stat, i) => (
                <div key={i} className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-md bg-gradient-to-br ${stat.gradient} transition-transform hover:-translate-y-1 duration-300`}>
                  <div className="absolute -top-4 -left-4 w-16 h-16 rounded-full bg-white/10 blur-lg" />
                  <div className="relative z-10 flex flex-col justify-between h-full gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/85">{stat.label}</span>
                      <div className="bg-white/15 rounded-lg p-1.5">
                        <stat.icon className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-xl font-black tracking-tight">{stat.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* لوحة قياس دقة مؤشر الأداء والالتزام العملياتي */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-extrabold text-slate-800 text-sm">مؤشرات الجودة والفعالية السريرية</span>
                <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg">معدلات ممتازة</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: "معدل التزام وحضور المواعيد", val: reportData.attendanceRate, color: C.green },
                  { label: "معدل نمو واستقطاب المرضى الجدد", val: Math.round((reportData.newPatients / Math.max(reportData.totalPatients, 1)) * 100), color: C.blue },
                  { label: "كفاءة الفواتير والتحصيل المالي", val: Math.min(100, Math.round((reportData.totalRevenue / Math.max(reportData.totalAppointments * 200, 1)) * 100)), color: C.goldLight },
                ].map((item, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-bold" style={{ color: item.color }}>{item.val}%</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000"
                        style={{ width: item.val + "%", background: `linear-gradient(90deg, ${item.color}, ${item.color}bb)` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* الرسوم البيانية الكبرى */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* المواعيد اليومية */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-50">
                    <Calendar className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">إحصائيات المواعيد اليومية</h3>
                </div>
                <div className="p-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyAppointments.slice(-15)}>
                      <defs>
                        <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.blue} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={C.blue} stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9, fill: C.slate }} />
                      <YAxis tick={{ fontSize: 9, fill: C.slate }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="count" name="المواعيد" stroke={C.blue} strokeWidth={2.5}
                        fill="url(#gBlue)" dot={{ r: 3, fill: C.blue, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* الإيرادات اليومية */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-50">
                    <DollarSign className="w-4 h-4 text-amber-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">حركة نمو الإيرادات اليومية</h3>
                </div>
                <div className="p-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyRevenue.slice(-15)}>
                      <defs>
                        <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.goldLight} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={C.goldLight} stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9, fill: C.slate }} />
                      <YAxis tick={{ fontSize: 9, fill: C.slate }} tickFormatter={(v) => fmt(v)} />
                      <Tooltip />
                      <Area type="monotone" dataKey="amount" name="الإيرادات" stroke={C.goldLight} strokeWidth={2.5}
                        fill="url(#gGold)" dot={{ r: 3, fill: C.goldLight, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* توزيع الخدمات الطبية وعيادات التخصص الأعلى أداءً */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 page-break-before">
              
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden lg:col-span-3">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-purple-50">
                    <Activity className="w-4 h-4 text-purple-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">توزيع الخدمات والعيادات</h3>
                </div>
                <div className="p-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.serviceDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius="48%"
                        outerRadius="72%"
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {reportData.serviceDistribution.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => [fmt(Number(val)) + " موعد", ""]} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden lg:col-span-2 flex flex-col justify-between">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-50">
                    <Award className="w-4 h-4 text-rose-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">الخدمات الأكثر طلباً</h3>
                </div>
                <div className="p-5 space-y-4 flex-1 flex flex-col justify-center">
                  {reportData.topServices.map((s, i) => {
                    const max = reportData.topServices[0]?.value || 1;
                    const pct = (s.value / max) * 100;
                    const colors = [C.blue, C.green, C.goldLight, C.purple, C.rose];
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-bold truncate max-w-[150px]">{s.name}</span>
                          <span className="font-black" style={{ color: colors[i] }}>{fmt(s.value)}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-1000"
                            style={{ width: pct + "%", background: colors[i] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* جدول تفصيلي بالأداء اليومي للمبيعات للطباعة المباشرة */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-teal-50">
                    <FileText className="w-4 h-4 text-teal-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">سجلات الأداء والتحصيل للفترة الحالية</h3>
                </div>
                <span className="text-xxs text-slate-400 font-bold">عرض 10 أيام</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs font-bold">
                      <th className="p-4">التاريخ</th>
                      <th className="p-4">عدد المواعيد</th>
                      <th className="p-4">مجموع المبيعات المحصلة</th>
                      <th className="p-4">مستوى الكفاءة العامة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                    {reportData.dailyAppointments.slice(0, 10).map((day, idx) => {
                      const rev = reportData.dailyRevenue.find(r => r.date === day.date);
                      const isHigh = day.count >= reportData.averagePerDay;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 text-slate-500 font-mono">{day.date}</td>
                          <td className="p-4">{fmt(day.count)}</td>
                          <td className="p-4 text-[#b45309]">{fmt(rev?.amount || 0)} ر.ي</td>
                          <td className="p-4">
                            <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-md font-bold ${isHigh ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                              {isHigh ? "ممتاز" : "مستقر"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* كود QR مدمج بتصميم أرينا الفخم يربط مع Telegram */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-6">
              <div className="p-2.5 bg-slate-50 rounded-2xl border-2 border-[#b45309] shadow-inner">
                <QRCodeCanvas value={qrLink} size={110} level="H" includeMargin />
              </div>
              <div className="text-center md:text-right space-y-2 flex-1">
                <h4 className="text-base font-extrabold text-slate-900">منظومة الحجز والتأكيد الرقمي التلقائي</h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                  بإمكان المرضى مسح رمز الـ QR مباشرة من خلال تطبيق تيليجرام للوصول إلى الحجز المباشر والمؤتمت، وحجز العيادة المناسبة والتأكيد الفوري عبر السيرفر دون تدخل بشري.
                </p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1.5">
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold">✓ حجز فوري مؤمن</span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold">✓ كود تشفير الحالات</span>
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
            <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-bold">عذراً، لا تتوفر أي بيانات أو سجلات كافية حالياً للفترة الزمنية المحددة.</p>
          </div>
        )}
      </main>

      {/* ===== الفوتر المخصص للشاشة ===== */}
      <footer className="bg-slate-950 py-6 border-t border-slate-900 text-center print:hidden">
        <p className="text-slate-500 text-xxs font-bold">© {new Date().getFullYear()} {clinicName} | جميع الحقوق محفوظة لعيادتك الذكية</p>
      </footer>

      {/* ===== تنسيق الأداء الفاخر للطباعة المتصفحية الفائقة ===== */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        
        * {
          font-family: 'Cairo', sans-serif !important;
        }

        /* تحسينات تخطيط الطباعة الدقيقة */
        @media print {
          @page {
            size: A4;
            margin: 12mm 12mm 12mm 12mm;
          }
          body {
            background-color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .hidden.print\\:flex {
            display: flex !important;
          }
          #report-content {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .bg-white {
            border: none !important;
            box-shadow: none !important;
          }
          .page-break-before {
            page-break-before: always;
          }
          table {
            page-break-inside: avoid;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
      `}</style>

    </div>
  );
}

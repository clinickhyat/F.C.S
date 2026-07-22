import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
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
  Clock,
  Award,
  Printer,
  Building2,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { QRCodeCanvas } from "qrcode.react";

// ========== الألوان ==========
const COLORS = {
  primary: "#1a2a6c",
  primaryLight: "#2d4a9e",
  gold: "#c9a84c",
  goldLight: "#e8c76e",
  blue: "#1a73e8",
  green: "#10b981",
  purple: "#7c3aed",
  rose: "#e11d48",
  cyan: "#0891b2",
  orange: "#f59e0b",
  teal: "#0d9488",
  slate: "#64748b",
  bg: "#f0f4ff",
  white: "#ffffff",
  border: "#e2e8f0",
  text: "#1e293b",
  muted: "#64748b",
};

const PIE_COLORS = [
  COLORS.blue,
  COLORS.green,
  COLORS.gold,
  COLORS.purple,
  COLORS.rose,
  COLORS.cyan,
  COLORS.orange,
  COLORS.teal,
];

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

// ========== المساعدات ==========
const formatNumber = (n: number) => n.toLocaleString("ar-SA");
const shortDate = (d: string) => d.slice(5);

const getMonthLabel = (m: string) => {
  const names = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  const idx = parseInt(m.slice(5, 7)) - 1;
  return names[idx] + " " + m.slice(0, 4);
};

// ========== المكون الرئيسي ==========
export default function ReportsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
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

  const printRef = useRef<HTMLDivElement>(null);

  // ===== جلب بيانات العيادة =====
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

  // ===== جلب بيانات التقارير =====
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
      toast({ 
        title: "خطأ", 
        description: "فشل في جلب بيانات التقارير", 
        variant: "destructive" 
      });
    }
  };

  useEffect(() => {
    if (activeClinicId) {
      fetchReportData(activeClinicId);
    }
  }, [filterType, selectedMonth, selectedYear, startDate, endDate]);

  // ===== تصدير PDF محسّن =====
  const handleDownloadPDF = async () => {
    if (!reportData) return;
    setGenerating(true);

    try {
      const doc = new jsPDF({ 
        orientation: "portrait", 
        unit: "mm", 
        format: "a4", 
        compress: true 
      });

      // إضافة دعم للعربية
      doc.setLanguage("ar");
      doc.setFont("helvetica");

      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const m = 12;

      // ===== صفحة الغلاف =====
      doc.setFillColor(COLORS.primary);
      doc.rect(0, 0, pw, ph, "F");

      // الشعار والعنوان
      doc.setFontSize(24);
      doc.setTextColor("#ffffff");
      doc.setFont("helvetica", "bold");
      doc.text(clinicName, pw / 2, 80, { align: "center" });

      doc.setFontSize(14);
      doc.setTextColor(COLORS.gold);
      doc.text("تقرير شامل - Smart Clinic", pw / 2, 95, { align: "center" });

      doc.setFontSize(10);
      doc.setTextColor("#ffffff99");
      const { start, end } = getDateRange();
      doc.text(`الفترة: ${start} إلى ${end}`, pw / 2, 110, { align: "center" });
      doc.text(new Date().toLocaleDateString("ar-SA"), pw / 2, 120, { align: "center" });

      // خط ذهبي
      doc.setFillColor(COLORS.gold);
      doc.rect(m, ph - 40, pw - 2 * m, 2, "F");

      // ===== صفحة KPIs =====
      doc.addPage();
      let y = 20;

      // عنوان القسم
      doc.setFillColor(COLORS.primary);
      doc.rect(m, y, pw - 2 * m, 10, "F");
      doc.setFontSize(12);
      doc.setTextColor("#ffffff");
      doc.setFont("helvetica", "bold");
      doc.text("المؤشرات الرئيسية", m + 5, y + 7);
      y += 18;

      // جدول KPIs
      const kpiData = [
        ["إجمالي المرضى", formatNumber(reportData.totalPatients)],
        ["إجمالي المواعيد", formatNumber(reportData.totalAppointments)],
        ["إجمالي الإيرادات", formatNumber(reportData.totalRevenue) + " ر.ي"],
        ["نسبة الحضور", reportData.attendanceRate + "%"],
        ["مرضى جدد", formatNumber(reportData.newPatients)],
        ["متوسط يومي", formatNumber(reportData.averagePerDay)],
      ];

      autoTable(doc, {
        startY: y,
        head: [["المؤشر", "القيمة"]],
        body: kpiData,
        styles: {
          font: "helvetica",
          fontSize: 10,
          cellPadding: 4,
          halign: "right",
        },
        headStyles: {
          fillColor: [26, 42, 108],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 255],
        },
        columnStyles: {
          0: { cellWidth: 100 },
          1: { cellWidth: 70, fontStyle: "bold", textColor: [201, 168, 76] },
        },
      });

      // ===== جدول أفضل الخدمات =====
      doc.addPage();
      y = 20;

      doc.setFillColor(COLORS.primary);
      doc.rect(m, y, pw - 2 * m, 10, "F");
      doc.setFontSize(12);
      doc.setTextColor("#ffffff");
      doc.text("أفضل الخدمات", m + 5, y + 7);
      y += 18;

      const total = reportData.serviceDistribution.reduce((s, x) => s + x.value, 0);
      const servicesData = reportData.topServices.map((s, i) => {
        const pct = Math.round((s.value / total) * 100);
        return [String(i + 1), s.name, formatNumber(s.value), pct + "%"];
      });

      autoTable(doc, {
        startY: y,
        head: [["#", "اسم الخدمة", "المواعيد", "النسبة"]],
        body: servicesData,
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 3,
          halign: "center",
        },
        headStyles: {
          fillColor: [26, 42, 108],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 255],
        },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 90, halign: "right" },
          2: { cellWidth: 40 },
          3: { cellWidth: 30, textColor: [16, 185, 129], fontStyle: "bold" },
        },
      });

      // ===== جدول التفاصيل اليومية =====
      doc.addPage();
      y = 20;

      doc.setFillColor(COLORS.primary);
      doc.rect(m, y, pw - 2 * m, 10, "F");
      doc.setFontSize(12);
      doc.setTextColor("#ffffff");
      doc.text("التفاصيل اليومية", m + 5, y + 7);
      y += 18;

      const dailyData = reportData.dailyAppointments.slice(0, 20).map((d) => {
        const rev = reportData.dailyRevenue.find((r) => r.date === d.date);
        const avg = reportData.averagePerDay;
        const status =
          d.count > avg * 1.2
            ? "ممتاز"
            : d.count < avg * 0.8
            ? "منخفض"
            : "معتدل";
        return [d.date, formatNumber(d.count), formatNumber(rev?.amount || 0), status];
      });

      autoTable(doc, {
        startY: y,
        head: [["التاريخ", "المواعيد", "الإيرادات (ر.ي)", "الحالة"]],
        body: dailyData,
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 2.5,
          halign: "center",
        },
        headStyles: {
          fillColor: [13, 148, 136],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [240, 253, 250],
        },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 40, fontStyle: "bold" },
          2: { cellWidth: 45, textColor: [201, 168, 76] },
          3: { cellWidth: 40 },
        },
      });

      // ===== صفحة QR =====
      doc.addPage();
      const qrY = ph / 2 - 40;

      doc.setFillColor(COLORS.bg);
      doc.rect(0, 0, pw, ph, "F");

      doc.setFillColor(COLORS.primary);
      doc.rect(0, 0, pw, 35, "F");

      doc.setFontSize(14);
      doc.setTextColor("#ffffff");
      doc.setFont("helvetica", "bold");
      doc.text("احجز موعدك الآن", pw / 2, 18, { align: "center" });

      doc.setFontSize(9);
      doc.setTextColor(COLORS.gold);
      doc.text(clinicName, pw / 2, 27, { align: "center" });

      // QR
      const qrCanvas = document.getElementById("hidden-qr-canvas") as HTMLCanvasElement;
      if (qrCanvas) {
        const qrSize = 60;
        const qrX = pw / 2 - qrSize / 2;
        doc.setFillColor("#ffffff");
        doc.rect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, "F");
        doc.setDrawColor(COLORS.gold);
        doc.setLineWidth(2);
        doc.rect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, "S");
        const qrDataUrl = qrCanvas.toDataURL("image/png");
        doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
      }

      doc.setFontSize(10);
      doc.setTextColor(COLORS.text);
      doc.setFont("helvetica", "bold");
      doc.text("امسح الكود بتطبيق تيليجرام", pw / 2, qrY + 75, { align: "center" });

      const qrLink = `https://t.me/${botUsername || "SmartClinc_bot"}?start=clinic_${activeClinicId}`;
      doc.setFontSize(7);
      doc.setTextColor(COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.text(qrLink, pw / 2, qrY + 82, { align: "center" });

      // ===== التذييل لجميع الصفحات =====
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(COLORS.primary);
        doc.rect(0, ph - 10, pw, 10, "F");
        doc.setFillColor(COLORS.gold);
        doc.rect(0, ph - 11, pw, 1, "F");
        doc.setFontSize(7);
        doc.setTextColor("#ffffff");
        doc.text(
          `${clinicName} | Smart Clinic | © ${new Date().getFullYear()}`,
          pw / 2,
          ph - 4,
          { align: "center" }
        );
        doc.text(`صفحة ${i} من ${totalPages}`, pw - m, ph - 4, { align: "right" });
      }

      const fileName = `SmartClinic_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);

      toast({
        title: "نجاح",
        description: "تم تحميل التقرير بنجاح",
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "خطأ",
        description: "فشل في إنشاء التقرير",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  // ===== نطاق التاريخ =====
  const getDateRange = () => {
    let start = "",
      end = "";
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
    return { start, end };
  };

  // ===== CSV =====
  const handleDownloadCSV = () => {
    if (!reportData) return;
    const rows = ["التاريخ,المواعيد,الإيرادات"];
    reportData.dailyAppointments.forEach((d) => {
      const rev = reportData.dailyRevenue.find((r) => r.date === d.date);
      rows.push(`${d.date},${d.count},${rev?.amount || 0}`);
    });
    const blob = new Blob(["\uFEFF" + rows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "نجاح", description: "تم تحميل ملف CSV" });
  };

  // ===== طباعة =====
  const handlePrint = () => window.print();

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const qrLink = activeClinicId
    ? `https://t.me/${botUsername || "SmartClinc_bot"}?start=clinic_${activeClinicId}`
    : "";

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* QR مخفي */}
      <div className="fixed -top-full -left-full opacity-0 pointer-events-none">
        <QRCodeCanvas
          id="hidden-qr-canvas"
          value={qrLink}
          size={240}
          level="H"
          includeMargin
        />
      </div>

      {/* الهيدر */}
      <header
        className="sticky top-0 z-50 bg-white shadow-sm print:hidden"
        style={{ borderBottom: `3px solid ${COLORS.gold}` }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 text-slate-600 hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">العودة</span>
            </button>

            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: COLORS.primary }}
              >
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">تقارير {clinicName}</h1>
                <p className="text-xs text-slate-500">لوحة التحليلات الشاملة</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPDF}
                disabled={generating || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: COLORS.gold }}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                PDF
              </button>
              <button
                onClick={handleDownloadCSV}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-all"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-all"
              >
                <Printer className="w-4 h-4" />
                طباعة
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* المحتوى */}
      <main className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
        {/* الفلترة */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-slate-600">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">فلترة التقرير</span>
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="month">شهر محدد</option>
              <option value="year">سنة كاملة</option>
              <option value="range">نطاق مخصص</option>
            </select>

            {filterType === "month" && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {filterType === "year" && (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  )
                )}
              </select>
            )}

            {filterType === "range" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-400">إلى</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <button
              onClick={() => activeClinicId && fetchReportData(activeClinicId)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium"
              style={{ background: COLORS.primary }}
            >
              <RefreshCw className="w-4 h-4" />
              تحديث
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        ) : reportData ? (
          <div ref={printRef}>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                {
                  label: "إجمالي المرضى",
                  value: formatNumber(reportData.totalPatients),
                  icon: Users,
                  color: COLORS.blue,
                },
                {
                  label: "إجمالي المواعيد",
                  value: formatNumber(reportData.totalAppointments),
                  icon: Calendar,
                  color: COLORS.green,
                },
                {
                  label: "إجمالي الإيرادات",
                  value: formatNumber(reportData.totalRevenue) + " ر.ي",
                  icon: DollarSign,
                  color: COLORS.gold,
                },
                {
                  label: "نسبة الحضور",
                  value: reportData.attendanceRate + "%",
                  icon: TrendingUp,
                  color: COLORS.purple,
                },
                {
                  label: "مرضى جدد",
                  value: formatNumber(reportData.newPatients),
                  icon: Award,
                  color: COLORS.rose,
                },
                {
                  label: "متوسط يومي",
                  value: formatNumber(reportData.averagePerDay),
                  icon: Clock,
                  color: COLORS.cyan,
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: stat.color + "15" }}
                    >
                      <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mb-1">{stat.label}</p>
                  <p className="text-xl font-bold text-slate-800">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* الرسوم البيانية */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* المواعيد اليومية */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  المواعيد اليومية
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyAppointments.slice(-30)}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={shortDate}
                        tick={{ fontSize: 10, fill: COLORS.muted }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke={COLORS.blue}
                        strokeWidth={2}
                        fill="url(#colorCount)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* الإيرادات اليومية */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  الإيرادات اليومية
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyRevenue.slice(-30)}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.gold} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.gold} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={shortDate}
                        tick={{ fontSize: 10, fill: COLORS.muted }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: COLORS.muted }}
                        tickFormatter={formatNumber}
                      />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke={COLORS.gold}
                        strokeWidth={2}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* توزيع الخدمات */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-600" />
                  توزيع الخدمات
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.serviceDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="80%"
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {reportData.serviceDistribution.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val) => [formatNumber(Number(val)) + " موعد", ""]}
                      />
                      <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                        iconType="circle"
                        iconSize={8}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* أفضل الخدمات */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Award className="w-4 h-4 text-orange-600" />
                  أفضل الخدمات
                </h3>
                <div className="space-y-3">
                  {reportData.topServices.map((s, i) => {
                    const max = reportData.topServices[0]?.value || 1;
                    const pct = (s.value / max) * 100;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-700 font-medium">{s.name}</span>
                          <span className="font-bold text-slate-800">
                            {formatNumber(s.value)}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: pct + "%",
                              background: PIE_COLORS[i % PIE_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* المقارنة الشهرية */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-600" />
                المقارنة الشهرية (آخر 6 أشهر)
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportData.monthlyComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={getMonthLabel}
                      tick={{ fontSize: 10, fill: COLORS.muted }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10, fill: COLORS.muted }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10, fill: COLORS.muted }}
                    />
                    <Tooltip />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="appointments"
                      name="المواعيد"
                      fill={COLORS.blue}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="revenue"
                      name="الإيرادات"
                      fill={COLORS.gold}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* جدول التفاصيل */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-600" />
                  تفاصيل يومية
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                        التاريخ
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600">
                        المواعيد
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600">
                        الإيرادات
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600">
                        الحالة
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.dailyAppointments.slice(0, 15).map((day, idx) => {
                      const rev = reportData.dailyRevenue.find(
                        (r) => r.date === day.date
                      );
                      const avg = reportData.averagePerDay;
                      const status =
                        day.count > avg * 1.2
                          ? { label: "ممتاز", color: "text-green-600", bg: "bg-green-50" }
                          : day.count < avg * 0.8
                          ? { label: "منخفض", color: "text-red-600", bg: "bg-red-50" }
                          : {
                              label: "معتدل",
                              color: "text-amber-600",
                              bg: "bg-amber-50",
                            };
                      return (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                        >
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {day.date}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-slate-800">
                            {formatNumber(day.count)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-amber-600">
                            {formatNumber(rev?.amount || 0)} ر.ي
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs font-bold px-2 py-1 rounded-lg ${status.bg} ${status.color}`}
                            >
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* QR */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-shrink-0 p-4 rounded-xl border-2 border-amber-400">
                  <QRCodeCanvas value={qrLink} size={120} level="H" includeMargin />
                </div>
                <div className="flex-1 text-center md:text-right">
                  <h3 className="text-lg font-bold text-slate-800 mb-2">
                    احجز موعدك عبر تيليجرام
                  </h3>
                  <p className="text-sm text-slate-600 mb-3">
                    امسح رمز QR بتطبيق تيليجرام للحجز الفوري
                  </p>
                  <p className="text-xs text-slate-400 font-mono break-all">{qrLink}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <Activity className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">لا توجد بيانات كافية لعرض التقرير</p>
          </div>
        )}
      </main>

      {/* التذييل */}
      <footer
        className="mt-8 py-4 text-center print:hidden"
        style={{ background: COLORS.primary }}
      >
        <p className="text-white/60 text-xs">
          © {new Date().getFullYear()} {clinicName} | Smart Clinic
        </p>
      </footer>

      {/* أنماط الطباعة */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 8mm;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          * {
            box-shadow: none !important;
          }
          .bg-white {
            break-inside: avoid;
          }
          .h-64,
          .h-72 {
            height: 200px !important;
          }
        }
      `}</style>
    </div>
  );
}

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
  RadialBarChart,
  RadialBar,
} from "recharts";
import {
  Users,
  Calendar,
  TrendingUp,
  DollarSign,
  Loader2,
  Download,
  FileText,
  ArrowLeft,
  Activity,
  Filter,
  CalendarRange,
  Clock,
  Award,
  Printer,
  Building2,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { QRCodeCanvas } from "qrcode.react";

// ألوان هوية الشركة
const COLORS = {
  primary: "#1a2a6c",
  secondary: "#c9a84c",
  gold: "#c9a84c",
  blue: "#1a73e8",
  green: "#34a853",
  purple: "#7c3aed",
  rose: "#e11d48",
  cyan: "#0891b2",
  dark: "#0b1e33",
  muted: "#6b7a8f",
};

const CHART_COLORS = [COLORS.blue, COLORS.green, COLORS.gold, COLORS.purple, COLORS.rose];

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

  const chartRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  // 1. جلب بيانات العيادة (الاسم، الشعار، اسم البوت)
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

  // 2. جلب بيانات التقارير حسب الفلترة
  const fetchReportData = async (clinicId: string) => {
    try {
      let start = "";
      let end = "";

      if (filterType === "month") {
        start = `${selectedMonth}-01`;
        const lastDay = new Date(
          new Date(selectedMonth + "-01").getFullYear(),
          new Date(selectedMonth + "-01").getMonth() + 1,
          0
        ).getDate();
        end = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
      } else if (filterType === "year") {
        start = `${selectedYear}-01-01`;
        end = `${selectedYear}-12-31`;
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

  // إعادة جلب عند تغيير الفلترة
  useEffect(() => {
    if (activeClinicId) {
      fetchReportData(activeClinicId);
    }
  }, [filterType, selectedMonth, selectedYear, startDate, endDate]);

  // 3. تصدير PDF احترافي مع QR والشعار
  const handleDownloadPDF = async () => {
    if (!reportData || !chartRef.current) return;

    toast({ title: "⏳ جاري إنشاء التقرير..." });

    try {
      // التقاط QR كصورة
      let qrImageData: string | null = null;
      if (qrRef.current) {
        const qrCanvas = qrRef.current.querySelector("canvas");
        if (qrCanvas) {
          qrImageData = qrCanvas.toDataURL("image/png");
        }
      }

      const charts = chartRef.current.querySelectorAll(".chart-container");
      const chartImages: string[] = [];

      for (const chart of charts) {
        const canvas = await html2canvas(chart as HTMLElement, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });
        chartImages.push(canvas.toDataURL("image/png"));
      }

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = 20;

      // ========== الهيدر (شعار + QR + اسم العيادة) ==========
      // الشعار (يمين)
      if (clinicLogo) {
        try {
          const logoImg = await fetch(clinicLogo).then((r) => r.blob());
          const reader = new FileReader();
          const logoData = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(logoImg);
          });
          doc.addImage(logoData, "PNG", 15, 10, 35, 35);
        } catch (_) {}
      } else {
        doc.setFontSize(24);
        doc.setTextColor(COLORS.primary);
        doc.text("🏥", 15, 30);
      }

      // QR (يسار) - باستخدام الصورة الملتقطة
      if (qrImageData) {
        doc.addImage(qrImageData, "PNG", pageWidth - 45, 10, 30, 30);
      }

      // اسم العيادة في المنتصف
      doc.setFontSize(22);
      doc.setTextColor(COLORS.primary);
      doc.text(clinicName, pageWidth / 2, 25, { align: "center" });

      doc.setFontSize(12);
      doc.setTextColor(COLORS.muted);
      doc.text("التقرير الشامل للعيادة", pageWidth / 2, 35, { align: "center" });

      // التاريخ
      doc.setFontSize(10);
      doc.setTextColor(COLORS.muted);
      const dateStr = new Date().toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.text(`تاريخ التقرير: ${dateStr}`, pageWidth / 2, 43, { align: "center" });

      y = 52;

      // خط فاصل ذهبي
      doc.setDrawColor(201, 168, 76);
      doc.setLineWidth(0.5);
      doc.line(15, y, pageWidth - 15, y);
      y += 8;

      // ========== بطاقات KPI ==========
      doc.setFontSize(9);
      doc.setTextColor("#333");
      const kpis = [
        ["👤 المرضى", reportData.totalPatients],
        ["📅 المواعيد", reportData.totalAppointments],
        ["💰 الإيرادات", reportData.totalRevenue + " ر.ي"],
        ["📊 نسبة الحضور", reportData.attendanceRate + "%"],
        ["🌟 مرضى جدد", reportData.newPatients],
        ["⏱️ متوسط يومي", reportData.averagePerDay],
      ];

      let kpiX = 20;
      kpis.forEach(([label, value], i) => {
        if (i % 3 === 0 && i > 0) {
          y += 14;
          kpiX = 20;
        }
        doc.setFontSize(8);
        doc.setTextColor(COLORS.muted);
        doc.text(label, kpiX, y);
        doc.setFontSize(13);
        doc.setTextColor(COLORS.dark);
        doc.text(String(value), kpiX, y + 6);
        kpiX += 55;
      });
      y += 20;

      // ========== إضافة الرسوم البيانية ==========
      for (let i = 0; i < chartImages.length; i++) {
        if (i > 0 && i % 2 === 0) {
          doc.addPage();
          y = 20;
        }
        const imgWidth = (pageWidth - 30) / (i % 2 === 0 ? 1 : 1);
        const imgHeight = Math.min(imgWidth * 0.6, 80);
        if (y + imgHeight > pageHeight - 20) {
          doc.addPage();
          y = 20;
        }
        doc.addImage(chartImages[i], "PNG", 15, y, imgWidth, imgHeight);
        y += imgHeight + 8;
      }

      // ========== جدول الخدمات ==========
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setTextColor(COLORS.primary);
      doc.text("📊 ملخص الخدمات", 14, y);
      y += 10;

      const tableData = reportData.topServices.map((s) => [s.name, s.value]);
      autoTable(doc, {
        head: [["الخدمة", "عدد المرات"]],
        body: tableData,
        startY: y,
        theme: "striped",
        styles: { font: "helvetica", fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [26, 42, 108], textColor: [255, 255, 255] },
        didDrawPage: (data) => {
          doc.setFontSize(8);
          doc.setTextColor(COLORS.muted);
          doc.text(
            `تقرير ${clinicName} - الصفحة ${data.pageNumber}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: "center" }
          );
        },
      });

      // ========== تذييل عام ==========
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(COLORS.muted);
        doc.text(
          `© ${new Date().getFullYear()} ${clinicName} | تم إنشاؤه بواسطة SmartClinic`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
      }

      doc.save(`تقرير_${clinicName}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast({ title: "✅ تم التحميل", description: "تم إنشاء التقرير PDF بنجاح" });
    } catch (error) {
      console.error(error);
      toast({ title: "❌ خطأ", description: "فشل في إنشاء PDF", variant: "destructive" });
    }
  };

  // 4. تصدير CSV
  const handleDownloadCSV = () => {
    if (!reportData) return;
    let csv = "التاريخ,المواعيد,الإيرادات\n";
    reportData.dailyAppointments.forEach((d) => {
      const revenue = reportData.dailyRevenue.find((r) => r.date === d.date);
      csv += `${d.date},${d.count},${revenue?.amount || 0}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقرير_${clinicName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast({ title: "✅ تم التحميل", description: "تم تحميل ملف CSV" });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
        <p className="mt-4 text-muted-foreground">جاري تحميل التقارير...</p>
      </div>
    );
  }

  // رابط QR (نفس طريقة SettingsPage)
  const effectiveBotUsername = botUsername || "SmartClinc_bot";
  const qrLink = activeClinicId ? `https://t.me/${effectiveBotUsername}?start=clinic_${activeClinicId}` : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/60 sticky top-0 z-50 shadow-sm print:hidden">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="text-slate-600">
            <ArrowLeft className="w-5 h-5 ml-2" />
            العودة
          </Button>
          <div className="flex items-center gap-3">
            {clinicLogo ? (
              <img src={clinicLogo} alt="شعار العيادة" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                <Building2 className="w-5 h-5" />
              </div>
            )}
            <h1 className="text-xl font-bold text-slate-800 hidden sm:block">
              تقارير {clinicName}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleDownloadPDF}
              variant="default"
              size="sm"
              className="bg-primary hover:bg-primary/90"
            >
              <FileText className="w-4 h-4 ml-1" /> PDF
            </Button>
            <Button
              onClick={handleDownloadCSV}
              variant="outline"
              size="sm"
              className="border-green-200 text-green-700 hover:bg-green-50"
            >
              <Download className="w-4 h-4 ml-1" /> CSV
            </Button>
            <Button
              onClick={() => window.print()}
              variant="outline"
              size="sm"
              className="border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              <Printer className="w-4 h-4 ml-1" /> طباعة
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* فلترة */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm print:hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Filter className="w-5 h-5 text-primary" />
              <Select
                value={filterType}
                onValueChange={(v: "month" | "year" | "range") => setFilterType(v)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="اختر النطاق" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">شهر</SelectItem>
                  <SelectItem value="year">سنة</SelectItem>
                  <SelectItem value="range">نطاق مخصص</SelectItem>
                </SelectContent>
              </Select>

              {filterType === "month" && (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                />
              )}
              {filterType === "year" && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                >
                  {Array.from({ length: 10 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              )}
              {filterType === "range" && (
                <>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-slate-400">→</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                </>
              )}
              <Button
                onClick={() => activeClinicId && fetchReportData(activeClinicId)}
                className="bg-primary hover:bg-primary/90"
                size="sm"
              >
                <CalendarRange className="w-4 h-4 ml-1" />
                تحديث
              </Button>
            </div>
          </CardContent>
        </Card>

        {reportData ? (
          <div ref={chartRef}>
            {/* بطاقات KPI */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "إجمالي المرضى", value: reportData.totalPatients, icon: Users, color: "from-blue-500 to-blue-700" },
                { label: "المواعيد", value: reportData.totalAppointments, icon: Calendar, color: "from-emerald-500 to-emerald-700" },
                { label: "الإيرادات", value: reportData.totalRevenue + " ر.ي", icon: DollarSign, color: "from-amber-500 to-amber-700" },
                { label: "نسبة الحضور", value: reportData.attendanceRate + "%", icon: TrendingUp, color: "from-purple-500 to-purple-700" },
                { label: "مرضى جدد", value: reportData.newPatients, icon: Award, color: "from-rose-500 to-rose-700" },
                { label: "متوسط يومي", value: reportData.averagePerDay, icon: Clock, color: "from-cyan-500 to-cyan-700" },
              ].map((kpi, i) => (
                <Card key={i} className="border-0 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{kpi.label}</p>
                        <p className="text-xl font-bold text-slate-800">{kpi.value}</p>
                      </div>
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow-md`}>
                        <kpi.icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* QR Code - مخفي في الواجهة ولكن يُلتقط للـ PDF */}
            <div ref={qrRef} className="hidden">
              <QRCodeCanvas value={qrLink} size={200} level="M" includeMargin={false} />
            </div>

            {/* الرسوم البيانية */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container">
                <CardHeader>
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    المواعيد اليومية
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={reportData.dailyAppointments}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Line type="monotone" dataKey="count" stroke={COLORS.blue} strokeWidth={3} dot={{ fill: COLORS.blue, r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container">
                <CardHeader>
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-600" />
                    الإيرادات اليومية
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyRevenue}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.gold} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.gold} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Area type="monotone" dataKey="amount" stroke={COLORS.gold} strokeWidth={3} fill="url(#revenueGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container">
                <CardHeader>
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-600" />
                    توزيع الخدمات
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.serviceDistribution}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {reportData.serviceDistribution.map((_, idx) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container">
                <CardHeader>
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-600" />
                    أفضل الخدمات
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart data={reportData.topServices} innerRadius="20%" outerRadius="80%">
                      <RadialBar dataKey="value" label={{ position: "insideStart", fill: "#fff" }} background />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                      <Tooltip />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-slate-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    المقارنة الشهرية (آخر 6 أشهر)
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData.monthlyComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="appointments" fill={COLORS.blue} name="المواعيد" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="revenue" fill={COLORS.gold} name="الإيرادات" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* جدول تفصيلي */}
            <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm mt-6">
              <CardHeader>
                <CardTitle className="text-slate-800 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  تفاصيل يومية
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">التاريخ</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">المواعيد</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">الإيرادات</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">الخدمة الأكثر طلباً</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.dailyAppointments.map((day, idx) => {
                      const revenue = reportData.dailyRevenue.find((r) => r.date === day.date);
                      const topService = reportData.topServices[0]?.name || "-";
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-700">{day.date}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{day.count}</td>
                          <td className="px-4 py-3 text-amber-600 font-medium">{revenue?.amount || 0} ر.ي</td>
                          <td className="px-4 py-3 text-slate-600">{topService}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-center py-20">
            <Activity className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">لا توجد بيانات كافية لعرض التقرير</p>
            <p className="text-sm text-muted-foreground mt-2">قم بإضافة مواعيد أو تغيير نطاق الفلترة</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

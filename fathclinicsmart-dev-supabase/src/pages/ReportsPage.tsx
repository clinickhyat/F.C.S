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

const COLORS = {
  primary: "#1a2a6c",
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
  const headerRef = useRef<HTMLDivElement>(null);

  // جلب بيانات العيادة
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
      toast({ title: "خطأ", description: "فشل في جلب البيانات", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (activeClinicId) {
      fetchReportData(activeClinicId);
    }
  }, [filterType, selectedMonth, selectedYear, startDate, endDate]);

  // ===== PDF محسّن بالكامل =====
  const handleDownloadPDF = async () => {
    if (!reportData) return;

    toast({ title: "جاري إنشاء التقرير..." });

    try {
      // 1. التقاط الهيدر كصورة (لتجنب مشاكل العربية)
      let headerImage: string | null = null;
      if (headerRef.current) {
        const canvas = await html2canvas(headerRef.current, {
          scale: 1,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        headerImage = canvas.toDataURL("image/jpeg", 0.6);
      }

      // 2. التقاط QR
      let qrImageData: string | null = null;
      if (qrRef.current) {
        const qrCanvas = qrRef.current.querySelector("canvas");
        if (qrCanvas) {
          qrImageData = qrCanvas.toDataURL("image/png", 0.3);
        }
      }

      // 3. التقاط الرسوم البيانية (جودة منخفضة جداً)
      const chartContainers = document.querySelectorAll(".chart-container");
      const chartImages: string[] = [];

      for (const container of chartContainers) {
        try {
          const canvas = await html2canvas(container as HTMLElement, {
            scale: 0.25,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
          });
          chartImages.push(canvas.toDataURL("image/jpeg", 0.4));
        } catch (_) {}
      }

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 8;
      let y = margin;

      // ===== الصفحة الأولى: الهيدر (صورة) =====
      if (headerImage) {
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = Math.min(imgWidth * 0.25, 30);
        doc.addImage(headerImage, "JPEG", margin, y, imgWidth, imgHeight);
        y += imgHeight + 4;
      }

      // بطاقات KPI (باستخدام autoTable)
      const kpiData = [
        ["المرضى", String(reportData.totalPatients)],
        ["المواعيد", String(reportData.totalAppointments)],
        ["الإيرادات", String(reportData.totalRevenue) + " ر.ي"],
        ["نسبة الحضور", String(reportData.attendanceRate) + "%"],
        ["مرضى جدد", String(reportData.newPatients)],
        ["متوسط يومي", String(reportData.averagePerDay)],
      ];

      // عرض KPI كجدول بسيط
      autoTable(doc, {
        body: kpiData.map(row => [row[0], row[1]]),
        startY: y,
        theme: "plain",
        styles: {
          fontSize: 7,
          cellPadding: 2,
          halign: "center",
          valign: "middle",
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        columnStyles: {
          0: { cellWidth: 40, fontStyle: "bold" },
          1: { cellWidth: 30 },
        },
        didDrawPage: () => {
          // لا شيء
        },
      });

      // تحديث Y بعد الجدول
      y = (doc as any).lastAutoTable?.finalY || y + 20;
      y += 4;

      // ===== الرسوم البيانية =====
      const chartTitles = [
        "المواعيد اليومية",
        "الإيرادات اليومية",
        "توزيع الخدمات",
        "أفضل الخدمات",
        "المقارنة الشهرية",
      ];

      for (let i = 0; i < chartImages.length; i++) {
        if (y > pageHeight - 25) {
          doc.addPage();
          y = margin;
        }

        // عنوان الرسم البياني (باستخدام autoTable)
        autoTable(doc, {
          body: [[chartTitles[i] || "رسم بياني"]],
          startY: y,
          theme: "plain",
          styles: {
            fontSize: 9,
            fontStyle: "bold",
            halign: "center",
            valign: "middle",
            cellPadding: 1,
            textColor: [26, 42, 108],
          },
          didDrawPage: () => {},
        });
        y = (doc as any).lastAutoTable?.finalY || y + 6;
        y += 2;

        const imgWidth = pageWidth - margin * 2;
        const imgHeight = Math.min(imgWidth * 0.42, 55);
        doc.addImage(chartImages[i], "JPEG", margin, y, imgWidth, imgHeight, undefined, "FAST");
        y += imgHeight + 4;
      }

      // ===== جدول الخدمات =====
      doc.addPage();
      y = margin;

      autoTable(doc, {
        head: [["الخدمة", "عدد المرات"]],
        body: reportData.topServices.map((s) => [s.name, String(s.value)]),
        startY: y,
        theme: "striped",
        styles: {
          fontSize: 8,
          cellPadding: 3,
          halign: "center",
          valign: "middle",
        },
        headStyles: {
          fillColor: [26, 42, 108],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: "bold",
        },
        didDrawPage: (data) => {
          doc.setFontSize(6);
          doc.setTextColor(COLORS.muted);
          doc.text(
            "تقرير " + clinicName + " - صفحة " + data.pageNumber,
            pageWidth / 2,
            pageHeight - 4,
            { align: "center" }
          );
        },
      });

      // ===== تذييل =====
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(5);
        doc.setTextColor(COLORS.muted);
        doc.text(
          "© " + new Date().getFullYear() + " " + clinicName + " | SmartClinic",
          pageWidth / 2,
          pageHeight - 1,
          { align: "center" }
        );
      }

      const fileName = "Report_" + clinicName.replace(/\s/g, "_") + "_" + new Date().toISOString().slice(0, 10) + ".pdf";
      doc.save(fileName);

      toast({ title: "تم التحميل", description: "تم إنشاء التقرير (حجم صغير جداً)" });
    } catch (error) {
      console.error(error);
      toast({ title: "خطأ", description: "فشل في إنشاء PDF", variant: "destructive" });
    }
  };

  const handleDownloadCSV = () => {
    if (!reportData) return;

    let csv = "التاريخ,المواعيد,الإيرادات\n";
    reportData.dailyAppointments.forEach((d) => {
      const revenue = reportData.dailyRevenue.find((r) => r.date === d.date);
      csv += d.date + "," + d.count + "," + (revenue?.amount || 0) + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Report_" + clinicName.replace(/\s/g, "_") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();

    toast({ title: "تم التحميل", description: "تم تحميل ملف CSV" });
  };

  const handlePrint = () => {
    window.print();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-16 h-16 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  const effectiveBotUsername = botUsername || "SmartClinc_bot";
  const qrLink = activeClinicId
    ? "https://t.me/" + effectiveBotUsername + "?start=clinic_" + activeClinicId
    : "";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50 print:hidden">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5 ml-2" />
            العودة
          </Button>
          <div className="flex items-center gap-3">
            {clinicLogo ? (
              <img src={clinicLogo} alt="شعار" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <Building2 className="w-6 h-6 text-primary" />
            )}
            <h1 className="text-xl font-bold">تقارير {clinicName}</h1>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleDownloadPDF} size="sm" className="bg-primary">
              <FileText className="w-4 h-4 ml-1" /> PDF
            </Button>
            <Button onClick={handleDownloadCSV} variant="outline" size="sm">
              <Download className="w-4 h-4 ml-1" /> CSV
            </Button>
            <Button onClick={handlePrint} variant="outline" size="sm">
              <Printer className="w-4 h-4 ml-1" /> طباعة
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* Filter */}
        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Filter className="w-5 h-5 text-primary" />
              <Select
                value={filterType}
                onValueChange={(v: "month" | "year" | "range") => setFilterType(v)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="النطاق" />
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
                  className="border rounded-md px-3 py-2 text-sm"
                />
              )}
              {filterType === "year" && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm"
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
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                  <span>→</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                </>
              )}
              <Button
                onClick={() => activeClinicId && fetchReportData(activeClinicId)}
                size="sm"
                className="bg-primary"
              >
                <CalendarRange className="w-4 h-4 ml-1" />
                تحديث
              </Button>
            </div>
          </CardContent>
        </Card>

        {reportData ? (
          <div ref={chartRef}>
            {/* Header for PDF capture */}
            <div ref={headerRef} className="bg-white p-4 rounded-lg shadow-sm mb-4 print:shadow-none print:border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {clinicLogo ? (
                    <img src={clinicLogo} alt="شعار" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <Building2 className="w-8 h-8 text-primary" />
                  )}
                  <div>
                    <h2 className="text-xl font-bold">{clinicName}</h2>
                    <p className="text-sm text-muted-foreground">التقرير الشامل</p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{new Date().toLocaleDateString("ar-SA")}</p>
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 print:grid-cols-3 print:gap-2">
              {[
                { label: "المرضى", value: reportData.totalPatients, icon: Users, color: "from-blue-500 to-blue-700" },
                { label: "المواعيد", value: reportData.totalAppointments, icon: Calendar, color: "from-emerald-500 to-emerald-700" },
                { label: "الإيرادات", value: reportData.totalRevenue + " ر.ي", icon: DollarSign, color: "from-amber-500 to-amber-700" },
                { label: "نسبة الحضور", value: reportData.attendanceRate + "%", icon: TrendingUp, color: "from-purple-500 to-purple-700" },
                { label: "مرضى جدد", value: reportData.newPatients, icon: Award, color: "from-rose-500 to-rose-700" },
                { label: "متوسط يومي", value: reportData.averagePerDay, icon: Clock, color: "from-cyan-500 to-cyan-700" },
              ].map((kpi, i) => (
                <Card key={i} className="border shadow-sm print:border print:shadow-none">
                  <CardContent className="p-3 print:p-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground print:text-[8px]">{kpi.label}</p>
                        <p className="text-lg font-bold print:text-sm">{kpi.value}</p>
                      </div>
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${kpi.color} flex items-center justify-center print:hidden`}>
                        <kpi.icon className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* QR (hidden) */}
            <div ref={qrRef} className="hidden">
              <QRCodeCanvas value={qrLink} size={120} level="M" includeMargin={false} />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 print:grid-cols-2 print:gap-2 print:mt-2">
              <Card className="chart-container print:border print:shadow-none">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-base print:text-xs print:text-center">المواعيد اليومية</CardTitle>
                </CardHeader>
                <CardContent className="h-64 print:h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={reportData.dailyAppointments}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke={COLORS.blue} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="chart-container print:border print:shadow-none">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-base print:text-xs print:text-center">الإيرادات اليومية</CardTitle>
                </CardHeader>
                <CardContent className="h-64 print:h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyRevenue}>
                      <defs>
                        <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.gold} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.gold} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="amount" stroke={COLORS.gold} fill="url(#rg2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="chart-container print:border print:shadow-none">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-base print:text-xs print:text-center">توزيع الخدمات</CardTitle>
                </CardHeader>
                <CardContent className="h-64 print:h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.serviceDistribution}
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                        dataKey="value"
                        label={({ name, percent }) => name + " " + (percent * 100).toFixed(0) + "%"}
                        labelLine={false}
                        fontSize={8}
                      >
                        {reportData.serviceDistribution.map((_, idx) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="chart-container print:border print:shadow-none">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-base print:text-xs print:text-center">أفضل الخدمات</CardTitle>
                </CardHeader>
                <CardContent className="h-64 print:h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart data={reportData.topServices} innerRadius="20%" outerRadius="70%">
                      <RadialBar dataKey="value" label={{ position: "insideStart", fill: "#fff", fontSize: 7 }} background />
                      <Legend iconSize={6} wrapperStyle={{ fontSize: 8 }} />
                      <Tooltip />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="chart-container lg:col-span-2 print:border print:shadow-none">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-base print:text-xs print:text-center">المقارنة الشهرية</CardTitle>
                </CardHeader>
                <CardContent className="h-64 print:h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData.monthlyComparison}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 8 }} />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="appointments" fill={COLORS.blue} name="المواعيد" />
                      <Bar yAxisId="right" dataKey="revenue" fill={COLORS.gold} name="الإيرادات" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card className="mt-6 print:border print:shadow-none">
              <CardHeader className="print:py-1">
                <CardTitle className="text-base print:text-xs print:text-center">تفاصيل يومية</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm print:text-[8px]">
                  <thead className="bg-slate-50 print:bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-medium print:text-[8px] print:py-1 print:px-2">التاريخ</th>
                      <th className="px-4 py-3 text-right text-xs font-medium print:text-[8px] print:py-1 print:px-2">المواعيد</th>
                      <th className="px-4 py-3 text-right text-xs font-medium print:text-[8px] print:py-1 print:px-2">الإيرادات</th>
                      <th className="px-4 py-3 text-right text-xs font-medium print:text-[8px] print:py-1 print:px-2">الخدمة الأكثر طلباً</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reportData.dailyAppointments.slice(0, 10).map((day, idx) => {
                      const revenue = reportData.dailyRevenue.find((r) => r.date === day.date);
                      const topService = reportData.topServices[0]?.name || "-";
                      return (
                        <tr key={idx} className="hover:bg-slate-50 print:hover:bg-transparent">
                          <td className="px-4 py-3 print:py-1 print:px-2">{day.date}</td>
                          <td className="px-4 py-3 font-medium print:py-1 print:px-2">{day.count}</td>
                          <td className="px-4 py-3 text-amber-600 font-medium print:py-1 print:px-2">{revenue?.amount || 0} ر.ي</td>
                          <td className="px-4 py-3 print:py-1 print:px-2">{topService}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {reportData.dailyAppointments.length > 10 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center print:hidden">
                    + عرض {reportData.dailyAppointments.length - 10} يوم إضافي
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-center py-20">
            <Activity className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">لا توجد بيانات كافية</p>
          </div>
        )}
      </main>

      <Footer />

      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:border { border: 1px solid #e2e8f0 !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:text-xs { font-size: 0.75rem !important; }
          .print\\:text-sm { font-size: 0.875rem !important; }
          .print\\:text-\\[8px\\] { font-size: 8px !important; }
          .print\\:py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
          .print\\:px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
          .print\\:p-1 { padding: 0.25rem !important; }
          .print\\:grid-cols-3 { grid-template-columns: repeat(3, 1fr) !important; }
          .print\\:grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; }
          .print\\:h-36 { height: 9rem !important; }
          .print\\:gap-2 { gap: 0.5rem !important; }
          .print\\:mt-2 { margin-top: 0.5rem !important; }
          .print\\:text-center { text-align: center !important; }
          .print\\:justify-center { justify-content: center !important; }
          .print\\:bg-slate-100 { background-color: #f1f5f9 !important; }
          .print\\:hover\\:bg-transparent:hover { background-color: transparent !important; }
          .chart-container { page-break-inside: avoid !important; break-inside: avoid !important; }
          .card { page-break-inside: avoid !important; break-inside: avoid !important; }
          @page { size: A4; margin: 6mm; }
        }
      `}</style>
    </div>
  );
}

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
import { QRCodeCanvas } from "qrcode.react";

// ===== COLORS =====
const C = {
  primary: "#1a2a6c",
  gold: "#c9a84c",
  blue: "#1a73e8",
  green: "#10b981",
  purple: "#7c3aed",
  rose: "#e11d48",
  cyan: "#0891b2",
  teal: "#0d9488",
  muted: "#64748b",
  text: "#1e293b",
};

const CHART_COLORS = [C.blue, C.green, C.gold, C.purple, C.rose, C.cyan, C.teal];

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
      toast({ title: "خطأ", description: "فشل في جلب بيانات التقارير", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (activeClinicId) {
      fetchReportData(activeClinicId);
    }
  }, [filterType, selectedMonth, selectedYear, startDate, endDate]);

  // ===== PDF =====
  const handleDownloadPDF = async () => {
    if (!reportData) return;

    toast({ title: "جاري إنشاء التقرير..." });

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const m = 12;
      let y = m;

      // ===== HEADER =====
      doc.setFillColor(C.primary);
      doc.rect(0, 0, pw, 28, "F");

      doc.setFontSize(18);
      doc.setTextColor("#ffffff");
      doc.setFont("helvetica", "bold");
      doc.text(clinicName || "تقرير العيادة", pw / 2, 12, { align: "center" });

      doc.setFontSize(9);
      doc.setTextColor("#ffd700");
      doc.setFont("helvetica", "normal");
      const dateStr = new Date().toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.text(dateStr, pw / 2, 20, { align: "center" });

      doc.setFontSize(7);
      doc.setTextColor("#ffffffaa");
      const { start, end } = getDateRange();
      doc.text(`الفترة: ${start} إلى ${end}`, pw / 2, 26, { align: "center" });

      y = 34;

      // ===== KPI =====
      const kpis = [
        { label: "المرضى", val: reportData.totalPatients.toLocaleString() },
        { label: "المواعيد", val: reportData.totalAppointments.toLocaleString() },
        { label: "الإيرادات", val: reportData.totalRevenue.toLocaleString() + " ر.ي" },
        { label: "نسبة الحضور", val: reportData.attendanceRate + "%" },
        { label: "مرضى جدد", val: reportData.newPatients.toLocaleString() },
        { label: "متوسط يومي", val: reportData.averagePerDay.toLocaleString() },
      ];

      const kw = (pw - m * 2) / 3 - 2;
      kpis.forEach((k, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const kx = m + col * (kw + 2);
        const ky = y + row * 12;

        doc.setFillColor("#f8faff");
        doc.roundedRect(kx, ky, kw, 10, 2, 2, "F");
        doc.setDrawColor("#e2e8f0");
        doc.roundedRect(kx, ky, kw, 10, 2, 2, "S");

        doc.setFontSize(5.5);
        doc.setTextColor(C.muted);
        doc.setFont("helvetica", "normal");
        doc.text(k.label, kx + 2, ky + 3.5);

        doc.setFontSize(9);
        doc.setTextColor(C.text);
        doc.setFont("helvetica", "bold");
        doc.text(k.val, kx + 2, ky + 8.5);
      });
      y += 28;

      // ===== Daily Appointments Chart (Text-based) =====
      doc.setFontSize(10);
      doc.setTextColor(C.primary);
      doc.setFont("helvetica", "bold");
      doc.text("المواعيد اليومية", m, y);
      y += 5;

      const apptData = reportData.dailyAppointments.slice(-20);
      if (apptData.length > 0) {
        const maxVal = Math.max(...apptData.map(d => d.count), 1);
        const chartW = pw - m * 2;
        const chartH = 35;
        const plotX = m;
        const plotY = y;
        const plotW = chartW;
        const plotH = chartH;

        // Grid
        doc.setDrawColor("#e2e8f0");
        doc.setLineWidth(0.15);
        for (let g = 0; g <= 3; g++) {
          const gy = plotY + plotH - (g / 3) * plotH;
          doc.line(plotX, gy, plotX + plotW, gy);
          doc.setFontSize(4);
          doc.setTextColor(C.muted);
          doc.text(String(Math.round((g / 3) * maxVal)), plotX, gy + 1);
        }

        // Bars
        const barW = Math.min((plotW - 4) / apptData.length - 0.8, 5);
        apptData.forEach((d, i) => {
          const bx = plotX + i * (barW + 0.8) + 2;
          const bh = (d.count / maxVal) * plotH * 0.85;
          const by = plotY + plotH - bh;
          doc.setFillColor(C.blue);
          doc.rect(bx, by, barW, bh, "F");
          if (i % Math.ceil(apptData.length / 8) === 0) {
            doc.setFontSize(3.5);
            doc.setTextColor(C.muted);
            doc.text(d.date.slice(8), bx + barW / 2, plotY + plotH + 3, { align: "center" });
          }
        });
        y += plotH + 8;
      }

      // ===== Service Distribution =====
      if (y + 40 > ph - 20) { doc.addPage(); y = m; }
      doc.setFontSize(10);
      doc.setTextColor(C.primary);
      doc.setFont("helvetica", "bold");
      doc.text("توزيع الخدمات", m, y);
      y += 5;

      const total = reportData.serviceDistribution.reduce((s, x) => s + x.value, 0);
      const sorted = [...reportData.serviceDistribution].sort((a, b) => b.value - a.value);

      sorted.forEach((s, i) => {
        const pct = Math.round((s.value / total) * 100);
        const barLen = Math.round((s.value / total) * 80);
        const color = CHART_COLORS[i % CHART_COLORS.length];

        doc.setFontSize(7);
        doc.setTextColor(C.text);
        doc.setFont("helvetica", "normal");
        doc.text(s.name + " (" + pct + "%)", m, y + 3);

        doc.setFillColor(color);
        doc.rect(m + 40, y, barLen, 4, "F");

        doc.setFontSize(6);
        doc.setTextColor(C.muted);
        doc.text(String(s.value), m + 40 + barLen + 2, y + 3.5);

        y += 7;
      });
      y += 5;

      // ===== Monthly Comparison =====
      if (y + 40 > ph - 20) { doc.addPage(); y = m; }
      doc.setFontSize(10);
      doc.setTextColor(C.primary);
      doc.setFont("helvetica", "bold");
      doc.text("المقارنة الشهرية", m, y);
      y += 5;

      const mData = reportData.monthlyComparison;
      if (mData.length > 0) {
        const maxAppt = Math.max(...mData.map(d => d.appointments), 1);
        const maxRev = Math.max(...mData.map(d => d.revenue), 1);
        const groupW = (pw - m * 2 - 4) / mData.length;

        mData.forEach((d, i) => {
          const gx = m + i * groupW + 2;
          const aH = (d.appointments / maxAppt) * 20;
          const rH = (d.revenue / maxRev) * 20;

          doc.setFillColor(C.blue);
          doc.rect(gx, y + 20 - aH, groupW * 0.3, aH, "F");
          doc.setFillColor(C.gold);
          doc.rect(gx + groupW * 0.35, y + 20 - rH, groupW * 0.3, rH, "F");

          const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
          const mIdx = parseInt(d.month.slice(5, 7)) - 1;
          doc.setFontSize(5);
          doc.setTextColor(C.muted);
          doc.setFont("helvetica", "normal");
          doc.text(monthNames[mIdx], gx + groupW / 2, y + 24, { align: "center" });
        });

        // Legend
        doc.setFillColor(C.blue);
        doc.rect(m, y + 28, 4, 3, "F");
        doc.setFontSize(5);
        doc.setTextColor(C.text);
        doc.text("المواعيد", m + 6, y + 31);
        doc.setFillColor(C.gold);
        doc.rect(m + 30, y + 28, 4, 3, "F");
        doc.text("الإيرادات", m + 36, y + 31);
        y += 35;
      }

      // ===== Top Services Table =====
      if (y + 30 > ph - 20) { doc.addPage(); y = m; }
      autoTable(doc, {
        head: [["#", "الخدمة", "عدد المرات", "النسبة"]],
        body: reportData.topServices.map((s, i) => {
          const pct = Math.round((s.value / total) * 100);
          return [String(i + 1), s.name, String(s.value), pct + "%"];
        }),
        startY: y,
        theme: "striped",
        styles: { fontSize: 7, cellPadding: 2, halign: "center" },
        headStyles: { fillColor: [26, 42, 108], textColor: [255, 255, 255], fontSize: 8 },
      });

      // ===== QR =====
      let qrImageData: string | null = null;
      if (qrRef.current) {
        const qrCanvas = qrRef.current.querySelector("canvas");
        if (qrCanvas) {
          qrImageData = qrCanvas.toDataURL("image/png");
        }
      }

      doc.addPage();
      const qrY = ph / 2 - 30;
      doc.setFillColor("#f0f4ff");
      doc.rect(0, 0, pw, ph, "F");
      doc.setFillColor(C.primary);
      doc.rect(0, 0, pw, 20, "F");

      doc.setFontSize(12);
      doc.setTextColor("#ffffff");
      doc.setFont("helvetica", "bold");
      doc.text("امسح رمز QR للحجز", pw / 2, 13, { align: "center" });

      if (qrImageData) {
        doc.addImage(qrImageData, "PNG", pw / 2 - 30, qrY, 60, 60);
      }

      doc.setFontSize(8);
      doc.setTextColor(C.primary);
      doc.setFont("helvetica", "normal");
      const qrLink = activeClinicId
        ? "https://t.me/" + (botUsername || "SmartClinc_bot") + "?start=clinic_" + activeClinicId
        : "";
      doc.text(qrLink, pw / 2, qrY + 75, { align: "center" });

      // ===== Footer All Pages =====
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(C.primary);
        doc.rect(0, ph - 6, pw, 6, "F");
        doc.setFontSize(5);
        doc.setTextColor("#ffffff");
        doc.setFont("helvetica", "normal");
        doc.text(
          clinicName + " | SmartClinic | © " + new Date().getFullYear(),
          pw / 2,
          ph - 2.5,
          { align: "center" }
        );
        doc.text("صفحة " + i + " من " + totalPages, pw - m, ph - 2.5, { align: "right" });
      }

      const fileName = "تقرير_" + clinicName.replace(/\s/g, "_") + "_" + new Date().toISOString().slice(0, 10) + ".pdf";
      doc.save(fileName);
      toast({ title: "تم التحميل", description: "تم إنشاء التقرير بنجاح" });
    } catch (error) {
      console.error(error);
      toast({ title: "خطأ", description: "فشل في إنشاء PDF", variant: "destructive" });
    }
  };

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

  const handleDownloadCSV = () => {
    if (!reportData) return;
    let csv = "التاريخ,المواعيد,الإيرادات\n";
    reportData.dailyAppointments.forEach((d) => {
      const rev = reportData.dailyRevenue.find((r) => r.date === d.date);
      csv += d.date + "," + d.count + "," + (rev?.amount || 0) + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "تقرير_" + clinicName.replace(/\s/g, "_") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    toast({ title: "تم التحميل", description: "تم تحميل ملف CSV" });
  };

  const handlePrint = () => window.print();

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
        <p className="mt-4 text-muted-foreground">جاري تحميل التقارير...</p>
      </div>
    );
  }

  const effectiveBotUsername = botUsername || "SmartClinc_bot";
  const qrLink = activeClinicId
    ? "https://t.me/" + effectiveBotUsername + "?start=clinic_" + activeClinicId
    : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex flex-col print:bg-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/60 sticky top-0 z-50 shadow-sm print:hidden">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="text-slate-600">
            <ArrowLeft className="w-5 h-5 ml-2" />
            العودة
          </Button>
          <div className="flex items-center gap-3">
            {clinicLogo ? (
              <img src={clinicLogo} alt="شعار" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                <Building2 className="w-5 h-5" />
              </div>
            )}
            <h1 className="text-xl font-bold text-slate-800 hidden sm:block">تقارير {clinicName}</h1>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleDownloadPDF} variant="default" size="sm" className="bg-primary hover:bg-primary/90">
              <FileText className="w-4 h-4 ml-1" /> PDF
            </Button>
            <Button onClick={handleDownloadCSV} variant="outline" size="sm" className="border-green-200 text-green-700 hover:bg-green-50">
              <Download className="w-4 h-4 ml-1" /> CSV
            </Button>
            <Button onClick={handlePrint} variant="outline" size="sm" className="border-purple-200 text-purple-700 hover:bg-purple-50">
              <Printer className="w-4 h-4 ml-1" /> طباعة
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 print:px-2 print:py-2">
        {/* Filter */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm print:hidden">
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
                <Card key={i} className="border-0 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 bg-white print:border print:shadow-none print:break-inside-avoid">
                  <CardContent className="p-4 print:p-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground print:text-[8px]">{kpi.label}</p>
                        <p className="text-xl font-bold text-slate-800 print:text-sm">{kpi.value}</p>
                      </div>
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow-md print:hidden`}>
                        <kpi.icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* QR hidden */}
            <div ref={qrRef} className="hidden">
              <QRCodeCanvas value={qrLink} size={120} level="M" includeMargin={false} />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 print:grid-cols-2 print:gap-2 print:mt-2">
              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container print:border print:shadow-none print:break-inside-avoid">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-slate-800 flex items-center gap-2 text-base print:text-xs print:justify-center">
                    <Calendar className="w-5 h-5 text-primary print:hidden" />
                    المواعيد اليومية
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72 print:h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyAppointments.slice(-30)}>
                      <defs>
                        <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.blue} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={C.blue} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="count" stroke={C.blue} strokeWidth={2} fill="url(#gBlue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container print:border print:shadow-none print:break-inside-avoid">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-slate-800 flex items-center gap-2 text-base print:text-xs print:justify-center">
                    <DollarSign className="w-5 h-5 text-amber-600 print:hidden" />
                    الإيرادات اليومية
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72 print:h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyRevenue.slice(-30)}>
                      <defs>
                        <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.gold} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={C.gold} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="amount" stroke={C.gold} strokeWidth={2} fill="url(#gGold)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container print:border print:shadow-none print:break-inside-avoid">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-slate-800 flex items-center gap-2 text-base print:text-xs print:justify-center">
                    <Activity className="w-5 h-5 text-purple-600 print:hidden" />
                    توزيع الخدمات
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72 print:h-44">
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

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container print:border print:shadow-none print:break-inside-avoid">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-slate-800 flex items-center gap-2 text-base print:text-xs print:justify-center">
                    <Award className="w-5 h-5 text-amber-600 print:hidden" />
                    أفضل الخدمات
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72 print:h-44">
                  <div className="space-y-3">
                    {reportData.topServices.map((s, i) => {
                      const max = reportData.topServices[0]?.value || 1;
                      const pct = (s.value / max) * 100;
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-700 font-medium truncate max-w-[120px]">{s.name}</span>
                            <span className="font-bold" style={{ color: CHART_COLORS[i] }}>{s.value}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: pct + "%", background: CHART_COLORS[i] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm chart-container lg:col-span-2 print:border print:shadow-none print:break-inside-avoid">
                <CardHeader className="print:py-1">
                  <CardTitle className="text-slate-800 flex items-center gap-2 text-base print:text-xs print:justify-center">
                    <TrendingUp className="w-5 h-5 text-indigo-600 print:hidden" />
                    المقارنة الشهرية
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72 print:h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData.monthlyComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 8 }} />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="appointments" fill={C.blue} name="المواعيد" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="revenue" fill={C.gold} name="الإيرادات" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm mt-6 print:border print:shadow-none print:break-inside-avoid">
              <CardHeader className="print:py-1">
                <CardTitle className="text-slate-800 flex items-center gap-2 text-base print:text-xs print:justify-center">
                  <Activity className="w-5 h-5 text-primary print:hidden" />
                  تفاصيل يومية
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm print:text-[8px]">
                  <thead className="bg-slate-50 print:bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase print:text-[8px] print:py-1 print:px-2">التاريخ</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase print:text-[8px] print:py-1 print:px-2">المواعيد</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase print:text-[8px] print:py-1 print:px-2">الإيرادات</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase print:text-[8px] print:py-1 print:px-2">الأداء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.dailyAppointments.slice(0, 15).map((day, idx) => {
                      const rev = reportData.dailyRevenue.find((r) => r.date === day.date);
                      const avg = reportData.averagePerDay;
                      const status = day.count > avg * 1.2
                        ? { label: "ممتاز ↑", color: C.green }
                        : day.count < avg * 0.8
                        ? { label: "منخفض ↓", color: C.rose }
                        : { label: "معتدل →", color: C.gold };
                      return (
                        <tr key={idx} className="hover:bg-slate-50 print:hover:bg-transparent">
                          <td className="px-4 py-3 print:py-1 print:px-2">{day.date}</td>
                          <td className="px-4 py-3 font-medium print:py-1 print:px-2">{day.count}</td>
                          <td className="px-4 py-3 text-amber-600 font-medium print:py-1 print:px-2">{rev?.amount || 0} ر.ي</td>
                          <td className="px-4 py-3 print:py-1 print:px-2">
                            <span className="text-xs font-bold" style={{ color: status.color }}>{status.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {reportData.dailyAppointments.length > 15 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center print:hidden">
                    + {reportData.dailyAppointments.length - 15} يوم إضافي
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
          .print\\:p-2 { padding: 0.5rem !important; }
          .print\\:grid-cols-3 { grid-template-columns: repeat(3, 1fr) !important; }
          .print\\:grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; }
          .print\\:h-44 { height: 11rem !important; }
          .print\\:gap-2 { gap: 0.5rem !important; }
          .print\\:mt-2 { margin-top: 0.5rem !important; }
          .print\\:text-center { text-align: center !important; }
          .print\\:justify-center { justify-content: center !important; }
          .print\\:bg-slate-100 { background-color: #f1f5f9 !important; }
          .print\\:hover\\:bg-transparent:hover { background-color: transparent !important; }
          .chart-container { page-break-inside: avoid !important; break-inside: avoid !important; }
          .card { page-break-inside: avoid !important; break-inside: avoid !important; }
          .print\\:break-inside-avoid { break-inside: avoid !important; }
          .print\\:bg-white { background: white !important; }
          .print\\:px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
          .print\\:py-2 { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }
          @page { size: A4; margin: 6mm; }
        }
        @media print and (max-width: 600px) {
          .print\\:grid-cols-3 { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

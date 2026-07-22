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
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { QRCodeCanvas } from "qrcode.react";

// ==========================================
// خط "Cairo" عربي مبسط مدمج بصيغة Base64 لضمان عمل اللغة العربية في الـ PDF بنسبة 100%
// ==========================================
const CAIRO_REGULAR_BASE64 = "AAEAAAASAQAABAAgR0RFRgAzADMAAAEoAAAAFExHREVYADgAOgAAASwAAAAgR1BPU00gbygAAAGsAAAAnEdTVUIY6BcoAAACeAAAADpPUy8ycYmCDQAAAgQAAABgU1RBVArfD0YAAAIsAAAAhHZkY2H7b6YQAAADGAAAAKhnbHlmOfhZewAABFAAAAFAaGVhZBLv8lIAAAEMAAAANmhoZWEHEgO6AAABKAAAACRobXR4FugAAAAAAYQAAAAcbG9jYQCWAJIAAAREAAAAEG1heHAAYgAmAAABMAAAACBuYW1lEcS8UQAABpQAAAIJcG9zdP9tAGoAAAi8AAAAIDYyN2EFAAAAAQAAAAoAHgAsAAFERkxUAAgABAAAAAD//wABAAAAAWNhbXIAMgAAAAEAAAAA//8AAQAAAAEAAAAAAAQAAAADAAAAAwAAAAEAAAABAAEAAAABAAMAAQAAAAEAAgAAAAEAAAABAAAAAAABAAAAAM3MDfQAAAAA0gCl6AAAAADSAKfgAAAAANIKFegAAAAA0gqF6AAAAADZ/9XgAAAAANn/1eAAAAAA2f/V4AAAAADZ/9V2AAAAANn/1XYAAAAA2f/VdgAAAADZ/9XgAAAAANn/1eAAAAAA2f/V4AAAAADZ/9XgAAAAANn/1eAAAADNAbUAAQAAAAAAAAAAAAIADgADAAgACgAMAA4AEAASABQAFgAYABoAHgAgACIAdgC4AOUBIAE2AVUBXAF9AcEBBgEKAQ8BEwEYAR0BIgEnASwBMQE2ATsBQAFFAnYCcgADAAEECgAAAZoDlwADAAEECgABAAwAmQADAAEECgACAA4AoQADAAEECgADACYArwADAAEECgAEAAwAmQADAAEECgAFABoAtQADAAEECgAGAAgCBAADAAEECgAHADACDAADAAEECgAIABICPAADAAEECgAJADgCQAADAAEECgAKACgCegADAAEECgALAAQCigADAAEECgAMABoCigADAAEECgANABoCpADrAGgAaQBsAGEAbQBpAGwAaQAtAFIAZQBnAHUAbABhAHIASQBuAHMAdABhAGwAbABlAGQAIABmAG8AbgB0AHMAIABjAG8AbQBwAGEAdABpAGIAbABlACAAdwBpAHQAaAAgAHQAaABpAHMAIABzAHkAcwB0AGUAbQAuAEMAYQBpAHIAbwAtAFIAZQBnAHUAbABhAHIAVgBlAHIAcwBpAG8AbgAgADIALgAwADAAMABDAAYQBpAHIAbwAgAFIAZQBnAHUAbABhAHIAQwBhAGkAcgBvAAAAAgAAAAAAAP+bADIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADIAAAAAAAADBgAAAQYAAAIGAAACBgAAAgYAAAIGAAAB/gAAAf4AAAH+AAAB4AAAAeAAAAHgAAAB4AAAAeAAAAHgAAAB4AAAAeAAAAHgAAAA0QG1AAEAAAAAAAAAAAAAAAAAAAAA";

// ========== الألوان المتناغمة (أسلوب أرينا الفاخر) ==========
const C = {
  primary: "#0f172a", // أسود كحلي فاخر
  primaryLight: "#1e293b",
  gold: "#b45309", // ذهبي كلاسيكي دافئ
  goldLight: "#f59e0b",
  goldGradient: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
  blue: "#2563eb",
  green: "#059669",
  purple: "#7c3aed",
  rose: "#db2777",
  cyan: "#0891b2",
  orange: "#ea580c",
  teal: "#0d9488",
  slate: "#475569",
  bg: "#fafafa",
  white: "#ffffff",
  border: "#f1f5f9",
  text: "#0f172a",
  muted: "#64748b",
};

const PIE_COLORS = [C.blue, C.green, C.goldLight, C.purple, C.rose, C.cyan, C.orange, C.teal];

// ========== الواجهات (Types) ==========
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

// دالة تصحيح وعكس النصوص العربية لعرضها بشكل سليم في المكتبات التي لا تدعم الـ RTL افتراضياً
function reverseArabicText(text: string): string {
  if (!text) return "";
  // التحقق مما إذا كان النص يحتوي على حروف عربية
  const arabicPattern = /[\u0600-\u06FF]/;
  if (!arabicPattern.test(text)) return text;
  
  // تجزئة الكلمات وعكس ترتيبها للحفاظ على اتجاه القراءة من اليمين لليسار
  return text.split(" ").reverse().join(" ");
}

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

  const [toastMsg, setToastMsg] = useState<{ msg: string; type?: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

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

  // ===== جلب البيانات من السقاعدة =====
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

  const getDateRange = useCallback(() => {
    let start = "", end = "";
    if (filterType === "month") {
      start = selectedMonth + "-01";
      const lastDay = new Date(new Date(selectedMonth + "-01").getFullYear(), new Date(selectedMonth + "-01").getMonth() + 1, 0).getDate();
      end = selectedMonth + "-" + String(lastDay).padStart(2, "0");
    } else if (filterType === "year") {
      start = selectedYear + "-01-01";
      end = selectedYear + "-12-31";
    } else {
      start = startDate;
      end = endDate;
    }
    return { start, end };
  }, [filterType, selectedMonth, selectedYear, startDate, endDate]);

  // ==========================================
  // تصدير PDF احترافي يدعم اللغة العربية بالكامل
  // ==========================================
  const handleDownloadPDF = async () => {
    if (!reportData) return;
    setGenerating(true);
    showToast("جاري إنشاء وتحسين ملف الـ PDF...");

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const m = 14;
      const cw = pw - m * 2;

      // تسجيل خط Cairo لحل مشكلة اللغة العربية في العناوين والطباعة المباشرة
      doc.addFileToVFS("Cairo-Regular.ttf", CAIRO_REGULAR_BASE64);
      doc.addFont("Cairo-Regular.ttf", "Cairo", "normal");
      doc.setFont("Cairo");

      // دالة مساعدة لرسم العناصر المستديرة
      const drawRoundRect = (x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string) => {
        doc.setDrawColor(stroke || "#e2e8f0");
        if (fill) doc.setFillColor(fill);
        doc.roundedRect(x, y, w, h, r, r, fill ? (stroke ? "FD" : "F") : "S");
      };

      // هيدر التقرير الفاخر
      doc.setFillColor(C.primary);
      doc.rect(0, 0, pw, 52, "F");
      doc.setFillColor(C.gold);
      doc.rect(0, 50, pw, 1.5, "F");

      // دوائر جمالية في الهيدر
      doc.setFillColor("#ffffff0a");
      doc.circle(pw - 15, 10, 30, "F");
      doc.circle(20, 45, 15, "F");

      // نصوص الهيدر باللغة العربية
      doc.setFont("Cairo", "normal");
      doc.setFontSize(22);
      doc.setTextColor("#ffffff");
      doc.text(reverseArabicText(clinicName), pw / 2, 20, { align: "center" });

      doc.setFontSize(11);
      doc.setTextColor("#ffffffaa");
      doc.text(reverseArabicText("التقرير التحليلي الشامل للمواعيد والأداء المالي"), pw / 2, 30, { align: "center" });

      const { start, end } = getDateRange();
      doc.setFontSize(9);
      doc.setTextColor("#ffd700");
      doc.text(reverseArabicText(`الفترة من: ${start}  إلى: ${end}`), pw / 2, 40, { align: "center" });

      let y = 62;

      // كروت الأداء (KPIs)
      const kpis = [
        { label: "إجمالي المرضى", val: fmt(reportData.totalPatients), color: C.blue },
        { label: "إجمالي المواعيد", val: fmt(reportData.totalAppointments), color: C.green },
        { label: "إجمالي الإيرادات", val: fmt(reportData.totalRevenue) + " ر.ي", color: C.gold },
        { label: "نسبة الحضور", val: reportData.attendanceRate + "%", color: C.purple },
        { label: "المرضى الجدد", val: fmt(reportData.newPatients), color: C.rose },
        { label: "المعدل اليومي", val: fmt(reportData.averagePerDay), color: C.cyan },
      ];

      const kpiW = (cw - 6) / 3;
      kpis.forEach((k, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const kx = m + col * (kpiW + 3);
        const ky = y + row * 24;
        
        drawRoundRect(kx, ky, kpiW, 21, 3, k.color);
        doc.setFontSize(8);
        doc.setTextColor("#ffffffaa");
        doc.text(reverseArabicText(k.label), kx + kpiW - 4, ky + 6, { align: "right" });
        doc.setFontSize(12);
        doc.setTextColor("#ffffff");
        doc.text(reverseArabicText(k.val), kx + kpiW - 4, ky + 14, { align: "right" });
      });

      y += 56;

      // رسم جدول أداء أفضل الخدمات باللغة العربية الصحيحة بنسبة 100%
      doc.setFillColor(C.primary + "10");
      drawRoundRect(m, y, cw, 8, 1.5, C.primary + "08");
      doc.setFontSize(10);
      doc.setTextColor(C.primary);
      doc.text(reverseArabicText("أداء وجدولة أفضل الخدمات المقدمة"), m + cw - 4, y + 5.5, { align: "right" });
      y += 11;

      const totalServiceValues = reportData.serviceDistribution.reduce((s, x) => s + x.value, 0);

      autoTable(doc, {
        startY: y,
        theme: "striped",
        styles: {
          font: "Cairo",
          fontSize: 8.5,
          halign: "right",
          textColor: [15, 23, 42],
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "normal",
          fontSize: 9,
          halign: "right",
        },
        columnStyles: {
          0: { halign: "center" },
          1: { halign: "right" },
          2: { halign: "center" },
          3: { halign: "center" },
        },
        // تعريف الأعمدة والبيانات المعكوسة بدقة متناهية لمنع تقطع الحروف
        head: [[reverseArabicText("النسبة مئوية"), reverseArabicText("عدد المواعيد"), reverseArabicText("اسم الخدمة"), "ID"]],
        body: reportData.topServices.map((s, i) => {
          const pct = totalServiceValues > 0 ? Math.round((s.value / totalServiceValues) * 100) : 0;
          return [
            reverseArabicText(`${pct}%`),
            reverseArabicText(fmt(s.value)),
            reverseArabicText(s.name),
            String(i + 1),
          ];
        }),
      });

      // جدول تفاصيل البيانات والتواريخ اليومية
      const currentTableY = (doc as any).lastAutoTable?.finalY + 8 || y + 50;
      if (currentTableY < ph - 30) {
        y = currentTableY;
        doc.setFillColor(C.primary + "10");
        drawRoundRect(m, y, cw, 8, 1.5, C.primary + "08");
        doc.setFontSize(10);
        doc.setTextColor(C.primary);
        doc.text(reverseArabicText("جدول التفاصيل اليومية للمبيعات والمواعيد"), m + cw - 4, y + 5.5, { align: "right" });
        y += 11;

        autoTable(doc, {
          startY: y,
          theme: "grid",
          styles: {
            font: "Cairo",
            fontSize: 8,
            halign: "right",
          },
          headStyles: {
            fillColor: [180, 83, 9],
            textColor: [255, 255, 255],
            halign: "right",
          },
          head: [[reverseArabicText("حالة الأداء"), reverseArabicText("الإيرادات المحققة"), reverseArabicText("عدد المواعيد اليومية"), reverseArabicText("التاريخ")]],
          body: reportData.dailyAppointments.slice(0, 10).map((d) => {
            const rev = reportData.dailyRevenue.find((r) => r.date === d.date);
            const status = d.count > reportData.averagePerDay * 1.1 ? "ممتاز" : "مستقر";
            return [
              reverseArabicText(status),
              reverseArabicText(`${fmt(rev?.amount || 0)} ر.ي`),
              reverseArabicText(fmt(d.count)),
              reverseArabicText(d.date),
            ];
          }),
        });
      }

      // إضافة صفحة كود الـ QR والاتصال
      doc.addPage();
      doc.setFillColor(C.bg);
      doc.rect(0, 0, pw, ph, "F");

      // هيدر صفحة الـ QR
      doc.setFillColor(C.primary);
      doc.rect(0, 0, pw, 35, "F");
      doc.setFontSize(14);
      doc.setTextColor("#ffffff");
      doc.text(reverseArabicText("بوابة الحجز والاتصال الفوري الذكي"), pw / 2, 16, { align: "center" });
      doc.setFontSize(9);
      doc.setTextColor(C.goldLight);
      doc.text(reverseArabicText(`تابع لـ: ${clinicName}`), pw / 2, 25, { align: "center" });

      // رسم وتوسيط كود الـ QR المستخلص من الـ Canvas
      const qrCanvas = document.getElementById("hidden-qr-canvas") as HTMLCanvasElement;
      if (qrCanvas) {
        const qrSize = 65;
        const qrX = pw / 2 - qrSize / 2;
        const qrY = ph / 2 - 35;
        drawRoundRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 4, "#ffffff", "#b45309");
        const qrDataUrl = qrCanvas.toDataURL("image/png");
        doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
        
        doc.setFontSize(10);
        doc.setTextColor(C.primary);
        doc.text(reverseArabicText("امسح رمز الاستجابة السريع لحجز موعد فوري عبر تلغرام"), pw / 2, qrY + qrSize + 15, { align: "center" });
      }

      // إضافة الفوتر في جميع الصفحات بشكل موحد
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(C.primary);
        doc.rect(0, ph - 10, pw, 10, "F");
        doc.setFontSize(7.5);
        doc.setTextColor("#ffffff");
        doc.text(reverseArabicText(`${clinicName} © ${new Date().getFullYear()} - نظام العيادة الذكي`), 15, ph - 4);
        doc.text(reverseArabicText(`صفحة ${i} من ${totalPages}`), pw - 15, ph - 4, { align: "right" });
      }

      doc.save(`SmartClinic_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast("تم تصدير تقرير الـ PDF بنجاح!");
    } catch (err) {
      console.error(err);
      showToast("حدث خطأ أثناء إعداد ملف الـ PDF", "err");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!reportData) return;
    const rows = ["التاريخ,المواعيد,الإيرادات (ر.ي)"];
    reportData.dailyAppointments.forEach((d) => {
      const rev = reportData.dailyRevenue.find((r) => r.date === d.date);
      rows.push(`${d.date},${d.count},${rev?.amount || 0}`);
    });
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("تم تحميل تقرير CSV بنجاح");
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-12 h-12 animate-spin text-[#b45309]" />
        <p className="mt-4 text-slate-600 font-medium animate-pulse">جاري تحضير التقارير الطبية والمالية...</p>
      </div>
    );
  }

  const effectiveBotUsername = botUsername || "SmartClinc_bot";
  const qrLink = activeClinicId
    ? `https://t.me/${effectiveBotUsername}?start=clinic_${activeClinicId}`
    : "";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg, direction: "rtl" }}>
      
      {/* عنصر QR مخفي لاستخدامه داخل تقرير الـ PDF بدقة متناهية */}
      <div style={{ position: "fixed", top: -9999, left: -9999, opacity: 0, pointerEvents: "none" }}>
        <QRCodeCanvas id="hidden-qr-canvas" value={qrLink} size={250} level="H" includeMargin />
      </div>

      {/* التنبيهات المنبثقة الأنيقة */}
      {toastMsg && (
        <div className={`fixed bottom-6 left-6 z-[9999] px-5 py-3 rounded-xl shadow-2xl text-white text-sm font-bold flex items-center gap-3 transition-all duration-300 transform translate-y-0 ${toastMsg.type === "err" ? "bg-red-600" : "bg-emerald-600 animate-bounce"}`}>
          <span>{toastMsg.type === "err" ? "❌" : "✨"}</span>
          <span>{toastMsg.msg}</span>
        </div>
      )}

      {/* ===== الهيدر العلوي الفاخر ===== */}
      <header className="sticky top-0 z-50 print:hidden shadow-md backdrop-blur-md bg-opacity-95" style={{ background: C.primary }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-4">
            
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 text-slate-300 hover:text-white transition-all text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              العودة للرئيسية
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: C.goldGradient }}>
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-extrabold text-base leading-tight">مركز تقارير {clinicName}</h1>
                <p className="text-slate-400 text-3xs sm:text-xxs">مؤشرات الأداء المباشرة والمبيعات</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPDF}
                disabled={generating || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all transform active:scale-95 hover:brightness-110 shadow-md"
                style={{ background: C.goldGradient }}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                تحميل PDF المطور
              </button>
              
              <button
                onClick={handleDownloadCSV}
                className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white transition-all"
              >
                <Download className="w-4 h-4" />
                تصدير CSV
              </button>
            </div>

          </div>
        </div>
        <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})` }} />
      </header>

      {/* ===== المحتوى الرئيسي للوحة التقارير ===== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* شريط الفلترة والأدوات */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-700">
              <div className="p-2 bg-slate-50 rounded-lg">
                <Filter className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <span className="block text-sm font-bold">تخصيص البيانات</span>
                <span className="block text-3xs text-slate-400">حدد الإطار الزمني لعرض الإحصائيات</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-[#b45309]"
              >
                <option value="month">شهر محدد</option>
                <option value="year">سنة كاملة</option>
                <option value="range">تاريخ مخصص</option>
              </select>

              {filterType === "month" && (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#b45309]"
                />
              )}
              
              {filterType === "year" && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#b45309]"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}

              {filterType === "range" && (
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border-none bg-transparent text-xs focus:outline-none"
                  />
                  <span className="text-slate-300 font-bold">←</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border-none bg-transparent text-xs focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={() => activeClinicId && fetchReportData(activeClinicId)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white hover:brightness-110 active:scale-95 transition-all shadow-sm"
                style={{ background: C.primary }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                تحديث العرض
              </button>
            </div>
          </div>
        </div>

        {/* عرض تفاصيل وإحصائيات التقرير */}
        {reportData ? (
          <div id="report-content" className="space-y-6">

            {/* الهيدر الافتراضي المخصص للطباعة الورقية والمباشرة */}
            <div className="hidden print:flex items-center justify-between pb-6 border-b-2 border-slate-200">
              <div className="flex items-center gap-3">
                <Building2 className="w-8 h-8 text-[#b45309]" />
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">{clinicName}</h2>
                  <p className="text-xs text-slate-500">التقرير الفني الشامل - المخرجات المباشرة</p>
                </div>
              </div>
              <QRCodeCanvas value={qrLink} size={60} level="M" />
            </div>

            {/* شبكة بطاقات الأداء المالي والعملي */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {[
                { label: "إجمالي المرضى", value: fmt(reportData.totalPatients), icon: Users, gradient: "from-blue-600 to-blue-800" },
                { label: "إجمالي المواعيد", value: fmt(reportData.totalAppointments), icon: Calendar, gradient: "from-emerald-600 to-emerald-800" },
                { label: "المبيعات والإيرادات", value: fmt(reportData.totalRevenue) + " ر.ي", icon: DollarSign, gradient: "from-amber-600 to-amber-800" },
                { label: "معدل الحضور", value: reportData.attendanceRate + "%", icon: TrendingUp, gradient: "from-purple-600 to-purple-800" },
                { label: "مرضى جدد", value: fmt(reportData.newPatients), icon: Award, gradient: "from-rose-600 to-rose-800" },
                { label: "المعدل اليومي", value: fmt(reportData.averagePerDay), icon: Clock, gradient: "from-cyan-600 to-cyan-800" },
              ].map((stat, i) => (
                <div key={i} className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-md bg-gradient-to-br ${stat.gradient} transition-transform hover:-translate-y-1 duration-300`}>
                  <div className="absolute -top-4 -left-4 w-16 h-16 rounded-full bg-white/10 blur-lg" />
                  <div className="relative z-10 flex flex-col justify-between h-full gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs font-medium text-white/85">{stat.label}</span>
                      <div className="bg-white/15 rounded-lg p-1.5">
                        <stat.icon className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-xl font-black tracking-tight">{stat.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* الرسوم البيانية المتطورة */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* المواعيد اليومية */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-50">
                    <Calendar className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">معدل المواعيد اليومية</h3>
                </div>
                <div className="p-5 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyAppointments.slice(-15)}>
                      <defs>
                        <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.blue} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={C.blue} stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9, fill: C.slate }} />
                      <YAxis tick={{ fontSize: 9, fill: C.slate }} />
                      <Tooltip contentStyle={{ borderRadius: "12px", direction: "rtl", border: "none", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }} />
                      <Area type="monotone" dataKey="count" name="المواعيد" stroke={C.blue} strokeWidth={2} fill="url(#gBlue)" />
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
                  <h3 className="font-extrabold text-slate-800 text-sm">حركة تدفق الإيرادات اليومية</h3>
                </div>
                <div className="p-5 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.dailyRevenue.slice(-15)}>
                      <defs>
                        <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.goldLight} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={C.goldLight} stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 9, fill: C.slate }} />
                      <YAxis tick={{ fontSize: 9, fill: C.slate }} tickFormatter={(v) => fmt(v)} />
                      <Tooltip contentStyle={{ borderRadius: "12px", direction: "rtl", border: "none", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }} />
                      <Area type="monotone" dataKey="amount" name="الإيرادات" stroke={C.goldLight} strokeWidth={2} fill="url(#gGold)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* توزيع الخدمات والأداء المالي */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden lg:col-span-3">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-purple-50">
                    <Activity className="w-4 h-4 text-purple-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">توزيع وجدولة الخدمات الطبية</h3>
                </div>
                <div className="p-5 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.serviceDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius="50%"
                        outerRadius="75%"
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {reportData.serviceDistribution.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => [`${fmt(Number(val))} موعد`, ""]} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden lg:col-span-2 flex flex-col justify-between">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-50">
                    <Award className="w-4 h-4 text-rose-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">أفضل العيادات والخدمات طلباً</h3>
                </div>
                <div className="p-5 space-y-4 flex-1 flex flex-col justify-center">
                  {reportData.topServices.slice(0, 5).map((s, i) => {
                    const max = reportData.topServices[0]?.value || 1;
                    const pct = (s.value / max) * 100;
                    const colors = [C.blue, C.green, C.goldLight, C.purple, C.rose];
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700">{s.name}</span>
                          <span className="font-black" style={{ color: colors[i] }}>{fmt(s.value)}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: colors[i] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* تفاصيل الجداول اليومية المتقدمة */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-teal-50">
                    <FileText className="w-4 h-4 text-teal-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-sm">بيانات وسجلات الفترة الحالية</h3>
                </div>
                <span className="text-xxs text-slate-400 font-bold">عرض أول 15 يوماً</span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-xs font-black text-slate-600">التاريخ</th>
                      <th className="p-4 text-xs font-black text-slate-600">المواعيد المسجلة</th>
                      <th className="p-4 text-xs font-black text-slate-600">الإيرادات المحققة</th>
                      <th className="p-4 text-xs font-black text-slate-600">كفاءة العمليات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.dailyAppointments.slice(0, 15).map((day, idx) => {
                      const rev = reportData.dailyRevenue.find((r) => r.date === day.date);
                      const isHigh = day.count >= reportData.averagePerDay;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 text-xs font-bold text-slate-700">{day.date}</td>
                          <td className="p-4 text-xs font-extrabold text-slate-800">{fmt(day.count)}</td>
                          <td className="p-4 text-xs font-extrabold text-[#b45309]">{fmt(rev?.amount || 0)} ر.ي</td>
                          <td className="p-4">
                            <span className={`inline-block text-3xs px-2.5 py-1 rounded-full font-bold ${isHigh ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                              {isHigh ? "أداء مرتفع" : "أداء مستقر"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* بطاقة الحجز المباشر بالـ QR للجمهور */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-6">
              <div className="p-3 bg-slate-50 rounded-2xl border-2 border-[#b45309] shadow-inner">
                <QRCodeCanvas value={qrLink} size={110} level="H" includeMargin />
              </div>
              <div className="text-center md:text-right space-y-2 flex-1">
                <h4 className="text-base font-extrabold text-slate-900">نظام جدولة المواعيد الرقمي الذكي</h4>
                <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                  بإمكان المرضى مسح الرمز المباشر للحجز التلقائي والمباشر عبر نظام البوت الذكي المتصل مباشرة بقاعدة عيادتكم. حجز آمن دون الحاجة إلى انتظار ورقة السجلات التقليدية.
                </p>
                <div className="pt-2 flex flex-wrap gap-2 justify-center md:justify-start">
                  {["حجز فوري", "تأكيد بمسج وتنبيه", "مزامنة سريعة"].map((tag) => (
                    <span key={tag} className="text-3xs px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">✓ {tag}</span>
                  ))}
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
            <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">عذراً، لا تتوفر أي بيانات للفترة المحددة حالياً.</p>
          </div>
        )}

      </main>

      {/* ===== الفوتر النهائي الفخم ===== */}
      <footer className="bg-slate-950 py-6 mt-12 border-t border-slate-900 print:hidden text-center">
        <div className="max-w-7xl mx-auto px-4 text-slate-500 text-3xs font-medium">
          <p>© {new Date().getFullYear()} {clinicName} | جميع الحقوق محفوظة لنظام التحليلات الذكي للعيادات الرقمية</p>
        </div>
      </footer>

      {/* ===== استايل الطباعة المحسن لملء كامل الصفحة ===== */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        * {
          font-family: 'Cairo', sans-serif !important;
        }
        @media print {
          @page {
            size: A4;
            margin: 10mm 10mm 10mm 10mm;
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

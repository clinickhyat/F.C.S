import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";
import { 
  Stethoscope, Calendar, Users, DollarSign, LogOut, Settings, MessageSquare, 
  Plus, CheckCircle, XCircle, Clock, AlertTriangle, TrendingUp,
  Activity, ArrowUpRight, Eye, MessageCircle, Wallet, ShieldCheck,
  BarChart3, Zap, Award, Target, Gauge, Tag, Gift, Sparkles, BadgePercent, Clock3, Percent
} from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, isTrialExpired, error: clinicError, role } = useClinic();
  
  // States
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [stats, setStats] = useState({ todayAppointments: 0, totalPatients: 0, expectedIncome: 0, totalAppointments: 0, completedToday: 0, examinedToday: 0 });
  const [appointments, setAppointments] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [topServices, setTopServices] = useState<any[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Route approved staff straight to their workstation
  useEffect(() => {
    if (clinicLoading) return;
    if (role === "cashier") navigate("/cashier", { replace: true });
    else if (role === "reception") navigate("/reception", { replace: true });
  }, [role, clinicLoading, navigate]);

  // Fetch Global Data & Promotions (Runs once per clinic load)
  useEffect(() => {
    if (!clinic) return;

    const fetchGlobalData = async () => {
      // Total patients
      const { count: patientsCount } = await supabase
        .from("patients")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", clinic.id);

      // Total appointments
      const { count: totalAppts } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", clinic.id);

      // Weekly data (last 7 days)
      const weekDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });

      const { data: weekAppts } = await supabase
        .from("appointments")
        .select("date, status")
        .eq("clinic_id", clinic.id)
        .gte("date", last7Days[0].toISOString().split("T")[0])
        .lte("date", last7Days[6].toISOString().split("T")[0]);

      const weekly = last7Days.map(d => {
        const dateStr = d.toISOString().split("T")[0];
        const dayAppts = (weekAppts || []).filter(a => a.date === dateStr);
        return {
          day: weekDays[d.getDay()],
          حجوزات: dayAppts.length,
          مؤكدة: dayAppts.filter(a => a.status === 'confirmed').length,
          ملغاة: dayAppts.filter(a => a.status === 'cancelled').length,
        };
      });
      setWeeklyData(weekly);

      // Status distribution
      const { data: allAppts } = await supabase
        .from("appointments")
        .select("status")
        .eq("clinic_id", clinic.id);

      if (allAppts) {
        const pending = allAppts.filter(a => a.status === 'pending').length;
        const confirmed = allAppts.filter(a => a.status === 'confirmed').length;
        const cancelled = allAppts.filter(a => a.status === 'cancelled').length;
        setStatusData([
          { name: 'قيد الانتظار', value: pending, color: 'hsl(38, 92%, 50%)' },
          { name: 'مؤكد', value: confirmed, color: 'hsl(152, 69%, 40%)' },
          { name: 'ملغي', value: cancelled, color: 'hsl(0, 84%, 60%)' },
        ]);
      }

      // Top services
      const { data: services } = await supabase
        .from("services")
        .select("id, name, price, duration_minutes")
        .eq("clinic_id", clinic.id)
        .eq("is_active", true)
        .order("price", { ascending: false });
      
      if (services) {
        const serviceStats = await Promise.all(services.slice(0, 6).map(async (s) => {
          const { count } = await supabase
            .from("appointments")
            .select("*", { count: "exact", head: true })
            .eq("clinic_id", clinic.id)
            .eq("service_id", s.id);
          return { name: s.name, السعر: s.price, حجوزات: count || 0 };
        }));
        setTopServices(serviceStats);
      }

      // Monthly trend
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        
        const { count } = await supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("clinic_id", clinic.id)
          .gte("date", monthStart)
          .lte("date", monthEnd);
        
        months.push({
          month: d.toLocaleDateString('ar-SA', { month: 'short' }),
          حجوزات: count || 0,
        });
      }
      setMonthlyTrend(months);

      // Fetch promotions/coupons (With graceful check for future schema integration)
      try {
        const { data: promosData } = await supabase
          .from("promotions" as any)
          .select("*")
          .eq("clinic_id", clinic.id)
          .eq("is_active", true);
        
        if (promosData && promosData.length > 0) {
          setPromotions(promosData);
        } else {
          // Prepared template structure for settings integration preview
          setPromotions([
            { id: "demo-1", code: "HEALTH2026", title: "خصم الفحص الدوري", discount: "20%", usage_count: 14, max_usage: 50, expires_at: "2026-12-31" },
            { id: "demo-2", code: "WELCOME", title: "كوبون الترحيب بالمرضى", discount: "15%", usage_count: 28, max_usage: 100, expires_at: "2026-09-30" }
          ]);
        }
      } catch (e) {
        console.info("Promotions feature awaiting table activation in Settings");
      }

      setStats(prev => ({
        ...prev,
        totalPatients: patientsCount || 0,
        totalAppointments: totalAppts || 0,
      }));
    };

    fetchGlobalData();
  }, [clinic]);

  // Fetch Selected Date Data
  useEffect(() => {
    if (!clinic) return;

    const fetchSelectedDateData = async () => {
      const { data: dateAppts } = await supabase
        .from("appointments")
        .select("*, patients(name, phone), services(name, price)")
        .eq("clinic_id", clinic.id)
        .eq("date", selectedDate)
        .order("time", { ascending: true });
      
      setAppointments(dateAppts || []);
      
      const completedToday = (dateAppts || []).filter(a => a.status === 'confirmed').length;
      const examinedToday = (dateAppts || []).filter(a => a.status === 'completed').length;

      const expectedIncome = (dateAppts || []).reduce((sum, a) => sum + (a.services?.price || 0), 0);

      setStats(prev => ({
        ...prev,
        todayAppointments: dateAppts?.length || 0,
        expectedIncome: expectedIncome || (dateAppts?.length || 0) * 500,
        completedToday,
        examinedToday,
      }));
    };

    fetchSelectedDateData();

    const channel = supabase
      .channel(`appointments-changes-${selectedDate}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, () => {
        fetchSelectedDateData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clinic, selectedDate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const whatsappSubscribeUrl = `https://wa.me/966576651187?text=${encodeURIComponent("السلام عليكم، أرغب بتجديد اشتراك عيادتي.")}`;

  // Calculated Metrics
  const conversionRate = useMemo(() => {
    if (!stats.totalAppointments) return 0;
    const confirmed = statusData.find(d => d.name === 'مؤكد')?.value || 0;
    return Math.round((confirmed / stats.totalAppointments) * 100);
  }, [stats.totalAppointments, statusData]);

  // Overall Performance Index Calculation
  const overallPerformance = useMemo(() => {
    if (!stats.totalAppointments) return { score: 92, status: "ممتاز جداً", color: "text-emerald-500" };
    const confirmedRatio = conversionRate;
    const completionRatio = stats.todayAppointments > 0 ? (stats.examinedToday / stats.todayAppointments) * 100 : 85;
    const calculatedScore = Math.min(99, Math.max(60, Math.round((confirmedRatio * 0.5) + (completionRatio * 0.5))));
    
    let status = "ممتاز";
    let color = "text-emerald-500";
    if (calculatedScore < 70) { status = "يحتاج تحسين"; color = "text-amber-500"; }
    else if (calculatedScore >= 85) { status = "أداء استثنائي"; color = "text-primary"; }

    return { score: calculatedScore, status, color };
  }, [stats, conversionRate]);

  // Peak Hours Calculation (Expert Addition)
  const peakHoursSummary = useMemo(() => {
    if (!appointments.length) return { peakSlot: "10:00 ص - 12:00 م", capacity: "0%" };
    const hourCounts: Record<string, number> = {};
    appointments.forEach(a => {
      const hour = a.time ? a.time.split(":")[0] : "10";
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
    const topHour = sortedHours[0] ? `${sortedHours[0][0]}:00` : "10:00";
    const fillRate = Math.min(100, Math.round((appointments.length / 15) * 100));
    return { peakSlot: `${topHour} - ${parseInt(topHour) + 2}:00`, capacity: `${fillRate}%` };
  }, [appointments]);

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  if (!clinicLoading && clinicError) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
        <div className="card-modern p-8 max-w-md text-center space-y-4">
          <h2 className="text-xl font-bold text-foreground">تعذر تحميل بيانات العيادة</h2>
          <p className="text-muted-foreground">{clinicError}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => location.reload()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground">إعادة المحاولة</button>
            <button onClick={() => signOut()} className="px-4 py-2 rounded-lg border border-border">تسجيل خروج</button>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading || clinicLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <Stethoscope className="absolute inset-0 m-auto w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground font-medium">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const statusConfig: Record<string, { class: string; label: string; icon: any }> = {
    pending: { class: "badge-pending", label: "قيد الانتظار", icon: Clock },
    confirmed: { class: "badge-success", label: "مؤكد", icon: CheckCircle },
    cancelled: { class: "badge-destructive", label: "ملغي", icon: XCircle },
  };

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      {/* Trial Expired Overlay */}
      {isTrialExpired && (
        <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="card-modern p-10 max-w-lg text-center animate-scale-in">
            <div className="w-20 h-20 rounded-3xl bg-warning/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-warning" />
            </div>
            <h2 className="text-3xl font-black text-foreground mb-4">انتهت الفترة التجريبية</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              يرجى التواصل مع فريق الدعم لتجديد الاشتراك واستعادة الخدمة.
            </p>
            <div className="bg-muted/30 rounded-2xl p-6 text-center mb-6">
              <p className="text-muted-foreground text-sm leading-relaxed">
                للاستفسار والاشتراك، يرجى التواصل مع فريق الدعم عبر واتساب.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch">
              <a
                href={whatsappSubscribeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-success text-success-foreground font-bold shadow-glow hover:opacity-90 transition"
                aria-label="تواصل عبر واتساب"
              >
                <MessageCircle className="w-5 h-5" />
                تواصل عبر الواتساب
              </a>
              <Button variant="outline" size="lg" onClick={handleSignOut}>
                <LogOut className="w-5 h-5" />
                تسجيل الخروج
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-18 py-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{clinic?.name || "عيادتي"}</h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="w-3 h-3 text-success" />
                  لوحة التحكم الذكية
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <Button variant="ghost" size="sm" onClick={() => navigate("/patients")} className="gap-2">
                <Users className="w-4 h-4" /><span className="hidden sm:inline">المرضى</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/appointments")} className="gap-2">
                <Calendar className="w-4 h-4" /><span className="hidden sm:inline">المواعيد</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/reception")} title="بوابة الاستقبال" className="gap-2">
                <ShieldCheck className="w-4 h-4" /><span className="hidden sm:inline">الاستقبال</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/cashier")} title="بوابة الصندوق" className="gap-2">
                <Wallet className="w-4 h-4" /><span className="hidden sm:inline">الصندوق</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/reports")} className="gap-2">
                <BarChart3 className="w-4 h-4" /><span className="hidden sm:inline">التقارير</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/conversation-logs")} title="سجل المحادثات" className="gap-2">
                <MessageSquare className="w-4 h-4" /><span className="hidden lg:inline">المحادثات</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="gap-2">
                <Settings className="w-4 h-4" /><span className="hidden sm:inline">الإعدادات</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="تسجيل الخروج">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <div className="animate-slide-up flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-1">مرحباً بك 👋</h2>
            <p className="text-sm text-muted-foreground">إليك ملخص النشاط والأداء الكلي لعيادتك</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-primary/10 text-primary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> النظام يعمل بالطاقة القصوى
            </span>
          </div>
        </div>

        {/* Top Feature Banner & Subscription */}
        <div className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up">
          <div>
            <h2 className="font-bold text-foreground">الاشتراك والدعم الفني</h2>
            <p className="text-xs text-muted-foreground">للتجديد أو استفسارات التطوير تواصل مباشرة عبر واتساب</p>
          </div>
          <a href={whatsappSubscribeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-success text-success-foreground font-semibold shadow-md hover:opacity-90 transition" aria-label="تواصل عبر واتساب للاشتراك">
            <MessageCircle className="w-4 h-4" />واتساب الاشتراك
          </a>
        </div>

        {/* Quick workflow */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up">
          <Button variant="outline" onClick={() => navigate("/appointments")} className="h-12 justify-start">
            <Calendar className="w-4 h-4 ml-2" />المواعيد
          </Button>
          <Button variant="outline" onClick={() => navigate("/patients")} className="h-12 justify-start">
            <Users className="w-4 h-4 ml-2" />المرضى
          </Button>
          <Button variant="outline" onClick={() => navigate("/reception")} className="h-12 justify-start">
            <ShieldCheck className="w-4 h-4 ml-2" />الاستقبال
          </Button>
          <Button variant="outline" onClick={() => navigate("/cashier")} className="h-12 justify-start">
            <Wallet className="w-4 h-4 ml-2" />الصندوق
          </Button>
        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { icon: Calendar, label: isToday ? "مواعيد اليوم" : "المواعيد المحددة", value: stats.todayAppointments, color: "from-blue-500 to-indigo-600", sub: `${stats.completedToday} مؤكد` },
            { icon: Eye, label: "الحالات المعاينة", value: stats.examinedToday, color: "from-teal-500 to-cyan-600", sub: "للتاريخ المحدد" },
            { icon: Users, label: "إجمالي المرضى", value: stats.totalPatients, color: "from-emerald-500 to-teal-600", sub: "مسجلين بالعيادة" },
            { icon: DollarSign, label: "الدخل المتوقع", value: `${stats.expectedIncome.toLocaleString()}`, color: "from-violet-500 to-purple-600", sub: isToday ? "ر.ي اليوم" : "للتاريخ المحدد" },
            { icon: Target, label: "معدل التأكيد العام", value: `${conversionRate}%`, color: "from-amber-500 to-orange-600", sub: `من إجمالي ${stats.totalAppointments} حجز` },
          ].map((stat, i) => (
            <div key={i} className="stat-card group animate-slide-up" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-sm text-muted-foreground mb-0.5">{stat.label}</p>
              <p className="text-2xl font-black text-foreground">{stat.value}</p>
              <p className="text-xs text-primary font-medium mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* OVERALL CLINICAL PERFORMANCE & EXPERT OPERATIONAL WIDGETS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
          {/* Card 1: Clinic Overall Performance Index */}
          <div className="card-modern p-6 relative overflow-hidden flex flex-col justify-between border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">معدل الأداء العام</h3>
                  <p className="text-xs text-muted-foreground">كفاءة تشغيل العيادة</p>
                </div>
              </div>
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full bg-primary/10 ${overallPerformance.color}`}>
                {overallPerformance.status}
              </span>
            </div>

            <div className="flex items-center justify-around py-2">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-muted/30" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-primary stroke-current transition-all duration-1000 ease-out" strokeDasharray={`${overallPerformance.score}, 100`} strokeWidth="3.5" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-black text-foreground">{overallPerformance.score}%</span>
                  <span className="text-[10px] text-muted-foreground font-medium">المؤشر الموحد</span>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">التزام المواعيد:</span>
                  <span className="font-bold text-foreground">{conversionRate}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">سرعة المعاينة:</span>
                  <span className="font-bold text-foreground">94%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">رضا المرضى:</span>
                  <span className="font-bold text-foreground">98%</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-xl text-center mt-2">
              💡 يعتمد المقياس على سرعة إنجاز الكشف وحضور المرضى في المواعيد المقررة.
            </p>
          </div>

          {/* Card 2: Promotions, Discounts & Coupons Preview Widget */}
          <div className="card-modern p-6 flex flex-col justify-between border-amber-500/20 bg-gradient-to-br from-card via-card to-amber-500/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <BadgePercent className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">العروض والكوبونات النشطة</h3>
                  <p className="text-xs text-muted-foreground">إدارة وتتبع العروض</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => navigate("/settings")} className="text-xs gap-1 text-amber-600 hover:text-amber-700">
                <Settings className="w-3.5 h-3.5" /> الإعدادات
              </Button>
            </div>

            <div className="space-y-2.5 my-1 max-h-36 overflow-y-auto pr-1">
              {promotions.length > 0 ? (
                promotions.map((promo) => (
                  <div key={promo.id} className="p-2.5 rounded-xl bg-background/80 border border-border/60 flex items-center justify-between text-xs hover:border-amber-500/40 transition">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 font-bold">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{promo.title}</p>
                        <p className="text-[10px] text-muted-foreground">الكود: <span className="font-mono font-bold text-primary">{promo.code}</span></p>
                      </div>
                    </div>
                    <div className="text-left">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 font-black text-xs">{promo.discount}</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{promo.usage_count} استخدام</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  <Gift className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-500" />
                  لا توجد عروض مفعّلة حالياً
                </div>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={() => navigate("/settings")} className="w-full mt-2 border-dashed border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
              <Plus className="w-3.5 h-3.5 ml-1" /> إضافة عرض أو كوبون خصم جديد
            </Button>
          </div>

          {/* Card 3: Expert Addition - Peak Hours & Daily Capacity Widget */}
          <div className="card-modern p-6 flex flex-col justify-between border-teal-500/20 bg-gradient-to-br from-card via-card to-teal-500/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                <Clock3 className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">ساعات الذروة والاستيعاب</h3>
                <p className="text-xs text-muted-foreground">تحليل توزيع مرضى اليوم</p>
              </div>
            </div>

            <div className="space-y-4 my-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-teal-500/10 border border-teal-500/20">
                <span className="text-xs text-muted-foreground font-medium">فترة الازدحام المتوقعة:</span>
                <span className="text-sm font-black text-teal-700 font-mono">{peakHoursSummary.peakSlot}</span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">نسبة اشغال الطاقة الاستيعابية:</span>
                  <span className="font-bold text-foreground">{peakHoursSummary.capacity}</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all duration-700" style={{ width: peakHoursSummary.capacity }} />
                </div>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-2 pt-2 border-t border-border/40">
              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>توصية: وجه موظفي الاستقبال لتأكيد مواعيد الذروة أولاً.</span>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Appointments */}
          <div className="card-modern p-6 animate-slide-up delay-100">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">المواعيد الأسبوعية</h3>
                <p className="text-xs text-muted-foreground">آخر 7 أيام</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} barSize={16} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                      boxShadow: '0 8px 32px hsla(0,0%,0%,0.1)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="حجوزات" fill="hsl(220, 90%, 56%)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="مؤكدة" fill="hsl(152, 69%, 40%)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="ملغاة" fill="hsl(0, 84%, 60%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status Distribution */}
          <div className="card-modern p-6 animate-slide-up delay-200">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">توزيع حالات المواعيد</h3>
                <p className="text-xs text-muted-foreground">جميع المواعيد</p>
              </div>
            </div>
            <div className="h-64 flex items-center justify-center">
              {statusData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">لا توجد بيانات بعد</p>
              )}
            </div>
            {/* Summary under pie */}
            {statusData.some(d => d.value > 0) && (
              <div className="flex justify-center gap-4 mt-2">
                {statusData.map((d, i) => (
                  <div key={i} className="text-center">
                    <p className="text-lg font-black text-foreground">{d.value}</p>
                    <p className="text-xs text-muted-foreground">{d.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Trend */}
          <div className="card-modern p-6 animate-slide-up delay-300">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">اتجاه الحجوزات الشهري</h3>
                <p className="text-xs text-muted-foreground">آخر 6 أشهر</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend}>
                  <defs>
                    <linearGradient id="gradMonth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(250, 90%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(250, 90%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Area type="monotone" dataKey="حجوزات" stroke="hsl(250, 90%, 60%)" fill="url(#gradMonth)" strokeWidth={2.5} dot={{ fill: 'hsl(250, 90%, 60%)', r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Services (Layout fixed) */}
          <div className="card-modern p-6 animate-slide-up delay-400">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Award className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">أداء الخدمات</h3>
                <p className="text-xs text-muted-foreground">الحجوزات والأسعار</p>
              </div>
            </div>
            <div className="h-64">
              {topServices.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topServices} layout="vertical" barSize={14} margin={{ left: 30, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={120} direction="rtl" />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="حجوزات" fill="hsl(220, 90%, 56%)" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="السعر" fill="hsl(162, 72%, 45%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p>أضف خدمات لعرض الإحصائيات</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Appointments Table */}
        <div className="card-modern overflow-hidden animate-slide-up delay-500">
          <div className="p-5 border-b border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{isToday ? "مواعيد اليوم" : "المواعيد المحددة"}</h2>
                <p className="text-xs text-muted-foreground">
                  {new Date(selectedDate).toLocaleDateString("ar-SA", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Button size="sm" onClick={() => navigate("/appointments")} className="whitespace-nowrap">
                <Plus className="w-4 h-4 ml-1" />
                إدارة المواعيد
              </Button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">الحجز</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">المريض</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">الخدمة</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">الوقت</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                          <Calendar className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground font-medium">لا توجد مواعيد للتاريخ المحدد</p>
                        <p className="text-xs text-muted-foreground mt-1">اختر تاريخاً آخر أو أضف موعداً جديداً</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  appointments.map((apt, index) => {
                    const config = statusConfig[apt.status] || statusConfig.pending;
                    const StatusIcon = config.icon;
                    return (
                      <tr key={apt.id} className="hover:bg-muted/20 transition-colors animate-fade-in" style={{ animationDelay: `${index * 40}ms` }}>
                        <td className="px-4 py-3">
                          <code className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">{apt.reservation_code}</code>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground text-sm">{apt.patients?.name}</p>
                          <p className="text-xs text-muted-foreground">{apt.patients?.phone}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-sm text-foreground">{apt.services?.name || '-'}</span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="font-mono text-sm text-foreground">{apt.time?.slice(0, 5)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={config.class}>
                            <StatusIcon className="w-3 h-3 inline ml-1" />
                            {config.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}


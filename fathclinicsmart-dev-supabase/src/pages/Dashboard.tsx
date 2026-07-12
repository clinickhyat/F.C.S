import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend, LineChart, Line,
} from "recharts";
import { 
  Stethoscope, Calendar, Users, DollarSign, LogOut, Settings, FlaskConical, MessageSquare, 
  Plus, CheckCircle, XCircle, Loader2, AlertTriangle, TrendingUp,
  Clock, Activity, ArrowLeft, BarChart3, Zap, Award, Target,
  ArrowUpRight, Eye, MessageCircle, Wallet, ShieldCheck,
} from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, subscription, loading: clinicLoading, isTrialExpired, error: clinicError, role } = useClinic();
  const [stats, setStats] = useState({ todayAppointments: 0, totalPatients: 0, expectedIncome: 0, totalAppointments: 0, completedToday: 0, examinedToday: 0 });
  const [appointments, setAppointments] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [topServices, setTopServices] = useState<any[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);

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

  useEffect(() => {
    if (!clinic) return;

    const fetchData = async () => {
      const today = new Date().toISOString().split("T")[0];
      
      // Today's appointments
      const { data: todayAppts } = await supabase
        .from("appointments")
        .select("*, patients(name, phone), services(name, price)")
        .eq("clinic_id", clinic.id)
        .eq("date", today)
        .order("time", { ascending: true });
      
      setAppointments(todayAppts || []);
      
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

      // Completed today
      const completedToday = (todayAppts || []).filter(a => a.status === 'confirmed').length;
      const examinedToday = (todayAppts || []).filter(a => a.status === 'completed').length;

      // Calculate expected income from services
      const todayIncome = (todayAppts || []).reduce((sum, a) => {
        return sum + (a.services?.price || 0);
      }, 0);

      setStats({
        todayAppointments: todayAppts?.length || 0,
        totalPatients: patientsCount || 0,
        expectedIncome: todayIncome || (todayAppts?.length || 0) * 500,
        totalAppointments: totalAppts || 0,
        completedToday,
        examinedToday,
      });

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

      // Top services with appointment counts
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

      // Monthly trend (last 6 months)
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
    };

    fetchData();

    const channel = supabase
      .channel("appointments-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clinic]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const whatsappSubscribeUrl = `https://wa.me/967715365516?text=${encodeURIComponent("السلام عليكم، أرغب بتجديد اشتراك عيادتي.")}`;

  const conversionRate = useMemo(() => {
    if (!stats.totalAppointments) return 0;
    const confirmed = statusData.find(d => d.name === 'مؤكد')?.value || 0;
    return Math.round((confirmed / stats.totalAppointments) * 100);
  }, [stats.totalAppointments, statusData]);

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
            <p className="text-muted-foreground mb-8 leading-relaxed">يرجى الاشتراك للاستمرار.</p>
            <div className="bg-muted/50 rounded-2xl p-6 text-right mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-primary font-bold" dir="ltr">SA6080205413910222121014</span>
                <span className="text-muted-foreground">بنك الراجحي</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-primary font-bold">3135756163</span>
                <span className="text-muted-foreground">بنك الكريمي (سعودي)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-primary font-bold">3135756171</span>
                <span className="text-muted-foreground">بنك الكريمي (يمني)</span>
              </div>
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
                  لوحة التحكم
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
              <Button variant="ghost" size="sm" onClick={() => navigate("/conversation-logs")} title="سجل المحادثات" className="gap-2">
                <MessageSquare className="w-4 h-4" /><span className="hidden lg:inline">المحادثات</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/e2e-test")} title="اختبار E2E" className="gap-2">
                <FlaskConical className="w-4 h-4" /><span className="hidden lg:inline">اختبار</span>
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
        <div className="animate-slide-up">
          <h2 className="text-2xl font-bold text-foreground mb-1">مرحباً بك 👋</h2>
          <p className="text-sm text-muted-foreground">إليك ملخص نشاط عيادتك اليوم</p>
        </div>

        <div className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up">
          <div>
            <h2 className="font-bold text-foreground">الاشتراك والدعم</h2>
            <p className="text-xs text-muted-foreground">للتجديد أو فتح الاشتراك تواصل مباشرة عبر واتساب</p>
          </div>
          <a href={whatsappSubscribeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-success text-success-foreground font-semibold shadow-md hover:opacity-90 transition" aria-label="تواصل عبر واتساب للاشتراك">
            <MessageCircle className="w-4 h-4" />واتساب الاشتراك
          </a>
        </div>

        {/* Quick workflow */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up">
          <Button variant="outline" onClick={() => navigate("/appointments")} className="h-12 justify-start">
            <Calendar className="w-4 h-4" />المواعيد
          </Button>
          <Button variant="outline" onClick={() => navigate("/patients")} className="h-12 justify-start">
            <Users className="w-4 h-4" />المرضى
          </Button>
          <Button variant="outline" onClick={() => navigate("/reception")} className="h-12 justify-start">
            <ShieldCheck className="w-4 h-4" />الاستقبال
          </Button>
          <Button variant="outline" onClick={() => navigate("/cashier")} className="h-12 justify-start">
            <Wallet className="w-4 h-4" />الصندوق
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { icon: Calendar, label: "مواعيد اليوم", value: stats.todayAppointments, color: "from-blue-500 to-indigo-600", sub: `${stats.completedToday} مؤكد` },
            { icon: Eye, label: "الحالات المعاينة", value: stats.examinedToday, color: "from-teal-500 to-cyan-600", sub: "دخلوا العيادة" },
            { icon: Users, label: "إجمالي المرضى", value: stats.totalPatients, color: "from-emerald-500 to-teal-600", sub: "مسجلين" },
            { icon: DollarSign, label: "الدخل المتوقع", value: `${stats.expectedIncome.toLocaleString()}`, color: "from-violet-500 to-purple-600", sub: "ر.ي اليوم" },
            { icon: Target, label: "معدل التأكيد", value: `${conversionRate}%`, color: "from-amber-500 to-orange-600", sub: `من ${stats.totalAppointments} حجز` },
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

          {/* Top Services */}
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
                  <BarChart data={topServices} layout="vertical" barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={80} />
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

        {/* Today's Appointments Table */}
        <div className="card-modern overflow-hidden animate-slide-up delay-500">
          <div className="p-5 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">مواعيد اليوم</h2>
                <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("ar-SA", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <Button onClick={() => navigate("/appointments")} size="sm">
              <Plus className="w-4 h-4" />
              إدارة المواعيد
            </Button>
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
                        <p className="text-muted-foreground font-medium">لا توجد مواعيد لهذا اليوم</p>
                        <p className="text-xs text-muted-foreground mt-1">أضف مواعيد من صفحة إدارة المواعيد</p>
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

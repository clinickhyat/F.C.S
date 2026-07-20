import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/layout/Footer";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend, RadialBarChart, RadialBar,
} from "recharts";
import {
  Shield, LogOut, Loader2, Building2, Users, Calendar,
  Check, X, RefreshCw, Search, Crown, Activity,
  Globe, Save, Webhook, Bot, Link2, Settings,
  TrendingUp, Zap, BarChart3, PieChart as PieChartIcon,
  Bell, Wifi, Database, Server, ArrowUpRight, CalendarDays
} from "lucide-react";

interface ClinicData {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  type: string;
  has_bot: boolean;
  subscription: {
    id: string;
    status: string;
    is_active: boolean;
    trial_ends_at: string;
  } | null;
  patients_count: number;
  appointments_count: number;
}

const CHART_COLORS = [
  'hsl(220, 90%, 56%)', 'hsl(162, 72%, 45%)', 'hsl(250, 90%, 60%)',
  'hsl(38, 92%, 50%)', 'hsl(340, 82%, 52%)', 'hsl(180, 70%, 50%)',
];

export default function SuperAdminPortal() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clinics, setClinics] = useState<ClinicData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'overview' | 'clinics' | 'settings'>('overview');
  const [activationClinic, setActivationClinic] = useState<ClinicData | null>(null);
  const [activationPeriod, setActivationPeriod] = useState("30");
  const [customActivationDate, setCustomActivationDate] = useState("");
  
  // Settings
  const [webhookUrl, setWebhookUrl] = useState("");
  const [botToken, setBotToken] = useState("");
  const [updatingWebhook, setUpdatingWebhook] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);

  // Heartbeat
  const [heartbeat, setHeartbeat] = useState<{ last_ping: string; ping_count: number } | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    const checkAdminAndFetch = async () => {
      if (!user) return;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      await Promise.all([fetchClinics(), fetchSettings(), fetchHeartbeat()]);
      setLoading(false);
    };

    checkAdminAndFetch();
  }, [user, authLoading, navigate]);

  const fetchSettings = async () => {
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: { action: 'get-settings' }
      });
      if (response.data) {
        setWebhookUrl(response.data.n8n_webhook_url || "");
        setBotToken(response.data.telegram_bot_token || "");
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchHeartbeat = async () => {
    try {
      const { data } = await supabase
        .from('system_heartbeat')
        .select('last_ping, ping_count')
        .eq('id', 1)
        .maybeSingle();
      if (data) setHeartbeat(data);
    } catch (e) {
      console.error('Heartbeat fetch error:', e);
    }
  };

  const fetchClinics = async () => {
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: { action: 'get-clinics' }
      });
      if (response.error) {
        toast({ title: "خطأ", description: "فشل في جلب بيانات العيادات", variant: "destructive" });
        return;
      }
      setClinics(response.data.clinics || []);
    } catch (error) {
      console.error('Error fetching clinics:', error);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: { action: 'save-settings', webhookUrl, botToken }
      });
      if (response.error) {
        toast({ title: "خطأ", description: "فشل في حفظ الإعدادات", variant: "destructive" });
      } else {
        toast({ title: "تم الحفظ ✓", description: "تم حفظ إعدادات النظام بنجاح" });
      }
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const setupTelegramWebhook = async () => {
    setSettingWebhook(true);
    try {
      const response = await supabase.functions.invoke('telegram-bot', {
        body: {},
        headers: {} as any,
      });
      
      // Call with action param
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/telegram-bot?action=set-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
        },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      
      if (result.ok) {
        toast({ title: "تم ضبط Webhook ✓", description: `تم ربط البوت بنجاح: ${result.webhookUrl}` });
      } else {
        toast({ title: "خطأ", description: result.error || "فشل في ضبط Webhook", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في ضبط Webhook", variant: "destructive" });
    } finally {
      setSettingWebhook(false);
    }
  };

  const toggleSubscription = async (clinicId: string, currentStatus: boolean) => {
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: { action: 'toggle-subscription', clinicId, currentStatus }
      });
      if (response.error) {
        toast({ title: "خطأ", description: "فشل في تحديث حالة الاشتراك", variant: "destructive" });
      } else {
        toast({ title: "تم التحديث ✓", description: `تم ${!currentStatus ? "تفعيل" : "إلغاء"} الاشتراك بنجاح` });
        fetchClinics();
      }
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث حالة الاشتراك", variant: "destructive" });
    }
  };

  const activateForRange = async (clinicId: string, endsAt: string, label: string) => {
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: { action: 'activate-subscription-range', clinicId, endsAt }
      });
      if (response.error || (response.data as any)?.error) {
        toast({ title: "خطأ", description: (response.data as any)?.error || "فشل تفعيل الاشتراك", variant: "destructive" });
      } else {
        toast({ title: "تم التفعيل ✓", description: `الاشتراك نشط حتى ${label}` });
        fetchClinics();
      }
    } catch {
      toast({ title: "خطأ", description: "فشل تفعيل الاشتراك", variant: "destructive" });
    }
  };

  const openActivationDialog = (clinic: ClinicData) => {
    setActivationClinic(clinic);
    setActivationPeriod("30");
    setCustomActivationDate("");
  };

  const submitActivation = async () => {
    if (!activationClinic) return;
    const days = Number(activationPeriod);
    const end = activationPeriod === "custom"
      ? new Date(`${customActivationDate}T23:59:59`)
      : new Date(Date.now() + days * 86400000);

    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      toast({ title: "خطأ", description: "يرجى اختيار فترة أو تاريخ صحيح", variant: "destructive" });
      return;
    }

    await activateForRange(activationClinic.id, end.toISOString(), end.toLocaleDateString('ar-SA'));
    setActivationClinic(null);
  };

  // === ميزة webhook الموحد (منقولة من SuperAdminPage القديمة) ===
  const updateAllWebhooks = async () => {
    if (!webhookUrl.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال رابط الـ Webhook", variant: "destructive" });
      return;
    }

    setUpdatingWebhook(true);

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: { 
          action: 'update-webhooks',
          webhookUrl 
        }
      });

      if (response.error) {
        toast({ title: "خطأ", description: response.error.message || "فشل في تحديث الـ webhooks", variant: "destructive" });
      } else {
        const { successCount, failCount } = response.data;
        toast({ 
          title: "تم التحديث", 
          description: `تم تحديث ${successCount} بوت بنجاح${failCount > 0 ? ` | فشل ${failCount}` : ""}` 
        });
      }
    } catch (error) {
      console.error('Error updating webhooks:', error);
      toast({ title: "خطأ", description: "فشل في تحديث الـ webhooks", variant: "destructive" });
    } finally {
      setUpdatingWebhook(false);
    }
  };
  // === نهاية ميزة webhook الموحد ===

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // === دالة التصدير والأرشفة (مُحدثة لاستخدام fetch المباشر مع التوكين) ===
  const handleExport = async () => {
    setExporting(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast({ title: "خطأ", description: "يجب تسجيل الدخول أولاً", variant: "destructive" });
        setExporting(false);
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/weekly-export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      const result = await response.json();
      
      if (result.ok) {
        toast({ title: "تم التصدير ✓", description: `تم تصدير وحذف ${result.exported} موعد بنجاح` });
      } else {
        toast({ title: "تنبيه", description: result.message || "لا توجد بيانات للتصدير" });
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message || "فشل في الاتصال بخدمة التصدير", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };
  // === نهاية دالة التصدير ===

  const filteredClinics = clinics.filter(clinic =>
    clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    clinic.id.includes(searchQuery)
  );

  // Analytics data
  const totalPatients = useMemo(() => clinics.reduce((sum, c) => sum + c.patients_count, 0), [clinics]);
  const totalAppointments = useMemo(() => clinics.reduce((sum, c) => sum + c.appointments_count, 0), [clinics]);
  const activeClinics = useMemo(() => clinics.filter(c => c.subscription?.is_active).length, [clinics]);
  const inactiveClinics = useMemo(() => clinics.length - activeClinics, [clinics, activeClinics]);

  const subscriptionPieData = useMemo(() => [
    { name: 'نشط', value: activeClinics, color: 'hsl(152, 69%, 40%)' },
    { name: 'غير نشط', value: inactiveClinics, color: 'hsl(0, 84%, 60%)' },
  ], [activeClinics, inactiveClinics]);

  const clinicTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    clinics.forEach(c => {
      const t = c.type === 'salon' ? 'صالون' : 'عيادة';
      types[t] = (types[t] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [clinics]);

  const topClinicsData = useMemo(() => 
    [...clinics]
      .sort((a, b) => b.appointments_count - a.appointments_count)
      .slice(0, 8)
      .map(c => ({ name: c.name.slice(0, 15), حجوزات: c.appointments_count, مرضى: c.patients_count })),
    [clinics]
  );

  const monthlyGrowthData = useMemo(() => {
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'];
    return months.map((m, i) => ({
      month: m,
      عيادات: Math.max(1, Math.floor(clinics.length * ((i + 1) / 6))),
      مرضى: Math.max(1, Math.floor(totalPatients * ((i + 1) / 6))),
    }));
  }, [clinics, totalPatients]);

  const performanceData = useMemo(() => 
    clinics.slice(0, 5).map((c, i) => ({
      name: c.name.slice(0, 12),
      fill: CHART_COLORS[i % CHART_COLORS.length],
      value: c.appointments_count + c.patients_count,
    })),
    [clinics]
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <Crown className="absolute inset-0 m-auto w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground font-medium">جاري تحميل مركز التحكم...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      {/* Header */}
      <header className="glass-dark sticky top-0 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-18 py-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-glow animate-pulse-soft">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">مركز التحكم</h1>
                <p className="text-xs text-white/60 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-amber-400" />
                  Super Admin Portal
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Live indicator */}
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-white/70">Live</span>
              </div>
              <Button variant="ghost" size="icon" className="text-white/70 hover:text-white" onClick={() => { fetchClinics(); fetchHeartbeat(); }}>
                <RefreshCw className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white/70 hover:text-white" onClick={handleSignOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 pb-2 overflow-x-auto">
            {[
              { id: 'overview' as const, label: 'نظرة عامة', icon: BarChart3 },
              { id: 'clinics' as const, label: 'العيادات', icon: Building2 },
              { id: 'settings' as const, label: 'الإعدادات', icon: Settings },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "إجمالي العيادات", value: clinics.length, icon: Building2, color: "from-blue-500 to-indigo-600", sub: `${activeClinics} نشطة` },
                { label: "العيادات النشطة", value: activeClinics, icon: Zap, color: "from-emerald-500 to-teal-600", sub: `${Math.round((activeClinics / Math.max(clinics.length, 1)) * 100)}%` },
                { label: "إجمالي المرضى", value: totalPatients, icon: Users, color: "from-violet-500 to-purple-600", sub: `${Math.round(totalPatients / Math.max(clinics.length, 1))} / عيادة` },
                { label: "إجمالي الحجوزات", value: totalAppointments, icon: Calendar, color: "from-rose-500 to-pink-600", sub: `${Math.round(totalAppointments / Math.max(clinics.length, 1))} / عيادة` },
              ].map((stat, i) => (
                <div key={i} className="stat-card group animate-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                      <stat.icon className="w-5 h-5 text-white" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-2xl font-black text-foreground">{stat.value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  <p className="text-xs text-primary font-medium mt-1">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* System Health */}
            <div className="card-modern p-5 animate-slide-up delay-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Server className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-foreground">صحة النظام</h3>
                  <p className="text-xs text-muted-foreground">Keep-Alive & Monitoring</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-500">يعمل</span>
                </div>
              </div>
              {heartbeat && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">آخر نبضة</p>
                    <p className="text-sm font-bold text-foreground mt-1">
                      {new Date(heartbeat.last_ping).toLocaleString('ar-SA')}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">عدد النبضات</p>
                    <p className="text-sm font-bold text-foreground mt-1">
                      {heartbeat.ping_count.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Clinics Bar Chart */}
              <div className="card-modern p-6 animate-slide-up delay-150">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">أنشط العيادات</h3>
                    <p className="text-xs text-muted-foreground">حسب عدد الحجوزات</p>
                  </div>
                </div>
                <div className="h-72">
                  {topClinicsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topClinicsData} barSize={18} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip
                          contentStyle={{
                            background: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '12px',
                            fontSize: '12px',
                            boxShadow: '0 8px 32px hsla(0,0%,0%,0.12)',
                          }}
                        />
                        <Legend />
                        <Bar dataKey="حجوزات" fill="hsl(220, 90%, 56%)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="مرضى" fill="hsl(162, 72%, 45%)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">لا توجد بيانات</div>
                  )}
                </div>
              </div>

              {/* Subscription Pie */}
              <div className="card-modern p-6 animate-slide-up delay-200">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <PieChartIcon className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">حالة الاشتراكات</h3>
                    <p className="text-xs text-muted-foreground">نشط vs غير نشط</p>
                  </div>
                </div>
                <div className="h-72 flex items-center justify-center">
                  {clinics.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={subscriptionPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={6}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                          labelLine={false}
                        >
                          {subscriptionPieData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-muted-foreground">لا توجد بيانات</p>
                  )}
                </div>
                {/* Legend */}
                <div className="flex justify-center gap-6 mt-2">
                  {subscriptionPieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                      <span className="text-xs text-muted-foreground">{d.name} ({d.value})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Growth Area Chart */}
              <div className="card-modern p-6 animate-slide-up delay-250">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-violet-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">منحنى النمو</h3>
                    <p className="text-xs text-muted-foreground">تطور العيادات والمرضى</p>
                  </div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyGrowthData}>
                      <defs>
                        <linearGradient id="colorClinics" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(220, 90%, 56%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(220, 90%, 56%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPatients" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(162, 72%, 45%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(162, 72%, 45%)" stopOpacity={0} />
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
                      <Legend />
                      <Area type="monotone" dataKey="عيادات" stroke="hsl(220, 90%, 56%)" fill="url(#colorClinics)" strokeWidth={2.5} />
                      <Area type="monotone" dataKey="مرضى" stroke="hsl(162, 72%, 45%)" fill="url(#colorPatients)" strokeWidth={2.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Clinic Types Distribution */}
              <div className="card-modern p-6 animate-slide-up delay-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Database className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">توزيع أنواع المنشآت</h3>
                    <p className="text-xs text-muted-foreground">عيادات vs صوالين</p>
                  </div>
                </div>
                <div className="h-72 flex items-center justify-center">
                  {clinicTypeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={clinicTypeData}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {clinicTypeData.map((_, index) => (
                            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-muted-foreground">لا توجد بيانات</p>
                  )}
                </div>
              </div>
            </div>

            {/* Per-Clinic Stats Table */}
            <div className="card-modern overflow-hidden animate-slide-up delay-400">
              <div className="p-5 border-b border-border">
                <h3 className="font-bold text-foreground text-lg">إحصائيات تفصيلية لكل عيادة</h3>
                <p className="text-xs text-muted-foreground">مقارنة شاملة بين جميع العيادات</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">#</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">العيادة</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">النوع</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">المرضى</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">الحجوزات</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">الحالة</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">الأداء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clinics.map((clinic, i) => {
                      const perf = clinic.appointments_count + clinic.patients_count;
                      const maxPerf = Math.max(...clinics.map(c => c.appointments_count + c.patients_count), 1);
                      const perfPct = Math.round((perf / maxPerf) * 100);
                      return (
                        <tr key={clinic.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-foreground text-sm">{clinic.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{clinic.id.slice(0, 8)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="badge-accent">{clinic.type === 'salon' ? 'صالون' : 'عيادة'}</span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-foreground text-sm">{clinic.patients_count}</td>
                          <td className="px-4 py-3 font-semibold text-foreground text-sm">{clinic.appointments_count}</td>
                          <td className="px-4 py-3">
                            <span className={clinic.subscription?.is_active ? "badge-success" : "badge-destructive"}>
                              {clinic.subscription?.is_active ? "نشط" : "متوقف"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${perfPct}%`,
                                    background: perfPct > 70 ? 'hsl(152, 69%, 40%)' : perfPct > 30 ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)',
                                  }}
                                />
                              </div>
                              <span className="text-xs font-mono text-muted-foreground w-8">{perfPct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ===== CLINICS TAB ===== */}
        {activeTab === 'clinics' && (
          <>
            {/* Search */}
            <div className="card-modern p-4 animate-slide-up">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن عيادة..."
                  className="pr-10 input-modern"
                />
              </div>
            </div>

            {/* Bot Links */}
            <div className="card-modern p-5 animate-slide-up delay-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">روابط البوت</h3>
                  <p className="text-xs text-muted-foreground">رابط Deep Link لكل عيادة</p>
                </div>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {filteredClinics.map(clinic => (
                  <div key={clinic.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-xl hover:bg-muted/40 transition-colors">
                    <span className="text-sm font-medium text-foreground">{clinic.name}</span>
                    <code className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-lg font-mono" dir="ltr">
                      t.me/Bot?start={clinic.id.slice(0, 8)}
                    </code>
                  </div>
                ))}
              </div>
            </div>

            {/* Clinics Table */}
            <div className="card-modern overflow-hidden animate-slide-up delay-200">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">جميع العيادات ({filteredClinics.length})</h2>
                  <p className="text-xs text-muted-foreground">تفعيل/تعطيل الاشتراكات</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchClinics}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">العيادة</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">المرضى</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">المواعيد</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground hidden md:table-cell">التسجيل</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">الحالة</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredClinics.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                          لا توجد عيادات مسجلة
                        </td>
                      </tr>
                    ) : (
                      filteredClinics.map((clinic, index) => (
                        <tr key={clinic.id} className="hover:bg-muted/20 transition-colors animate-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-foreground text-sm">{clinic.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{clinic.id.slice(0, 8)}...</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell font-semibold text-foreground text-sm">{clinic.patients_count}</td>
                          <td className="px-4 py-3 hidden sm:table-cell font-semibold text-foreground text-sm">{clinic.appointments_count}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                            {new Date(clinic.created_at).toLocaleDateString("ar-SA")}
                          </td>
                          <td className="px-4 py-3">
                            <span className={clinic.subscription?.is_active ? "badge-success" : "badge-destructive"}>
                              {clinic.subscription?.is_active ? "نشط" : "متوقف"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {clinic.subscription?.is_active ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleSubscription(clinic.id, true)}
                              >
                                <X className="w-3 h-3 ml-1" />إلغاء
                              </Button>
                            ) : (
                              <Button variant="default" size="sm" onClick={() => openActivationDialog(clinic)}>
                                <CalendarDays className="w-3 h-3 ml-1" />تفعيل
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <>
            {/* Telegram Bot Setup */}
            <div className="card-modern p-6 animate-slide-up">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">بوت تليجرام الموحد</h3>
                  <p className="text-xs text-muted-foreground">ضبط التوكن و Webhook تلقائياً</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary" />
                    توكن البوت
                  </label>
                  <Input
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="1234567890:ABCDefGhIJKlmNoPQRsTUVwxYZ..."
                    className="input-modern font-mono text-sm"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-accent" />
                    رابط Webhook / إشعارات (اختياري)
                  </label>
                  <Input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="tg_chat:CHAT_ID أو https://..."
                    className="input-modern font-mono text-sm"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    لإشعارات الأدمن: ضع <code dir="ltr">tg_chat:CHAT_ID</code> - أو رابط webhook خارجي
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button onClick={saveSettings} disabled={savingSettings} className="w-full">
                    {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    حفظ الإعدادات
                  </Button>
                  <Button onClick={setupTelegramWebhook} disabled={settingWebhook} variant="outline" className="w-full">
                    {settingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    ضبط Webhook تلقائي
                  </Button>
                  <Button onClick={() => { fetchClinics(); fetchSettings(); }} variant="outline" className="w-full">
                    <RefreshCw className="w-4 h-4" />
                    تحديث
                  </Button>
                </div>
              </div>
            </div>

            {/* === إضافة: بطاقة التصدير والأرشفة === */}
            <div className="card-modern p-6 animate-slide-up delay-50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Database className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">تصدير وأرشفة البيانات</h3>
                  <p className="text-xs text-muted-foreground">تصدير المواعيد الأقدم من 30 يوم إلى Google Sheets وحذفها من قاعدة البيانات</p>
                </div>
              </div>
              <Button onClick={handleExport} disabled={exporting} variant="default" className="w-full">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                تصدير وأرشفة الأسبوع
              </Button>
            </div>
            {/* === نهاية إضافة بطاقة التصدير === */}

            {/* System Info */}
            <div className="card-modern p-6 animate-slide-up delay-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">معلومات النظام</h3>
                  <p className="text-xs text-muted-foreground">الحالة والمراقبة</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-muted/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Keep-Alive</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-bold text-foreground">يعمل كل 5 دقائق</span>
                  </div>
                </div>
                <div className="bg-muted/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">انتهاء التجربة التلقائي</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-bold text-foreground">يوم واحد (تلقائي)</span>
                  </div>
                </div>
                <div className="bg-muted/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">AI Agent</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-bold text-foreground">Gemini Flash Lite</span>
                  </div>
                </div>
                <div className="bg-muted/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">إشعارات الطبيب</p>
                  <div className="flex items-center gap-2">
                    <Bell className="w-3 h-3 text-primary" />
                    <span className="text-sm font-bold text-foreground">فوري عبر تليجرام</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <Dialog open={!!activationClinic} onOpenChange={(open) => !open && setActivationClinic(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفعيل اشتراك {activationClinic?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">مدة الاشتراك</label>
              <select
                value={activationPeriod}
                onChange={(e) => setActivationPeriod(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="30">شهر واحد</option>
                <option value="90">3 أشهر</option>
                <option value="180">6 أشهر</option>
                <option value="365">سنة كاملة</option>
                <option value="730">سنتان</option>
                <option value="1825">5 سنوات</option>
                <option value="3650">10 سنوات</option>
                <option value="custom">تاريخ مخصص…</option>
              </select>
            </div>
            {activationPeriod === "custom" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">تاريخ الانتهاء</label>
                <Input
                  type="date"
                  value={customActivationDate}
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  onChange={(e) => setCustomActivationDate(e.target.value)}
                  dir="ltr"
                />
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setActivationClinic(null)}>إلغاء</Button>
              <Button onClick={submitActivation}>
                <CalendarDays className="w-4 h-4" />تفعيل الاشتراك
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

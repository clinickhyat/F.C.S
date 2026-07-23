import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/layout/Footer";
import { toast } from "@/hooks/use-toast";
import { 
  CalendarDays, CheckCircle, Clock, LogOut, QrCode, Search, 
  ShieldCheck, Stethoscope, Wallet, Users, TrendingUp, Timer, 
  Camera, X 
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { QrReader } from "react-qr-reader";

type Appointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  arrived_at: string | null;
  entered_at?: string | null;
  payment_status: string;
  patients: { name: string; phone: string } | null;
  services: { name: string; price: number | null } | null;
};

export default function ReceptionPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const today = dateFilter;
  
  // QR Scanner states
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (clinicLoading) return;
    if (role === "owner" || role === "reception") setUnlocked(true);
    if (role === "cashier") navigate("/cashier", { replace: true });
  }, [role, clinicLoading, navigate]);

  const fetchAppointments = async () => {
    if (!clinic || !unlocked) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("id,date,time,status,reservation_code,arrived_at,payment_status,entered_at,patients(name,phone),services(name,price)")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  };

  useEffect(() => {
    if (!clinic || !unlocked) return;
    fetchAppointments();
    const channel = supabase
      .channel(`reception-${clinic.id}-${today}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, fetchAppointments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinic, unlocked, today]);

  const filtered = useMemo(() => appointments.filter((a) => {
    const matchesSearch =
      a.reservation_code.toLowerCase().includes(search.toLowerCase()) ||
      a.patients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.patients?.phone?.includes(search);
    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return !["cancelled", "completed"].includes(a.status);
    if (statusFilter === "arrived") return !!a.arrived_at && a.status !== "completed";
    if (statusFilter === "waiting") return !a.arrived_at && !["cancelled", "completed"].includes(a.status);
    if (statusFilter === "completed") return a.status === "completed" || !!a.entered_at;
    if (statusFilter === "paid") return a.payment_status === "paid";
    return a.status === statusFilter;
  }), [appointments, search, statusFilter]);

  const unlock = () => {
    if (pin === (clinic?.reception_pin || "1234")) setUnlocked(true);
    else toast({ title: "رمز غير صحيح", description: "تحقق من رمز الاستقبال في الإعدادات", variant: "destructive" });
  };

  const markArrived = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ arrived_at: new Date().toISOString(), department: "استقبال" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    if (error) toast({ title: "خطأ", description: "فشل تحديث الموعد", variant: "destructive" });
    else toast({ title: "تم تأكيد الحضور", description: "انتقلت الحالة إلى الصندوق" });
  };

  const markEntered = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ status: "completed", department: "المعاينة" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    if (error) toast({ title: "خطأ", description: "فشل تسجيل الدخول", variant: "destructive" });
    else toast({ title: "تم الدخول", description: "أُضيفت الحالة إلى المعاينات" });
  };

  const markNoShow = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    if (error) toast({ title: "خطأ", description: "فشل التحديث", variant: "destructive" });
    else toast({ title: "تم تسجيل عدم الحضور", description: "أُغلق الموعد كـ (لم يصل)" });
  };

  // QR Scanner Functions using react-qr-reader (ZXing by Google)
  const handleScan = (result: any) => {
    if (result) {
      const decodedText = result.getText();
      setScanning(false);
      setScannerOpen(false);
      
      // Try to find appointment by ID or reservation code
      const found = appointments.find(a => 
        a.id === decodedText || 
        a.reservation_code === decodedText ||
        a.reservation_code.toLowerCase() === decodedText.toLowerCase()
      );
      
      if (found) {
        if (!found.arrived_at) {
          markArrived(found.id);
        } else {
          toast({ title: "تنبيه", description: "هذا الموعد تم تسجيل حضوره مسبقاً" });
        }
      } else {
        toast({ 
          title: "لم يتم العثور على الموعد", 
          description: `الكود: ${decodedText}`, 
          variant: "destructive" 
        });
      }
    }
  };

  const handleError = (err: any) => {
    console.warn("QR Scanner error:", err);
    // If it's a permission error, show a message
    if (err?.message?.includes("Permission") || err?.message?.includes("permission")) {
      toast({ 
        title: "الرجاء منح إذن الكاميرا", 
        description: "اذهب إلى إعدادات المتصفح واسمح للكاميرا ثم أعد المحاولة", 
        variant: "destructive" 
      });
      setScannerOpen(false);
      setScanning(false);
    }
  };

  const startScanner = () => {
    setScannerOpen(true);
    setScanning(true);
  };

  const stopScanner = () => {
    setScannerOpen(false);
    setScanning(false);
  };

  if (authLoading || clinicLoading) return <div className="min-h-screen bg-mesh flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;

  if (clinicError) {
    return <div className="min-h-screen bg-mesh flex items-center justify-center p-4"><div className="card-modern p-6 max-w-md text-center text-destructive font-bold">{clinicError}</div></div>;
  }

  if (isTrialExpired && role !== "owner") {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
        <div className="card-modern p-8 max-w-md text-center space-y-4">
          <div className="text-3xl">⛔</div>
          <h1 className="text-xl font-black text-foreground">لا يمكن الدخول</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            أنت موظف في عيادة <b>{clinic?.name || ""}</b>. هذه العيادة منتهية الاشتراك. يرجى من صاحب العيادة تجديد الاشتراك.
          </p>
          <Button onClick={signOut} className="w-full">تسجيل الخروج</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      {/* QR Scanner Modal using react-qr-reader */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button 
              onClick={stopScanner}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-center text-foreground mb-4">
              {scanning ? "مسح QR" : "جاري التحميل..."}
            </h3>
            
            <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-2xl bg-black">
              <QrReader
                onResult={handleScan}
                onError={handleError}
                constraints={{ 
                  facingMode: "environment",
                  aspectRatio: 1
                }}
                containerStyle={{ width: '100%', height: '100%' }}
                videoStyle={{ objectFit: 'cover' }}
              />
              {scanning && (
                <div className="absolute inset-0 border-2 border-primary/50 rounded-2xl animate-pulse pointer-events-none" />
              )}
            </div>
            
            <p className="text-xs text-center text-muted-foreground mt-4">
              ضع كود QR داخل الإطار للمسح التلقائي
            </p>
            
            <Button 
              variant="outline" 
              className="w-full mt-4"
              onClick={stopScanner}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {!unlocked && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="card-modern p-8 w-full max-w-sm text-center space-y-5">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-black text-foreground">بوابة الاستقبال</h1>
            <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} placeholder="رمز PIN" className="text-center text-xl tracking-widest" />
            <Button onClick={unlock} className="w-full">دخول</Button>
          </div>
        </div>
      )}

      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4 h-18 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow"><Stethoscope className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-xl font-bold text-foreground">الاستقبال</h1><p className="text-xs text-muted-foreground">مواعيد اليوم</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={startScanner} className="hover:bg-primary/10">
              <Camera className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/cashier")}><Wallet className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <StatsAndCharts appointments={appointments} />

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو كود الحجز أو الهاتف" className="pr-10" /></div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-40">
            <option value="active">النشطة</option>
            <option value="all">الكل</option>
            <option value="waiting">بانتظار الوصول</option>
            <option value="arrived">حاضر</option>
            <option value="paid">مدفوع</option>
            <option value="completed">تم الدخول</option>
            <option value="cancelled">ملغي/لم يصل</option>
          </select>
          <Button variant="outline" onClick={fetchAppointments}><CalendarDays className="w-4 h-4" />تحديث</Button>
        </div>

        <div className="grid gap-3">
          {filtered.map((a) => {
            const confirmedNotArrived = a.status === "confirmed" && !a.arrived_at;
            const arrivedUnpaid = !!a.arrived_at && a.payment_status !== "paid";
            const paidWaitingEntry = !!a.arrived_at && a.payment_status === "paid";
            return (
              <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                    <span className="text-sm text-muted-foreground"><Clock className="w-3 h-3 inline ml-1" />{String(a.time).slice(0, 5)}</span>
                    {confirmedNotArrived && <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">تم التأكيد — لم يصل</span>}
                    {arrivedUnpaid && <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/15 text-blue-600 font-bold">حاضر — بانتظار الدفع</span>}
                    {paidWaitingEntry && <span className="px-2 py-0.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-600 font-bold">مدفوع — جاهز للدخول</span>}
                  </div>
                  <h2 className="font-bold text-foreground">{a.patients?.name || "مريض"}</h2>
                  <p className="text-sm text-muted-foreground">{a.patients?.phone || "بدون هاتف"} — {a.services?.name || "بدون خدمة"}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {!a.arrived_at && (
                    <>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markArrived(a.id)}><CheckCircle className="w-4 h-4" />وصل</Button>
                      <Button variant="destructive" onClick={() => markNoShow(a.id)}>لم يصل</Button>
                    </>
                  )}
                  {paidWaitingEntry && (
                    <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markEntered(a.id)}>
                      <Stethoscope className="w-4 h-4" />دخول
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="card-modern p-12 text-center text-muted-foreground"><QrCode className="w-10 h-10 mx-auto mb-3" />لا توجد مواعيد نشطة اليوم</div>}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatsAndCharts({ appointments }: { appointments: Appointment[] }) {
  const nonCancelled = appointments.filter((a) => a.status !== "cancelled");
  const total = nonCancelled.length;
  const arrived = nonCancelled.filter((a) => !!a.arrived_at || ["arrived","paid","completed"].includes(a.status)).length;
  const waiting = nonCancelled.filter((a) => !a.arrived_at && a.status !== "completed").length;
  const examined = nonCancelled.filter((a) => a.status === "completed" || !!a.entered_at).length;
  const confirmedRate = total > 0 ? Math.round((arrived / total) * 100) : 0;

  const hourly = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (let h = 8; h <= 20; h++) buckets[h] = 0;
    nonCancelled.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h] += 1;
    });
    return Object.entries(buckets).map(([h, count]) => ({ hour: `${h}:00`, count }));
  }, [appointments]);

  const statusData = useMemo(() => ([
    { name: "حضروا", value: arrived },
    { name: "بانتظار", value: waiting },
    { name: "معاينة", value: examined },
  ]), [arrived, waiting, examined]);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(152 69% 40%)"];
  const stats = [
    { label: "إجمالي اليوم", value: total, icon: CalendarDays, tint: "from-primary/20 to-primary/5", iconClass: "text-primary" },
    { label: "حضور", value: arrived, icon: CheckCircle, tint: "from-emerald-500/20 to-emerald-500/5", iconClass: "text-emerald-500" },
    { label: "بانتظار", value: waiting, icon: Timer, tint: "from-amber-500/20 to-amber-500/5", iconClass: "text-amber-500" },
    { label: "الحالات المعاينة", value: examined, icon: Stethoscope, tint: "from-teal-500/20 to-teal-500/5", iconClass: "text-teal-500" },
    { label: "نسبة الحضور", value: `${confirmedRate}%`, icon: TrendingUp, tint: "from-accent/20 to-accent/5", iconClass: "text-accent" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={`card-modern p-4 bg-gradient-to-br ${s.tint} border border-border/60`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                <p className="text-2xl font-black text-foreground mt-1">{s.value}</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-background/60 flex items-center justify-center backdrop-blur">
                <s.icon className={`w-5 h-5 ${s.iconClass}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground">التوزيع الزمني للمواعيد</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourly} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-4 h-4 text-accent" />
            <h3 className="font-bold text-foreground">حالة الحضور</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={4} stroke="hsl(var(--background))" strokeWidth={2}>
                {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
              <Legend wrapperStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

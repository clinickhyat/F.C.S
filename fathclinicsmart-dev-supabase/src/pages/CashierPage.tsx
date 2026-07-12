import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Footer } from "@/components/layout/Footer";
import { toast } from "@/hooks/use-toast";
import { Banknote, CheckCircle, LogOut, Plus, Search, ShieldCheck, Stethoscope, UserPlus, Users, DollarSign, TrendingUp, Receipt, Clock } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

type Appointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  arrived_at: string | null;
  entered_at?: string | null;
  payment_status: string;
  paid_amount?: number | null;
  discount_amount?: number | null;
  is_walk_in: boolean;
  patients: { name: string; phone: string } | null;
  services: { name: string; price: number | null } | null;
};

export default function CashierPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, role, isTrialExpired } = useClinic();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const today = dateFilter;

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (clinicLoading) return;
    if (role === "owner" || role === "cashier") setUnlocked(true);
    if (role === "reception") navigate("/reception", { replace: true });
  }, [role, clinicLoading, navigate]);

  const fetchAppointments = async () => {
    if (!clinic || !unlocked) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("id,date,time,status,reservation_code,arrived_at,entered_at,payment_status,paid_amount,discount_amount,is_walk_in,patients(name,phone),services(name,price)")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .order("time", { ascending: true });
    if (!error) setAppointments((data || []) as Appointment[]);
  };

  useEffect(() => {
    if (!clinic || !unlocked) return;
    fetchAppointments();
    const channel = supabase
      .channel(`cashier-${clinic.id}-${today}`)
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
    if (statusFilter === "active") return !["cancelled"].includes(a.status);
    if (statusFilter === "paid") return a.payment_status === "paid";
    if (statusFilter === "unpaid") return a.payment_status !== "paid" && a.status !== "cancelled";
    if (statusFilter === "arrived") return !!a.arrived_at;
    if (statusFilter === "waiting") return !a.arrived_at && a.status !== "cancelled";
    if (statusFilter === "cancelled") return a.status === "cancelled";
    return true;
  }), [appointments, search, statusFilter]);

  const unlock = () => {
    if (pin === (clinic?.cashier_pin || "5678")) setUnlocked(true);
    else toast({ title: "رمز غير صحيح", description: "تحقق من رمز الصندوق في الإعدادات", variant: "destructive" });
  };

  const markPaid = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ payment_status: "paid", department: "صندوق" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    toast({ title: error ? "خطأ" : "تم تسجيل الدفع", description: error ? "فشل تحديث الدفع" : "انتقلت الحالة إلى الاستقبال للدخول", variant: error ? "destructive" : "default" });
  };

  const markArrived = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ arrived_at: new Date().toISOString(), department: "استقبال" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    toast({ title: error ? "خطأ" : "تم تأكيد الحضور", description: error ? "فشل تحديث الموعد" : "المريض حاضر — يمكن الآن تحصيل الدفع", variant: error ? "destructive" : "default" });
  };

  const markNoShow = async (appointmentId: string) => {
    if (!clinic) return;
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId)
      .eq("clinic_id", clinic.id);
    toast({ title: error ? "خطأ" : "تم تسجيل عدم الحضور", description: error ? "فشل التحديث" : "أُغلق الموعد كـ (لم يصل)", variant: error ? "destructive" : "default" });
  };

  const addWalkIn = async () => {
    if (!clinic || !patientName.trim()) return;
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .insert({ clinic_id: clinic.id, name: patientName.trim(), phone: patientPhone.trim() || "بدون هاتف" })
      .select("id")
      .single();
    if (patientError || !patient) {
      toast({ title: "خطأ", description: "فشل إضافة المريض", variant: "destructive" });
      return;
    }
    const code = `WI-${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await supabase.from("appointments").insert({
      clinic_id: clinic.id,
      patient_id: patient.id,
      date: today,
      time: format(new Date(), "HH:mm"),
      status: "confirmed",
      reservation_code: code,
      arrived_at: new Date().toISOString(),
      payment_status: "paid",
      is_walk_in: true,
      department: "صندوق",
    });
    if (error) toast({ title: "خطأ", description: "فشل إضافة مريض مباشر", variant: "destructive" });
    else {
      toast({ title: "تمت الإضافة", description: `تم تسجيل المريض المباشر ${code}` });
      setWalkInOpen(false); setPatientName(""); setPatientPhone(""); fetchAppointments();
    }
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
      {!unlocked && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="card-modern p-8 w-full max-w-sm text-center space-y-5">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-black text-foreground">بوابة الصندوق</h1>
            <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} placeholder="رمز PIN" className="text-center text-xl tracking-widest" />
            <Button onClick={unlock} className="w-full">دخول</Button>
          </div>
        </div>
      )}

      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4 h-18 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow"><Stethoscope className="w-5 h-5 text-white" /></div>
            <div><h1 className="text-xl font-bold text-foreground">الصندوق</h1><p className="text-xs text-muted-foreground">تحصيل مواعيد اليوم</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/reception")}><Users className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 space-y-5">
        <CashierStats appointments={appointments} />
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو كود الحجز أو الهاتف" className="pr-10" /></div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value || todayStr)} className="md:w-44" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-40">
            <option value="active">النشطة</option>
            <option value="all">الكل</option>
            <option value="paid">مدفوع</option>
            <option value="unpaid">بانتظار الدفع</option>
            <option value="arrived">حاضر</option>
            <option value="waiting">لم يصل</option>
            <option value="cancelled">ملغي</option>
          </select>
          <Button onClick={() => setWalkInOpen(true)}><Plus className="w-4 h-4" />مريض مباشر</Button>
        </div>

        <div className="grid gap-3">
          {filtered.map((a) => {
            const notArrived = !a.arrived_at;
            return (
              <div key={a.id} className="card-modern p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-primary bg-primary/10 px-2 py-1 rounded-lg font-bold">{a.reservation_code}</code>
                    {a.is_walk_in && <span className="badge-success">مباشر</span>}
                    {notArrived && <span className="px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-600 font-bold">لم يصل بعد</span>}
                  </div>
                  <h2 className="font-bold text-foreground">{a.patients?.name || "مريض"}</h2>
                  <p className="text-sm text-muted-foreground">{a.services?.name || "بدون خدمة"} — {a.services?.price == null ? "حسب الفحص" : `${a.services.price} ر.ي`}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {notArrived ? (
                    <>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markArrived(a.id)}><CheckCircle className="w-4 h-4" />وصل</Button>
                      <Button variant="destructive" onClick={() => markNoShow(a.id)}>لم يصل</Button>
                    </>
                  ) : (
                    <Button onClick={() => markPaid(a.id)} disabled={a.payment_status === "paid"}><Banknote className="w-4 h-4" />{a.payment_status === "paid" ? "مدفوع" : "تسجيل الدفع"}</Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="card-modern p-12 text-center text-muted-foreground"><CheckCircle className="w-10 h-10 mx-auto mb-3" />لا توجد مواعيد نشطة اليوم</div>}
        </div>
      </main>

      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إضافة مريض مباشر</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="اسم المريض" />
            <Input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="الهاتف اختياري" />
            <Button onClick={addWalkIn} className="w-full"><UserPlus className="w-4 h-4" />إضافة وتسجيل الدفع</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

function CashierStats({ appointments }: { appointments: Appointment[] }) {
  const paid = appointments.filter((a) => a.payment_status === "paid");
  const waitingPayment = appointments.filter(
    (a) => !!a.arrived_at && a.payment_status !== "paid" && a.status !== "cancelled"
  );
  const amountFor = (a: Appointment) =>
    typeof a.paid_amount === "number" ? a.paid_amount : (a.services?.price || 0);
  const totalRevenue = paid.reduce((s, a) => s + amountFor(a), 0);
  const totalDiscount = paid.reduce((s, a) => s + (a.discount_amount || 0), 0);
  const netRevenue = totalRevenue - totalDiscount;
  const avgTicket = paid.length ? Math.round(totalRevenue / paid.length) : 0;

  const hourly = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (let h = 8; h <= 20; h++) buckets[h] = 0;
    paid.forEach((a) => {
      const h = parseInt(String(a.time).slice(0, 2), 10);
      if (!Number.isNaN(h) && buckets[h] !== undefined) buckets[h] += amountFor(a);
    });
    return Object.entries(buckets).map(([h, amount]) => ({ hour: `${h}:00`, amount }));
  }, [paid]);

  const byService = useMemo(() => {
    const map: Record<string, number> = {};
    paid.forEach((a) => {
      const key = a.services?.name || "بدون خدمة";
      map[key] = (map[key] || 0) + amountFor(a);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid]);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--success, 142 76% 36%))", "hsl(var(--warning, 38 92% 50%))"];
  const stats = [
    { label: "إجمالي الإيرادات", value: `${totalRevenue.toLocaleString()} ر.ي`, icon: DollarSign, tint: "from-emerald-500/20 to-emerald-500/5", iconClass: "text-emerald-500" },
    { label: "صافي الإيرادات", value: `${netRevenue.toLocaleString()} ر.ي`, icon: TrendingUp, tint: "from-primary/20 to-primary/5", iconClass: "text-primary" },
    { label: "متوسط الفاتورة", value: `${avgTicket.toLocaleString()}`, icon: Receipt, tint: "from-violet-500/20 to-violet-500/5", iconClass: "text-violet-500" },
    { label: "مدفوع", value: paid.length, icon: CheckCircle, tint: "from-blue-500/20 to-blue-500/5", iconClass: "text-blue-500" },
    { label: "بانتظار الدفع", value: waitingPayment.length, icon: Clock, tint: "from-amber-500/20 to-amber-500/5", iconClass: "text-amber-500" },
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
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-foreground">الإيرادات حسب الساعة</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourly} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground">توزيع الإيرادات حسب الخدمة</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byService} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={4} stroke="hsl(var(--background))" strokeWidth={2}>
                {byService.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
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
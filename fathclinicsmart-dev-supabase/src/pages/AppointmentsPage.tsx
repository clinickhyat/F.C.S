import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/layout/Footer";
import { SubscriptionLock } from "@/components/SubscriptionLock";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import {
  Stethoscope, Calendar as CalendarIcon, CalendarDays, Plus, Search,
  Edit, Trash2, Loader2, LogOut, Settings, LayoutDashboard,
  CheckCircle, XCircle, Clock, Phone
} from "lucide-react";

interface Appointment {
  id: string;
  patient_id: string;
  date: string;
  time: string;
  status: string;
  reservation_code: string;
  notes: string | null;
  patients: { id?: string; name: string; phone: string; telegram_user_id?: string } | null;
}

interface Patient {
  id: string;
  name: string;
  phone: string;
  telegram_user_id?: string;
}

// ─── دالة استخراج وتصفية الاسم والرقم الحقيقيين من الملاحظات أو البيانات ───
export const extractPatientInfo = (apt: Appointment) => {
  let name = apt.patients?.name || "";
  let phone = apt.patients?.phone || "";

  const isGenericName = !name || name === "." || name.trim().toLowerCase() === "point" || name.startsWith("tg:") || name.includes("غير محدد");
  const isGenericPhone = !phone || phone.trim().toLowerCase().startsWith("tg:") || phone === "." || phone === "بدون هاتف";

  // استخراج الاسم والرقم الصريحين إذا كانا مدونين بالملاحظات القادمة من تلجرام
  if ((isGenericName || isGenericPhone) && apt.notes) {
    const nameMatch = apt.notes.match(/المريض:\s*([^(–\n\r]+)/);
    if (nameMatch && nameMatch[1] && isGenericName) {
      name = nameMatch[1].replace(/👤/g, "").replace(/@\w+/g, "").trim();
    }

    const phoneMatch = apt.notes.match(/\(([^)]+)\)/) || apt.notes.match(/(?:الهاتف:\s*|📱\s*)([+\d\s-]+)/);
    if (phoneMatch && phoneMatch[1] && isGenericPhone) {
      const extractedP = phoneMatch[1].trim();
      if (!extractedP.startsWith("tg:")) {
        phone = extractedP;
      }
    }
  }

  // تنظيف وإعادة صياغة المخرجات النهائية
  let cleanName = name.replace(/^tg:\d+/i, "").replace(/👤/g, "").replace(/@\w+/g, "").trim();
  if (!cleanName || cleanName === "." || cleanName.length < 2) cleanName = "مريض غير محدد";

  let cleanPhone = phone.trim();
  if (!cleanPhone || cleanPhone.toLowerCase().startsWith("tg:") || cleanPhone === "." || cleanPhone === "بدون هاتف") {
    cleanPhone = "حجز عبر تلجرام (بدون رقم)";
  }

  return { cleanName, cleanPhone };
};

export default function AppointmentsPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading } = useClinic();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);

  // Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Form states
  const [formPatientId, setFormPatientId] = useState("");
  const [formDate, setFormDate] = useState<Date | undefined>(new Date());
  const [formTime, setFormTime] = useState("09:00");
  const [formStatus, setFormStatus] = useState("pending");
  const [formNotes, setFormNotes] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // New patient form
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!clinic) return;
    fetchAppointments();
    fetchPatients();

    const channel = supabase
      .channel("appointments-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${clinic.id}` }, () => {
        fetchAppointments();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clinic]);

  const fetchAppointments = async () => {
    if (!clinic) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("appointments")
      .select("*, patients(id, name, phone, telegram_user_id)")
      .eq("clinic_id", clinic.id)
      .order("date", { ascending: false })
      .order("time", { ascending: true });

    if (!error) setAppointments((data || []) as Appointment[]);
    setLoading(false);
  };

  const fetchPatients = async () => {
    if (!clinic) return;
    const { data } = await supabase
      .from("patients")
      .select("id, name, phone, telegram_user_id")
      .eq("clinic_id", clinic.id)
      .order("name");
    setPatients(data || []);
  };

  const generateReservationCode = () => {
    return `RE-${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const resetForm = () => {
    setFormPatientId("");
    setFormDate(new Date());
    setFormTime("09:00");
    setFormStatus("pending");
    setFormNotes("");
    setShowNewPatient(false);
    setNewPatientName("");
    setNewPatientPhone("");
  };

  const handleAddAppointment = async () => {
    if (!clinic || !formDate) return;

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const pickedStr = format(formDate, "yyyy-MM-dd");
    if (pickedStr < todayStr) {
      toast({ title: "تاريخ غير صالح", description: "لا يمكن الحجز في يوم فائت", variant: "destructive" });
      return;
    }
    if (pickedStr === todayStr) {
      const now = new Date();
      const [hh, mm] = formTime.split(":").map(Number);
      const picked = new Date();
      picked.setHours(hh || 0, mm || 0, 0, 0);
      if (picked.getTime() <= now.getTime()) {
        toast({ title: "وقت غير صالح", description: "لا يمكن الحجز في وقت فائت — اختر وقتاً لاحقاً", variant: "destructive" });
        return;
      }
    }

    let patientId = formPatientId;

    if (showNewPatient) {
      if (!newPatientName.trim() || !newPatientPhone.trim()) {
        toast({ title: "خطأ", description: "يرجى إدخال اسم ورقم هاتف المريض", variant: "destructive" });
        return;
      }
      setFormSubmitting(true);
      const { data: newPatient, error: patientError } = await supabase
        .from("patients")
        .insert({ name: newPatientName.trim(), phone: newPatientPhone.trim(), clinic_id: clinic.id })
        .select()
        .single();

      if (patientError) {
        toast({ title: "خطأ", description: "فشل في إضافة المريض", variant: "destructive" });
        setFormSubmitting(false);
        return;
      }
      patientId = newPatient.id;
      fetchPatients();
    }

    if (!patientId) {
      toast({ title: "خطأ", description: "يرجى اختيار مريض", variant: "destructive" });
      return;
    }

    setFormSubmitting(true);
    const { error } = await supabase.from("appointments").insert({
      patient_id: patientId,
      clinic_id: clinic.id,
      date: format(formDate, "yyyy-MM-dd"),
      time: formTime,
      status: formStatus,
      reservation_code: generateReservationCode(),
      notes: formNotes || null,
    });

    setFormSubmitting(false);
    if (error) {
      toast({ title: "خطأ", description: "فشل في إضافة الموعد", variant: "destructive" });
    } else {
      toast({ title: "تم بنجاح", description: "تمت إضافة الموعد" });
      setIsAddOpen(false);
      resetForm();
      fetchAppointments();
    }
  };

  const handleEditAppointment = async () => {
    if (!selectedAppointment || !formDate) return;

    setFormSubmitting(true);
    const updates: Record<string, unknown> = {
      patient_id: formPatientId,
      date: format(formDate, "yyyy-MM-dd"),
      time: formTime,
      status: formStatus,
      notes: formNotes || null,
    };

    const { error } = await supabase
      .from("appointments")
      .update(updates)
      .eq("id", selectedAppointment.id)
      .eq("clinic_id", clinic?.id || "");

    setFormSubmitting(false);
    if (error) {
      toast({ title: "خطأ", description: "فشل في تعديل الموعد", variant: "destructive" });
    } else {
      toast({ title: "تم بنجاح", description: "تم تعديل الموعد" });
      setIsEditOpen(false);
      setSelectedAppointment(null);
      resetForm();
      fetchAppointments();
    }
  };

  const handleDeleteAppointment = async () => {
    if (!selectedAppointment) return;

    setFormSubmitting(true);
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", selectedAppointment.id)
      .eq("clinic_id", clinic?.id || "");

    setFormSubmitting(false);
    if (error) {
      toast({ title: "خطأ", description: "فشل في حذف الموعد", variant: "destructive" });
    } else {
      toast({ title: "تم بنجاح", description: "تم حذف الموعد" });
      setIsDeleteOpen(false);
      setSelectedAppointment(null);
      fetchAppointments();
    }
  };

  const openEditDialog = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setFormPatientId(apt.patient_id);
    setFormDate(new Date(apt.date));
    setFormTime(apt.time);
    setFormStatus(apt.status);
    setFormNotes(apt.notes || "");
    setIsEditOpen(true);
  };

  const openDeleteDialog = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setIsDeleteOpen(true);
  };

  const filteredAppointments = appointments.filter((apt) => {
    const { cleanName, cleanPhone } = extractPatientInfo(apt);

    const matchesSearch =
      cleanName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cleanPhone.includes(searchQuery) ||
      apt.reservation_code.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || apt.status === statusFilter;
    const matchesDate = !dateFilter || apt.date === format(dateFilter, "yyyy-MM-dd");
    return matchesSearch && matchesStatus && matchesDate;
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const statusConfig: Record<string, { bg: string; text: string; border: string; icon: any; label: string }> = {
    pending: { 
      bg: "bg-amber-500/10", 
      text: "text-amber-600", 
      border: "border-amber-500/20",
      icon: Clock,
      label: "قيد الانتظار" 
    },
    confirmed: { 
      bg: "bg-emerald-500/10", 
      text: "text-emerald-600", 
      border: "border-emerald-500/20",
      icon: CheckCircle,
      label: "مؤكد" 
    },
    cancelled: { 
      bg: "bg-rose-500/10", 
      text: "text-rose-600", 
      border: "border-rose-500/20",
      icon: XCircle,
      label: "ملغي" 
    },
  };

  if (authLoading || clinicLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col" dir="rtl">
      <SubscriptionLock />
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
                  <CalendarDays className="w-3 h-3 text-primary" />
                  إدارة المواعيد الطبية
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <LayoutDashboard className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
                <Settings className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Filters & Actions */}
        <div className="card-modern p-4 sm:p-6 mb-6 animate-slide-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_180px_200px_auto] gap-3 items-stretch">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="بحث باسم المريض، الرقم أو كود الحجز..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 input-modern w-full"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="confirmed">مؤكد</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Filter */}
            <div className="relative">
              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={dateFilter ? format(dateFilter, "yyyy-MM-dd") : ""}
                onChange={(e) => setDateFilter(e.target.value ? new Date(`${e.target.value}T12:00:00`) : undefined)}
                className="input-modern w-full pr-10 text-right"
                dir="ltr"
              />
            </div>

            <Button onClick={() => { resetForm(); setIsAddOpen(true); }} className="shadow-lg w-full lg:w-auto">
              <Plus className="w-4 h-4 ml-1" />
              إضافة موعد
            </Button>
          </div>
        </div>

        {/* Appointments Table */}
        <div className="card-modern overflow-hidden animate-slide-up delay-100">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">قائمة المواعيد</h2>
                <p className="text-xs text-muted-foreground">{filteredAppointments.length} موعد مسجل</p>
              </div>
            </div>
            
            <div className="hidden md:flex items-center gap-4">
              {Object.entries(statusConfig).map(([key, config]) => (
                <div key={key} className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bg} ${config.border} border`}>
                  <config.icon className={`w-3.5 h-3.5 ${config.text}`} />
                  <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
                <p className="text-muted-foreground">جاري تحميل المواعيد...</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[920px] table-fixed">
                <colgroup>
                  <col className="w-[140px]" />
                  <col className="w-[210px]" />
                  <col className="w-[135px]" />
                  <col className="w-[110px]" />
                  <col className="w-[140px]" />
                  <col className="w-[180px]" />
                  <col className="w-[110px]" />
                </colgroup>
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">رقم الحجز</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">المريض</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">التاريخ</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">الوقت</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">الحالة</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">ملاحظات</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                            <CalendarDays className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <p className="text-muted-foreground font-medium">لا توجد مواعيد</p>
                          <Button variant="link" onClick={() => { resetForm(); setIsAddOpen(true); }} className="mt-2">
                            إضافة موعد جديد
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((apt, index) => {
                      const status = statusConfig[apt.status] || statusConfig.pending;
                      const { cleanName, cleanPhone } = extractPatientInfo(apt);

                      return (
                        <tr 
                          key={apt.id} 
                          className={`hover:bg-muted/20 transition-colors animate-fade-in ${status.bg.replace('/10', '/5')}`}
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <td className="px-6 py-4">
                            <span className="font-mono text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-lg">
                              {apt.reservation_code}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-semibold text-foreground">{cleanName}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 text-primary/70" />
                                <span dir="ltr">{cleanPhone}</span>
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-foreground font-medium">{apt.date}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-foreground">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{apt.time}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${status.bg} ${status.text} ${status.border} border`}>
                              <status.icon className="w-3.5 h-3.5" />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground text-sm max-w-xs truncate">
                            {apt.notes || "—"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => openEditDialog(apt)}
                                className="hover:bg-primary/10"
                              >
                                <Edit className="w-4 h-4 text-primary" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => openDeleteDialog(apt)}
                                className="hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Add Appointment Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة موعد جديد</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!showNewPatient ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">المريض</label>
                <Select value={formPatientId} onValueChange={setFormPatientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مريض" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} - {p.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="link" size="sm" className="p-0 h-auto text-primary" onClick={() => setShowNewPatient(true)}>
                  + إضافة مريض جديد
                </Button>
              </div>
            ) : (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">مريض جديد</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowNewPatient(false)}>إلغاء</Button>
                </div>
                <Input placeholder="اسم المريض الصريح" value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} />
                <Input placeholder="رقم الهاتف" value={newPatientPhone} onChange={(e) => setNewPatientPhone(e.target.value)} dir="ltr" />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">التاريخ</label>
              <Input
                type="date"
                value={formDate ? format(formDate, "yyyy-MM-dd") : ""}
                onChange={(e) => setFormDate(e.target.value ? new Date(`${e.target.value}T12:00:00`) : undefined)}
                min={format(new Date(), "yyyy-MM-dd")}
                dir="ltr"
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الوقت</label>
              <Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الحالة</label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                  <SelectItem value="confirmed">مؤكد</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">ملاحظات</label>
              <Textarea placeholder="ملاحظات إضافية..." value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>إلغاء</Button>
            <Button onClick={handleAddAppointment} disabled={formSubmitting}>
              {formSubmitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              إضافة الموعد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Appointment Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الموعد</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">المريض</label>
              <Select value={formPatientId} onValueChange={setFormPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مريض" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} - {p.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">التاريخ</label>
              <Input
                type="date"
                value={formDate ? format(formDate, "yyyy-MM-dd") : ""}
                onChange={(e) => setFormDate(e.target.value ? new Date(`${e.target.value}T12:00:00`) : undefined)}
                min={format(new Date(), "yyyy-MM-dd")}
                dir="ltr"
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الوقت</label>
              <Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الحالة</label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                  <SelectItem value="confirmed">مؤكد</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">ملاحظات</label>
              <Textarea placeholder="ملاحظات إضافية..." value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>إلغاء</Button>
            <Button onClick={handleEditAppointment} disabled={formSubmitting}>
              {formSubmitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            هل أنت متأكد من حذف موعد المريض <strong>{selectedAppointment ? extractPatientInfo(selectedAppointment).cleanName : ""}</strong>؟
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDeleteAppointment} disabled={formSubmitting}>
              {formSubmitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

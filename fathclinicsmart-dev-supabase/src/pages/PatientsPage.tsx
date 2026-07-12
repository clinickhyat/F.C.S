import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClinic } from "@/hooks/useClinic";
import { SubscriptionLock } from "@/components/SubscriptionLock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  Users, 
  Search, 
  Phone, 
  Calendar,
  ArrowRight,
  UserCircle,
  Clock,
  Plus,
  Pencil,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Footer } from "@/components/layout/Footer";

const PatientsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clinic, loading: clinicLoading } = useClinic();
  const clinicId = clinic?.id;
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [patientToDelete, setPatientToDelete] = useState<any>(null);
  const [formData, setFormData] = useState({ name: "", phone: "" });

  const { data: patients, isLoading: patientsLoading } = useQuery({
    queryKey: ['patients', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from('patients')
        .select('*, appointments(count)')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId
  });

  const addPatientMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string }) => {
      const { error } = await supabase
        .from('patients')
        .insert({ ...data, clinic_id: clinicId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients', clinicId] });
      toast.success("تمت إضافة المريض بنجاح");
      handleCloseDialog();
    },
    onError: () => toast.error("فشل في إضافة المريض")
  });

  const updatePatientMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; phone: string } }) => {
      const { error } = await supabase
        .from('patients')
        .update(data)
        .eq('id', id)
        .eq('clinic_id', clinicId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients', clinicId] });
      toast.success("تم تحديث بيانات المريض");
      handleCloseDialog();
    },
    onError: () => toast.error("فشل في تحديث البيانات")
  });

  const deletePatientMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', id)
        .eq('clinic_id', clinicId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients', clinicId] });
      toast.success("تم حذف المريض");
      setIsDeleteDialogOpen(false);
      setPatientToDelete(null);
    },
    onError: () => toast.error("فشل في حذف المريض")
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPatient(null);
    setFormData({ name: "", phone: "" });
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", phone: "" });
    setEditingPatient(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (patient: any) => {
    setFormData({ name: patient.name, phone: patient.phone });
    setEditingPatient(patient);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }
    if (editingPatient) {
      updatePatientMutation.mutate({ id: editingPatient.id, data: formData });
    } else {
      addPatientMutation.mutate(formData);
    }
  };

  const filteredPatients = patients?.filter(patient => 
    patient.phone.includes(searchQuery) || 
    patient.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (clinicLoading || patientsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5" dir="rtl">
      <SubscriptionLock />
      {/* Header */}
      <header className="glass-strong border-b border-border/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/dashboard')}
                className="gap-2"
              >
                <ArrowRight className="h-4 w-4" />
                العودة للوحة التحكم
              </Button>
              <div className="h-6 w-px bg-border/50"></div>
              <h1 className="text-xl font-bold text-foreground">إدارة المرضى</h1>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-2">
                <Users className="h-4 w-4" />
                {filteredPatients.length} مريض
              </Badge>
              <Button onClick={handleOpenAdd} className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة مريض
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Search Section */}
        <Card className="glass-strong border-border/50 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-primary" />
              البحث عن مريض
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="ابحث بالاسم أو رقم الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 bg-background/50 border-border/50 focus:border-primary/50"
              />
            </div>
          </CardContent>
        </Card>

        {/* Patients Table */}
        <Card className="glass-strong border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCircle className="h-5 w-5 text-primary" />
              قائمة المرضى
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredPatients.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "لا توجد نتائج للبحث" : "لا يوجد مرضى مسجلين بعد"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-right font-semibold">الاسم</TableHead>
                      <TableHead className="text-right font-semibold">رقم الهاتف</TableHead>
                      <TableHead className="text-right font-semibold">تاريخ التسجيل</TableHead>
                      <TableHead className="text-right font-semibold">عدد الحجوزات</TableHead>
                      <TableHead className="text-right font-semibold">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPatients.map((patient) => (
                      <TableRow 
                        key={patient.id} 
                        className="border-border/30 hover:bg-primary/5 transition-colors"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                              <UserCircle className="h-5 w-5 text-primary" />
                            </div>
                            {patient.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            <span dir="ltr">{patient.phone}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(patient.created_at), 'dd MMMM yyyy', { locale: ar })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="h-3 w-3" />
                            {(patient.appointments as any)?.[0]?.count || 0} حجز
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(patient)}
                              className="h-8 w-8 text-primary hover:bg-primary/10"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setPatientToDelete(patient);
                                setIsDeleteDialogOpen(true);
                              }}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingPatient ? "تعديل بيانات المريض" : "إضافة مريض جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">اسم المريض</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="أدخل اسم المريض"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="أدخل رقم الهاتف"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseDialog}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={addPatientMutation.isPending || updatePatientMutation.isPending}
            >
              {editingPatient ? "حفظ التعديلات" : "إضافة المريض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المريض "{patientToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => patientToDelete && deletePatientMutation.mutate(patientToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
};

export default PatientsPage;

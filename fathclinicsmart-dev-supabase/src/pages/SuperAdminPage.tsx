import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/layout/Footer";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, LogOut, Loader2, Building2, Users, Calendar,
  Check, X, RefreshCw, Search, Crown, Activity, Eye, EyeOff,
  Globe, Save, Webhook
} from "lucide-react";

interface ClinicData {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
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

export default function SuperAdminPage() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clinics, setClinics] = useState<ClinicData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Webhook settings
  const [webhookUrl, setWebhookUrl] = useState("");
  const [updatingWebhook, setUpdatingWebhook] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    const checkAdminAndFetch = async () => {
      if (!user) return;

      // Check if user is admin
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
      await fetchClinics();
      setLoading(false);
    };

    checkAdminAndFetch();
  }, [user, authLoading, navigate]);

  const fetchClinics = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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
      toast({ title: "خطأ", description: "فشل في جلب بيانات العيادات", variant: "destructive" });
    }
  };

  const toggleSubscription = async (clinicId: string, currentStatus: boolean) => {
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: { 
          action: 'toggle-subscription',
          clinicId,
          currentStatus 
        }
      });

      if (response.error) {
        toast({ title: "خطأ", description: "فشل في تحديث حالة الاشتراك", variant: "destructive" });
      } else {
        toast({ title: "تم التحديث ✓", description: `تم ${!currentStatus ? "تفعيل" : "إلغاء"} الاشتراك بنجاح` });
        fetchClinics();
      }
    } catch (error) {
      console.error('Error toggling subscription:', error);
      toast({ title: "خطأ", description: "فشل في تحديث حالة الاشتراك", variant: "destructive" });
    }
  };

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

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const filteredClinics = clinics.filter(clinic =>
    clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    clinic.id.includes(searchQuery)
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      {/* Header */}
      <header className="glass-dark sticky top-0 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-18 py-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-glow">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">لوحة المدير</h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Shield className="w-3 h-3 text-warning" />
                  صلاحيات كاملة
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={fetchClinics}>
                <RefreshCw className="w-5 h-5" />
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
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "إجمالي العيادات", value: clinics.length, icon: Building2, color: "from-blue-500 to-indigo-600" },
            { label: "العيادات النشطة", value: clinics.filter(c => c.subscription?.is_active).length, icon: Activity, color: "from-emerald-500 to-teal-600" },
            { label: "إجمالي المرضى", value: clinics.reduce((sum, c) => sum + c.patients_count, 0), icon: Users, color: "from-violet-500 to-purple-600" },
            { label: "إجمالي المواعيد", value: clinics.reduce((sum, c) => sum + c.appointments_count, 0), icon: Calendar, color: "from-rose-500 to-pink-600" },
          ].map((stat, i) => (
            <div key={i} className="stat-card animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg mb-3`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-2xl font-black text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Webhook Settings */}
        <div className="card-modern p-6 mb-8 animate-slide-up delay-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
              <Webhook className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">رابط Webhook الموحد</h3>
              <p className="text-xs text-muted-foreground">تحديث رابط استقبال تيليجرام لجميع البوتات (HTTPS فقط)</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="relative">
              <Globe className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/webhook/..."
                className="pr-10 input-modern font-mono text-sm"
                dir="ltr"
              />
            </div>
            <Button 
              onClick={updateAllWebhooks} 
              disabled={updatingWebhook}
              className="w-full"
            >
              {updatingWebhook ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              حفظ وتعميم على جميع العيادات
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              سيتم تحديث الـ Webhook لـ {clinics.filter(c => c.has_bot).length} بوت مسجل
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="card-modern p-4 mb-6 animate-slide-up delay-200">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن عيادة بالاسم أو المعرّف..."
              className="pr-10 input-modern"
            />
          </div>
        </div>

        {/* Clinics Table */}
        <div className="card-modern overflow-hidden animate-slide-up delay-300">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-bold text-foreground">جميع العيادات</h2>
            <p className="text-sm text-muted-foreground">إدارة العيادات وتفعيل الاشتراكات</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">العيادة</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">المرضى</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">المواعيد</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">تاريخ التسجيل</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">الحالة</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">إجراءات</th>
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
                    <tr 
                      key={clinic.id} 
                      className="hover:bg-muted/20 transition-colors animate-fade-in"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-foreground">{clinic.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{clinic.id.slice(0, 8)}...</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-foreground">{clinic.patients_count}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-foreground">{clinic.appointments_count}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-sm">
                        {new Date(clinic.created_at).toLocaleDateString("ar-SA")}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`${
                          clinic.subscription?.is_active ? "badge-success" : "badge-destructive"
                        }`}>
                          {clinic.subscription?.is_active ? "نشط" : "غير نشط"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant={clinic.subscription?.is_active ? "outline" : "default"}
                            size="sm"
                            onClick={() => toggleSubscription(clinic.id, clinic.subscription?.is_active || false)}
                          >
                            {clinic.subscription?.is_active ? (
                              <>
                                <X className="w-4 h-4 ml-1" />
                                إلغاء
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4 ml-1" />
                                تفعيل
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
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

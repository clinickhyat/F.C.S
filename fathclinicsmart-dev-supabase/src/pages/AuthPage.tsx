import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Stethoscope, Mail, Lock, User, ArrowLeft, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
});

type Mode = "login" | "owner_signup";

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode: Mode = searchParams.get("mode") === "signup" ? "owner_signup" : "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const navigate = useNavigate();
  const { signUp, user } = useAuth();
  const { toast } = useToast();

  const isLogin = mode === "login";

  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  const validateForm = () => {
    try {
      if (isLogin) loginSchema.parse({ email, password });
      else signupSchema.parse({ email, password, fullName });
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((e) => { if (e.path[0]) newErrors[e.path[0].toString()] = e.message; });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      if (isLogin) {
        // استخدام دالة الوكيل auth-login بدلاً من supabase.auth.signInWithPassword
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const result = await response.json();
        
        if (!result.ok) {
          toast({
            title: "خطأ في تسجيل الدخول",
            description: result.error || "فشل تسجيل الدخول",
            variant: "destructive",
          });
        } else {
          // حفظ الجلسة في العميل المحلي
          await supabase.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          });
          toast({ title: "مرحباً بك!", description: "تم تسجيل الدخول بنجاح" });
          navigate("/dashboard");
        }
      } else {
        const { error } = await signUp(email, password, fullName, "owner");
        if (error) {
          if (error.message.includes("already registered")) {
            toast({ title: "حساب موجود", description: "هذا البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول", variant: "destructive" });
            setMode("login");
          } else {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
          }
        } else {
          toast({ title: "تم إنشاء الحساب!", description: "مرحباً بك في نظام العيادات الذكي" });
          navigate("/dashboard");
        }
      }
    } catch (err: any) {
      toast({
        title: "خطأ غير متوقع",
        description: err?.message || "حدث خطأ أثناء تسجيل الدخول",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const subtitle =
    mode === "login"
      ? "سجل دخولك للوصول إلى لوحة التحكم"
      : "أنشئ حساب صاحب عيادة وابدأ تجربتك المجانية";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed inset-0 bg-gradient-overlay pointer-events-none" />
      <div className="fixed top-20 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="fixed bottom-20 left-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float delay-200" />

      <div className="flex-1 flex items-center justify-center p-4 relative">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 animate-slide-up">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
                <Stethoscope className="w-7 h-7 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold text-foreground">نظام العيادات الذكي</span>
            </div>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-card p-6 animate-slide-up delay-100">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setErrors({}); }} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-5">
                <TabsTrigger value="login">دخول</TabsTrigger>
                <TabsTrigger value="owner_signup">حساب جديد (صاحب عيادة)</TabsTrigger>
              </TabsList>

              <TabsContent value={mode} className="mt-0">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!isLogin && (
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-foreground">الاسم الكامل</Label>
                      <div className="relative">
                        <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input id="fullName" type="text" placeholder="د. أحمد محمد" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pr-10 h-12 bg-background border-border" />
                      </div>
                      {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">البريد الإلكتروني</Label>
                    <div className="relative">
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input id="email" type="email" placeholder="you@clinic.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pr-10 h-12 bg-background border-border" dir="ltr" />
                    </div>
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-foreground">كلمة المرور</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10 h-12 bg-background border-border" dir="ltr" />
                    </div>
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>

                  {isLogin && (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 leading-relaxed">
                      💡 الموظفون (استقبال/صندوق) يسجّلون الدخول من هنا بنفس البريد وكلمة المرور التي أعطاها لهم صاحب العيادة.
                    </p>
                  )}

                  <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <>
                        <span>{isLogin ? "تسجيل الدخول" : "إنشاء حساب صاحب عيادة"}</span>
                        <ArrowLeft className="w-5 h-5 icon-flip" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>

          <div className="text-center mt-6 animate-slide-up delay-200">
            <Button variant="ghost" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
              العودة للصفحة الرئيسية
            </Button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

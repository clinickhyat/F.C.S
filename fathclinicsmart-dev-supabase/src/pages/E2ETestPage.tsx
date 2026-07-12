import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useClinic } from "@/hooks/useClinic";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";
import {
  Stethoscope, ArrowRight, PlayCircle, CheckCircle2, XCircle,
  MinusCircle, Loader2, Bell, MessageSquare, LayoutDashboard,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type StepStatus = "ok" | "fail" | "skipped";
interface Step {
  name: string;
  status: StepStatus;
  details?: string;
}

export default function E2ETestPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { clinic, loading: clinicLoading } = useClinic();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<{ passed: number; failed: number; skipped: number } | null>(null);
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Live notifications stream
  useEffect(() => {
    if (!clinic) return;
    const load = async () => {
      const { data } = await supabase
        .from("telegram_notifications")
        .select("id, title, message, status, notification_type, created_at")
        .eq("clinic_id", clinic.id)
        .order("created_at", { ascending: false })
        .limit(8);
      setRecentNotifs(data || []);
    };
    load();
    const ch = supabase
      .channel("e2e-notifs")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "telegram_notifications", filter: `clinic_id=eq.${clinic.id}` },
        load
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clinic]);

  const runTests = async () => {
    setRunning(true);
    setSteps([]);
    setSummary(null);
    try {
      const { data, error } = await supabase.functions.invoke("e2e-runner", { method: "POST", body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSteps(data.steps || []);
      setSummary({ passed: data.passed, failed: data.failed, skipped: data.skipped });
      toast({
        title: data.overall === "passed" ? "اكتمل الاختبار بنجاح ✓" : "اكتمل الاختبار مع وجود أخطاء",
        description: `نجح: ${data.passed} · فشل: ${data.failed} · مُتخطى: ${data.skipped}`,
        variant: data.overall === "passed" ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "فشل تشغيل الاختبار", description: e?.message || "خطأ غير معروف", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const statusIcon = (s: StepStatus) => {
    if (s === "ok") return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (s === "fail") return <XCircle className="w-5 h-5 text-rose-500" />;
    return <MinusCircle className="w-5 h-5 text-muted-foreground" />;
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
      <header className="glass-strong sticky top-0 z-40">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">اختبار E2E</h1>
              <p className="text-xs text-muted-foreground">فحص شامل للبوت والإشعارات</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/conversation-logs")}>
              <MessageSquare className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <LayoutDashboard className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {/* Instructions */}
        <div className="card-modern p-6 mb-6">
          <h2 className="text-xl font-bold mb-3">تعليمات عملية قبل الاختبار</h2>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal mr-5">
            <li><b className="text-foreground">الطبيب:</b> يربط حسابه للإشعارات فقط عبر <code className="text-xs">/start link_&lt;ownerId&gt;</code>.</li>
            <li><b className="text-foreground">الزبون:</b> يبدأ من رابط حجز العيادة <code className="text-xs">/start clinic_&lt;clinicId&gt;</code> ثم يضغط خدمة من أزرار البوت.</li>
            <li>زر <b className="text-foreground">"جاهز للاختبار"</b> يحاكي زبوناً تجريبياً: دخول برابط العيادة، حجز خدمة، إلغاء بكود RE، طوارئ، ثم تنظيف.</li>
            <li>الإشعارات أدناه تُعرض لحظياً عبر Realtime، أما إشعار تيليجرام الفعلي يصل للطبيب إذا كان حسابه مربوطاً.</li>
          </ol>
          <Button onClick={runTests} disabled={running || !clinic} size="lg" className="w-full mt-5">
            {running ? <><Loader2 className="w-5 h-5 animate-spin" /> جاري الاختبار…</> : <><PlayCircle className="w-5 h-5" /> جاهز للاختبار</>}
          </Button>
        </div>

        {/* Results */}
        {steps.length > 0 && (
          <div className="card-modern p-6 mb-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">نتائج السيناريوهات</h3>
              {summary && (
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600">✓ {summary.passed}</span>
                  <span className="px-2 py-1 rounded-full bg-rose-500/10 text-rose-600">✗ {summary.failed}</span>
                  <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground">— {summary.skipped}</span>
                </div>
              )}
            </div>
            <ul className="space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                  {statusIcon(s.status)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{s.name}</div>
                    {s.details && <div className="text-xs text-muted-foreground mt-1 break-words">{s.details}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Live notifications */}
        <div className="card-modern p-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="font-bold">إشعارات تيليجرام الأخيرة (مباشر)</h3>
          </div>
          {recentNotifs.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد إشعارات بعد.</p>
          ) : (
            <ul className="space-y-2">
              {recentNotifs.map((n) => (
                <li key={n.id} className="text-xs p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{n.title}</span>
                    <span className={
                      n.status === "sent" ? "text-emerald-600" :
                      n.status === "failed" ? "text-rose-600" :
                      "text-muted-foreground"
                    }>{n.status}</span>
                  </div>
                  <div className="text-muted-foreground mt-1 line-clamp-2">{n.message}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("ar")}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

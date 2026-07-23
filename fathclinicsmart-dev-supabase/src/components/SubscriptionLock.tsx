import { useClinic } from "@/hooks/useClinic";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubscriptionLock() {
  const { isTrialExpired } = useClinic();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  if (!isTrialExpired) return null;

  const whatsappSubscribeUrl = `https://wa.me/966576651187?text=${encodeURIComponent("السلام عليكم، أرغب بتجديد اشتراك عيادتي.")}`;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/98 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="card-modern p-10 max-w-lg text-center animate-scale-in">
        <div className="w-20 h-20 rounded-3xl bg-warning/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-warning" />
        </div>
        <h2 className="text-3xl font-black text-foreground mb-4">الاشتراك غير مفعّل</h2>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          عيادتك مقفلة حتى يتم تفعيل أو تجديد الاشتراك. تواصل عبر واتساب لإكمال الدفع.
        </p>
        <div className="bg-muted/50 rounded-2xl p-6 text-right mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-primary font-bold" dir="ltr">SA6080205413910222121014</span>
            <span className="text-muted-foreground">بنك الراجحي</span>
          </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch">
          <a
            href={whatsappSubscribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-success text-success-foreground font-bold shadow-glow hover:opacity-90 transition"
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
  );
}

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

  const whatsappSupportUrl = `https://wa.me/966576651187?text=${encodeURIComponent(
    "السلام عليكم، أرغب بتجديد اشتراك عيادتي."
  )}`;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="card-modern p-10 max-w-md text-center animate-scale-in border border-border/40 shadow-2xl">
        {/* أيقونة */}
        <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-6 border border-warning/20">
          <AlertTriangle className="w-10 h-10 text-warning" />
        </div>

        {/* العنوان */}
        <h2 className="text-3xl font-bold text-foreground mb-3">
          انتهت صلاحية الاشتراك
        </h2>

        {/* النص الرسمي */}
        <div className="space-y-4 mb-8 text-right">
          <p className="text-muted-foreground leading-relaxed">
            نحيطكم علماً بأن الفترة التجريبية لنظام عيادتك قد انتهت.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            لتجديد الاشتراك واستعادة كامل الخدمات، يرجى التواصل مع إدارة النظام
            عبر الزر أدناه. سيقوم فريق الدعم بتوجيهكم لإتمام عملية التجديد بكل
            سهولة.
          </p>
          <p className="text-sm text-muted-foreground/80 leading-relaxed bg-muted/30 p-3 rounded-xl">
            📌 <span className="font-medium">ملاحظة:</span> جميع بيانات عيادتك
            ومرضاك محفوظة بشكل آمن وستُستعاد فور تجديد الاشتراك.
          </p>
        </div>

        {/* أزرار الإجراءات */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch">
          <a
            href={whatsappSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <MessageCircle className="w-5 h-5" />
            التواصل مع الدعم لتجديد الاشتراك
          </a>
          <Button
            variant="outline"
            size="lg"
            onClick={handleSignOut}
            className="gap-2"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
        </div>

        {/* تذييل شفاف */}
        <p className="text-xs text-muted-foreground/60 mt-6 border-t border-border/30 pt-4">
          نظام إدارة العيادات الذكي © 2026
        </p>
      </div>
    </div>
  );
}

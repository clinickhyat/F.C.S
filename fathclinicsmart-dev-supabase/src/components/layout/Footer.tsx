import { Stethoscope } from "lucide-react";

export function Footer() {
  return (
    <footer className="py-8 border-t border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-foreground">Smart Clinic</span>
              <span className="text-xs text-muted-foreground block">نظام العيادات الذكي</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span>للتواصل:</span>
            <a href="mailto:smartclinic1997@gmail.com" className="font-bold text-primary hover:underline">
              smartclinic1997@gmail.com
            </a>
          </div>

          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} SmartClinicFath — جميع الحقوق محفوظة
          </div>
        </div>
      </div>
    </footer>
  );
}

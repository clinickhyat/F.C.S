import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";
import { 
  Calendar, 
  Users, 
  BarChart3, 
  Bot, 
  Shield, 
  Smartphone,
  ArrowLeft,
  CheckCircle,
  Stethoscope,
  Clock,
  Sparkles,
  Zap,
  TrendingUp,
  MessageSquare,
  Play,
  ChevronLeft,
  CreditCard,
  Percent,
  Mic,
  QrCode,
  Moon,
  ShieldCheck,
  HelpCircle
} from "lucide-react";

const WHATSAPP_NUMBER = "967715365516"; // bilateral; wa.me requires international format
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("السلام عليكم، أرغب بمعرفة الرابط الصحيح للنظام والاشتراك.")}`;

const features = [
  {
    icon: Bot,
    title: "حجز آلي بالذكاء الاصطناعي",
    description: "بوت تيليجرام متقدم يتعامل مع حجوزات المرضى تلقائياً على مدار الساعة دون تدخل منك",
    color: "from-blue-500 to-indigo-600",
  },
  {
    icon: Mic,
    title: "وكيل صوتي ذكي (مجاناً)",
    description: "ردود صوتية عربية واضحة بدون استهلاك رصيد — يتحدث مع المريض بنبرة طبيعية ودودة",
    color: "from-fuchsia-500 to-pink-600",
  },
  {
    icon: QrCode,
    title: "عيادة ذكية بـ QR",
    description: "كود QR لكل حجز يسهّل استقبال المريض في العيادة بمسحة واحدة من الهاتف",
    color: "from-teal-500 to-emerald-600",
  },
  {
    icon: BarChart3,
    title: "تقارير Power BI الذكية",
    description: "تحليلات متقدمة للأداء والإيرادات مع لوحات بيانات تفاعلية ورسوم بيانية حية",
    color: "from-violet-500 to-purple-600",
  },
  {
    icon: MessageSquare,
    title: "نظام المطاردة للمرضى",
    description: "متابعة تلقائية للمرضى الذين لم يحضروا وإرسال تذكيرات ذكية لإعادة الحجز",
    color: "from-emerald-500 to-teal-600",
  },
  {
    icon: Calendar,
    title: "إدارة مواعيد ذكية",
    description: "جدول زمني متطور مع تحديثات لحظية وأكواد حجز فريدة لكل موعد",
    color: "from-orange-500 to-amber-600",
  },
  {
    icon: ShieldCheck,
    title: "حماية من التلاعب بالحجوزات",
    description: "ربط كل مريض بمعرّفه في تيليجرام لمنع الحجز بأسماء وهمية أو متكررة",
    color: "from-indigo-500 to-blue-600",
  },
  {
    icon: Shield,
    title: "أمان على مستوى البنوك",
    description: "حماية كاملة للبيانات مع تشفير متقدم وعزل تام لكل عيادة",
    color: "from-rose-500 to-pink-600",
  },
  {
    icon: Smartphone,
    title: "تصميم متجاوب 100%",
    description: "واجهة أنيقة تعمل بسلاسة على جميع الأجهزة من الجوال للكمبيوتر",
    color: "from-cyan-500 to-blue-600",
  },
];

const stats = [
  { value: "99.9%", label: "وقت التشغيل", icon: Zap },
  { value: "24/7", label: "دعم فني متواصل", icon: MessageSquare },
  { value: "AI", label: "بوت ذكي متقدم", icon: Bot },
  { value: "QR", label: "استقبال بمسحة واحدة", icon: QrCode },
];

const pricingPlans = [
  {
    name: "الباقة الأساسية",
    price: "مجاني",
    period: "يوم واحد تجريبي",
    features: ["حجز آلي عبر البوت", "إدارة المواعيد", "لوحة تحكم أساسية", "دعم عبر الواتساب"],
    highlighted: false,
  },
  {
    name: "الباقة الشهرية",
    price: "تواصل معنا",
    period: "اشتراك شهري",
    features: ["جميع مميزات الباقة الأساسية", "تقارير Power BI المتقدمة", "نظام المطاردة للمرضى", "دعم فني أولوية", "تخصيص كامل"],
    highlighted: true,
  },
  {
    name: "الباقة السنوية",
    price: "خصم 20%",
    period: "اشتراك سنوي",
    features: ["جميع مميزات الباقة الشهرية", "خصم 20% على السعر الإجمالي", "أولوية قصوى في الدعم", "تحديثات مجانية", "تدريب فريق العيادة"],
    highlighted: false,
    discount: true,
  },
];

const paymentMethods = [
  { name: "مصرف الراجحي (سعودي) — مفضّل", account: "SA6080205413910222121014" },
  { name: "بنك الكريمي (سعودي)", account: "3135756163" },
  { name: "بنك الكريمي (يمني)", account: "3135756171" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-strong">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-18 py-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold text-foreground">Smart Clinic</span>
                <span className="text-xs text-muted-foreground block">نظام العيادات الذكي</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/auth">
                <Button variant="ghost" size="sm">تسجيل الدخول</Button>
              </Link>
              <Link to="/auth?mode=signup">
                <Button variant="default" size="sm" className="shadow-lg">
                  <Sparkles className="w-4 h-4" />
                  ابدأ مجاناً
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 overflow-hidden bg-mesh">
        {/* Floating Elements */}
        <div className="floating-element w-96 h-96 bg-primary/20 top-20 -right-32 animate-float" />
        <div className="floating-element w-80 h-80 bg-accent/20 bottom-20 -left-20 animate-float-slow delay-200" />
        <div className="floating-element w-64 h-64 bg-violet-500/15 top-40 left-1/4 animate-float delay-400" />
        
        {/* Hero Pattern */}
        <div className="absolute inset-0 hero-pattern opacity-50" />
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-5xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/20 text-primary mb-8 animate-fade-in">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-semibold">جرّب مجاناً ليوم كامل</span>
              <ChevronLeft className="w-4 h-4" />
            </div>
            
            {/* Main Heading */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-foreground mb-6 leading-tight animate-slide-up">
              أدر عيادتك بذكاء مع
              <span className="block gradient-text mt-3">Smart Clinic System</span>
            </h1>
            
            {/* Subheading */}
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed animate-slide-up delay-100">
              نظام SaaS متكامل يجمع بين الحجز الآلي عبر البوت، تقارير Power BI الذكية، 
              ونظام المطاردة للمرضى - كل ذلك في منصة واحدة سهلة الاستخدام
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 animate-slide-up delay-200">
              <Link to="/auth?mode=signup">
                <Button variant="hero" size="xl" className="w-full sm:w-auto group">
                  <Sparkles className="w-5 h-5 transition-transform group-hover:rotate-12" />
                  <span>ابدأ التجربة المجانية</span>
                  <ArrowLeft className="w-5 h-5 icon-flip transition-transform group-hover:-translate-x-1" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline" size="xl" className="w-full sm:w-auto">
                  <Play className="w-5 h-5" />
                  لديك حساب؟ سجل دخولك
                </Button>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-muted-foreground text-sm animate-fade-in delay-300">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span>لا تحتاج بطاقة ائتمان</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span>إعداد في 5 دقائق</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span>دعم فني باللغة العربية</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 relative">
        <div className="section-divider" />
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div 
                key={index} 
                className="stat-card text-center animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary/10 flex items-center justify-center mx-auto mb-4">
                  <stat.icon className="w-7 h-7 text-primary" />
                </div>
                <div className="text-3xl md:text-4xl font-black gradient-text mb-2">
                  {stat.value}
                </div>
                <div className="text-muted-foreground text-sm font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="section-divider" />
      </section>

      {/* Features Section */}
      <section className="py-24 bg-mesh relative">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent mb-6">
              <Zap className="w-4 h-4" />
              <span className="text-sm font-semibold">مميزات حصرية</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-foreground mb-5">
              كل ما تحتاجه في <span className="gradient-text">منصة واحدة</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              مجموعة متكاملة من الأدوات الذكية المصممة خصيصاً لتحويل عيادتك إلى عيادة رقمية متطورة
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="feature-card group animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-500`}>
                  <feature.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 relative">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-6">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-semibold">أسعار مناسبة</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-foreground mb-5">
              خطط <span className="gradient-text">اشتراك مرنة</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              ابدأ مجاناً واختر الخطة المناسبة لحجم عيادتك واحتياجاتك
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
            {pricingPlans.map((plan, index) => (
              <div
                key={index}
                className={`relative rounded-3xl p-8 transition-all duration-500 animate-slide-up ${
                  plan.highlighted 
                    ? "bg-gradient-hero text-white shadow-2xl scale-105" 
                    : "bg-card border border-border shadow-card hover:shadow-card-hover"
                }`}
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 right-8 px-4 py-1.5 bg-accent rounded-full text-sm font-bold text-white shadow-glow-accent">
                    الأكثر طلباً
                  </div>
                )}
                {plan.discount && (
                  <div className="absolute -top-4 right-8 px-4 py-1.5 bg-success rounded-full text-sm font-bold text-white flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    توفير 20%
                  </div>
                )}
                <h3 className={`text-2xl font-bold mb-2 ${plan.highlighted ? "text-white" : "text-foreground"}`}>
                  {plan.name}
                </h3>
                <div className="mb-6">
                  <span className={`text-3xl font-black ${plan.highlighted ? "text-white" : "gradient-text"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm mr-2 ${plan.highlighted ? "text-white/70" : "text-muted-foreground"}`}>
                    / {plan.period}
                  </span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <CheckCircle className={`w-5 h-5 flex-shrink-0 ${plan.highlighted ? "text-accent" : "text-success"}`} />
                      <span className={`text-sm ${plan.highlighted ? "text-white/90" : "text-muted-foreground"}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link to="/auth?mode=signup" className="block">
                  <Button 
                    variant={plan.highlighted ? "hero-light" : "default"} 
                    size="lg" 
                    className="w-full"
                  >
                    {plan.highlighted ? "تواصل معنا الآن" : "ابدأ التجربة المجانية"}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          {/* Payment Methods */}
          <div className="max-w-2xl mx-auto">
            <div className="card-modern p-6 animate-slide-up delay-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                  <CreditCard className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">طرق الدفع المتاحة</h3>
                  <p className="text-xs text-muted-foreground">اختر الطريقة المناسبة لك</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {paymentMethods.map((method, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <span className="text-muted-foreground font-medium">{method.name}</span>
                    <span className="font-mono text-primary font-bold">
                      {method.account || "سيتم تحديثه قريباً"}
                    </span>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-6 border-t border-border text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  للاستفسار والاشتراك تواصل مع المطور: 
                  <span className="text-primary font-bold mr-1">م/ فتح الرحمن الخياط</span>
                </p>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="تواصل عبر واتساب">
                  <Button variant="default" size="lg" className="bg-[#25D366] hover:bg-[#1ebe57] text-white shadow-lg gap-2">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.555-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.353l-.999 3.648 3.889-.7zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
                    </svg>
                    تواصل عبر واتساب الآن
                  </Button>
                </a>
                <p className="text-xs text-muted-foreground">اضغط الأيقونة لفتح المحادثة مباشرة — الرقم محفوظ تلقائياً.</p>
              </div>
            </div>
          </div>

          {/* 24/7 Doctor section */}
          <div className="max-w-4xl mx-auto mt-12">
            <div className="card-modern p-8 bg-gradient-to-br from-indigo-500/5 to-blue-500/5 border-2 border-primary/10 animate-slide-up">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shrink-0">
                  <Moon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-foreground mb-2">موظف لا ينام ولا يتعب — يعمل 24/7</h3>
                  <p className="text-sm text-muted-foreground">المشكلة والحل بأسلوب احترافي</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                <div className="p-5 rounded-2xl bg-destructive/5 border border-destructive/10">
                  <div className="flex items-center gap-2 mb-3 text-destructive font-bold">
                    <HelpCircle className="w-5 h-5" /> المشكلة
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    موظف الاستقبال يغادر بعد الدوام، يأخذ إجازات، يرد متأخراً، يفقد الحجوزات، ويُكلّفك راتباً شهرياً مع أخطاء بشرية لا يمكن تفاديها. والمرضى الذين يحاولون الحجز ليلاً أو في العطلات ببساطة يضيعون.
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-success/5 border border-success/10">
                  <div className="flex items-center gap-2 mb-3 text-success font-bold">
                    <CheckCircle className="w-5 h-5" /> الحل
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    موظف رقمي ذكي يعمل على مدار 24 ساعة، 7 أيام في الأسبوع، بدون إجازات ولا أخطاء، يرد فوراً بصوت أو نص، يحجز، يذكّر، يتابع، ويخدم آلاف المرضى في نفس اللحظة — كل هذا بكلفة جزء بسيط من راتب موظف واحد.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-hero relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute inset-0 hero-pattern opacity-20" />
        <div className="floating-element w-72 h-72 bg-white/5 top-10 right-10 animate-float" />
        <div className="floating-element w-56 h-56 bg-accent/10 bottom-10 left-10 animate-float-slow" />
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white mb-8">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">انضم إلينا اليوم</span>
            </div>
            
            <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
              جاهز لتحويل عيادتك؟
            </h2>
            <p className="text-xl text-white/80 mb-10 leading-relaxed">
              انضم إلى مئات العيادات في اليمن التي تستخدم نظامنا لتحسين خدماتها وزيادة إيراداتها
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Link to="/auth?mode=signup">
                <Button variant="hero-light" size="xl" className="w-full sm:w-auto group">
                  <Sparkles className="w-5 h-5 transition-transform group-hover:rotate-12" />
                  <span>ابدأ مجاناً الآن</span>
                  <ArrowLeft className="w-5 h-5 icon-flip" />
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-white/70 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-accent" />
                <span>لا تحتاج بطاقة ائتمان</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-accent" />
                <span>يوم تجريبي مجاني</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-accent" />
                <span>إلغاء في أي وقت</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

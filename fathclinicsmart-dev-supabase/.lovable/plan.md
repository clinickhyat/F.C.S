# الخطة النهائية — تحسينات المشروع القديم

القيود: لا تغيير في مخطط قاعدة البيانات، لا كسر لأي ميزة قائمة (PIN، البوت، التذكيرات، QR، الاشتراكات).

## 1) تحويل تلقائي بعد تأكيد الحضور
- في `AppointmentsPage.tsx`: عند نجاح "تأكيد الحضور" من إدارة المواعيد → `navigate("/reception")` (خيار: toast بزر "فتح الاستقبال").
- في `ReceptionPage.tsx`: بعد `markArrived` بنجاح → `navigate("/cashier")` تلقائياً (بعد ثانية، مع toast).
- الصندوق يبقى نهاية السلسلة (لا تحويل بعد الدفع، فقط تحديث).

## 2) داشبورد احترافي في Reception و Cashier (مثل الصورة المرجعية)
تثبيت `recharts` (موجودة فعلاً في مكتبة shadcn chart).

### ReceptionPage — أعلى الصفحة
- **4 بطاقات KPI** بتصميم glass + أيقونة دائرية ملونة + رقم كبير + Δ% مقابل الأمس:
  - إجمالي اليوم / حضور / متبقي / نسبة الحضور
- **BarChart** (7 أيام): إجمالي vs حضور فعلي (أزرق/أخضر).
- **PieChart**: توزيع الخدمات الأكثر طلباً اليوم.
- **AreaChart**: حضور ساعة بساعة (أوقات الذروة).
- قائمة المواعيد الحالية تبقى كما هي أسفل الداشبورد.

### CashierPage — أعلى الصفحة
- **4 بطاقات KPI**: إجمالي الإيراد اليوم / مدفوع / بانتظار الدفع / مباشر.
- **BarChart** (7 أيام): الإيراد اليومي (تدرج أخضر).
- **PieChart**: توزيع الإيراد حسب الخدمة.
- **LineChart**: مدفوعات ساعة بساعة.
- قائمة الجاهزين للدفع تبقى كما هي.

مصدر البيانات: استعلامات قراءة إضافية على `appointments` مع `.eq('clinic_id', ...)` (آخر 7 أيام + اليوم). لا أعمدة جديدة.

الألوان: `hsl(var(--primary))`, `--accent`, `--success`, `--warning` من نظام التصميم (لا ألوان hardcoded).

## 3) منع الحجز في وقت فائت (تعزيز)
في `AppointmentsPage.tsx` عند submit إضافة/تعديل موعد:
- إذا `date < today` → toast خطأ ومنع الحفظ.
- إذا `date === today && time <= now` → toast خطأ ومنع الحفظ.
(يوجد `min` على input التاريخ فعلاً — نضيف تحقق الوقت.)

## 4) تصدير Google Sheets الأسبوعي + أرشفة (>30 يوماً)
في `SuperAdminPortal.tsx` (تبويب/قسم جديد "الأرشفة"):
- حقل حفظ `google_apps_script_url` في `system_settings` (عمود موجود أو `settings_json`).
- زر **تصدير ومزامنة الأسبوع**:
  1. Edge Function جديدة `weekly-archive` تجلب المواعيد `date < now() - 30 days` مقسّمة حسب `clinic_id` مع بيانات المريض/الخدمة.
  2. POST لكل عيادة إلى URL المحفوظ بصيغة `{clinic_name, rows[]}`.
  3. عند نجاح 200 → حذف تلك الصفوف من `appointments`.
  4. إرجاع عدد المواعيد المُصدّرة/المحذوفة لكل عيادة.
- توست نجاح مع الإحصائيات.
- زر إضافي "تحميل CSV" (اختياري) في Dashboard للمالك.

## 5) تنظيف الواجهة الرئيسية
في `LandingPage.tsx`: إزالة/إخفاء عبارة "٥٠٠ عيادة تستخدم النظام".

## 6) اختبار الموظفين (بدون تغيير منطق)
- تحقق أن الاستقبال لا يرى بيانات الصندوق والعكس (مضمون بـ RLS + role check الحالي).
- تحقق دخول صحيح/خاطئ للـ PIN.
- تحقق أن Realtime لا يزال يحدّث الصفحتين.

## ملفات ستُعدَّل
```text
src/pages/AppointmentsPage.tsx     — auto-redirect + past-time guard
src/pages/ReceptionPage.tsx        — KPIs + 3 charts + auto-redirect
src/pages/CashierPage.tsx          — KPIs + 3 charts
src/pages/SuperAdminPortal.tsx     — Google Sheets URL + Export button
src/pages/LandingPage.tsx          — remove "500 clinics" line
src/pages/Dashboard.tsx            — (اختياري) CSV export
supabase/functions/weekly-archive/index.ts  — جديد
```

## ترتيب التنفيذ والاختبار (دفعات صغيرة)
1. **الدفعة أ**: التحويل التلقائي + منع الوقت الفائت + إزالة "٥٠٠ عيادة". (اختبار سريع)
2. **الدفعة ب**: داشبورد Reception كامل. (اختبار)
3. **الدفعة ج**: داشبورد Cashier كامل. (اختبار)
4. **الدفعة د**: Edge Function للأرشفة + زر التصدير + حقل URL. (اختبار على عيادة تجريبية)

هل أبدأ الدفعة أ؟
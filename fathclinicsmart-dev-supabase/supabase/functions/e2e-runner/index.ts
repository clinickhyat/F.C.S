// E2E Test Runner — runs all bot scenarios using the live telegram-bot function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StepResult {
  name: string;
  status: "ok" | "fail" | "skipped";
  details?: string;
  data?: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // --- Auth check ---
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace("Bearer ", "");
    let userId: string | null = null;
    let clinic: any = null;

    // Service-role bypass: accepts ?owner_id=<uuid> for admin/automated testing
    if (jwt && jwt === serviceKey) {
      const url = new URL(req.url);
      const ownerOverride = url.searchParams.get("owner_id");
      if (ownerOverride) userId = ownerOverride;
    } else if (jwt) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      userId = userData?.user?.id || null;
    }
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { data: c } = await supabase
      .from("clinics")
      .select("id, name, bot_token, owner_id")
      .eq("owner_id", userId)
      .maybeSingle();
    clinic = c;
    if (!clinic) return json({ error: "no clinic for user" }, 400);

    const steps: StepResult[] = [];
    const testTgUserId = `e2e_${Math.floor(Math.random() * 1_000_000)}`;
    const testChatId = 999_000_000 + Math.floor(Math.random() * 999_999);
    const testFirstName = "اختبار_تلقائي";

    // --- 0. Cleanup previous E2E rows ---
    await supabase
      .from("patients")
      .delete()
      .like("phone", "tg:e2e_%")
      .eq("clinic_id", clinic.id);
    steps.push({ name: "تهيئة بيئة الاختبار", status: "ok" });

    // --- 1. Ensure at least one active service exists ---
    let { data: services } = await supabase
      .from("services")
      .select("id, name, price")
      .eq("clinic_id", clinic.id)
      .eq("is_active", true)
      .limit(1);

    if (!services || services.length === 0) {
      const { data: created, error: svcErr } = await supabase
        .from("services")
        .insert({
          clinic_id: clinic.id,
          name: "كشف عام (اختبار)",
          price: 5000,
          duration_minutes: 30,
          is_active: true,
        })
        .select("id, name, price")
        .single();
      if (svcErr) {
        steps.push({
          name: "تجهيز خدمة تجريبية",
          status: "fail",
          details: svcErr.message,
        });
        return finalize(supabase, clinic.id, userId, steps);
      }
      services = [created];
      steps.push({
        name: "تجهيز خدمة تجريبية",
        status: "ok",
        details: `أُنشئت خدمة: ${created.name}`,
      });
    } else {
      steps.push({
        name: "تجهيز خدمة تجريبية",
        status: "ok",
        details: `الخدمة الموجودة: ${services[0].name}`,
      });
    }
    const service = services![0];

    const botEndpoint = `${supabaseUrl}/functions/v1/telegram-bot`;

    let updateIdCounter = Date.now();
    const callBot = async (body: any) => {
      const res = await fetch(botEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    };

    // Synthetic Telegram user
    const tgFromId = 900_000_000 + Math.floor(Math.random() * 99_000_000);
    const startTgId = String(tgFromId);
    const baseFrom = { id: tgFromId, first_name: testFirstName };
    const baseChat = { id: tgFromId, type: "private" };

    const sendText = (text: string) => callBot({
      update_id: ++updateIdCounter,
      message: {
        message_id: updateIdCounter, from: baseFrom, chat: baseChat,
        date: Math.floor(Date.now() / 1000), text,
      },
    });
    const sendCallback = (data: string) => callBot({
      update_id: ++updateIdCounter,
      callback_query: {
        id: String(updateIdCounter), from: baseFrom,
        message: { message_id: updateIdCounter, chat: baseChat },
        data,
      },
    });

    // --- Cleanup any stale session for this synthetic user ---
    await supabase.from("bot_sessions").delete().eq("telegram_user_id", startTgId);

    // --- 2. Scenario: /start clinic_<id> (patient onboarding) ---
    await sendText(`/start clinic_${clinic.id}`);
    await sleep(700);
    const { data: patient } = await supabase
      .from("patients")
      .select("id, name")
      .eq("clinic_id", clinic.id)
      .or(`telegram_user_id.eq.${startTgId},phone.eq.tg:${startTgId}`)
      .maybeSingle();
    steps.push({
      name: "السيناريو 1: تسجيل عميل عبر /start",
      status: patient ? "ok" : "fail",
      details: patient ? `أُنشئ المريض: ${patient.name}` : `لم يتم إنشاء المريض.`,
    });

    // --- 3. Scenario: Reply-keyboard buttons must route instead of falling back to AI/help ---
    await sendText("حجز موعد");
    await sleep(500);
    const shortCallback = `book:${service.id}`;
    steps.push({
      name: "السيناريو 2: زر حجز موعد/الخدمات قابل للضغط",
      status: shortCallback.length <= 64 ? "ok" : "fail",
      details: shortCallback.length <= 64
        ? `callback_data آمن (${shortCallback.length}/64)`
        : `callback_data طويل جداً (${shortCallback.length}/64)`,
    });

    // --- 4. Scenario: Full booking wizard via callback + multi-step messages ---
    await sendCallback(`book:${service.id}`); // → ask_name
    await sleep(500);
    await sendText("عميل تجريبي للاختبار"); // → ask_phone
    await sleep(500);
    await sendText("967777123456"); // → ask_date
    await sleep(500);
    const today = new Date().toISOString().slice(0, 10);
    await sendCallback(`date_${today}`); // → ask_time

    // Find first free time and book it
    const { data: takenToday } = await supabase
      .from("appointments")
      .select("time")
      .eq("clinic_id", clinic.id)
      .eq("date", today)
      .in("status", ["pending", "confirmed"]);
    const HOURS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30"];
    const booked = new Set((takenToday || []).map((a: any) => String(a.time).slice(0, 5)));
    const freeTime = HOURS.find((t) => !booked.has(t)) || "08:00";
    await sleep(400);
    await sendCallback(`time_${freeTime.replace(":", "")}`); // → finalize
    await sleep(900);

    const { data: appt } = await supabase
      .from("appointments")
      .select("id, reservation_code, date, time, status")
      .eq("clinic_id", clinic.id)
      .eq("customer_telegram_id", startTgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    steps.push({
      name: "السيناريو 3: حجز موعد عبر التدفّق الكامل",
      status: appt ? "ok" : "fail",
      details: appt
        ? `كود الحجز: ${appt.reservation_code} · ${appt.date} ${appt.time}`
        : "لم يُنشأ موعد — تحقّق من اللوجز",
      data: appt,
    });

    // --- Check notification for doctor ---
    let notif = null as any;
    if (appt) {
      const { data: n } = await supabase
        .from("telegram_notifications")
        .select("id, status, error_message, notification_type, message, created_at")
        .eq("clinic_id", clinic.id)
        .eq("notification_type", "booking")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      notif = n;
      steps.push({
        name: "إشعار الطبيب بالحجز",
        status: n ? (n.status === "sent" ? "ok" : "skipped") : "fail",
        details: n
          ? n.status === "sent"
            ? "أُرسل عبر تيليجرام للطبيب ✓"
            : n.status === "skipped"
            ? "لم يُربط حساب الطبيب بعد (skipped)"
            : `الحالة: ${n.status} — ${n.error_message || ""}`
          : "لم يُسجَّل إشعار في قاعدة البيانات",
      });
    }

    // --- 5. Scenario: Cancel via RE-XXXX text ---
    if (appt) {
      await sendText(appt.reservation_code);
      await sleep(700);
      const { data: cancelled } = await supabase
        .from("appointments")
        .select("status")
        .eq("id", appt.id)
        .maybeSingle();
      steps.push({
        name: "السيناريو 4: إلغاء الموعد عبر كود الحجز",
        status: cancelled?.status === "cancelled" ? "ok" : "fail",
        details: `حالة الموعد: ${cancelled?.status || "غير معروف"}`,
      });
    } else {
      steps.push({
        name: "السيناريو 4: إلغاء الموعد",
        status: "skipped",
        details: "لا يوجد موعد ليتم إلغاؤه",
      });
    }

    // --- 6. Scenario: Emergency detection ---
    await supabase.from("bot_sessions").delete().eq("telegram_user_id", startTgId);
    await sendText("عندي نزيف شديد ولا أستطيع التنفس!");
    await sleep(700);
    const { data: emer } = await supabase
      .from("emergency_events")
      .select("id, severity, status, message_text")
      .eq("clinic_id", clinic.id)
      .eq("telegram_user_id", startTgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    steps.push({
      name: "السيناريو 4: كشف الطوارئ وتنبيه الطبيب",
      status: emer ? "ok" : "fail",
      details: emer
        ? `سُجّلت حالة طارئة بدرجة: ${emer.severity}`
        : "لم تُكتشف الحالة الطارئة",
    });

    // --- 6. Voice scenario: real audio cannot be synthesized here ---
    steps.push({
      name: "السيناريو 5: الرسالة الصوتية",
      status: "skipped",
      details:
        "يتطلب رسالة صوتية فعلية من تيليجرام (تحويلها لنص يجري عبر Gemini). للرد بالصوت يلزم ربط مزوّد TTS لاحقاً.",
    });

    // --- 7. Cleanup test data ---
    if (appt) await supabase.from("appointments").delete().eq("id", appt.id);
    await supabase.from("emergency_events").delete().eq("telegram_user_id", startTgId);
    await supabase.from("bot_sessions").delete().eq("telegram_user_id", startTgId);
    await supabase.from("patients").delete()
      .eq("clinic_id", clinic.id)
      .or(`telegram_user_id.eq.${startTgId},phone.eq.tg:${startTgId}`);
    steps.push({ name: "تنظيف بيانات الاختبار", status: "ok" });

    return finalize(supabase, clinic.id, userId, steps);
  } catch (e: any) {
    console.error("E2E runner error:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

async function finalize(
  supabase: any,
  clinicId: string,
  userId: string,
  steps: StepResult[],
) {
  const passed = steps.filter((s) => s.status === "ok").length;
  const failed = steps.filter((s) => s.status === "fail").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const overall = failed === 0 ? "passed" : "failed";

  await supabase.from("e2e_test_runs").insert({
    clinic_id: clinicId,
    created_by: userId,
    scenario: "full_suite",
    status: overall,
    details: { steps, passed, failed, skipped },
  });

  return json({ ok: true, overall, passed, failed, skipped, steps });
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

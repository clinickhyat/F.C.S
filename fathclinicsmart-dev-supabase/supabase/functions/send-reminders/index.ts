// Sends hourly Telegram reminders during the last 5 hours before an appointment.
// Runs on a pg_cron schedule (hourly).
// Idempotent per hour via appointments.reminder_last_sent_at and stops after confirmed_at.
//
// Body params (all optional):
//   dryRun: boolean  → skip Telegram send, still mark reminder_sent (for tests)
//   appointmentId: string → restrict the scan to a single appointment (for tests)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const envBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || null;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const dryRun = !!body?.dryRun;
    const appointmentId: string | null = body?.appointmentId || null;

    const now = new Date();
    const from = now;
    const to = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 55 * 60 * 1000);

    const fromDate = from.toISOString().split('T')[0];
    const toDate = to.toISOString().split('T')[0];

    let q = supabase
      .from('appointments')
      .select('id, clinic_id, patient_id, date, time, reservation_code, customer_telegram_id, reminder_sent, reminder_last_sent_at, reminder_count, confirmed_at, status, services(name, price), patients(name, phone), clinics(name, bot_token)')
      .in('status', ['pending', 'confirmed'])
      .is('confirmed_at', null);

    if (appointmentId) {
      q = q.eq('id', appointmentId);
    } else {
      q = q.gte('date', fromDate).lte('date', toDate);
    }

    const { data: appts, error } = await q;
    if (error) throw error;

    let sent = 0, skipped = 0, failed = 0;
    const details: any[] = [];

    for (const a of appts || []) {
      const apptDt = new Date(`${a.date}T${String(a.time).slice(0, 8)}`);
      if (!appointmentId && (apptDt < from || apptDt > to)) {
        skipped++; details.push({ id: a.id, reason: 'out_of_window' });
        await logTelemetry(supabase, a.clinic_id, 'reminder_skipped', 'ok', { id: a.id, reason: 'out_of_window' });
        continue;
      }
      if (!appointmentId && a.reminder_last_sent_at && new Date(a.reminder_last_sent_at) > oneHourAgo) {
        skipped++; details.push({ id: a.id, reason: 'already_reminded_this_hour' });
        await logTelemetry(supabase, a.clinic_id, 'reminder_skipped', 'ok', { id: a.id, reason: 'already_reminded_this_hour' });
        continue;
      }
      if (!a.customer_telegram_id) {
        skipped++; details.push({ id: a.id, reason: 'no_telegram_id' });
        await logTelemetry(supabase, a.clinic_id, 'reminder_skipped', 'ok', { id: a.id, reason: 'no_telegram_id' });
        continue;
      }

      const clinicToken = (a as any).clinics?.bot_token || envBotToken;
      if (!clinicToken && !dryRun) {
        skipped++; details.push({ id: a.id, reason: 'no_bot_token' });
        await logTelemetry(supabase, a.clinic_id, 'reminder_skipped', 'ok', { id: a.id, reason: 'no_bot_token' });
        continue;
      }

      if (dryRun) {
        await supabase.from('appointments').update({ reminder_sent: true, reminder_last_sent_at: now.toISOString(), reminder_count: (a.reminder_count || 0) + 1 }).eq('id', a.id);
        sent++; details.push({ id: a.id, dryRun: true });
        await logTelemetry(supabase, a.clinic_id, 'reminder_sent', 'dry_run', { id: a.id, code: a.reservation_code });
        continue;
      }

      const svc = (a as any).services;
      const priceLabel = !svc ? '' : (svc.price === null || svc.price === undefined ? 'حسب الفحص' : `${svc.price} ر.ي`);
      const clinicName = (a as any).clinics?.name || 'العيادة';
      const patientName = (a as any).patients?.name || '';

      const text =
        `🔔 <b>تذكير بموعدك في ${clinicName}</b>\n\n` +
        `أهلاً ${patientName} 🌷\n` +
        `نذكّرك بأن موعدك القادم خلال أقل من ٥ ساعات.\n\n` +
        (svc ? `🏷 الخدمة: ${svc.name}${priceLabel ? ` — ${priceLabel}` : ''}\n` : '') +
        `📅 التاريخ: ${a.date}\n` +
        `⏰ الوقت: ${String(a.time).slice(0, 5)}\n` +
        `🔖 كود الحجز: <code>${a.reservation_code}</code>\n\n` +
        `يرجى تأكيد حضورك أو الإلغاء عبر الأزرار أدناه 🙏`;

      const replyMarkup = {
        inline_keyboard: [[
          { text: '✅ سأحضر', callback_data: `confirm_${a.reservation_code}` },
          { text: '❌ إلغاء الموعد', callback_data: `cancel_${a.reservation_code}` },
        ]],
      };

      const res = await fetch(`https://api.telegram.org/bot${clinicToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(a.customer_telegram_id), text, parse_mode: 'HTML', reply_markup: replyMarkup }),
      });
      const result = await res.json();
      if (result?.ok) {
        sent++; details.push({ id: a.id, sent: true });
        await supabase.from('appointments').update({ reminder_sent: true, reminder_last_sent_at: now.toISOString(), reminder_count: (a.reminder_count || 0) + 1 }).eq('id', a.id);
        await logTelemetry(supabase, a.clinic_id, 'reminder_sent', 'ok', { id: a.id, code: a.reservation_code });
      } else {
        failed++; details.push({ id: a.id, error: result?.description });
        console.error('reminder send failed', a.id, JSON.stringify(result));
        await logTelemetry(supabase, a.clinic_id, 'reminder_failed', 'error', { id: a.id, error: result?.description });
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped, failed, scanned: appts?.length || 0, dryRun, details }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('send-reminders error', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function logTelemetry(supabase: any, clinicId: string | null, eventType: string, status: string, payload: any) {
  try {
    await supabase.from('telemetry_logs').insert({ clinic_id: clinicId, event_type: eventType, status, payload });
  } catch (_) { /* swallow telemetry errors */ }
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const AVAILABLE_HOURS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30'];

function validateGulfPhone(raw: string): { ok: boolean; normalized?: string } {
  const s = raw.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  if (/^(\+?967)?7\d{8}$/.test(s)) return { ok: true, normalized: s.startsWith('+') ? s : (s.startsWith('967') ? '+' + s : '+967' + s) };
  if (/^(\+?966)?0?5\d{8}$/.test(s)) return { ok: true, normalized: s.replace(/^0?/, '').startsWith('966') ? '+' + s.replace(/^\+?/, '').replace(/^0/, '') : '+966' + s.replace(/^\+?966/, '').replace(/^0/, '') };
  if (/^(\+?971)?0?5\d{8}$/.test(s)) return { ok: true, normalized: '+971' + s.replace(/^\+?971/, '').replace(/^0/, '') };
  if (/^(\+?974)?[3567]\d{7}$/.test(s)) return { ok: true, normalized: s.startsWith('+') ? s : '+974' + s.replace(/^974/, '') };
  if (/^(\+?968)?[79]\d{7}$/.test(s)) return { ok: true, normalized: s.startsWith('+') ? s : '+968' + s.replace(/^968/, '') };
  if (/^(\+?973)?[36]\d{7}$/.test(s)) return { ok: true, normalized: s.startsWith('+') ? s : '+973' + s.replace(/^973/, '') };
  if (/^(\+?965)?[569]\d{7}$/.test(s)) return { ok: true, normalized: s.startsWith('+') ? s : '+965' + s.replace(/^965/, '') };
  return { ok: false };
}

serve(async (req) => {
  const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
  const isTelegram = clientIP.startsWith('149.154.') ||
                     clientIP.startsWith('91.108.4.') ||
                     clientIP.startsWith('91.108.5.') ||
                     clientIP.startsWith('91.108.6.') ||
                     clientIP.startsWith('91.108.7.');

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || null;
  const isAdminAction = action === 'webhook-info' || action === 'bot-info' || action === 'set-webhook' || req.method === 'GET';

  if (!isTelegram && !isAdminAction) {
    console.log(`Blocked request from IP: ${clientIP} for non-admin action`);
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let rawBody: any = null;
    try { rawBody = await req.json(); } catch { rawBody = null; }

    if (action === 'set-webhook' || action === 'webhook-info' || action === 'bot-info') {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace('Bearer ', '');
      let botToken: string | null = null;
      let clinicIdForCache: string | null = null;
      let ownerInfo = 'env';
      if (jwt) {
        const { data: userData } = await supabase.auth.getUser(jwt);
        const uid = userData?.user?.id;
        if (uid) {
          const { data: ownerClinic } = await supabase.from('clinics').select('id').eq('owner_id', uid).maybeSingle();
          if (ownerClinic) {
            const { data: vaultData } = await supabase.from('vault').select('bot_token').eq('clinic_id', ownerClinic.id).maybeSingle();
            if (vaultData?.bot_token) {
              botToken = vaultData.bot_token;
              ownerInfo = uid;
              clinicIdForCache = ownerClinic.id;
            }
          }
        }
      }
      if (!botToken) botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || null;
      if (!botToken) return jsonResponse({ ok: false, error: 'لا يوجد توكن بوت محفوظ' }, 400);

      if (action === 'webhook-info') {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        return jsonResponse({ ok: true, info: await res.json(), owner: ownerInfo });
      }

      if (action === 'bot-info') {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const me = await res.json();
        const username = me?.result?.username || null;
        if (username && clinicIdForCache) {
          await supabase.from('clinics').update({ bot_username: username }).eq('id', clinicIdForCache);
        }
        return jsonResponse({ ok: !!me?.ok, username, raw: me });
      }

      const webhookUrl = clinicIdForCache
        ? `${supabaseUrl}/functions/v1/telegram-bot?clinic_id=${clinicIdForCache}`
        : `${supabaseUrl}/functions/v1/telegram-bot`;
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }),
      });
      const tgResult = await res.json();
      try {
        const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const me = await meRes.json();
        const username = me?.result?.username;
        if (username && clinicIdForCache) {
          await supabase.from('clinics').update({ bot_username: username }).eq('id', clinicIdForCache);
        }
      } catch (_) { /* ignore */ }
      return jsonResponse({ ok: !!tgResult?.ok, webhook: tgResult, webhookUrl, owner: ownerInfo });
    }

    const update = rawBody;
    if (!update) return jsonResponse({ ok: true });
    console.log('Telegram update:', JSON.stringify(update).slice(0, 500));
    const requestClinicId = extractClinicId(url.searchParams.get('clinic_id'));

    if (update.callback_query) return await handleCallbackQuery(supabase, update.callback_query, geminiApiKey, requestClinicId);

    const message = update.message;
    if (!message) return jsonResponse({ ok: true });

    const chatId = message.chat.id;
    let text = (message.text || '').trim();
    const telegramUserId = String(message.from.id);
    const firstName = message.from.first_name || 'عميل';
    const messageType = message.voice ? 'voice' : 'text';
    let transcript: string | null = null;

    const botToken = await getBotTokenForClinic(supabase, requestClinicId);
    if (!botToken) return jsonResponse({ ok: true });
    const send = (cId: number, txt: string, markup?: any) => sendMessage(botToken, cId, txt, markup);

    if (message.voice) {
      transcript = await transcribeTelegramVoice(botToken, message.voice.file_id, geminiApiKey);
      text = (transcript || '').trim();
      if (!text) {
        await send(chatId, '⚠️ لم أتمكن من فهم الرسالة الصوتية. أرسلها مرة أخرى أو اكتب طلبك نصياً.');
        return jsonResponse({ ok: true });
      }
    }

    const linkedClinicId = await getUserClinicId(supabase, telegramUserId);
    await logConversation(supabase, linkedClinicId, telegramUserId, String(chatId), 'incoming', messageType, message.text || null, transcript, null, 'ok', update);

    const isMainMenu = isBookingIntent(text) || isServicesIntent(text) || isAppointmentsIntent(text) || isCancelIntent(text);

    if (linkedClinicId && text && !text.startsWith('/') && detectEmergency(text)) {
      await clearSession(supabase, telegramUserId);
      await handleEmergency(supabase, botToken, linkedClinicId, telegramUserId, String(chatId), firstName, text);
      await send(chatId, '🚨 تم تصنيف رسالتك كحالة طارئة وتم إرسال تنبيه فوري للطبيب. إذا كانت الحالة حرجة اتصل بالإسعاف أو توجّه لأقرب طوارئ فوراً.');
      return jsonResponse({ ok: true });
    }

    const session = await getSession(supabase, telegramUserId);
    const looksLikeReCode = /^RE-\d{4}$/i.test(text.trim());
    if (session && session.step && session.step !== 'idle'
        && !text.startsWith('/') && !isMainMenu && !looksLikeReCode) {
      const handled = await progressSession(supabase, send, chatId, telegramUserId, firstName, session, text, botToken);
      if (handled) return jsonResponse({ ok: true });
    }
    if (isMainMenu && session && session.step !== 'idle') {
      await clearSession(supabase, telegramUserId);
    }

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const param = parts.length > 1 ? parts[1] : null;

      if (param && param.startsWith('link_')) {
        const token = param.replace('link_', '');
        const { data: linkData } = await supabase
          .from('link_tokens')
          .select('clinic_id, clinic_name, expires_at')
          .eq('token', token)
          .maybeSingle();
        if (!linkData || new Date(linkData.expires_at) < new Date()) {
          await send(chatId, '❌ رابط الربط غير صالح أو منتهي الصلاحية.');
          return jsonResponse({ ok: true });
        }
        await supabase.from('link_tokens').delete().eq('token', token);
        const { data: clinicOwned } = await supabase.from('clinics').select('id, name').eq('id', linkData.clinic_id).maybeSingle();
        if (!clinicOwned) { await send(chatId, '❌ العيادة غير موجودة.'); return jsonResponse({ ok: true }); }
        const { error: upErr } = await supabase.from('profiles').update({ phone: `tg:${telegramUserId}` }).eq('user_id', clinicOwned.id);
        await send(chatId, upErr ? '⚠️ حدث خطأ أثناء الربط.' :
          `✅ <b>تم ربط حسابك بنجاح!</b>\n\n🏥 العيادة: ${clinicOwned.name}\n\n🔔 ستصلك الآن إشعارات فورية بكل حجز جديد.`);
        return jsonResponse({ ok: true });
      }

      const clinicId = extractClinicId(param);
      if (clinicId) {
        const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', clinicId).single();
        if (!clinic) { await send(chatId, '❌ رابط العيادة غير صحيح.'); return jsonResponse({ ok: true }); }
        const { data: sub } = await supabase.from('subscriptions').select('status, is_active, trial_ends_at').eq('clinic_id', clinicId).single();
        if (!isSubscriptionUsable(sub)) { await send(chatId, '⚠️ هذه العيادة غير نشطة حالياً.'); return jsonResponse({ ok: true }); }

        const { data: existing } = await supabase.from('patients').select('id').eq('clinic_id', clinicId).eq('telegram_user_id', telegramUserId).maybeSingle();
        if (!existing) {
          await supabase.from('patients').insert({ clinic_id: clinicId, name: firstName, phone: `tg:${telegramUserId}`, telegram_user_id: telegramUserId });
        } else {
          await supabase.from('patients').update({ created_at: new Date().toISOString() }).eq('id', existing.id);
        }
        await clearSession(supabase, telegramUserId);

        await send(chatId,
          `🏥 <b>مرحباً ${firstName} في ${clinic.name}</b>\n\n` +
          (clinic.description ? `${clinic.description}\n\n` : '') +
          `للحجز اضغط زر «📅 حجز موعد» أو زر «🔍 الخدمات» لعرض الخدمات والأسعار.`,
          defaultKeyboard()
        );
        return jsonResponse({ ok: true });
      }

      if (param && !clinicId) {
        await send(chatId, '⚠️ رابط العيادة غير معروف. اطلب من العيادة رابط حجز يبدأ بـ /start clinic_');
        return jsonResponse({ ok: true });
      }

      if (linkedClinicId) {
        const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', linkedClinicId).single();
        if (clinic) {
          await send(chatId,
            `🏥 <b>مرحباً ${firstName} في ${clinic.name}</b>\n\n` +
            `للحجز اضغط زر «📅 حجز موعد» أو زر «🔍 الخدمات» لعرض الخدمات والأسعار.`,
            defaultKeyboard()
          );
          return jsonResponse({ ok: true });
        }
      }
      await send(chatId,
        `🏥 <b>مرحباً ${firstName} في Smart Clinic</b>\n\n` +
        `للحجز افتح رابط العيادة الذي أرسلته لك (مثال: /start clinic_معرّف_العيادة).`,
        defaultKeyboard()
      );
      return jsonResponse({ ok: true });
    }

    if (isBookingIntent(text) || isServicesIntent(text)) {
      if (!linkedClinicId) {
        await send(chatId, '⚠️ افتح رابط الحجز الخاص بالعيادة أولاً، ثم اختر الخدمة.');
        return jsonResponse({ ok: true });
      }
      const { data: clinic } = await supabase.from('clinics').select('id, name, type, description, doctor_name').eq('id', linkedClinicId).single();
      if (clinic) await sendServicesMenu(supabase, send, chatId, clinic, linkedClinicId, firstName);
      else await send(chatId, '❌ العيادة غير موجودة.');
      return jsonResponse({ ok: true });
    }

    if (isAppointmentsIntent(text)) {
      const { data: appointments } = await supabase.from('appointments')
        .select('id, date, time, status, reservation_code, services(name)')
        .eq('customer_telegram_id', telegramUserId)
        .in('status', ['pending', 'confirmed'])
        .order('date', { ascending: true }).limit(10);
      if (appointments && appointments.length > 0) {
        let msg = '📅 <b>مواعيدك القادمة:</b>\n\n';
        appointments.forEach((a: any, i: number) => {
          msg += `${i + 1}. ${a.status === 'confirmed' ? '✅' : '⏳'} <b>${a.date}</b> الساعة ${String(a.time).slice(0,5)}\n`;
          if (a.services?.name) msg += `   🏷 ${a.services.name}\n`;
          msg += `   🔖 كود: <code>${a.reservation_code}</code>\n\n`;
        });
        await send(chatId, msg);
      } else await send(chatId, '📭 لا توجد لديك مواعيد قادمة.');
      return jsonResponse({ ok: true });
    }

    if (isCancelIntent(text)) {
      const { data: appointments } = await supabase.from('appointments')
        .select('id, date, time, reservation_code')
        .eq('customer_telegram_id', telegramUserId)
        .in('status', ['pending', 'confirmed'])
        .order('date', { ascending: true }).limit(5);
      if (appointments && appointments.length > 0) {
        let msg = '❌ <b>اختر الموعد لإلغائه:</b>\n\n';
        const buttons: any[][] = [];
        appointments.forEach((a) => {
          msg += `📅 ${a.date} - ⏰ ${String(a.time).slice(0,5)}\n🔖 <code>${a.reservation_code}</code>\n\n`;
          buttons.push([{ text: `❌ إلغاء ${a.reservation_code}`, callback_data: `cancel_${a.reservation_code}` }]);
        });
        await send(chatId, msg, { inline_keyboard: buttons });
      } else await send(chatId, '📭 لا توجد لديك مواعيد يمكن إلغاؤها.');
      return jsonResponse({ ok: true });
    }

    if (text.match(/^RE-\d{4}$/i)) {
      const { data: appointment } = await supabase.from('appointments').update({ status: 'cancelled' })
        .eq('reservation_code', text.toUpperCase()).eq('customer_telegram_id', telegramUserId)
        .in('status', ['pending', 'confirmed']).select().single();
      await send(chatId, appointment ?
        `✅ <b>تم إلغاء الموعد</b>\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}` :
        '⚠️ لم يتم العثور على الموعد.');
      return jsonResponse({ ok: true });
    }

    if (geminiApiKey && linkedClinicId) {
      const { data: clinic } = await supabase.from('clinics').select('name, type, description, doctor_name, working_hours, voice_agent_enabled, voice_tone, voice_mode').eq('id', linkedClinicId).single();
      const { data: services } = await supabase.from('services').select('name, price, duration_minutes').eq('clinic_id', linkedClinicId).eq('is_active', true);
      let ctx = '';
      if (clinic) {
        ctx = `\nاسم العيادة: ${clinic.name}`;
        if (clinic.doctor_name) ctx += `\nالطبيب المشرف: د. ${clinic.doctor_name}`;
        if (clinic.description) ctx += `\nالوصف: ${clinic.description}`;
        if (services?.length) ctx += `\nالخدمات المتاحة: ${services.map((s: any) => { const p = (s.price === null || s.price === undefined) ? 'حسب الفحص' : `${s.price} ر.ي`; return `${s.name} (${p})`; }).join('، ')}`;
      }
      const tone = (clinic as any)?.voice_tone || 'ودود ومحترم';
      const aiResponse = await callAI(geminiApiKey, text, firstName, ctx, tone);
      if (aiResponse) {
        const cleanResponse = stripEmojis(aiResponse);
        const mode = (clinic as any)?.voice_mode || 'separate';
        const useVoice = (clinic as any)?.voice_agent_enabled && mode !== 'text' && (mode === 'voice' || (messageType === 'voice' && mode !== 'text') || (mode === 'separate' && Math.random() < 0.5));

        // إرسال الرد النصي فوراً
        await send(chatId, cleanResponse, defaultKeyboard());
        await logConversation(supabase, linkedClinicId, telegramUserId, String(chatId), 'outgoing', 'ai_response', null, null, cleanResponse, 'ok', null);

        // إرسال الصوت في الخلفية لتجنب مشكلة EarlyDrop
        if (useVoice) {
          EdgeRuntime.waitUntil((async () => {
            try {
              await sendVoiceReply(botToken, chatId, cleanResponse);
            } catch (e) {
              console.error('Voice error:', e);
            }
          })());
        }
        return jsonResponse({ ok: true });
      }
    }

    await send(chatId, `🤖 كيف يمكنني مساعدتك؟ استخدم الأزرار أدناه للبدء.`, defaultKeyboard());
    return jsonResponse({ ok: true });

  } catch (error) {
    console.error('Telegram bot error:', error);
    return jsonResponse({ ok: true });
  }
});

// ============ الدوال المساعدة ============

async function getSession(supabase: any, tgId: string) {
  const { data } = await supabase.from('bot_sessions').select('*').eq('telegram_user_id', tgId).maybeSingle();
  return data;
}

async function upsertSession(supabase: any, tgId: string, patch: Record<string, any>) {
  await supabase.from('bot_sessions').upsert({ telegram_user_id: tgId, updated_at: new Date().toISOString(), ...patch }, { onConflict: 'telegram_user_id' });
}

async function clearSession(supabase: any, tgId: string) {
  await supabase.from('bot_sessions').delete().eq('telegram_user_id', tgId);
}

async function sendServicesMenu(supabase: any, send: any, chatId: number, clinic: any, clinicId: string, firstName: string) {
  const { data: services } = await supabase.from('services')
    .select('id, name, price, duration_minutes')
    .eq('clinic_id', clinicId).eq('is_active', true).order('name');

  const doctorLine = clinic.doctor_name ? `تحت إشراف د. <b>${clinic.doctor_name}</b>\n` : '';
  let msg = `🏥 أهلاً وسهلاً ${firstName} في <b>${clinic.name}</b>\n${doctorLine}`;
  if (clinic.description) msg += `📝 ${clinic.description}\n`;

  if (services && services.length > 0) {
    msg += `\n📋 <b>اختر الخدمة التي تريد حجزها:</b>\n\n`;
    const buttons: any[][] = [];
    services.forEach((s: any, i: number) => {
      const priceLabel = (s.price === null || s.price === undefined) ? 'حسب الفحص' : `${s.price} ر.ي`;
      msg += `${i + 1}. ${s.name} — ${priceLabel} (${s.duration_minutes || 30} دقيقة)\n`;
      buttons.push([{ text: `📅 ${s.name}`, callback_data: `book:${s.id}` }]);
    });
    await send(chatId, msg, { inline_keyboard: buttons });
  } else {
    await send(chatId, msg + `\nلا توجد خدمات متاحة حالياً، تواصل مع العيادة لاحقاً.`, defaultKeyboard());
  }
}

async function progressSession(supabase: any, send: any, chatId: number, tgId: string, firstName: string, session: any, text: string, botToken: string): Promise<boolean> {
  if (/^(إلغاء|الغاء|cancel|stop)$/i.test(text.trim())) {
    await clearSession(supabase, tgId);
    await send(chatId, '✅ تم إلغاء الحجز. يمكنك البدء من جديد متى شئت.', defaultKeyboard());
    return true;
  }

  if (session.step === 'ask_name') {
    const name = text.trim();
    if (name.length < 2 || name.length > 80) {
      await send(chatId, '⚠️ الاسم قصير جداً أو طويل جداً. أرسل اسمك الكامل من فضلك.');
      return true;
    }
    await upsertSession(supabase, tgId, { full_name: name, step: 'ask_phone' });
    await send(chatId, `شكراً ${name} 🌷\n\n📱 اكتب الآن <b>رقم هاتفك للتواصل</b> (مع المقدمة، مثال: 9677xxxxxxxx).`);
    return true;
  }

  if (session.step === 'ask_phone') {
    const v = validateGulfPhone(text);
    if (!v.ok) {
      const attempts = (session.phone_attempts || 0) + 1;
      await upsertSession(supabase, tgId, { phone_attempts: attempts });
      if (attempts >= 3) {
        const { data: clinicRow } = await supabase.from('clinics').select('phone, name').eq('id', session.clinic_id).maybeSingle();
        const waNum = (clinicRow?.phone || '').replace(/[^\d]/g, '');
        const waBtn = waNum ? [[{ text: '💬 تواصل عبر واتساب', url: `https://wa.me/${waNum}` }]] : [];
        await clearSession(supabase, tgId);
        await send(chatId,
          '⚠️ تجاوزت عدد المحاولات المسموح بها.\n\n' +
          'تعذّر التحقق من رقم هاتفك. يمكنك التواصل مع العيادة مباشرة عبر واتساب أدناه، أو إعادة المحاولة لاحقاً بكتابة /book.',
          waBtn.length ? { inline_keyboard: waBtn } : undefined);
        return true;
      }
      await send(chatId, `⚠️ رقم الهاتف غير صحيح. يرجى إدخال رقم يمني أو خليجي صحيح.\nأمثلة مقبولة: 967777123456 — 966501234567 — 971501234567.\n(المحاولة ${attempts}/3)`);
      return true;
    }
    await upsertSession(supabase, tgId, { phone: v.normalized, phone_attempts: 0, step: 'ask_date' });
    const today = new Date();
    const buttons: any[][] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const label = i === 0 ? `اليوم (${iso})` : i === 1 ? `غداً (${iso})` : iso;
      buttons.push([{ text: `📅 ${label}`, callback_data: `date_${iso}` }]);
    }
    await send(chatId, `✅ تم حفظ الرقم.\n\n📅 اختر تاريخ الموعد:`, { inline_keyboard: buttons });
    return true;
  }

  if (session.step === 'ask_date') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) {
      return await handleDateChoice(supabase, send, chatId, tgId, session, text.trim());
    }
    await send(chatId, '⚠️ استخدم زر التاريخ بالأعلى أو اكتب التاريخ بصيغة YYYY-MM-DD.');
    return true;
  }

  if (session.step === 'ask_time') {
    const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const hh = m[1].padStart(2, '0');
      const time = `${hh}:${m[2]}`;
      return await finalizeBooking(supabase, send, chatId, tgId, firstName, session, time, botToken);
    }
    await send(chatId, '⚠️ اختر وقتاً من الأزرار أو اكتبه بصيغة HH:MM.');
    return true;
  }

  return false;
}

async function handleDateChoice(supabase: any, send: any, chatId: number, tgId: string, session: any, dateStr: string): Promise<boolean> {
  const { data: existing } = await supabase.from('appointments').select('time')
    .eq('clinic_id', session.clinic_id).eq('date', dateStr).in('status', ['pending', 'confirmed']);
  const booked = new Set((existing || []).map((a: any) => String(a.time).slice(0, 5)));

  let free = AVAILABLE_HOURS.filter((t) => !booked.has(t));

  const yemenTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Aden" }));
  const y = yemenTime.getFullYear();
  const m = String(yemenTime.getMonth() + 1).padStart(2, '0');
  const d = String(yemenTime.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  if (dateStr === todayStr) {
    const currentHour = yemenTime.getHours();
    const currentMinutes = yemenTime.getMinutes();

    free = free.filter(timeStr => {
      const [hourStr, minuteStr] = timeStr.split(':');
      const hour = parseInt(hourStr, 10);
      const min = parseInt(minuteStr, 10);

      if (hour > currentHour) return true;
      if (hour === currentHour && min > currentMinutes) return true;

      return false;
    });
  }

  if (free.length === 0) {
    await send(chatId, '⚠️ لا توجد أوقات متاحة متبقية في هذا اليوم. اختر تاريخاً آخر:', { inline_keyboard: nextDaysButtons() });
    return true;
  }

  await upsertSession(supabase, tgId, { preferred_date: dateStr, step: 'ask_time' });
  const buttons: any[][] = [];
  for (let i = 0; i < free.length; i += 3) {
    buttons.push(free.slice(i, i + 3).map((t) => ({ text: `⏰ ${t}`, callback_data: `time_${t.replace(':', '')}` })));
  }
  await send(chatId, `✅ التاريخ: <b>${dateStr}</b>\n\n⏰ اختر الوقت المناسب:`, { inline_keyboard: buttons });
  return true;
}

function nextDaysButtons() {
  const buttons: any[][] = [];
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    buttons.push([{ text: `📅 ${iso}`, callback_data: `date_${iso}` }]);
  }
  return buttons;
}

function normalizedText(text: string) {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[📅🔍📋❌🔎🗓️]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isBookingIntent(text: string) {
  const n = normalizedText(text);
  return n === '/book' || n === '/booking' || n.includes('حجز موعد') || n.includes('احجز موعد');
}

function isServicesIntent(text: string) {
  const n = normalizedText(text);
  return n === '/services' || n === 'الخدمات' || n === 'خدمات' || n === 'خدماتي' || n.includes('الخدمات') || n.includes('خدماتي');
}

function isAppointmentsIntent(text: string) {
  const n = normalizedText(text);
  return n === '/appointments' || n.includes('مواعيدي');
}

function isCancelIntent(text: string) {
  const n = normalizedText(text);
  return n === '/cancel' || n.includes('الغاء موعد') || n.includes('الغاء موعد');
}

function isSubscriptionUsable(sub: any) {
  if (!sub?.is_active) return false;
  if (sub.status === 'trial' && sub.trial_ends_at) {
    return new Date(sub.trial_ends_at).getTime() >= Date.now();
  }
  return sub.status !== 'expired';
}

async function finalizeBooking(supabase: any, send: any, chatId: number, tgId: string, firstName: string, session: any, time: string, botToken: string): Promise<boolean> {
  const { data: conflict } = await supabase.from('appointments').select('id').eq('clinic_id', session.clinic_id)
    .eq('date', session.preferred_date).eq('time', time + ':00').in('status', ['pending', 'confirmed']).maybeSingle();
  if (conflict) {
    const { data: existing } = await supabase.from('appointments').select('time').eq('clinic_id', session.clinic_id)
      .eq('date', session.preferred_date).in('status', ['pending', 'confirmed']);
    const booked = new Set((existing || []).map((a: any) => String(a.time).slice(0, 5)));
    const free = AVAILABLE_HOURS.filter((t) => !booked.has(t)).slice(0, 6);
    const buttons: any[][] = [];
    for (let i = 0; i < free.length; i += 3) {
      buttons.push(free.slice(i, i + 3).map((t) => ({ text: `⏰ ${t}`, callback_data: `time_${t.replace(':', '')}` })));
    }
    await send(chatId, `⚠️ الوقت <b>${time}</b> محجوز. هذه أوقات بديلة متاحة لنفس اليوم:`, { inline_keyboard: buttons });
    return true;
  }

  const isThirdParty = !!session.is_third_party;

  const todayStr = new Date().toISOString().slice(0, 10);
  const { count: todayCount } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('customer_telegram_id', tgId)
    .eq('date', todayStr)
    .not('status', 'in', '(cancelled)');
  if ((todayCount ?? 0) >= 3) {
    await send(chatId, '⚠️ لقد وصلت للحد الأقصى للحجوزات اليومية (3 مواعيد). يمكنك التواصل مع موظف الاستقبال لحجز موعد إضافي.');
    await clearSession(supabase, tgId);
    return true;
  }

  let patientId: string;
  let storedName = session.full_name;
  let storedPhone = session.phone;

  if (isThirdParty) {
    const { data: np } = await supabase.from('patients')
      .insert({ clinic_id: session.clinic_id, name: session.full_name, phone: session.phone })
      .select('id').single();
    patientId = np!.id;
  } else {
    const { data: existingPatient } = await supabase.from('patients').select('id, name, phone')
      .eq('clinic_id', session.clinic_id).eq('telegram_user_id', tgId).maybeSingle();
    if (existingPatient && existingPatient.phone && !String(existingPatient.phone).startsWith('tg:')) {
      patientId = existingPatient.id;
      storedName = existingPatient.name;
      storedPhone = existingPatient.phone;
    } else if (existingPatient) {
      patientId = existingPatient.id;
      await supabase.from('patients').update({ name: session.full_name, phone: session.phone }).eq('id', patientId);
    } else {
      const { data: np } = await supabase.from('patients')
        .insert({ clinic_id: session.clinic_id, name: session.full_name, phone: session.phone, telegram_user_id: tgId })
        .select('id').single();
      patientId = np!.id;
    }
  }

  const { data: service } = await supabase.from('services').select('name, price').eq('id', session.service_id).single();
  const code = `RE-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const notePrefix = isThirdParty ? 'حجز عبر تيليجرام (باسم شخص آخر)' : 'حجز عبر تيليجرام';
  const bookedBy = isThirdParty ? (session.booked_by_chat_id || tgId) : null;
  const { error } = await supabase.from('appointments').insert({
    clinic_id: session.clinic_id, patient_id: patientId, service_id: session.service_id,
    date: session.preferred_date, time: time + ':00', status: 'pending',
    reservation_code: code, customer_telegram_id: tgId,
    is_third_party_booking: isThirdParty,
    booked_by_chat_id: bookedBy,
    notes: `${notePrefix} - ${storedName} (${storedPhone})`,
  });
  if (error) {
    console.error('Booking error:', error);
    await send(chatId, '❌ تعذّر إكمال الحجز. حاول مرة أخرى.');
    return true;
  }
  await clearSession(supabase, tgId);
  const successMarkup = {
    inline_keyboard: [[{ text: '👥 حجز باسم شخص آخر', callback_data: `book_other:${session.service_id}` }]],
  };
  await send(chatId,
    `✅ <b>تم تأكيد ${isThirdParty ? 'الحجز نيابةً عن الشخص المذكور' : 'حجزك'} بنجاح!</b>\n\n` +
    `👤 الاسم: ${storedName}\n` +
    `📱 الهاتف: ${storedPhone}\n` +
    `🏷 الخدمة: ${service?.name || ''}\n` +
    `📅 التاريخ: ${session.preferred_date}\n` +
    `⏰ الوقت: ${time}\n` +
    `🔖 كود الحجز: <code>${code}</code>\n\n` +
    `احتفظ بالكود للاستعلام أو الإلغاء.`, successMarkup);

  await notifyDoctor(supabase, botToken, session.clinic_id,
    `${isThirdParty ? '👥 حجز باسم شخص آخر\n' : ''}👤 ${storedName}\n📱 ${storedPhone}\n🏷 ${service?.name || ''}\n📅 ${session.preferred_date} ⏰ ${time}\n🔖 ${code}`);
  return true;
}

async function handleCallbackQuery(supabase: any, query: any, geminiApiKey: string | undefined, requestClinicId: string | null = null) {
  const chatId = query.message.chat.id;
  const data = query.data;
  const tgId = String(query.from.id);
  const firstName = query.from.first_name || 'عميل';

  const botToken = await getBotTokenForClinic(supabase, requestClinicId);
  if (!botToken) return jsonResponse({ ok: true });
  const send = (cId: number, txt: string, markup?: any) => sendMessage(botToken, cId, txt, markup);
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: query.id }),
  });

  if (data.startsWith('book_other:')) {
    const serviceId = data.replace('book_other:', '');
    const { data: service } = await supabase.from('services').select('id, name, clinic_id').eq('id', serviceId).single();
    if (!service) { await send(chatId, '❌ الخدمة غير متوفرة.'); return jsonResponse({ ok: true }); }
    const { data: clinicRow } = await supabase
      .from('clinics')
      .select('name, receptionist_whatsapp')
      .eq('id', service.clinic_id)
      .maybeSingle();
    const wa = (clinicRow?.receptionist_whatsapp || '').replace(/[^\d]/g, '');
    if (!wa) {
      await send(chatId,
        `لم يتم تعيين رقم موظف الاستقبال بعد. يرجى التواصل مع صاحب العيادة.`);
      return jsonResponse({ ok: true });
    }
    const waText = encodeURIComponent(
      `مرحباً، أريد حجز موعد باسم شخص آخر في ${clinicRow?.name || 'العيادة'} - خدمة: ${service.name}`
    );
    const waUrl = `https://wa.me/${wa}?text=${waText}`;
    await send(chatId,
      `👥 <b>حجز باسم شخص آخر</b>\n\n` +
      `لحجز موعد باسم شخص آخر، يرجى التواصل مع موظف الاستقبال عبر الواتساب.`,
      { inline_keyboard: [[{ text: '💬 فتح واتساب الاستقبال', url: waUrl }]] });
    return jsonResponse({ ok: true });
  }

  if (data.startsWith('book:') || data.startsWith('book_')) {
    const serviceId = data.startsWith('book:') ? data.replace('book:', '') : data.split('_')[2];
    const { data: service } = await supabase.from('services').select('id, name, clinic_id').eq('id', serviceId).single();
    if (!service) { await send(chatId, '❌ الخدمة غير متوفرة.'); return jsonResponse({ ok: true }); }

    const { data: existingPatient } = await supabase.from('patients')
      .select('id, name, phone')
      .eq('clinic_id', service.clinic_id)
      .eq('telegram_user_id', tgId)
      .maybeSingle();
    const hasRealRegistration = existingPatient && existingPatient.phone && !String(existingPatient.phone).startsWith('tg:');

    if (hasRealRegistration) {
      await upsertSession(supabase, tgId, {
        clinic_id: service.clinic_id, service_id: service.id, step: 'ask_date',
        full_name: existingPatient!.name, phone: existingPatient!.phone,
        preferred_date: null, preferred_time: null,
        is_third_party: false, booked_by_chat_id: null, phone_attempts: 0,
      });
      const today = new Date();
      const buttons: any[][] = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(today); d.setDate(today.getDate() + i);
        const iso = d.toISOString().split('T')[0];
        const label = i === 0 ? `اليوم (${iso})` : i === 1 ? `غداً (${iso})` : iso;
        buttons.push([{ text: `📅 ${label}`, callback_data: `date_${iso}` }]);
      }
      await send(chatId,
        `أهلاً بعودتك ${existingPatient!.name} 🌷\n\n` +
        `سنحجز لك خدمة <b>${service.name}</b> باسمك المسجَّل سابقاً في هذه العيادة.\n` +
        `📱 الهاتف: <code>${existingPatient!.phone}</code>\n\n` +
        `📅 اختر تاريخ الموعد (أو اكتب: إلغاء للإيقاف):`, { inline_keyboard: buttons });
      return jsonResponse({ ok: true });
    }

    await upsertSession(supabase, tgId, { clinic_id: service.clinic_id, service_id: service.id, step: 'ask_name', full_name: null, phone: null, preferred_date: null, preferred_time: null, is_third_party: false, booked_by_chat_id: null, phone_attempts: 0 });
    await send(chatId,
      `📋 لحجز <b>${service.name}</b>:\n\n` +
      `أرسل أولاً <b>اسمك الكامل</b> من فضلك.\n\n` +
      `(لإلغاء العملية في أي وقت اكتب: إلغاء)`);
    return jsonResponse({ ok: true });
  }

  if (data.startsWith('date_')) {
    const dateStr = data.replace('date_', '');
    const session = await getSession(supabase, tgId);
    if (!session || session.step !== 'ask_date') {
      await send(chatId, '⚠️ ابدأ الحجز من زر الخدمة أولاً.');
      return jsonResponse({ ok: true });
    }
    await handleDateChoice(supabase, send, chatId, tgId, session, dateStr);
    return jsonResponse({ ok: true });
  }

  if (data.startsWith('time_')) {
    const raw = data.replace('time_', '');
    const time = `${raw.slice(0, 2)}:${raw.slice(2)}`;
    const session = await getSession(supabase, tgId);
    if (!session || session.step !== 'ask_time') {
      await send(chatId, '⚠️ ابدأ الحجز من زر الخدمة أولاً.');
      return jsonResponse({ ok: true });
    }
    await finalizeBooking(supabase, send, chatId, tgId, firstName, session, time, botToken);
    return jsonResponse({ ok: true });
  }

  if (data.startsWith('confirm_')) {
    const resCode = data.replace('confirm_', '');
    const { data: appointment } = await supabase.from('appointments').update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('reservation_code', resCode).eq('customer_telegram_id', tgId)
      .in('status', ['pending', 'confirmed']).select('date, time, reservation_code, clinic_id').single();
    if (appointment) {
      await send(chatId, `✅ <b>تم تأكيد حضورك</b>\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}\n\nبانتظارك في موعدك 🌷`);
      await notifyDoctor(supabase, botToken, appointment.clinic_id,
        `✅ <b>تأكيد حضور</b>\n👤 ${firstName}\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}`);
    } else await send(chatId, '⚠️ لم يتم العثور على الموعد.');
    return jsonResponse({ ok: true });
  }

  if (data.startsWith('cancel_')) {
    const resCode = data.replace('cancel_', '');
    const { data: appointment } = await supabase.from('appointments').update({ status: 'cancelled' })
      .eq('reservation_code', resCode).eq('customer_telegram_id', tgId)
      .in('status', ['pending', 'confirmed']).select('date, time, reservation_code, clinic_id').single();
    if (appointment) {
      await send(chatId, `✅ <b>تم إلغاء الموعد</b>\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}`);
      await notifyDoctor(supabase, botToken, appointment.clinic_id,
        `❌ <b>إلغاء موعد</b>\n👤 ${firstName}\n📅 ${appointment.date} ⏰ ${String(appointment.time).slice(0,5)}\n🔖 ${appointment.reservation_code}`);
    } else await send(chatId, '⚠️ لم يتم العثور على الموعد.');
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: true });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function defaultKeyboard() {
  return {
    keyboard: [
      [{ text: '📅 حجز موعد' }, { text: '📋 مواعيدي' }],
      [{ text: '🔍 الخدمات' }, { text: '❌ إلغاء موعد' }],
    ],
    resize_keyboard: true,
  };
}

function extractClinicId(param: string | null): string | null {
  if (!param) return null;
  const cleaned = decodeURIComponent(param).trim();
  const direct = cleaned.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (direct) return direct;
  const prefixed = cleaned.replace(/^(clinic|c|عيادة)[_-]/i, '');
  return prefixed.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? prefixed : null;
}

async function getBotTokenFromDB(supabase: any): Promise<string | null> {
  const { data } = await supabase.from('system_settings').select('telegram_bot_token').eq('id', 1).single();
  return data?.telegram_bot_token || null;
}

async function getBotTokenForClinic(supabase: any, clinicId: string | null): Promise<string | null> {
  if (clinicId) {
    const { data } = await supabase.from('vault').select('bot_token').eq('clinic_id', clinicId).maybeSingle();
    if (data?.bot_token) return data.bot_token;
  }
  return Deno.env.get('TELEGRAM_BOT_TOKEN') || await getBotTokenFromDB(supabase);
}

async function sendMessage(botToken: string, chatId: number, text: string, replyMarkup?: any) {
  const body: any = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!result.ok) console.error('Send message error:', JSON.stringify(result));
  return result;
}

async function getUserClinicId(supabase: any, tgId: string): Promise<string | null> {
  const { data } = await supabase.from('patients').select('clinic_id')
    .or(`telegram_user_id.eq.${tgId},phone.eq.tg:${tgId}`)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data?.clinic_id || null;
}

async function notifyDoctor(supabase: any, botToken: string, clinicId: string, info: string, notificationType = 'booking', title = 'إشعار جديد') {
  try {
    const { data: clinic } = await supabase.from('clinics').select('owner_id, name').eq('id', clinicId).single();
    if (!clinic) return null;
    const { data: ownerProfile } = await supabase.from('profiles').select('phone').eq('user_id', clinic.owner_id).single();
    const { data: notification } = await supabase.from('telegram_notifications').insert({
      clinic_id: clinicId,
      recipient_chat_id: ownerProfile?.phone?.startsWith('tg:') ? ownerProfile.phone.replace('tg:', '') : null,
      notification_type: notificationType, title, message: info, status: 'pending',
    }).select('id').single();

    if (ownerProfile?.phone?.startsWith('tg:')) {
      const ownerTgId = ownerProfile.phone.replace('tg:', '');
      const result = await sendMessage(botToken, Number(ownerTgId), `🔔 <b>${title} - ${clinic.name}</b>\n\n${info}`);
      await supabase.from('telegram_notifications').update({
        status: result?.ok ? 'sent' : 'failed',
        telegram_message_id: result?.result?.message_id ? String(result.result.message_id) : null,
        error_message: result?.ok ? null : JSON.stringify(result),
        sent_at: result?.ok ? new Date().toISOString() : null,
      }).eq('id', notification?.id);
    } else if (notification?.id) {
      await supabase.from('telegram_notifications').update({ status: 'skipped', error_message: 'لم يتم ربط حساب الطبيب بتيليجرام بعد' }).eq('id', notification.id);
    }
    return notification?.id || null;
  } catch (e) { console.error('Notify doctor error:', e); return null; }
}

function detectEmergency(text: string): boolean {
  const n = text.toLowerCase();
  const kw = ['طوارئ','اسعاف','إسعاف','نزيف','اختناق','لا يتنفس','ما يتنفس','ألم شديد','الم شديد','صدر','جلطة','إغماء','اغماء','فقدان وعي','حريق','حادث','تشنج','تسمم','انتحار'];
  return kw.some((k) => n.includes(k.toLowerCase()));
}

async function handleEmergency(supabase: any, botToken: string, clinicId: string, tgId: string, chatId: string, name: string, msg: string) {
  const notificationId = await notifyDoctor(supabase, botToken, clinicId,
    `🚨 <b>حالة طارئة محتملة</b>\n👤 ${name}\n💬 ${msg}\n📞 Telegram ID: ${tgId}`, 'emergency', 'تنبيه طوارئ عاجل');
  await supabase.from('emergency_events').insert({
    clinic_id: clinicId, telegram_user_id: tgId, chat_id: chatId, patient_name: name,
    message_text: msg, severity: 'urgent', status: 'notified', notification_id: notificationId,
  });
}

async function logConversation(supabase: any, clinicId: string | null, tgId: string, chatId: string, direction: string, messageType: string, messageText: string | null, transcript: string | null, aiResponse: string | null, status: string, rawUpdate: any, errorMessage?: string) {
  if (!clinicId) return;
  await supabase.from('bot_conversations').insert({
    clinic_id: clinicId, telegram_user_id: tgId, chat_id: chatId, direction, message_type: messageType,
    message_text: messageText, transcript, ai_response: aiResponse, status,
    error_message: errorMessage || null, raw_update: rawUpdate || null,
  });
}

async function transcribeTelegramVoice(botToken: string, fileId: string, geminiApiKey?: string): Promise<string | null> {
  if (!geminiApiKey) return null;
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = await fileRes.json();
    const filePath = fileData?.result?.file_path;
    if (!filePath) return null;
    const audioRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!audioRes.ok) return null;
    const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
    let binary = '';
    for (const byte of audioBytes) binary += String.fromCharCode(byte);
    const audioBase64 = btoa(binary);

    const url = `${GEMINI_API_URL}?key=${geminiApiKey}`;
    const payload = {
      contents: [{
        parts: [
          { text: "فرّغ النص العربي في هذا المقطع الصوتي بدقة وبدون أي إضافات." },
          { inline_data: { mime_type: "audio/ogg", data: audioBase64 } }
        ]
      }]
    };

    const aiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!aiRes.ok) return null;
    const result = await aiRes.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) { console.error('Voice transcription error:', e); return null; }
}

async function callAI(apiKey: string, userMessage: string, userName: string, clinicContext: string, tone = 'ودود ومحترم'): Promise<string | null> {
  try {
    const systemPrompt =
      `أنت موظف استقبال في عيادة طبية، نبرتك: ${tone}. تتحدث العربية الفصحى المبسّطة بنبرة دافئة وإنسانية، كأنك تستقبل المريض على باب العيادة بابتسامة.
${clinicContext}

أسلوبك:
- ابدأ ردّك دائماً بكلمة ترحيب لطيفة (مثل: أهلاً وسهلاً، يا هلا، حياك الله، تشرّفنا) ثم ادخل في صلب الجواب.
- اشرح بتفصيل كافٍ ومفيد (٢ إلى ٤ أسطر) دون إطالة مملّة، وقدّم المعلومة بثقة وطمأنينة.
- إذا ذكرت الأسعار، اذكرها بوضوح. وإذا كانت الخدمة "حسب الفحص" فاشرح أن السعر يُحدَّد بعد الكشف من قِبَل الطبيب.
- ادعُ المستخدم في نهاية الرد للضغط على زر «حجز موعد» لإتمام الحجز، أو زر «الخدمات» لاستعراض القائمة، أو «إلغاء موعد» لإلغاء حجز قائم.

قيود صارمة:
- ممنوع منعاً باتاً استخدام أي رموز تعبيرية (Emoji) أو أيقونات زخرفية أو علامات مثل 🕌 🏥 🌷 ★ ● ■ في الرد. اكتب نصاً عربياً نظيفاً فقط.
- لا تستخدم علامات التشكيل (الفتحة/الضمة/الكسرة/الشدّة/السكون) إطلاقاً؛ النص قد يُقرأ بصوت آلي وتُسبّب التشكيلات تشويشاً.
- اقتصر على ما يخص هذه العيادة: التعريف بها، خدماتها وأسعارها، أوقات العمل، توجيه الحجز والإلغاء.
- إذا سُئلت عن أي شيء خارج اختصاص العيادة (سياسة، طقس، رياضة، فتاوى، إلخ) فاعتذر بلطف بجملة واحدة وأعد التوجيه للخدمات.
- لا تقدّم تشخيصاً طبياً ولا وصفات دواء. في الأعراض الخطيرة وجّه فوراً للطوارئ.
- استخدم HTML فقط (<b>, <i>) وليس Markdown.
- اسم المستخدم: ${userName} — نادِه باسمه عند المناسبة.`;

    const url = `${GEMINI_API_URL}?key=${apiKey}`;
    const payload = {
      system_instruction: { parts: { text: systemPrompt } },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0.7 }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) { console.error('AI error:', response.status); return null; }
    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { console.error('AI call error:', e); return null; }
}

function stripEmojis(s: string): string {
  if (!s) return s;
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{2300}-\u{23FF}]/gu, '')
    .replace(/[\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[\u{1F300}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[•●◆■□▪▫★☆※♦♣♥♠✦✧✪✩◉○◎◇◈]/g, '')
    .replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

// دالة الصوت – ترسل الصوت في الخلفية لتجنب EarlyDrop
async function sendVoiceReply(botToken: string, chatId: number, htmlText: string): Promise<void> {
  const plain = stripEmojis(htmlText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')).trim();
  if (!plain) return;

  // نقصر النص على 200 حرف للأداء
  const textForTTS = plain.length > 200 ? plain.slice(0, 197) + '...' : plain;

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(textForTTS)}&textlen=${textForTTS.length}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return;

    const buffer = await r.arrayBuffer();
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('audio', new Blob([buffer], { type: 'audio/mpeg' }), 'voice.mp3');
    fd.append('title', plain.length > 60 ? plain.slice(0, 60) + '...' : plain);

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!json.ok) console.error('Voice send error:', JSON.stringify(json));
  } catch (e) {
    console.error('Voice error:', e);
  }
}

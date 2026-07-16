import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const { botToken, chatId, text } = await req.json();

    if (!botToken || !chatId || !text) {
      return new Response(JSON.stringify({ ok: false, error: "Missing fields" }), { status: 400 });
    }

    // تنظيف النص من الرموز والتشكيل (كما كان الكود القديم يفعل)
    const cleanText = text
      .replace(/<[^>]+>/g, '') // إزالة وسوم HTML
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '') // إزالة الإيموجي
      .replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, '') // إزالة التشكيل
      .replace(/\s+/g, ' ')
      .trim();

    // تحديد طول النص (يفضل ألا يزيد عن 200 حرف للأداء)
    const textForTTS = cleanText.length > 200 ? cleanText.slice(0, 197) + '...' : cleanText;

    // --- استخدام Google Translate TTS (نفس الكود القديم تماماً) ---
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(textForTTS)}&textlen=${textForTTS.length}`;
    const ttsResponse = await fetch(ttsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!ttsResponse.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'TTS fetch failed' }));
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    // -------------------------------------------

    // --- إرسال الصوت إلى تيليجرام كملف صوتي (نفس الكود القديم تماماً) ---
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('audio', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'voice.mp3');
    formData.append('title', cleanText.slice(0, 60)); // عنوان المقطع الصوتي

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, {
      method: 'POST',
      body: formData,
    });
    const telegramResult = await telegramRes.json();
    // -------------------------------------------

    return new Response(JSON.stringify({ ok: telegramResult.ok }));

  } catch (e) {
    console.error('send-voice error:', e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
});

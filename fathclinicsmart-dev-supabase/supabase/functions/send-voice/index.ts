import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const { botToken, chatId, text } = await req.json();
    
    if (!botToken || !chatId || !text) {
      return new Response(JSON.stringify({ ok: false, error: "Missing fields" }), { status: 400 });
    }

    const textForTTS = text.length > 400 ? text.slice(0, 397) + '...' : text;

    const sendAudio = async (buffer: Uint8Array | ArrayBuffer, ext: string) => {
      const fd = new FormData();
      fd.append('chat_id', String(chatId));
      fd.append('audio', new Blob([buffer], { type: ext === 'mp3' ? 'audio/mpeg' : 'audio/ogg' }), `voice.${ext}`);
      fd.append('title', text.length > 60 ? text.slice(0,60) + '...' : text);
      fd.append('performer', 'Smart Clinic');
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, { method: 'POST', body: fd });
      return await res.json();
    };

    const sendVoice = async (buffer: Uint8Array | ArrayBuffer, ext: string) => {
      const fd = new FormData();
      fd.append('chat_id', String(chatId));
      fd.append('voice', new Blob([buffer]), `voice.${ext}`);
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, { method: 'POST', body: fd });
      return await res.json();
    };

    // اختيار عشوائي بين الخدمتين (0 = gTTS, 1 = VoiceRSS)
    const randomChoice = Math.random() < 0.5 ? 0 : 1;

    // المحاولة 1: حسب الاختيار العشوائي
    if (randomChoice === 0) {
      // جرب gTTS (ترسل كـ sendAudio بصيغة MP3)
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(textForTTS)}&textlen=${textForTTS.length}`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.ok) {
          const buffer = await r.arrayBuffer();
          const result = await sendAudio(buffer, 'mp3');
          if (result.ok) return new Response(JSON.stringify({ ok: true, layer: 'gTTS' }));
        }
      } catch (_) {}
      // إذا فشل، جرب VoiceRSS
      try {
        const apiKey = Deno.env.get("VOICERSS_API_KEY");
        if (apiKey) {
          const url = `https://api.voicerss.org/?key=${apiKey}&hl=ar-sa&src=${encodeURIComponent(textForTTS)}&f=48khz_16bit_mono`;
          const res = await fetch(url);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            const result = await sendVoice(buffer, 'ogg');
            if (result.ok) return new Response(JSON.stringify({ ok: true, layer: 'VoiceRSS' }));
          }
        }
      } catch (_) {}
    } else {
      // جرب VoiceRSS أولاً
      try {
        const apiKey = Deno.env.get("VOICERSS_API_KEY");
        if (apiKey) {
          const url = `https://api.voicerss.org/?key=${apiKey}&hl=ar-sa&src=${encodeURIComponent(textForTTS)}&f=48khz_16bit_mono`;
          const res = await fetch(url);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            const result = await sendVoice(buffer, 'ogg');
            if (result.ok) return new Response(JSON.stringify({ ok: true, layer: 'VoiceRSS' }));
          }
        }
      } catch (_) {}
      // إذا فشل، جرب gTTS
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(textForTTS)}&textlen=${textForTTS.length}`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.ok) {
          const buffer = await r.arrayBuffer();
          const result = await sendAudio(buffer, 'mp3');
          if (result.ok) return new Response(JSON.stringify({ ok: true, layer: 'gTTS' }));
        }
      } catch (_) {}
    }

    return new Response(JSON.stringify({ ok: false, error: 'All TTS failed' }));
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const isValidWebhookUrl = (url: string): { valid: boolean; error?: string } => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return { valid: false, error: 'يجب أن يكون الرابط HTTPS' };
    if (url.length > 500) return { valid: false, error: 'الرابط طويل جداً' };
    const privateIpRanges = [/^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^127\./, /^169\.254\./, /^localhost$/i, /^0\.0\.0\.0$/, /^metadata\.google\.internal$/i];
    if (privateIpRanges.some(regex => regex.test(parsed.hostname))) return { valid: false, error: 'لا يمكن استخدام عناوين IP الداخلية' };
    return { valid: true };
  } catch {
    return { valid: false, error: 'صيغة الرابط غير صحيحة' };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: roleData } = await supabaseClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').single();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'غير مصرح - يجب أن تكون مديراً' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, ...params } = await req.json();
    console.log('Admin action:', action, 'by user:', user.id);
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      case 'get-settings': {
        let { data, error } = await adminClient
          .from('system_settings')
          .select('telegram_bot_token, n8n_webhook_url')
          .eq('id', 1)
          .maybeSingle();

        if (error) {
          console.error('get-settings error:', error);
          return new Response(JSON.stringify({ error: 'فشل في جلب الإعدادات', detail: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Auto-seed default row if missing (e.g. after project remix)
        if (!data) {
          await adminClient.from('system_settings').insert({ id: 1, telegram_bot_token: null, n8n_webhook_url: null });
          data = { telegram_bot_token: null, n8n_webhook_url: null } as any;
        }

        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'save-settings': {
        const { webhookUrl, botToken } = params;
        
        if (webhookUrl) {
          const validation = isValidWebhookUrl(webhookUrl);
          if (!validation.valid) {
            return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }

        const updates: any = { updated_at: new Date().toISOString() };
        if (webhookUrl !== undefined) updates.n8n_webhook_url = webhookUrl;
        if (botToken !== undefined) updates.telegram_bot_token = botToken;

        const { error } = await adminClient.from('system_settings').update(updates).eq('id', 1);
        if (error) {
          return new Response(JSON.stringify({ error: 'فشل في حفظ الإعدادات' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'update-webhooks': {
        const { webhookUrl } = params;
        const validation = isValidWebhookUrl(webhookUrl);
        if (!validation.valid) {
          return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Save to system_settings too
        await adminClient.from('system_settings').update({ n8n_webhook_url: webhookUrl, updated_at: new Date().toISOString() }).eq('id', 1);

        const { data: clinics } = await adminClient.from('clinics').select('id, bot_token').not('bot_token', 'is', null);
        let successCount = 0, failCount = 0;

        for (const clinic of clinics || []) {
          if (clinic.bot_token) {
            try {
              const response = await fetch(`https://api.telegram.org/bot${clinic.bot_token}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: webhookUrl }),
              });
              const result = await response.json();
              result.ok ? successCount++ : failCount++;
            } catch {
              failCount++;
            }
          }
        }

        return new Response(JSON.stringify({ success: true, successCount, failCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'toggle-subscription': {
        const { clinicId, currentStatus } = params;
        const { error } = await adminClient
          .from('subscriptions')
          .update({ 
            is_active: !currentStatus, 
            status: !currentStatus ? 'active' : 'expired',
            trial_ends_at: !currentStatus ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : new Date().toISOString()
          })
          .eq('clinic_id', clinicId);

        if (error) {
          return new Response(JSON.stringify({ error: 'فشل في تحديث الاشتراك' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true, newStatus: !currentStatus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'activate-subscription-range': {
        // Activate subscription for an explicit date range chosen by admin (month/quarter/year/custom).
        const { clinicId, endsAt } = params;
        if (!clinicId || !endsAt) {
          return new Response(JSON.stringify({ error: 'بيانات ناقصة' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const end = new Date(endsAt);
        if (isNaN(end.getTime()) || end.getTime() <= Date.now()) {
          return new Response(JSON.stringify({ error: 'تاريخ الانتهاء غير صحيح' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { data: existingSub } = await adminClient
          .from('subscriptions')
          .select('id')
          .eq('clinic_id', clinicId)
          .maybeSingle();
        const { error } = existingSub
          ? await adminClient
              .from('subscriptions')
              .update({ is_active: true, status: 'active', trial_ends_at: end.toISOString() })
              .eq('clinic_id', clinicId)
          : await adminClient
              .from('subscriptions')
              .insert({ clinic_id: clinicId, is_active: true, status: 'active', trial_ends_at: end.toISOString() });
        if (error) {
          return new Response(JSON.stringify({ error: 'فشل تفعيل الاشتراك' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true, endsAt: end.toISOString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get-clinics': {
        const { data: clinics, error } = await adminClient
          .from('clinics')
          .select('*, subscriptions (id, status, is_active, trial_ends_at)')
          .order('created_at', { ascending: false });

        if (error) {
          return new Response(JSON.stringify({ error: 'فشل في جلب العيادات' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const clinicsWithCounts = await Promise.all(
          (clinics || []).map(async (clinic) => {
            const { count: patientsCount } = await adminClient.from('patients').select('*', { count: 'exact', head: true }).eq('clinic_id', clinic.id);
            const { count: appointmentsCount } = await adminClient.from('appointments').select('*', { count: 'exact', head: true }).eq('clinic_id', clinic.id);
            return {
              ...clinic,
              subscription: Array.isArray(clinic.subscriptions) ? clinic.subscriptions[0] || null : clinic.subscriptions || null,
              patients_count: patientsCount || 0,
              appointments_count: appointmentsCount || 0,
              bot_token: clinic.bot_token ? '***masked***' : null,
              has_bot: !!clinic.bot_token,
            };
          })
        );

        return new Response(JSON.stringify({ clinics: clinicsWithCounts }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({ error: 'عملية غير معروفة' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('Admin operation error:', error);
    return new Response(JSON.stringify({ error: 'حدث خطأ في الخادم' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

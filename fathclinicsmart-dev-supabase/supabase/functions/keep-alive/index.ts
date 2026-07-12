import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update heartbeat
    const { error } = await supabase
      .from('system_heartbeat')
      .update({
        last_ping: new Date().toISOString(),
        ping_count: supabase.rpc ? undefined : 0,
      })
      .eq('id', 1);

    // Increment ping count via raw update
    await supabase.rpc('increment_heartbeat', {});

    // Also check and auto-expire trials
    const { data: expiredSubs } = await supabase
      .from('subscriptions')
      .update({ is_active: false, status: 'expired' })
      .lt('trial_ends_at', new Date().toISOString())
      .eq('status', 'trial')
      .eq('is_active', true)
      .select('clinic_id');

    console.log(`Keep-alive ping. Expired ${expiredSubs?.length || 0} trials.`);

    return new Response(JSON.stringify({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      expired_trials: expiredSubs?.length || 0 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Keep-alive error:', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

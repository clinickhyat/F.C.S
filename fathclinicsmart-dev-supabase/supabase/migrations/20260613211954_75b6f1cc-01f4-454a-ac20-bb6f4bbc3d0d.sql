ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS reception_pin TEXT NOT NULL DEFAULT '1234',
  ADD COLUMN IF NOT EXISTS cashier_pin TEXT NOT NULL DEFAULT '5678',
  ADD COLUMN IF NOT EXISTS departments JSONB NOT NULL DEFAULT '["استقبال", "عيادة", "صندوق"]'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_mode TEXT NOT NULL DEFAULT 'auto' CHECK (voice_mode IN ('auto', 'text', 'voice'));

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial')),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS department TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_today_flow ON public.appointments (clinic_id, date, time, status);
CREATE INDEX IF NOT EXISTS idx_appointments_payment_status ON public.appointments (clinic_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_pending ON public.appointments (date, time) WHERE reminder_sent = false AND status IN ('pending', 'confirmed');

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'send-reminders-hourly';

SELECT cron.schedule(
  'send-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fftizrtrhmeemzraxuta.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"source":"cron"}'::jsonb
  );
  $$
);
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'send-reminders-hourly';

SELECT cron.schedule(
  'send-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fftizrtrhmeemzraxuta.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $$
);
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_last_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_appointments_hourly_reminders
ON public.appointments (clinic_id, date, time, reminder_last_sent_at)
WHERE status IN ('pending', 'confirmed');
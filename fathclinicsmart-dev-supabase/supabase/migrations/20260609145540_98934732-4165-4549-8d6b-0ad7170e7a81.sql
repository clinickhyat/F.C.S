-- Make service price optional ("حسب الفحص" when null)
ALTER TABLE public.services ALTER COLUMN price DROP NOT NULL;
ALTER TABLE public.services ALTER COLUMN price DROP DEFAULT;

-- Track when a 10h-before reminder has been sent for an appointment
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_appointments_reminder ON public.appointments (date, time) WHERE reminder_sent = false;

-- Cache the bot username per clinic for QR code generation
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS bot_username TEXT;
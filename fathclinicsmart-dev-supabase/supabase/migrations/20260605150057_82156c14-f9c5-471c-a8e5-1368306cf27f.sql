
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS doctor_name text;

CREATE TABLE IF NOT EXISTS public.bot_sessions (
  telegram_user_id text PRIMARY KEY,
  clinic_id uuid,
  service_id uuid,
  step text NOT NULL DEFAULT 'idle',
  full_name text,
  phone text,
  preferred_date date,
  preferred_time time,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_sessions TO service_role;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages bot sessions"
  ON public.bot_sessions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

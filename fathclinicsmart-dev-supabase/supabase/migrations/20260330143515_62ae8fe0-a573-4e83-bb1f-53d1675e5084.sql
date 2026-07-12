
-- Add new columns to clinics table
ALTER TABLE public.clinics 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'clinic' CHECK (type IN ('clinic', 'salon')),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{"sunday":{"open":"08:00","close":"16:00"},"monday":{"open":"08:00","close":"16:00"},"tuesday":{"open":"08:00","close":"16:00"},"wednesday":{"open":"08:00","close":"16:00"},"thursday":{"open":"08:00","close":"16:00"}}'::jsonb;

-- Add new columns to services table
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add new columns to appointments table
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id),
ADD COLUMN IF NOT EXISTS customer_telegram_id TEXT;

-- Create system_settings table for unified bot config
CREATE TABLE IF NOT EXISTS public.system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telegram_bot_token TEXT,
  n8n_webhook_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view system settings"
ON public.system_settings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update system settings"
ON public.system_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert system settings"
ON public.system_settings FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default row
INSERT INTO public.system_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Create index for telegram lookups
CREATE INDEX IF NOT EXISTS idx_appointments_telegram_id ON public.appointments(customer_telegram_id);

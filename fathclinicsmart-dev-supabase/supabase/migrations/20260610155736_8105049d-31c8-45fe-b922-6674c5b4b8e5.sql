
ALTER TABLE public.clinics 
  ADD COLUMN IF NOT EXISTS voice_agent_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_tone TEXT DEFAULT 'ودود ومحترم';

CREATE TABLE IF NOT EXISTS public.telemetry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telemetry_logs TO authenticated;
GRANT ALL ON public.telemetry_logs TO service_role;

ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic owners can view their telemetry" ON public.telemetry_logs;
CREATE POLICY "Clinic owners can view their telemetry"
ON public.telemetry_logs FOR SELECT TO authenticated
USING (clinic_id IN (SELECT id FROM public.clinics WHERE owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_telemetry_clinic_event ON public.telemetry_logs (clinic_id, event_type, created_at DESC);

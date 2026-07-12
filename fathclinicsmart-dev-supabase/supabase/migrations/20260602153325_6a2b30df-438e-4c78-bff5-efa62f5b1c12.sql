-- Ensure app roles can reach existing public tables through the Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Make the new-user hook idempotent for existing/remixed projects
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_clinic_id UUID;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT DO NOTHING;

  SELECT id INTO new_clinic_id FROM public.clinics WHERE owner_id = NEW.id LIMIT 1;

  IF new_clinic_id IS NULL THEN
    INSERT INTO public.clinics (owner_id, name)
    VALUES (NEW.id, 'عيادتي')
    RETURNING id INTO new_clinic_id;
  END IF;

  INSERT INTO public.subscriptions (clinic_id, status, trial_ends_at, is_active)
  VALUES (new_clinic_id, 'trial', NOW() + INTERVAL '1 day', true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.bot_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  telegram_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'incoming',
  message_type TEXT NOT NULL DEFAULT 'text',
  message_text TEXT,
  transcript TEXT,
  ai_response TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  raw_update JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_conversations TO authenticated;
GRANT ALL ON public.bot_conversations TO service_role;
ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their clinic bot conversations"
ON public.bot_conversations FOR SELECT TO authenticated
USING ((clinic_id = public.get_user_clinic_id(auth.uid())) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can manage bot conversations"
ON public.bot_conversations FOR ALL TO service_role
USING (true)
WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_bot_conversations_clinic_created ON public.bot_conversations (clinic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.telegram_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  recipient_chat_id TEXT,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  telegram_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_notifications TO authenticated;
GRANT ALL ON public.telegram_notifications TO service_role;
ALTER TABLE public.telegram_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their clinic telegram notifications"
ON public.telegram_notifications FOR SELECT TO authenticated
USING ((clinic_id = public.get_user_clinic_id(auth.uid())) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can manage telegram notifications"
ON public.telegram_notifications FOR ALL TO service_role
USING (true)
WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_telegram_notifications_clinic_created ON public.telegram_notifications (clinic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.emergency_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  telegram_user_id TEXT,
  chat_id TEXT,
  patient_name TEXT,
  message_text TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'urgent',
  status TEXT NOT NULL DEFAULT 'new',
  notification_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_events TO authenticated;
GRANT ALL ON public.emergency_events TO service_role;
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their clinic emergency events"
ON public.emergency_events FOR SELECT TO authenticated
USING ((clinic_id = public.get_user_clinic_id(auth.uid())) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can manage emergency events"
ON public.emergency_events FOR ALL TO service_role
USING (true)
WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_emergency_events_clinic_created ON public.emergency_events (clinic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.e2e_test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  created_by UUID NOT NULL,
  scenario TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.e2e_test_runs TO authenticated;
GRANT ALL ON public.e2e_test_runs TO service_role;
ALTER TABLE public.e2e_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their clinic test runs"
ON public.e2e_test_runs FOR SELECT TO authenticated
USING (((clinic_id = public.get_user_clinic_id(auth.uid())) AND (created_by = auth.uid())) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can manage e2e test runs"
ON public.e2e_test_runs FOR ALL TO service_role
USING (true)
WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_e2e_test_runs_clinic_created ON public.e2e_test_runs (clinic_id, created_at DESC);

-- Backfill current users that were created before the trigger existed
DO $$
DECLARE
  u RECORD;
  new_clinic_id UUID;
BEGIN
  FOR u IN
    SELECT au.id, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.clinics c ON c.owner_id = au.id
    WHERE c.id IS NULL
  LOOP
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (u.id, u.raw_user_meta_data ->> 'full_name')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.clinics (owner_id, name)
    VALUES (u.id, 'عيادتي')
    RETURNING id INTO new_clinic_id;

    INSERT INTO public.subscriptions (clinic_id, status, trial_ends_at, is_active)
    VALUES (new_clinic_id, 'trial', NOW() + INTERVAL '1 day', true)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
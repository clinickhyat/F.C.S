
-- Update handle_new_user to use 1 day trial instead of 3 days
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_clinic_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Create clinic for the user
  INSERT INTO public.clinics (owner_id, name)
  VALUES (NEW.id, 'عيادتي')
  RETURNING id INTO new_clinic_id;
  
  -- Create trial subscription (1 day only)
  INSERT INTO public.subscriptions (clinic_id, status, trial_ends_at, is_active)
  VALUES (new_clinic_id, 'trial', NOW() + INTERVAL '1 day', true);
  
  RETURN NEW;
END;
$function$;

-- Create a keep-alive table to track pings
CREATE TABLE IF NOT EXISTS public.system_heartbeat (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_ping timestamptz NOT NULL DEFAULT now(),
  ping_count bigint NOT NULL DEFAULT 0
);

INSERT INTO public.system_heartbeat (id, last_ping, ping_count) 
VALUES (1, now(), 0)
ON CONFLICT (id) DO NOTHING;

-- RLS for system_heartbeat (service role only)
ALTER TABLE public.system_heartbeat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view heartbeat"
ON public.system_heartbeat FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

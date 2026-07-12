
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS receptionist_whatsapp text;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS global_bot_username text;
-- Seed default bot username if missing
UPDATE public.system_settings SET global_bot_username = COALESCE(global_bot_username, 'SmartClinc_bot') WHERE id = 1;
INSERT INTO public.system_settings (id, global_bot_username) VALUES (1, 'SmartClinc_bot') ON CONFLICT (id) DO NOTHING;
GRANT SELECT (global_bot_username) ON public.system_settings TO anon, authenticated;

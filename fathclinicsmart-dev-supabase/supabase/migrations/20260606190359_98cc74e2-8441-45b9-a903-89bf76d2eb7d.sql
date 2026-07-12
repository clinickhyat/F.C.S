ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS telegram_user_id text;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_telegram_user
ON public.patients (clinic_id, telegram_user_id)
WHERE telegram_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_telegram_user_created
ON public.patients (telegram_user_id, created_at DESC)
WHERE telegram_user_id IS NOT NULL;

UPDATE public.patients
SET telegram_user_id = replace(phone, 'tg:', '')
WHERE phone LIKE 'tg:%'
  AND telegram_user_id IS NULL;
-- 1) VAULT TABLE
CREATE TABLE IF NOT EXISTS public.vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  bot_token text,
  reception_pin text,
  cashier_pin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault TO authenticated;
GRANT ALL ON public.vault TO service_role;

ALTER TABLE public.vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only clinic owner can read vault"
  ON public.vault FOR SELECT TO authenticated
  USING (public.is_clinic_owner(clinic_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only clinic owner can insert vault"
  ON public.vault FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_owner(clinic_id, auth.uid()));

CREATE POLICY "Only clinic owner can update vault"
  ON public.vault FOR UPDATE TO authenticated
  USING (public.is_clinic_owner(clinic_id, auth.uid()))
  WITH CHECK (public.is_clinic_owner(clinic_id, auth.uid()));

CREATE POLICY "Only clinic owner can delete vault"
  ON public.vault FOR DELETE TO authenticated
  USING (public.is_clinic_owner(clinic_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_vault_updated_at ON public.vault;
CREATE TRIGGER update_vault_updated_at BEFORE UPDATE ON public.vault
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) MIGRATE EXISTING SECRETS FROM clinics -> vault (keep columns for backward compatibility)
INSERT INTO public.vault (clinic_id, bot_token, reception_pin, cashier_pin)
SELECT id, bot_token, reception_pin, cashier_pin FROM public.clinics
ON CONFLICT (clinic_id) DO NOTHING;

-- 3) FIX RLS on staff_login_attempts
DROP POLICY IF EXISTS "Anyone reads own attempt by email" ON public.staff_login_attempts;

CREATE POLICY "Users can read their own login attempts"
  ON public.staff_login_attempts FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Admins can read all login attempts"
  ON public.staff_login_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) APPOINTMENTS: add missing columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_third_party_booking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booked_by_chat_id text,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_time timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_code text,
  ADD COLUMN IF NOT EXISTS entered_at timestamptz;
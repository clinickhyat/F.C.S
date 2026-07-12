
-- 1) Helper: fetch clinic owned by current user
CREATE OR REPLACE FUNCTION public.current_user_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clinics WHERE owner_id = auth.uid() LIMIT 1;
$$;

-- 2) Add clinic staff by email (owner only)
CREATE OR REPLACE FUNCTION public.add_clinic_staff_by_email(
  _email text,
  _role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_user_id uuid;
  v_existing uuid;
BEGIN
  v_clinic_id := public.current_user_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ليس لديك عيادة مسجلة');
  END IF;

  IF _role NOT IN ('reception','cashier') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'الدور غير مسموح');
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'لا يوجد حساب مسجل بهذا البريد. اطلب من الموظف إنشاء حساب أولاً.');
  END IF;

  SELECT id INTO v_existing FROM public.clinic_staff WHERE user_id = v_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'هذا المستخدم مسجّل بالفعل كموظف.');
  END IF;

  INSERT INTO public.clinic_staff (clinic_id, user_id, email, role, approved)
  VALUES (v_clinic_id, v_user_id, lower(_email), _role::app_role, false);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3) Approve / revoke / remove staff (owner only)
CREATE OR REPLACE FUNCTION public.approve_clinic_staff(_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := public.current_user_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'غير مصرح');
  END IF;
  UPDATE public.clinic_staff
     SET approved = true, approved_at = now()
   WHERE id = _staff_id AND clinic_id = v_clinic_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_clinic_staff(_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := public.current_user_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'غير مصرح');
  END IF;
  UPDATE public.clinic_staff
     SET approved = false, approved_at = NULL
   WHERE id = _staff_id AND clinic_id = v_clinic_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_clinic_staff(_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := public.current_user_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'غير مصرح');
  END IF;
  DELETE FROM public.clinic_staff
   WHERE id = _staff_id AND clinic_id = v_clinic_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4) Vault access RPCs (owner or admin)
CREATE OR REPLACE FUNCTION public.get_clinic_vault()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_row public.vault%ROWTYPE;
BEGIN
  v_clinic_id := public.current_user_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'غير مصرح');
  END IF;
  SELECT * INTO v_row FROM public.vault WHERE clinic_id = v_clinic_id LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true,
    'reception_pin', v_row.reception_pin,
    'cashier_pin', v_row.cashier_pin,
    'bot_token', v_row.bot_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_clinic_vault(
  _reception_pin text,
  _cashier_pin text,
  _bot_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := public.current_user_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'غير مصرح');
  END IF;

  INSERT INTO public.vault (clinic_id, reception_pin, cashier_pin, bot_token)
  VALUES (v_clinic_id, _reception_pin, _cashier_pin, _bot_token)
  ON CONFLICT (clinic_id) DO UPDATE
    SET reception_pin = COALESCE(EXCLUDED.reception_pin, public.vault.reception_pin),
        cashier_pin   = COALESCE(EXCLUDED.cashier_pin, public.vault.cashier_pin),
        bot_token     = COALESCE(EXCLUDED.bot_token, public.vault.bot_token),
        updated_at    = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Ensure unique constraint for ON CONFLICT above
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'vault_clinic_id_unique'
  ) THEN
    ALTER TABLE public.vault ADD CONSTRAINT vault_clinic_id_unique UNIQUE (clinic_id);
  END IF;
END $$;

-- Function used by RPC to fetch staff list is not needed; policies allow owner to select clinic_staff.
-- List pending / approved staff via direct table select in code.

GRANT EXECUTE ON FUNCTION public.add_clinic_staff_by_email(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_clinic_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_clinic_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_clinic_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinic_vault() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_clinic_vault(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_clinic_id() TO authenticated;

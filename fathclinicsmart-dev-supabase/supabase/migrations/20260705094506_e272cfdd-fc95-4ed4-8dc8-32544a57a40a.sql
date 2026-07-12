
ALTER TABLE public.bot_sessions
  ADD COLUMN IF NOT EXISTS is_third_party boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booked_by_chat_id text,
  ADD COLUMN IF NOT EXISTS phone_attempts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.add_clinic_staff_by_email(_email text, _role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    RETURN jsonb_build_object('ok', false, 'error', 'هذا البريد الإلكتروني غير مسجل. يجب على الموظف إنشاء حساب أولاً من خلال صفحة تسجيل الدخول (تبويب "تسجيل موظف جديد").');
  END IF;

  SELECT id INTO v_existing FROM public.clinic_staff WHERE user_id = v_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'هذا المستخدم مسجّل بالفعل كموظف.');
  END IF;

  INSERT INTO public.clinic_staff (clinic_id, user_id, email, role, approved)
  VALUES (v_clinic_id, v_user_id, lower(_email), _role::app_role, false);

  RETURN jsonb_build_object('ok', true);
END;
$function$;

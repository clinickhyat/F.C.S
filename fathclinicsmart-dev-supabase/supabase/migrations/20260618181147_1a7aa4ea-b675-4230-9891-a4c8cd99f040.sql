CREATE OR REPLACE FUNCTION public.is_clinic_owner(_clinic_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinics
    WHERE id = _clinic_id
      AND owner_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_approved_clinic_staff(_clinic_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_staff
    WHERE clinic_id = _clinic_id
      AND user_id = _user_id
      AND approved = true
  )
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_staff TO authenticated;
GRANT ALL ON public.clinic_staff TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
GRANT EXECUTE ON FUNCTION public.is_clinic_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_approved_clinic_staff(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view their own clinic" ON public.clinics;
DROP POLICY IF EXISTS "Users can insert their own clinic" ON public.clinics;
DROP POLICY IF EXISTS "Users can update their own clinic" ON public.clinics;

CREATE POLICY "Users can view accessible clinics"
ON public.clinics
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_approved_clinic_staff(id, auth.uid())
);

CREATE POLICY "Users can insert their own clinic"
ON public.clinics
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own clinic"
ON public.clinics
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage own clinic staff" ON public.clinic_staff;
DROP POLICY IF EXISTS "Staff insert own request" ON public.clinic_staff;
DROP POLICY IF EXISTS "Staff read own row" ON public.clinic_staff;

CREATE POLICY "Clinic owners can manage staff"
ON public.clinic_staff
FOR ALL
TO authenticated
USING (
  public.is_clinic_owner(clinic_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  public.is_clinic_owner(clinic_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Staff can request access"
ON public.clinic_staff
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND approved = false);

CREATE POLICY "Staff can read own staff row"
ON public.clinic_staff
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
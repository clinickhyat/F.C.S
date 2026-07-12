-- Wire up the missing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users that have no clinic
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
    VALUES (new_clinic_id, 'trial', NOW() + INTERVAL '1 day', true);
  END LOOP;
END $$;
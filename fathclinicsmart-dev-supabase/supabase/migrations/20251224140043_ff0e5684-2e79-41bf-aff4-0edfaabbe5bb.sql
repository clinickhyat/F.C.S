-- Fix function search path for generate_reservation_code
CREATE OR REPLACE FUNCTION public.generate_reservation_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN 'RE-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$;
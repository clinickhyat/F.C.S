
-- Create increment_heartbeat function for keep-alive
CREATE OR REPLACE FUNCTION public.increment_heartbeat()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.system_heartbeat 
  SET ping_count = ping_count + 1, last_ping = now() 
  WHERE id = 1;
$$;

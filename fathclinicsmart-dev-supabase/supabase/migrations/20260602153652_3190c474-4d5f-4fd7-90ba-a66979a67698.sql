ALTER TABLE public.e2e_test_runs REPLICA IDENTITY FULL;
ALTER TABLE public.telegram_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.bot_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.emergency_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.e2e_test_runs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
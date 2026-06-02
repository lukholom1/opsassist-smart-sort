ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_notes;
ALTER TABLE public.ticket_notes REPLICA IDENTITY FULL;
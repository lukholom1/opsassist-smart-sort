
CREATE TABLE public.pending_admin_message_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.ticket_notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  user_name text,
  ticket_title text NOT NULL,
  admin_name text,
  message_preview text,
  notify_at timestamptz NOT NULL,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pending_admin_message_notifications TO authenticated;
GRANT ALL ON public.pending_admin_message_notifications TO service_role;

ALTER TABLE public.pending_admin_message_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own pending notifications" ON public.pending_admin_message_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX pending_admin_msg_due_idx
  ON public.pending_admin_message_notifications (notify_at)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX pending_admin_msg_ticket_idx
  ON public.pending_admin_message_notifications (ticket_id, user_id)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;


-- Conversation thread on each ticket
CREATE TABLE public.ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('user','admin')),
  body text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_notes_ticket_id_created_idx
  ON public.ticket_notes(ticket_id, created_at);

ALTER TABLE public.ticket_notes ENABLE ROW LEVEL SECURITY;

-- Helper: can the current user access this ticket's notes?
CREATE OR REPLACE FUNCTION public.can_access_ticket_notes(_ticket_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = _ticket_id
      AND (
        t.user_id = auth.uid()
        OR (public.has_role(auth.uid(), 'admin') AND public.user_department(auth.uid()) IS NULL)
        OR (public.has_role(auth.uid(), 'admin')
            AND public.user_department(auth.uid()) = ANY (t.categories))
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_ticket_notes(uuid) FROM PUBLIC, anon, authenticated;

-- SELECT: ticket owner, super admin, or dept admin whose department is in the ticket
CREATE POLICY "notes visible to participants"
ON public.ticket_notes
FOR SELECT
TO authenticated
USING (public.can_access_ticket_notes(ticket_id));

-- INSERT: same participants, but only while the ticket is not Resolved
CREATE POLICY "participants can add notes while open"
ON public.ticket_notes
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.can_access_ticket_notes(ticket_id)
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_id AND t.status <> 'Resolved'
  )
);

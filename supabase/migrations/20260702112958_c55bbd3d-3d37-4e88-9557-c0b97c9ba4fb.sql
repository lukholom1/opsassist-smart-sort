
-- ============ APPROVALS ============
CREATE TABLE public.ticket_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  department text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','info_requested')),
  decided_by uuid REFERENCES auth.users(id),
  decided_by_name text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.ticket_approvals TO authenticated;
GRANT ALL ON public.ticket_approvals TO service_role;

ALTER TABLE public.ticket_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approvals_select" ON public.ticket_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
    OR (public.has_role(auth.uid(), 'admin') AND public.user_department(auth.uid()) IS NULL)
    OR ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
        AND public.user_department(auth.uid()) = department)
  );

CREATE POLICY "approvals_update" ON public.ticket_approvals
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') AND public.user_department(auth.uid()) IS NULL)
    OR ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
        AND public.user_department(auth.uid()) = department)
  );

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id, read_at, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============ AUTO-DETECT APPROVAL KEYWORDS ============
CREATE OR REPLACE FUNCTION public.detect_approval_needed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text;
  v_dept text;
  v_needs boolean := false;
BEGIN
  v_text := lower(coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,''));
  IF v_text ~ '\m(leave|sick|emergency|broken|replacement|critical)\M' THEN
    v_needs := true;
  END IF;

  IF v_needs THEN
    NEW.approval_required := true;
    NEW.workflow_stage := 'pending_approval';

    -- create approval rows for each involved department
    IF NEW.categories IS NOT NULL THEN
      FOREACH v_dept IN ARRAY NEW.categories LOOP
        INSERT INTO public.ticket_approvals (ticket_id, department, reason)
        VALUES (NEW.id, v_dept, 'Auto-flagged (keyword match)');
      END LOOP;
    END IF;

    -- notify managers/admins of those departments
    INSERT INTO public.notifications (user_id, ticket_id, type, title, body, metadata)
    SELECT DISTINCT ur.user_id, NEW.id, 'approval_required',
           'Approval needed: ' || NEW.title,
           'A ticket in your department requires approval.',
           jsonb_build_object('ticket_id', NEW.id)
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role IN ('admin','manager')
      AND p.department = ANY (NEW.categories);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_detect_approval ON public.tickets;
CREATE TRIGGER trg_detect_approval
BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.detect_approval_needed();

-- ============ APPROVAL DECISION EFFECTS ============
CREATE OR REPLACE FUNCTION public.on_approval_decided()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending int;
  v_rejected int;
  v_owner uuid;
  v_title text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT user_id, title INTO v_owner, v_title FROM public.tickets WHERE id = NEW.ticket_id;

  -- log activity
  INSERT INTO public.ticket_activity (ticket_id, actor_id, actor_name, actor_role, event_type, description, metadata)
  VALUES (NEW.ticket_id, NEW.decided_by, coalesce(NEW.decided_by_name,'Manager'), 'manager',
          'approval_' || NEW.status,
          NEW.department || ' ' || NEW.status || coalesce(': ' || NEW.decision_note, ''),
          jsonb_build_object('department', NEW.department, 'status', NEW.status));

  SELECT count(*) FILTER (WHERE status = 'pending'),
         count(*) FILTER (WHERE status = 'rejected')
    INTO v_pending, v_rejected
  FROM public.ticket_approvals WHERE ticket_id = NEW.ticket_id;

  IF v_rejected > 0 THEN
    UPDATE public.tickets
      SET workflow_stage = 'closed', status = 'Resolved', resolved_at = coalesce(resolved_at, now())
      WHERE id = NEW.ticket_id;
  ELSIF v_pending = 0 THEN
    UPDATE public.tickets SET workflow_stage = 'approved' WHERE id = NEW.ticket_id;
    UPDATE public.tickets SET workflow_stage = 'assigned' WHERE id = NEW.ticket_id;
  END IF;

  -- notify ticket owner
  INSERT INTO public.notifications (user_id, ticket_id, type, title, body, metadata)
  VALUES (v_owner, NEW.ticket_id, 'approval_' || NEW.status,
          'Ticket ' || NEW.status || ': ' || v_title,
          coalesce(NEW.decision_note, 'Your ticket has been ' || NEW.status || '.'),
          jsonb_build_object('department', NEW.department));

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_on_approval_decided ON public.ticket_approvals;
CREATE TRIGGER trg_on_approval_decided
AFTER UPDATE ON public.ticket_approvals
FOR EACH ROW EXECUTE FUNCTION public.on_approval_decided();

-- ============ NOTIFY ON NEW NOTES ============
CREATE OR REPLACE FUNCTION public.notify_on_new_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_title text;
  v_cats text[];
BEGIN
  SELECT user_id, title, categories INTO v_owner, v_title, v_cats
  FROM public.tickets WHERE id = NEW.ticket_id;

  IF NEW.author_role = 'user' THEN
    -- notify all admins/managers in relevant departments
    INSERT INTO public.notifications (user_id, ticket_id, type, title, body, metadata)
    SELECT DISTINCT ur.user_id, NEW.ticket_id, 'new_note',
           'New message on: ' || v_title,
           left(NEW.body, 140),
           jsonb_build_object('from', 'user')
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role IN ('admin','manager')
      AND (p.department IS NULL OR p.department = ANY (v_cats))
      AND ur.user_id <> coalesce(NEW.author_id, '00000000-0000-0000-0000-000000000000'::uuid);
  ELSIF NEW.author_role IN ('admin','manager','ai') THEN
    IF v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, ticket_id, type, title, body, metadata)
      VALUES (v_owner, NEW.ticket_id, 'new_note',
              'New reply on: ' || v_title,
              left(NEW.body, 140),
              jsonb_build_object('from', NEW.author_role));
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_new_note ON public.ticket_notes;
CREATE TRIGGER trg_notify_new_note
AFTER INSERT ON public.ticket_notes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_note();

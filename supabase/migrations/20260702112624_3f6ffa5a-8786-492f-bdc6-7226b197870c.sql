
-- Tickets: workflow columns
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS sla_hours INT,
  ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

UPDATE public.tickets
SET workflow_stage = CASE
  WHEN status = 'Resolved' THEN 'closed'
  WHEN status = 'In Progress' THEN 'in_progress'
  ELSE 'assigned'
END
WHERE workflow_stage = 'submitted' AND created_at < now() - interval '1 minute';

-- Ticket activity table
CREATE TABLE IF NOT EXISTS public.ticket_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id UUID,
  actor_name TEXT NOT NULL DEFAULT 'System',
  actor_role TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_activity_ticket_id_created_at_idx
  ON public.ticket_activity (ticket_id, created_at DESC);

GRANT SELECT ON public.ticket_activity TO authenticated;
GRANT ALL ON public.ticket_activity TO service_role;

ALTER TABLE public.ticket_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read ticket activity when involved"
ON public.ticket_activity
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_activity.ticket_id
      AND (
        t.user_id = auth.uid()
        OR ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
            AND public.user_department(auth.uid()) IS NULL)
        OR ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
            AND public.user_department(auth.uid()) = ANY (t.categories))
      )
  )
);

-- Auto-log workflow/status changes on tickets
CREATE OR REPLACE FUNCTION public.log_ticket_workflow_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_activity (ticket_id, actor_id, actor_name, actor_role, event_type, description, metadata)
    VALUES (NEW.id, NEW.user_id, COALESCE(NEW.user_name, 'User'), 'user', 'ticket_created',
            'Ticket created', jsonb_build_object('priority', NEW.priority, 'categories', NEW.categories));
    RETURN NEW;
  END IF;

  IF NEW.workflow_stage IS DISTINCT FROM OLD.workflow_stage THEN
    INSERT INTO public.ticket_activity (ticket_id, event_type, description, metadata)
    VALUES (NEW.id, 'workflow_stage_changed',
            'Workflow: ' || OLD.workflow_stage || ' → ' || NEW.workflow_stage,
            jsonb_build_object('from', OLD.workflow_stage, 'to', NEW.workflow_stage));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ticket_activity (ticket_id, event_type, description, metadata)
    VALUES (NEW.id, 'status_changed',
            'Status: ' || OLD.status || ' → ' || NEW.status,
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ticket_workflow ON public.tickets;
CREATE TRIGGER trg_log_ticket_workflow
AFTER INSERT OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.log_ticket_workflow_change();

-- Auto-log assignment changes
CREATE OR REPLACE FUNCTION public.log_ticket_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_activity (ticket_id, event_type, description, metadata)
    VALUES (NEW.ticket_id, 'assigned',
            'Routed to ' || NEW.department || CASE WHEN NEW.assigned_to IS NOT NULL THEN ' (assignee set)' ELSE ' (unassigned)' END,
            jsonb_build_object('department', NEW.department, 'assigned_to', NEW.assigned_to));
    RETURN NEW;
  END IF;

  IF NEW.department IS DISTINCT FROM OLD.department THEN
    INSERT INTO public.ticket_activity (ticket_id, event_type, description, metadata)
    VALUES (NEW.ticket_id, 'reassigned',
            'Reassigned from ' || OLD.department || ' to ' || NEW.department,
            jsonb_build_object('from', OLD.department, 'to', NEW.department));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ticket_activity (ticket_id, event_type, description, metadata)
    VALUES (NEW.ticket_id, 'assignment_status_changed',
            NEW.department || ' → ' || NEW.status,
            jsonb_build_object('department', NEW.department, 'from', OLD.status, 'to', NEW.status));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ticket_assignment ON public.ticket_assignments;
CREATE TRIGGER trg_log_ticket_assignment
AFTER INSERT OR UPDATE ON public.ticket_assignments
FOR EACH ROW EXECUTE FUNCTION public.log_ticket_assignment_change();

-- Prefer manager over lower roles in get_my_role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() ORDER BY
    CASE role
      WHEN 'admin'::app_role THEN 1
      WHEN 'manager'::app_role THEN 2
      WHEN 'it_personnel'::app_role THEN 3
      ELSE 4
    END LIMIT 1
$$;

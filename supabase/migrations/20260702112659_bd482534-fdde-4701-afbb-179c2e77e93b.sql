
-- Update the full-resolution check to also advance workflow_stage
CREATE OR REPLACE FUNCTION public.check_ticket_full_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_total int; v_resolved int; v_any_ai boolean;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status = 'Resolved'), bool_or(resolved_by_ai)
    INTO v_total, v_resolved, v_any_ai
  FROM public.ticket_assignments WHERE ticket_id = NEW.ticket_id;

  IF v_total > 0 AND v_total = v_resolved THEN
    UPDATE public.tickets
      SET status = 'Resolved',
          resolved_at = COALESCE(resolved_at, now()),
          resolved_by_ai = COALESCE(v_any_ai, false),
          resolution_source = COALESCE(resolution_source, CASE WHEN v_any_ai THEN 'ai' ELSE 'department' END),
          workflow_stage = CASE WHEN workflow_stage = 'closed' THEN 'closed' ELSE 'resolved' END
      WHERE id = NEW.ticket_id;
  ELSIF v_total > 0 AND EXISTS (
    SELECT 1 FROM public.ticket_assignments
    WHERE ticket_id = NEW.ticket_id AND status = 'In Progress'
  ) THEN
    UPDATE public.tickets
      SET workflow_stage = 'in_progress'
      WHERE id = NEW.ticket_id
        AND workflow_stage NOT IN ('in_progress', 'resolved', 'closed');
  END IF;
  RETURN NEW;
END $function$;

-- When feedback is submitted on a resolved ticket, close it
CREATE OR REPLACE FUNCTION public.close_ticket_on_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tickets
    SET workflow_stage = 'closed'
    WHERE id = NEW.ticket_id AND workflow_stage <> 'closed';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_close_ticket_on_feedback ON public.ticket_feedback;
CREATE TRIGGER trg_close_ticket_on_feedback
AFTER INSERT ON public.ticket_feedback
FOR EACH ROW EXECUTE FUNCTION public.close_ticket_on_feedback();

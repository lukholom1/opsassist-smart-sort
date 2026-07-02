-- Split into BEFORE trigger (mutate NEW) and AFTER trigger (create approval/notification rows)
CREATE OR REPLACE FUNCTION public.detect_approval_needed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_text text;
BEGIN
  v_text := lower(coalesce(NEW.title,'') || ' ' || coalesce(NEW.details,''));
  IF v_text ~ '\m(leave|sick|emergency|broken|replacement|critical)\M' THEN
    NEW.approval_required := true;
    NEW.workflow_stage := 'pending_approval';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.create_ticket_approvals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dept text;
BEGIN
  IF NEW.approval_required IS TRUE AND NEW.categories IS NOT NULL THEN
    FOREACH v_dept IN ARRAY NEW.categories LOOP
      INSERT INTO public.ticket_approvals (ticket_id, department, reason)
      VALUES (NEW.id, v_dept, 'Auto-flagged (keyword match)');
    END LOOP;

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
END $function$;

DROP TRIGGER IF EXISTS trg_create_ticket_approvals ON public.tickets;
CREATE TRIGGER trg_create_ticket_approvals
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.create_ticket_approvals();
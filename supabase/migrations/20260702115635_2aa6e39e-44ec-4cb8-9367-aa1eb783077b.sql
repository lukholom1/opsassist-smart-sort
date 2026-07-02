CREATE OR REPLACE FUNCTION public.detect_approval_needed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_text text;
  v_dept text;
  v_needs boolean := false;
BEGIN
  v_text := lower(coalesce(NEW.title,'') || ' ' || coalesce(NEW.details,''));
  IF v_text ~ '\m(leave|sick|emergency|broken|replacement|critical)\M' THEN
    v_needs := true;
  END IF;

  IF v_needs THEN
    NEW.approval_required := true;
    NEW.workflow_stage := 'pending_approval';

    IF NEW.categories IS NOT NULL THEN
      FOREACH v_dept IN ARRAY NEW.categories LOOP
        INSERT INTO public.ticket_approvals (ticket_id, department, reason)
        VALUES (NEW.id, v_dept, 'Auto-flagged (keyword match)');
      END LOOP;
    END IF;

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
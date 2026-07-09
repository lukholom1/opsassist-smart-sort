
-- Approval delegation & ticket locking

ALTER TABLE public.workflow_approvals
  ADD COLUMN IF NOT EXISTS origin_department text,
  ADD COLUMN IF NOT EXISTS delegated_from_id uuid REFERENCES public.workflow_approvals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delegated_to_id   uuid REFERENCES public.workflow_approvals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS awaiting_delegation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid,
  ADD COLUMN IF NOT EXISTS sequence int NOT NULL DEFAULT 0;

-- Backfill: for existing rows origin_department = department.
UPDATE public.workflow_approvals
   SET origin_department = department
 WHERE origin_department IS NULL;

CREATE INDEX IF NOT EXISTS workflow_approvals_delegated_from_idx
  ON public.workflow_approvals(delegated_from_id);

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS approval_lock boolean NOT NULL DEFAULT false;

-- Recompute approval_lock for a given ticket.
CREATE OR REPLACE FUNCTION public.recalc_approval_lock(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_active int;
BEGIN
  SELECT count(*) INTO v_active
    FROM public.workflow_approvals
   WHERE ticket_id = _ticket_id
     AND (status = 'pending' OR awaiting_delegation = true);
  UPDATE public.tickets
     SET approval_lock = (v_active > 0)
   WHERE id = _ticket_id;
END $$;

-- Trigger: sync approval_lock and unskip on new approvals.
CREATE OR REPLACE FUNCTION public.workflow_approvals_touch_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ticket uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ticket := NEW.ticket_id;
    -- New approval request re-opens the approval workflow (unskip).
    UPDATE public.tickets
       SET workflow_skipped = false,
           workflow_skipped_at = null,
           workflow_skipped_by = null,
           workflow_skipped_reason = null
     WHERE id = v_ticket AND workflow_skipped = true;
  ELSIF TG_OP = 'DELETE' THEN
    v_ticket := OLD.ticket_id;
  ELSE
    v_ticket := NEW.ticket_id;
  END IF;

  PERFORM public.recalc_approval_lock(v_ticket);
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS workflow_approvals_lock_sync ON public.workflow_approvals;
CREATE TRIGGER workflow_approvals_lock_sync
AFTER INSERT OR UPDATE OR DELETE ON public.workflow_approvals
FOR EACH ROW EXECUTE FUNCTION public.workflow_approvals_touch_lock();

-- One-shot: sync approval_lock for existing tickets.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT ticket_id FROM public.workflow_approvals LOOP
    PERFORM public.recalc_approval_lock(r.ticket_id);
  END LOOP;
END $$;

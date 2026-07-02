
-- Make approval workflow manual: drop auto-triggers and allow ad-hoc approvals (no stage).
DROP TRIGGER IF EXISTS trg_detect_approval_needed ON public.tickets;
DROP TRIGGER IF EXISTS trg_create_ticket_approvals ON public.tickets;

-- Allow manual approvals with no attached workflow stage.
ALTER TABLE public.workflow_approvals ALTER COLUMN stage_id DROP NOT NULL;

-- Track manual "skipped / no approval needed" decisions on tickets.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS workflow_skipped boolean NOT NULL DEFAULT false;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS workflow_skipped_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS workflow_skipped_by uuid;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS workflow_skipped_reason text;


ALTER TABLE public.workflow_approvals
  ADD COLUMN IF NOT EXISTS request_note text,
  ADD COLUMN IF NOT EXISTS requested_by uuid,
  ADD COLUMN IF NOT EXISTS requested_by_name text;

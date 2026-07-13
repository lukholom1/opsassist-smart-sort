
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS escalated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_by uuid,
  ADD COLUMN IF NOT EXISTS escalated_by_name text,
  ADD COLUMN IF NOT EXISTS escalated_by_department text,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS escalation_notes text,
  ADD COLUMN IF NOT EXISTS escalation_status text;

CREATE INDEX IF NOT EXISTS tickets_escalated_idx
  ON public.tickets (escalated, escalated_at DESC)
  WHERE escalated = true;


-- Normalize existing free-text department values
UPDATE public.profiles SET department = 'HR' WHERE department IN ('Human Resources','hr','Hr');
UPDATE public.profiles SET department = NULL WHERE department IS NOT NULL AND department NOT IN ('HR','IT','Finance','Operations');

-- 1. Profiles dept constraint
ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_chk
  CHECK (department IS NULL OR department IN ('HR','IT','Finance','Operations'));

-- 2. Tickets: multi-category + resolution source
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS resolution_source text;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_resolution_source_chk
  CHECK (resolution_source IS NULL OR resolution_source IN ('ai','department'));

UPDATE public.tickets SET categories = ARRAY[category] WHERE array_length(categories,1) IS NULL;

-- 3. ticket_assignments
CREATE TABLE IF NOT EXISTS public.ticket_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  department text NOT NULL CHECK (department IN ('HR','IT','Finance','Operations')),
  assigned_to uuid,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  resolved_at timestamptz,
  resolved_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, department)
);
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_dept ON public.ticket_assignments(department, status);
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_assignee ON public.ticket_assignments(assigned_to);
ALTER TABLE public.ticket_assignments ENABLE ROW LEVEL SECURITY;

-- Backfill assignments for existing tickets (one per category)
INSERT INTO public.ticket_assignments (ticket_id, department, assigned_to, status, resolved_at, resolved_by_ai)
SELECT t.id, unnest(t.categories), t.assigned_to, t.status, t.resolved_at, t.resolved_by_ai
FROM public.tickets t
WHERE array_length(t.categories,1) > 0
ON CONFLICT (ticket_id, department) DO NOTHING;

-- 4. ticket_feedback
CREATE TABLE IF NOT EXISTS public.ticket_feedback (
  ticket_id uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  resolution_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_feedback ENABLE ROW LEVEL SECURITY;

-- 5. Helper
CREATE OR REPLACE FUNCTION public.user_department(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department FROM public.profiles WHERE id = _uid
$$;

-- 6. RLS ticket_assignments
CREATE POLICY "assignments visible to relevant users"
ON public.ticket_assignments FOR SELECT TO authenticated USING (
  (has_role(auth.uid(), 'admin'::app_role) AND user_department(auth.uid()) IS NULL)
  OR (has_role(auth.uid(), 'admin'::app_role) AND user_department(auth.uid()) = department)
  OR EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
);
CREATE POLICY "department admins update their assignments"
ON public.ticket_assignments FOR UPDATE TO authenticated USING (
  (has_role(auth.uid(), 'admin'::app_role) AND user_department(auth.uid()) IS NULL)
  OR (has_role(auth.uid(), 'admin'::app_role) AND user_department(auth.uid()) = department)
);

-- 7. RLS ticket_feedback
CREATE POLICY "ticket owners insert feedback"
ON public.ticket_feedback FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
);
CREATE POLICY "feedback visible to owner, admins, dept admins"
ON public.ticket_feedback FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR (has_role(auth.uid(), 'admin'::app_role) AND user_department(auth.uid()) IS NULL)
  OR EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_id
      AND has_role(auth.uid(), 'admin'::app_role)
      AND user_department(auth.uid()) = ANY(t.categories)
  )
);

-- 8. Trigger
CREATE OR REPLACE FUNCTION public.check_ticket_full_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
          resolution_source = COALESCE(resolution_source, CASE WHEN v_any_ai THEN 'ai' ELSE 'department' END)
      WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_check_ticket_full_resolution ON public.ticket_assignments;
CREATE TRIGGER trg_check_ticket_full_resolution
AFTER UPDATE OF status ON public.ticket_assignments
FOR EACH ROW EXECUTE FUNCTION public.check_ticket_full_resolution();

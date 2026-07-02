
-- =========================================================================
-- Conditional Approval Workflow engine
-- =========================================================================

-- 1. workflow_templates
CREATE TABLE public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  trigger_keywords text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workflow_templates TO authenticated, anon;
GRANT ALL ON public.workflow_templates TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates readable" ON public.workflow_templates FOR SELECT USING (true);
CREATE POLICY "templates admin write" ON public.workflow_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin') AND public.user_department(auth.uid()) IS NULL)
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.user_department(auth.uid()) IS NULL);

-- 2. workflow_stages
CREATE TABLE public.workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  position int NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('approval', 'operational', 'terminal')),
  approver_kind text CHECK (approver_kind IN ('department', 'user', 'none')),
  approver_department text,
  approver_user_id uuid,
  UNIQUE (template_id, position)
);
GRANT SELECT ON public.workflow_stages TO authenticated, anon;
GRANT ALL ON public.workflow_stages TO service_role;
ALTER TABLE public.workflow_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stages readable" ON public.workflow_stages FOR SELECT USING (true);
CREATE POLICY "stages admin write" ON public.workflow_stages FOR ALL
  USING (public.has_role(auth.uid(), 'admin') AND public.user_department(auth.uid()) IS NULL)
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.user_department(auth.uid()) IS NULL);

-- 3. ticket_workflow (one per ticket)
CREATE TABLE public.ticket_workflow (
  ticket_id uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id),
  current_stage_id uuid REFERENCES public.workflow_stages(id),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_workflow TO authenticated;
GRANT ALL ON public.ticket_workflow TO service_role;
ALTER TABLE public.ticket_workflow ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow owner or admin read" ON public.ticket_workflow FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "workflow admin write" ON public.ticket_workflow FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. workflow_approvals
CREATE TABLE public.workflow_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.workflow_stages(id),
  department text,
  approver_user_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'info_requested')),
  decision_note text,
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workflow_approvals_ticket_idx ON public.workflow_approvals(ticket_id);
CREATE INDEX workflow_approvals_status_idx ON public.workflow_approvals(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_approvals TO authenticated;
GRANT ALL ON public.workflow_approvals TO service_role;
ALTER TABLE public.workflow_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approvals visible" ON public.workflow_approvals FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "approvals admin write" ON public.workflow_approvals FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. workflow_history
CREATE TABLE public.workflow_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.workflow_stages(id),
  action text NOT NULL,
  actor_id uuid,
  actor_name text,
  actor_department text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workflow_history_ticket_idx ON public.workflow_history(ticket_id, created_at);
GRANT SELECT, INSERT ON public.workflow_history TO authenticated;
GRANT ALL ON public.workflow_history TO service_role;
ALTER TABLE public.workflow_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "history visible" ON public.workflow_history FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "history admin insert" ON public.workflow_history FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger helper (create only if missing)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER workflow_templates_touch BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ticket_workflow_touch BEFORE UPDATE ON public.ticket_workflow
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- Seed starter templates
-- =========================================================================
DO $$
DECLARE
  t_laptop uuid; t_software uuid; t_leave uuid;
BEGIN
  INSERT INTO public.workflow_templates (key, name, description, trigger_keywords)
  VALUES ('laptop_replacement', 'Laptop Replacement',
          'Replace a damaged, lost, or end-of-life laptop.',
          ARRAY['laptop replacement','replace laptop','broken laptop','new laptop','damaged laptop'])
  RETURNING id INTO t_laptop;
  INSERT INTO public.workflow_stages (template_id, position, name, type, approver_kind, approver_department) VALUES
    (t_laptop, 1, 'Request Submitted', 'operational', 'none', NULL),
    (t_laptop, 2, 'Finance Approval', 'approval', 'department', 'Finance'),
    (t_laptop, 3, 'IT Procurement', 'operational', 'department', 'IT'),
    (t_laptop, 4, 'Completed', 'terminal', 'none', NULL);

  INSERT INTO public.workflow_templates (key, name, description, trigger_keywords)
  VALUES ('software_purchase', 'Software Purchase',
          'Purchase or license new software.',
          ARRAY['software purchase','buy software','new software license','software license','purchase license'])
  RETURNING id INTO t_software;
  INSERT INTO public.workflow_stages (template_id, position, name, type, approver_kind, approver_department) VALUES
    (t_software, 1, 'Request Submitted', 'operational', 'none', NULL),
    (t_software, 2, 'Manager Approval', 'approval', 'department', 'Operations'),
    (t_software, 3, 'Finance Approval', 'approval', 'department', 'Finance'),
    (t_software, 4, 'IT Installation', 'operational', 'department', 'IT'),
    (t_software, 5, 'Completed', 'terminal', 'none', NULL);

  INSERT INTO public.workflow_templates (key, name, description, trigger_keywords)
  VALUES ('leave_request', 'Leave Request',
          'Employee time-off request.',
          ARRAY['leave request','annual leave','sick leave','vacation request','time off','request leave'])
  RETURNING id INTO t_leave;
  INSERT INTO public.workflow_stages (template_id, position, name, type, approver_kind, approver_department) VALUES
    (t_leave, 1, 'Request Submitted', 'operational', 'none', NULL),
    (t_leave, 2, 'Line Manager Approval', 'approval', 'department', 'Operations'),
    (t_leave, 3, 'HR Approval', 'approval', 'department', 'HR'),
    (t_leave, 4, 'Completed', 'terminal', 'none', NULL);
END $$;

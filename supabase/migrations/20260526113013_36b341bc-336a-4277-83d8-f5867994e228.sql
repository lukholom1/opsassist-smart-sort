
-- 1) Fix tickets UPDATE privilege escalation: only admins and assignees can update.
DROP POLICY IF EXISTS "Admins and assignees can update tickets" ON public.tickets;

CREATE POLICY "Admins and assignees can update tickets"
ON public.tickets
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR auth.uid() = assigned_to
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR auth.uid() = assigned_to
);

-- 2) Revoke direct EXECUTE on SECURITY DEFINER helpers. They are still callable
--    from RLS policy expressions (which run as the policy owner), but cannot be
--    invoked directly by anon/authenticated clients.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_department(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_ticket_notes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_department(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_ticket_notes(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;
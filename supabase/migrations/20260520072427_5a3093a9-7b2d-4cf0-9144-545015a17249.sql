
REVOKE ALL ON FUNCTION public.user_department(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_ticket_full_resolution() FROM PUBLIC, anon, authenticated;

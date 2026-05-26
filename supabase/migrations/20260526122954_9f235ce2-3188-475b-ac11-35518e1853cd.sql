
-- Attach the existing function as a trigger on ticket_assignments
DROP TRIGGER IF EXISTS trg_check_ticket_full_resolution ON public.ticket_assignments;
CREATE TRIGGER trg_check_ticket_full_resolution
AFTER INSERT OR UPDATE OF status, resolved_by_ai ON public.ticket_assignments
FOR EACH ROW
EXECUTE FUNCTION public.check_ticket_full_resolution();

-- Backfill: any ticket whose assignments are all Resolved should be Resolved.
UPDATE public.tickets t
SET status = 'Resolved',
    resolved_at = COALESCE(t.resolved_at, now()),
    resolved_by_ai = COALESCE(t.resolved_by_ai, sub.any_ai),
    resolution_source = COALESCE(t.resolution_source, CASE WHEN sub.any_ai THEN 'ai' ELSE 'department' END)
FROM (
  SELECT ticket_id,
         count(*) AS total,
         count(*) FILTER (WHERE status = 'Resolved') AS resolved,
         bool_or(resolved_by_ai) AS any_ai
  FROM public.ticket_assignments
  GROUP BY ticket_id
) sub
WHERE t.id = sub.ticket_id
  AND sub.total > 0
  AND sub.total = sub.resolved
  AND t.status <> 'Resolved';

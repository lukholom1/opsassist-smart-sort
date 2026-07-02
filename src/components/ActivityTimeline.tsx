import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  UserPlus,
  ArrowRightLeft,
  CircleCheck,
  CircleDot,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import { listTicketActivity, type TicketActivityRow } from "@/lib/tickets.functions";

function iconFor(eventType: string) {
  switch (eventType) {
    case "ticket_created":
      return <ClipboardList size={14} />;
    case "assigned":
      return <UserPlus size={14} />;
    case "reassigned":
      return <ArrowRightLeft size={14} />;
    case "workflow_stage_changed":
      return <Sparkles size={14} />;
    case "assignment_status_changed":
    case "status_changed":
      return <CircleDot size={14} />;
    case "approved":
      return <CircleCheck size={14} />;
    default:
      return <Activity size={14} />;
  }
}

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityTimeline({ ticketId }: { ticketId: string }) {
  const fetchActivity = useServerFn(listTicketActivity);
  const [rows, setRows] = useState<TicketActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActivity({ data: { ticket_id: ticketId } })
      .then((res) => {
        if (!cancelled) setRows(res.activity);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load activity");
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, fetchActivity]);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Activity size={12} /> Activity timeline
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-primary ring-1 ring-border">
                {iconFor(r.event_type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{r.description}</div>
                <div className="text-xs text-muted-foreground">
                  {fmt(r.created_at)}
                  {r.actor_role !== "system" && r.actor_name ? ` · ${r.actor_name}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getTicketWorkflow,
  completeCurrentOperationalStage,
  type WorkflowStage,
  type WorkflowApproval,
  type WorkflowHistoryRow,
  type TicketWorkflowRow,
  type WorkflowTemplate,
} from "@/lib/workflow.functions";
import { CheckCircle2, Circle, Clock, XCircle, Loader2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Loaded = {
  workflow: TicketWorkflowRow;
  template: WorkflowTemplate | null;
  stages: WorkflowStage[];
  approvals: WorkflowApproval[];
  history: WorkflowHistoryRow[];
};

export function WorkflowProgress({ ticketId }: { ticketId: string }) {
  const getFn = useServerFn(getTicketWorkflow);
  const completeFn = useServerFn(completeCurrentOperationalStage);
  const { role, department } = useAuth();
  const [data, setData] = useState<Loaded | null | "none">(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = (await getFn({ data: { ticket_id: ticketId } })) as any;
      if (!r.workflow) {
        setData("none");
        return;
      }
      setData(r as Loaded);
    } catch {
      setData("none");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  if (data === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Loading workflow…
      </div>
    );
  }
  if (data === "none") return null;

  const { workflow, stages, approvals, history } = data;
  const currentIdx = stages.findIndex((s) => s.id === workflow.current_stage_id);
  const isRejected = workflow.status === "rejected";
  const isCompleted = workflow.status === "completed";

  async function completeStage() {
    setBusy(true);
    try {
      await completeFn({ data: { ticket_id: ticketId } });
      toast.success("Stage completed");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  const currentStage = currentIdx >= 0 ? stages[currentIdx] : null;
  const canCompleteOp =
    role === "admin" &&
    currentStage?.type === "operational" &&
    !isRejected &&
    !isCompleted &&
    (!department ||
      !currentStage.approver_department ||
      currentStage.approver_department === department);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <GitBranch size={12} /> Approval workflow
          {data.template && (
            <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
              {data.template.name}
            </span>
          )}
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            isRejected && "bg-destructive/15 text-destructive",
            isCompleted && "bg-emerald-500/15 text-emerald-600",
            !isRejected && !isCompleted && "bg-warning/15 text-warning",
          )}
        >
          {isRejected ? "Rejected" : isCompleted ? "Completed" : "In progress"}
        </span>
      </div>

      <ol className="grid gap-2">
        {stages.map((s, i) => {
          const isCurrent = i === currentIdx && !isCompleted && !isRejected;
          const isPast =
            isCompleted ||
            (currentIdx >= 0 && i < currentIdx) ||
            (isRejected && i < (currentIdx === -1 ? stages.length : currentIdx));
          const isRejectedHere = isRejected && i === currentIdx;
          return (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
                isCurrent && "border-primary/50 bg-primary/5",
                isPast && "border-emerald-500/40 bg-emerald-500/5",
                isRejectedHere && "border-destructive/40 bg-destructive/5",
                !isCurrent && !isPast && !isRejectedHere && "border-border bg-card/50 opacity-70",
              )}
            >
              {isRejectedHere ? (
                <XCircle size={16} className="text-destructive" />
              ) : isPast ? (
                <CheckCircle2 size={16} className="text-emerald-600" />
              ) : isCurrent ? (
                <Clock size={16} className="text-primary animate-pulse" />
              ) : (
                <Circle size={16} className="text-muted-foreground" />
              )}
              <div className="flex-1">
                <div className="font-medium">{s.name}</div>
                {s.type === "approval" && s.approver_department && (
                  <div className="text-[11px] text-muted-foreground">
                    Approver: {s.approver_department}
                  </div>
                )}
              </div>
              {isCurrent && s.type === "approval" && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-warning">
                  Awaiting approval
                </span>
              )}
              {isCurrent && s.type === "operational" && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                  In progress
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {canCompleteOp && (
        <div className="mt-3">
          <Button size="sm" onClick={completeStage} disabled={busy}>
            {busy ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 size={14} className="mr-1.5" />
            )}
            Mark "{currentStage?.name}" complete
          </Button>
        </div>
      )}

      {approvals.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Approval decisions
          </div>
          <ul className="grid gap-1 text-xs">
            {approvals.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-md bg-card/50 px-2 py-1"
              >
                <span className="font-medium">{a.department ?? "—"}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    a.status === "approved" && "bg-emerald-500/15 text-emerald-600",
                    a.status === "rejected" && "bg-destructive/15 text-destructive",
                    a.status === "pending" && "bg-warning/15 text-warning",
                    a.status === "info_requested" && "bg-primary/15 text-primary",
                  )}
                >
                  {a.status.replace("_", " ")}
                </span>
                {a.decided_by_name && (
                  <span className="text-muted-foreground">
                    by {a.decided_by_name}
                    {a.decided_at ? ` · ${new Date(a.decided_at).toLocaleString()}` : ""}
                  </span>
                )}
                {a.decision_note && (
                  <span className="w-full pt-0.5 text-muted-foreground">
                    “{a.decision_note}”
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workflow history ({history.length})
          </summary>
          <ol className="mt-2 grid gap-1 border-l border-border pl-3 text-xs">
            {history.map((h) => (
              <li key={h.id}>
                <div className="text-muted-foreground">
                  {new Date(h.created_at).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">
                    {h.actor_name ?? "System"}
                    {h.actor_department ? ` (${h.actor_department})` : ""}
                  </span>{" "}
                  — {h.action.replace(/_/g, " ")}
                  {h.comment ? `: ${h.comment}` : ""}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getTicketWorkflow,
  completeCurrentOperationalStage,
  getTicketApprovalState,
  requestManualApprovals,
  skipWorkflow,
  unskipWorkflow,
  decideApproval,
  type WorkflowStage,
  type WorkflowApproval,
  type WorkflowHistoryRow,
  type TicketWorkflowRow,
  type WorkflowTemplate,
} from "@/lib/workflow.functions";
import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  Loader2,
  GitBranch,
  UserPlus,
  ShieldOff,
  RotateCcw,
  MessageCircleQuestion,
  Building2,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const DEPARTMENTS = ["HR", "IT", "Finance", "Operations"] as const;

type TemplateState = {
  workflow: TicketWorkflowRow;
  template: WorkflowTemplate | null;
  stages: WorkflowStage[];
  approvals: WorkflowApproval[];
  history: WorkflowHistoryRow[];
} | null;

type ManualState = {
  ticket: {
    id: string;
    workflow_skipped: boolean;
    workflow_skipped_reason: string | null;
    workflow_skipped_at: string | null;
  } | null;
  approvals: (WorkflowApproval & { approver_name: string | null })[];
  history: WorkflowHistoryRow[];
};

export function WorkflowProgress({ ticketId }: { ticketId: string }) {
  const getWorkflowFn = useServerFn(getTicketWorkflow);
  const getManualFn = useServerFn(getTicketApprovalState);
  const requestFn = useServerFn(requestManualApprovals);
  const skipFn = useServerFn(skipWorkflow);
  const unskipFn = useServerFn(unskipWorkflow);
  const decideFn = useServerFn(decideApproval);
  const completeFn = useServerFn(completeCurrentOperationalStage);
  const { role, department, session } = useAuth();

  const [template, setTemplate] = useState<TemplateState>(null);
  const [manual, setManual] = useState<ManualState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Request-approval dialog state.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  // Skip dialog state.
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState("");

  // Per-approval decide notes.
  const [decideNote, setDecideNote] = useState<Record<string, string>>({});

  const isAdmin = role === "admin";
  const userId = session?.user?.id ?? null;

  const load = useCallback(async () => {
    try {
      const [w, m] = await Promise.all([
        getWorkflowFn({ data: { ticket_id: ticketId } }).catch(() => ({ workflow: null }) as any),
        getManualFn({ data: { ticket_id: ticketId } }),
      ]);
      setTemplate(w.workflow ? (w as TemplateState) : null);
      setManual(m as ManualState);
    } finally {
      setLoading(false);
    }
  }, [ticketId, getWorkflowFn, getManualFn]);

  useEffect(() => {
    load();
  }, [load]);

  async function openPicker() {
    setPickerOpen(true);
    if (candidates.length === 0) {
      try {
        const r = await listCandFn();
        setCandidates(r.users as Candidate[]);
      } catch {
        // ignore
      }
    }
  }

  function toggleDept(d: string) {
    setSelectedDepts((prev) => {
      const s = new Set(prev);
      if (s.has(d)) s.delete(d);
      else s.add(d);
      return s;
    });
  }
  function toggleUser(u: string) {
    setSelectedUsers((prev) => {
      const s = new Set(prev);
      if (s.has(u)) s.delete(u);
      else s.add(u);
      return s;
    });
  }

  async function submitRequest() {
    const approvers = [
      ...Array.from(selectedDepts).map((d) => ({ department: d })),
      ...Array.from(selectedUsers).map((u) => ({ user_id: u })),
    ];
    if (approvers.length === 0) {
      toast.error("Pick at least one approver.");
      return;
    }
    setBusy(true);
    try {
      await requestFn({ data: { ticket_id: ticketId, approvers, note: note || undefined } });
      toast.success("Approval requested");
      setPickerOpen(false);
      setSelectedDepts(new Set());
      setSelectedUsers(new Set());
      setNote("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitSkip() {
    setBusy(true);
    try {
      await skipFn({ data: { ticket_id: ticketId, reason: skipReason || undefined } });
      toast.success("Marked as no approval required");
      setSkipOpen(false);
      setSkipReason("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function undoSkip() {
    setBusy(true);
    try {
      await unskipFn({ data: { ticket_id: ticketId } });
      toast.success("Approval workflow re-enabled");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function decide(approvalId: string, decision: "approve" | "reject" | "info") {
    setBusy(true);
    try {
      await decideFn({
        data: {
          approval_id: approvalId,
          decision,
          comment: decideNote[approvalId] || undefined,
        },
      });
      toast.success(
        decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Info requested",
      );
      setDecideNote((n) => {
        const c = { ...n };
        delete c[approvalId];
        return c;
      });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Loading approvals…
      </div>
    );
  }

  const skipped = !!manual?.ticket?.workflow_skipped;
  const approvals = manual?.approvals ?? [];
  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <GitBranch size={12} /> Approvals
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && !skipped && (
            <>
              <Button size="sm" variant="outline" onClick={openPicker} disabled={busy}>
                <UserPlus size={14} className="mr-1.5" /> Request approval
              </Button>
              {approvals.length === 0 && !template && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSkipOpen(true)}
                  disabled={busy}
                >
                  <ShieldOff size={14} className="mr-1.5" /> Skip
                </Button>
              )}
            </>
          )}
          {isAdmin && skipped && (
            <Button size="sm" variant="outline" onClick={undoSkip} disabled={busy}>
              <RotateCcw size={14} className="mr-1.5" /> Re-enable
            </Button>
          )}
        </div>
      </div>

      {/* Skipped banner */}
      {skipped && (
        <div className="rounded-lg border border-muted-foreground/20 bg-muted/50 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <ShieldOff size={14} className="text-muted-foreground" /> No approval required
          </div>
          {manual?.ticket?.workflow_skipped_reason && (
            <p className="mt-1 text-xs text-muted-foreground">
              “{manual.ticket.workflow_skipped_reason}”
            </p>
          )}
        </div>
      )}

      {/* Empty state */}
      {!skipped && approvals.length === 0 && !template && (
        <p className="text-sm text-muted-foreground">
          No approvals requested for this ticket.
          {isAdmin && " Use “Request approval” if this ticket needs sign-off."}
        </p>
      )}

      {/* Manual approvals list */}
      {approvals.length > 0 && (
        <ul className="grid gap-2">
          {approvals.map((a) => {
            const canDecide =
              isAdmin &&
              a.status === "pending" &&
              ((a.approver_user_id && a.approver_user_id === userId) ||
                (a.department && (!department || a.department === department)) ||
                (a.department && department == null));
            return (
              <li
                key={a.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  a.status === "pending" && "border-warning/40 bg-warning/5",
                  a.status === "approved" && "border-emerald-500/40 bg-emerald-500/5",
                  a.status === "rejected" && "border-destructive/40 bg-destructive/5",
                  a.status === "info_requested" && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {a.approver_user_id ? (
                      <UserIcon size={14} className="text-muted-foreground" />
                    ) : (
                      <Building2 size={14} className="text-muted-foreground" />
                    )}
                    <span className="font-medium">
                      {a.approver_name ?? a.department ?? "Approver"}
                    </span>
                    {a.department && a.approver_user_id && (
                      <span className="text-xs text-muted-foreground">({a.department})</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      a.status === "pending" && "bg-warning/20 text-warning",
                      a.status === "approved" && "bg-emerald-500/20 text-emerald-700",
                      a.status === "rejected" && "bg-destructive/20 text-destructive",
                      a.status === "info_requested" && "bg-primary/20 text-primary",
                    )}
                  >
                    {a.status.replace("_", " ")}
                  </span>
                </div>

                {a.decision_note && (
                  <p className="mt-1 text-xs text-muted-foreground">“{a.decision_note}”</p>
                )}
                {a.decided_by_name && a.decided_at && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    by {a.decided_by_name} · {new Date(a.decided_at).toLocaleString()}
                  </p>
                )}

                {canDecide && (
                  <div className="mt-2 grid gap-2">
                    <Textarea
                      rows={2}
                      placeholder="Optional comment…"
                      value={decideNote[a.id] ?? ""}
                      onChange={(e) =>
                        setDecideNote((n) => ({ ...n, [a.id]: e.target.value }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => decide(a.id, "approve")}
                        disabled={busy}
                      >
                        <CheckCircle2 size={14} className="mr-1.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => decide(a.id, "reject")}
                        disabled={busy}
                      >
                        <XCircle size={14} className="mr-1.5" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(a.id, "info")}
                        disabled={busy}
                      >
                        <MessageCircleQuestion size={14} className="mr-1.5" /> Request info
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Template-based (legacy) workflow — kept for tickets that already have one */}
      {template && <TemplateBlock data={template} isAdmin={isAdmin} department={department} busy={busy} onComplete={completeStage} />}

      {/* History */}
      {manual && manual.history.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Approval history ({manual.history.length})
          </summary>
          <ol className="mt-2 grid gap-1 border-l border-border pl-3 text-xs">
            {manual.history.map((h) => (
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

      {/* Request-approval picker */}
      {pickerOpen && (
        <div className="mt-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">Request approval from</div>
          <div className="grid gap-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Departments
              </div>
              <div className="flex flex-wrap gap-3">
                {DEPARTMENTS.map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={selectedDepts.has(d)}
                      onCheckedChange={() => toggleDept(d)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            {candidates.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Or specific people
                </div>
                <div className="max-h-40 overflow-y-auto rounded border border-border p-2">
                  {candidates.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 py-1 text-sm"
                    >
                      <Checkbox
                        checked={selectedUsers.has(c.id)}
                        onCheckedChange={() => toggleUser(c.id)}
                      />
                      <span className="font-medium">{c.name}</span>
                      {c.department && (
                        <span className="text-xs text-muted-foreground">({c.department})</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Note (optional)
              </Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why is approval needed?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPickerOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitRequest} disabled={busy}>
                {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
                Send request
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Skip dialog */}
      {skipOpen && (
        <div className="mt-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">Skip approval workflow</div>
          <p className="mb-2 text-xs text-muted-foreground">
            Mark this ticket as not requiring approval. You can re-enable this later.
          </p>
          <Textarea
            rows={2}
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Reason (optional)"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSkipOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitSkip} disabled={busy}>
              {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              Confirm skip
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateBlock({
  data,
  isAdmin,
  department,
  busy,
  onComplete,
}: {
  data: NonNullable<TemplateState>;
  isAdmin: boolean;
  department: string | null;
  busy: boolean;
  onComplete: () => void;
}) {
  const { workflow, stages } = data;
  const currentIdx = stages.findIndex((s) => s.id === workflow.current_stage_id);
  const isRejected = workflow.status === "rejected";
  const isCompleted = workflow.status === "completed";
  const currentStage = currentIdx >= 0 ? stages[currentIdx] : null;
  const canCompleteOp =
    isAdmin &&
    currentStage?.type === "operational" &&
    !isRejected &&
    !isCompleted &&
    (!department ||
      !currentStage.approver_department ||
      currentStage.approver_department === department);

  return (
    <div className="mt-4 rounded-lg border border-border bg-card/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <GitBranch size={12} /> Template workflow
          {data.template && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {data.template.name}
            </span>
          )}
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
            isRejected && "bg-destructive/15 text-destructive",
            isCompleted && "bg-emerald-500/15 text-emerald-600",
            !isRejected && !isCompleted && "bg-warning/15 text-warning",
          )}
        >
          {isRejected ? "Rejected" : isCompleted ? "Completed" : "In progress"}
        </span>
      </div>
      <ol className="grid gap-1.5">
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
                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                isCurrent && "border-primary/50 bg-primary/5",
                isPast && "border-emerald-500/40 bg-emerald-500/5",
                isRejectedHere && "border-destructive/40 bg-destructive/5",
                !isCurrent && !isPast && !isRejectedHere && "border-border opacity-70",
              )}
            >
              {isRejectedHere ? (
                <XCircle size={14} className="text-destructive" />
              ) : isPast ? (
                <CheckCircle2 size={14} className="text-emerald-600" />
              ) : isCurrent ? (
                <Clock size={14} className="text-primary" />
              ) : (
                <Circle size={14} className="text-muted-foreground" />
              )}
              <span className="flex-1 font-medium">{s.name}</span>
            </li>
          );
        })}
      </ol>
      {canCompleteOp && (
        <div className="mt-2">
          <Button size="sm" onClick={onComplete} disabled={busy}>
            <CheckCircle2 size={14} className="mr-1.5" />
            Mark “{currentStage?.name}” complete
          </Button>
        </div>
      )}
    </div>
  );
}

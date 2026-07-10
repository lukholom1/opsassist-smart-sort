import React, { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getTicketWorkflow,
  completeCurrentOperationalStage,
  getTicketApprovalState,
  requestManualApprovals,
  skipWorkflow,
  unskipWorkflow,
  decideApproval,
  forwardApproval,
  listApproverCandidates,
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
  Forward,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const forwardFn = useServerFn(forwardApproval);
  const listCandidatesFn = useServerFn(listApproverCandidates);
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

  // Forward dialog state (approval-id being forwarded).
  const [forwardId, setForwardId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<
    { id: string; name: string; department: string | null }[]
  >([]);

  const isAdmin = role === "admin";
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!isAdmin) return;
    listCandidatesFn()
      .then((r: any) => setCandidates(r.users ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);


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

  function openPicker() {
    setPickerOpen(true);
  }

  function toggleDept(d: string) {
    setSelectedDepts((prev) => {
      const s = new Set(prev);
      if (s.has(d)) s.delete(d);
      else s.add(d);
      return s;
    });
  }

  async function submitRequest() {
    const departments = Array.from(selectedDepts);
    if (departments.length === 0) {
      toast.error("Pick at least one department.");
      return;
    }
    if (!note.trim()) {
      toast.error("Please add a comment explaining why approval is needed.");
      return;
    }
    setBusy(true);
    try {
      await requestFn({
        data: { ticket_id: ticketId, departments, note: note.trim() },
      });
      toast.success("Approval requested");
      setPickerOpen(false);
      setSelectedDepts(new Set());
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
    const comment = (decideNote[approvalId] ?? "").trim();
    if (decision === "reject" && !comment) {
      toast.error("Please provide a reason before rejecting.");
      return;
    }
    setBusy(true);
    try {
      await decideFn({
        data: {
          approval_id: approvalId,
          decision,
          comment: comment || undefined,
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

      {/* Manual approvals list — parents render with any delegated children nested underneath */}
      {approvals.length > 0 && (
        <ul className="grid gap-2">
          {(() => {
            const parents = approvals.filter((a) => !a.delegated_from_id);
            const childrenOf = new Map<string, typeof approvals>();
            for (const a of approvals) {
              if (a.delegated_from_id) {
                const arr = childrenOf.get(a.delegated_from_id) ?? [];
                arr.push(a);
                childrenOf.set(a.delegated_from_id, arr);
              }
            }
            const renderRow = (a: (typeof approvals)[number], isChild = false) => {
              const canDecide =
                isAdmin &&
                a.status === "pending" &&
                !a.awaiting_delegation &&
                ((a.assigned_user_id && a.assigned_user_id === userId) ||
                  (a.approver_user_id && a.approver_user_id === userId) ||
                  (a.department && (!department || a.department === department)) ||
                  (a.department && department == null));
              const canForward = canDecide;
              return (
                <li
                  key={a.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    isChild && "ml-6 border-dashed",
                    a.awaiting_delegation && "border-primary/40 bg-primary/5",
                    !a.awaiting_delegation && a.status === "pending" && "border-warning/40 bg-warning/5",
                    a.status === "approved" && "border-emerald-500/40 bg-emerald-500/5",
                    a.status === "rejected" && "border-destructive/40 bg-destructive/5",
                    a.status === "info_requested" && "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isChild && <Forward size={12} className="text-primary" />}
                      {a.approver_user_id || a.assigned_user_id ? (
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
                      {isChild && a.origin_department && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          from {a.origin_department}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        a.awaiting_delegation && "bg-primary/20 text-primary",
                        !a.awaiting_delegation && a.status === "pending" && "bg-warning/20 text-warning",
                        a.status === "approved" && "bg-emerald-500/20 text-emerald-700",
                        a.status === "rejected" && "bg-destructive/20 text-destructive",
                        a.status === "info_requested" && "bg-primary/20 text-primary",
                      )}
                    >
                      {a.awaiting_delegation
                        ? "Awaiting delegate"
                        : a.status.replace("_", " ")}
                    </span>
                  </div>

                  {a.request_note && (
                    <div className="mt-2 rounded border border-border/60 bg-background/50 px-2 py-1.5 text-xs">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Reason for request
                        {a.requested_by_name ? ` · ${a.requested_by_name}` : ""}
                      </div>
                      <p className="mt-0.5 text-foreground">{a.request_note}</p>
                    </div>
                  )}

                  {a.decision_note && (
                    <div
                      className={cn(
                        "mt-2 rounded border px-2 py-1.5 text-xs",
                        a.status === "rejected"
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border/60 bg-background/50",
                      )}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {a.status === "rejected"
                          ? "Reason for rejection"
                          : a.status === "info_requested"
                            ? "Info requested"
                            : "Decision note"}
                      </div>
                      <p className="mt-0.5 text-foreground">{a.decision_note}</p>
                    </div>
                  )}
                  {a.decided_by_name && a.decided_at && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      by {a.decided_by_name} · {new Date(a.decided_at).toLocaleString()}
                    </p>
                  )}

                  {a.awaiting_delegation && (
                    <p className="mt-2 text-[11px] italic text-primary">
                      Waiting for the delegate to decide before you can finalise this approval.
                    </p>
                  )}

                  {canDecide && (
                    <div className="mt-2 grid gap-2">
                      <Textarea
                        rows={2}
                        placeholder="Add a comment (required when rejecting)…"
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
                        {canForward && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setForwardId(a.id)}
                            disabled={busy}
                          >
                            <Forward size={14} className="mr-1.5" /> Forward
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            };
            const rows: React.ReactNode[] = [];
            for (const p of parents) {
              rows.push(renderRow(p, false));
              for (const c of childrenOf.get(p.id) ?? []) rows.push(renderRow(c, true));
            }
            return rows;
          })()}
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
      {pickerOpen && (() => {
        const eligibleDepts = DEPARTMENTS.filter((d) =>
          candidates.some((c) => c.department === d && c.id !== userId),
        );
        return (
        <div className="mt-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">Request approval from</div>
          <div className="grid gap-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Departments
              </div>
              {eligibleDepts.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                  No other eligible approvers are available. You are the only approver in every department.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {eligibleDepts.map((d) => (
                    <label key={d} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={selectedDepts.has(d)}
                        onCheckedChange={() => toggleDept(d)}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              )}
              {DEPARTMENTS.length !== eligibleDepts.length && eligibleDepts.length > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Departments where you are the sole approver are hidden.
                </p>
              )}
            </div>
            <div>
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Reason for approval request <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain why this ticket needs approval from the selected department(s)…"
                required
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                The receiving department will see this comment alongside the full ticket.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPickerOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitRequest} disabled={busy || eligibleDepts.length === 0}>
                {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
                Send request
              </Button>
            </div>
          </div>
        </div>
        );
      })()}

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

      {forwardId && (
        <InlineForwardDialog
          approval={approvals.find((a) => a.id === forwardId)!}
          candidates={candidates}
          onClose={() => setForwardId(null)}
          onSubmit={async ({ to_department, to_user_id, note }) => {
            setBusy(true);
            try {
              await forwardFn({
                data: {
                  approval_id: forwardId,
                  to_department,
                  to_user_id: to_user_id || undefined,
                  note,
                },
              });
              toast.success("Forwarded — the delegate has been notified.");
              setForwardId(null);
              await load();
            } catch (e: any) {
              toast.error(e?.message ?? "Failed to forward");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function InlineForwardDialog({
  approval,
  candidates,
  onClose,
  onSubmit,
}: {
  approval: WorkflowApproval;
  candidates: { id: string; name: string; department: string | null }[];
  onClose: () => void;
  onSubmit: (v: {
    to_department: string;
    to_user_id: string;
    note: string;
  }) => void | Promise<void>;
}) {
  const [dept, setDept] = useState<string>(
    DEPARTMENTS.find((d) => d !== approval.department) ?? "Finance",
  );
  const [userId, setUserId] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = candidates.filter((c) => c.department === dept);

  async function submit() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ to_department: dept, to_user_id: userId, note: note.trim() });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Forward approval</DialogTitle>
          <DialogDescription>
            {approval.department} remains accountable — once the delegate decides, the request
            returns here for final sign-off.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Forward to department
            </Label>
            <Select
              value={dept}
              onValueChange={(v) => {
                setDept(v);
                setUserId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Specific approver (optional)
            </Label>
            <Select value={userId || "any"} onValueChange={(v) => setUserId(v === "any" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Anyone in the department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anyone in the department</SelectItem>
                {filtered.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reason for delegation <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why this approval is being forwarded…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !note.trim()}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Forward
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

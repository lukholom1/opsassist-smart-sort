import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listPendingApprovals,
  decideApproval,
  forwardApproval,
  listApproverCandidates,
} from "@/lib/workflow.functions";
import { useAuth } from "@/hooks/use-auth";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MessageCircleQuestion,
  Clock,
  Building2,
  Loader2,
  Inbox,
  Forward,
  ExternalLink,
  GitBranch,
} from "lucide-react";

const DEPARTMENTS = ["HR", "IT", "Finance", "Operations"] as const;


export const Route = createFileRoute("/_authenticated/admin/approvals")({
  head: () => ({ meta: [{ title: "Approvals — OpsAssist" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    highlight: typeof s.highlight === "string" ? s.highlight : undefined,
  }),
  component: ApprovalsPage,
});

type ApprovalItem = Awaited<ReturnType<typeof listPendingApprovals>>["approvals"][number];

function ApprovalsPage() {
  const { department, role } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listPendingApprovals);
  const decideFn = useServerFn(decideApproval);
  const forwardFn = useServerFn(forwardApproval);
  const listCandidatesFn = useServerFn(listApproverCandidates);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [forwardTarget, setForwardTarget] = useState<ApprovalItem | null>(null);
  const [candidates, setCandidates] = useState<
    { id: string; name: string; department: string | null }[]
  >([]);

  useEffect(() => {
    listCandidatesFn()
      .then((r: any) => setCandidates(r.users ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (role && role !== "admin") navigate({ to: "/dashboard", replace: true });
  }, [role, navigate]);

  async function refresh() {
    try {
      const r = await listFn();
      setItems(r.approvals);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load approvals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link from notifications: scroll to the referenced approval card.
  const search = Route.useSearch();
  const highlightId = search.highlight;
  const handledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightId || loading) return;
    if (handledRef.current === highlightId) return;
    const match = items.find((a) => a.ticket_id === highlightId);
    if (match) {
      handledRef.current = highlightId;
      requestAnimationFrame(() => {
        document
          .getElementById(`approval-${match.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } else if (items.length > 0 || !loading) {
      handledRef.current = highlightId;
      toast.info("That approval is no longer pending", {
        description: "It may have already been decided.",
      });
      navigate({ to: "/admin/approvals", search: {}, replace: true }).catch(() => {});
    }
  }, [highlightId, items, loading, navigate]);

  async function decide(id: string, decision: "approve" | "reject" | "info") {
    const comment = (comments[id] ?? "").trim();
    if (decision === "reject" && !comment) {
      toast.error("Please provide a reason before rejecting.");
      return;
    }
    setBusyId(id);
    try {
      await decideFn({
        data: { approval_id: id, decision, comment: comment || undefined },
      });
      toast.success(
        decision === "approve"
          ? "Approved — requester notified"
          : decision === "reject"
            ? "Rejected — requester notified with reason"
            : "Info requested — requester notified",
      );
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen">
      <AdminHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
          <p className="text-muted-foreground mt-1">
            {department
              ? `Pending approvals for ${department}.`
              : "All pending approvals across every department."}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> Loading…
          </div>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <Inbox size={32} />
              <div>
                <p className="font-medium text-foreground">Nothing waiting on you</p>
                <p className="text-sm">New approval requests will appear here automatically.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {items.map((a) => {
              const t = a.ticket as any;
              return (
                <Card
                  key={a.id}
                  id={`approval-${a.id}`}
                  className={`shadow-sm transition ${
                    highlightId && a.ticket_id === highlightId
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : ""
                  }`}
                >

                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{t?.title ?? "Ticket"}</CardTitle>
                        <div className="mt-1 text-xs text-muted-foreground">
                          #{a.ticket_id.slice(0, 8)} · {t?.user_name} ·{" "}
                          {t?.created_at
                            ? new Date(t.created_at).toLocaleString()
                            : "unknown"}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          <Building2 size={11} /> {a.department ?? "—"}
                        </Badge>
                        {(a as any).origin_department &&
                          (a as any).origin_department !== a.department && (
                            <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                              <GitBranch size={11} /> from {(a as any).origin_department}
                            </Badge>
                          )}
                        {(a as any).is_delegated && (
                          <Badge className="gap-1 bg-primary/15 text-primary border border-primary/30">
                            <Forward size={11} /> Delegated
                          </Badge>
                        )}
                        {Array.isArray(t?.categories) && t.categories[0] && (
                          <Badge variant="outline" className="gap-1">
                            Owner: {t.categories[0]}
                          </Badge>
                        )}
                        <Badge variant="outline">Priority: {t?.priority ?? "—"}</Badge>
                        <Badge className="gap-1 bg-warning/15 text-warning border border-warning/30">
                          <Clock size={11} /> {a.stage?.name ?? "Pending your review"}
                        </Badge>
                      </div>

                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {t?.details && (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Ticket details
                        </div>
                        <p className="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-foreground">
                          {t.details}
                        </p>
                      </div>
                    )}

                    {Array.isArray(t?.categories) && t.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {t.categories.map((c: string) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {(a as any).request_note && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                          Reason for approval request
                          {(a as any).requested_by_name
                            ? ` · ${(a as any).requested_by_name}`
                            : ""}
                        </div>
                        <p className="text-sm text-foreground">
                          {(a as any).request_note}
                        </p>
                      </div>
                    )}

                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Your decision comment{" "}
                        <span className="text-destructive">*  required if rejecting</span>
                      </div>
                      <Textarea
                        placeholder="Add a comment. A reason is required when rejecting…"
                        value={comments[a.id] ?? ""}
                        onChange={(e) =>
                          setComments((c) => ({ ...c, [a.id]: e.target.value }))
                        }
                        rows={3}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => decide(a.id, "approve")}
                        disabled={busyId === a.id}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle2 size={14} className="mr-1.5" /> Approve
                      </Button>
                      <Button
                        onClick={() => decide(a.id, "reject")}
                        disabled={busyId === a.id}
                        variant="destructive"
                      >
                        <XCircle size={14} className="mr-1.5" /> Reject
                      </Button>
                      <Button
                        onClick={() => decide(a.id, "info")}
                        disabled={busyId === a.id}
                        variant="outline"
                      >
                        <MessageCircleQuestion size={14} className="mr-1.5" /> Request info
                      </Button>
                      <Button
                        onClick={() => setForwardTarget(a)}
                        disabled={busyId === a.id}
                        variant="outline"
                      >
                        <Forward size={14} className="mr-1.5" /> Forward
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="ml-auto">
                        <Link
                          to="/admin/tickets"
                          search={{ ticket: a.ticket_id }}
                        >
                          <ExternalLink size={14} className="mr-1.5" /> View ticket
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {forwardTarget && (
        <ForwardDialog
          approval={forwardTarget}
          candidates={candidates}
          onClose={() => setForwardTarget(null)}
          onSubmit={async ({ to_department, to_user_id, note }) => {
            setBusyId(forwardTarget.id);
            try {
              await forwardFn({
                data: {
                  approval_id: forwardTarget.id,
                  to_department,
                  to_user_id: to_user_id || undefined,
                  note,
                },
              });
              toast.success("Approval forwarded — delegate has been notified.");
              setForwardTarget(null);
              await refresh();
            } catch (e: any) {
              toast.error(e?.message ?? "Failed to forward");
            } finally {
              setBusyId(null);
            }
          }}
        />
      )}
    </div>
  );

}

function ForwardDialog({
  approval,
  candidates,
  onClose,
  onSubmit,
}: {
  approval: ApprovalItem;
  candidates: { id: string; name: string; department: string | null }[];
  onClose: () => void;
  onSubmit: (v: { to_department: string; to_user_id: string; note: string }) => void | Promise<void>;
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
          <DialogTitle>Forward this approval</DialogTitle>
          <DialogDescription>
            You remain accountable for the {approval.department} approval. Once the delegate
            decides, the request returns to you for final sign-off.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Forward to department
            </label>
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Specific approver (optional)
            </label>
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reason for delegation <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
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

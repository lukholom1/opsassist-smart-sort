import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, XCircle, MessageCircleQuestion, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listApprovals, decideApproval, type ApprovalRow } from "@/lib/approvals.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  component: ApprovalsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-red-500">Failed to load approvals: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function ApprovalsPage() {
  const load = useServerFn(listApprovals);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["approvals", tab],
    queryFn: () => load({ data: { status: tab } }),
    refetchInterval: 15000,
  });

  const decide = useServerFn(decideApproval);
  const mut = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "rejected" | "info_requested"; note?: string }) =>
      decide({ data: v }),
    onSuccess: () => {
      toast.success("Decision recorded");
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft size={14} className="mr-1.5" /> Back
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Approval queue</h1>
          <div className="flex gap-1">
            <Button size="sm" variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>
              Pending
            </Button>
            <Button size="sm" variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>
              All
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No {tab === "pending" ? "pending" : ""} approvals.
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map((r) => (
              <ApprovalCard key={r.id} row={r} onDecide={(status, note) => mut.mutate({ id: r.id, status, note })} pending={mut.isPending} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ApprovalCard({
  row,
  onDecide,
  pending,
}: {
  row: ApprovalRow;
  onDecide: (status: "approved" | "rejected" | "info_requested", note?: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState("");
  const isDecided = row.status !== "pending";

  const statusColor: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-700",
    approved: "bg-emerald-500/20 text-emerald-700",
    rejected: "bg-red-500/20 text-red-700",
    info_requested: "bg-blue-500/20 text-blue-700",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{row.ticket_title}</span>
            <Badge variant="outline">{row.department}</Badge>
            <Badge variant="outline">{row.ticket_priority}</Badge>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[row.status]}`}>
              {row.status.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            From {row.ticket_user_name} · {new Date(row.created_at).toLocaleString()}
            {row.reason && ` · ${row.reason}`}
          </p>
        </div>
      </div>

      {isDecided ? (
        <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs">
          <span className="font-medium">{row.decided_by_name ?? "Manager"}</span>
          {row.decision_note && <p className="mt-1 text-muted-foreground">“{row.decision_note}”</p>}
        </div>
      ) : (
        <>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional decision note…"
            rows={2}
            className="mt-3"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => onDecide("approved", note)} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 size={14} className="mr-1.5" /> Approve
            </Button>
            <Button size="sm" disabled={pending} variant="destructive" onClick={() => onDecide("rejected", note)}>
              <XCircle size={14} className="mr-1.5" /> Reject
            </Button>
            <Button size="sm" disabled={pending} variant="outline" onClick={() => onDecide("info_requested", note)}>
              <MessageCircleQuestion size={14} className="mr-1.5" /> Request info
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listPendingApprovals, decideApproval } from "@/lib/workflow.functions";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MessageCircleQuestion,
  Clock,
  Building2,
  Loader2,
  Inbox,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  head: () => ({ meta: [{ title: "Approvals — OpsAssist" }] }),
  component: ApprovalsPage,
});

type ApprovalItem = Awaited<ReturnType<typeof listPendingApprovals>>["approvals"][number];

function ApprovalsPage() {
  const { department, role } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listPendingApprovals);
  const decideFn = useServerFn(decideApproval);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

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

  async function decide(id: string, decision: "approve" | "reject" | "info") {
    setBusyId(id);
    try {
      await decideFn({ data: { approval_id: id, decision, comment: comments[id] } });
      toast.success(
        decision === "approve"
          ? "Approved — workflow advanced"
          : decision === "reject"
            ? "Rejected"
            : "Info requested",
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
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">
              <ArrowLeft size={14} className="mr-1.5" /> Back to admin
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
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
                <Card key={a.id} className="shadow-sm">
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
                        <Badge variant="outline">Priority: {t?.priority ?? "—"}</Badge>
                        <Badge className="gap-1 bg-warning/15 text-warning border border-warning/30">
                          <Clock size={11} /> {a.stage?.name ?? "Stage"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <Textarea
                      placeholder="Optional comment for the requester…"
                      value={comments[a.id] ?? ""}
                      onChange={(e) =>
                        setComments((c) => ({ ...c, [a.id]: e.target.value }))
                      }
                      rows={2}
                    />
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
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

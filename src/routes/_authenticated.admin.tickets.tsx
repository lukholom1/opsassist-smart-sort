import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listDeptTickets,
  updateAssignmentStatus,
  reassignAssignment,
  touchTicketInProgress,
  type AssignmentRow,
} from "@/lib/tickets.functions";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { dispatchTicketEmails } from "@/lib/emailService";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LogOut,
  Loader2,
  Search,
  Bot,
  MessageSquare,
  BarChart3,
  ArrowRightLeft,
  ArrowLeft,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  elapsed,
  CategoryPills,
  PriorityPill,
  RatingStars,
} from "@/components/ticket-bits";
import { NotesDialog } from "@/components/NotesDialog";
import { useNotesRealtime } from "@/hooks/use-notes-realtime";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";

export const Route = createFileRoute("/_authenticated/admin/tickets")({
  head: () => ({ meta: [{ title: "Tickets — OpsAssist" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    ticket: typeof s.ticket === "string" ? s.ticket : undefined,
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  component: AdminTicketsPage,
});

type Status = "Open" | "In Progress" | "Resolved";
type Department = "HR" | "IT" | "Finance" | "Operations";
type Ticket = {
  id: string;
  user_name: string;
  title: string;
  details: string;
  categories: string[];
  priority: string;
  status: Status;
  created_at: string;
  resolved_at: string | null;
  resolved_by_ai: boolean;
  resolution_source: string | null;
  assignments: AssignmentRow[];
  my_assignment: AssignmentRow | null;
  feedback: { rating: number; comment: string | null } | null;
  last_note_at: string | null;
  last_note_role: "user" | "admin" | null;
};

function AdminTicketsPage() {
  const navigate = useNavigate();
  const { signOut, fullName, department, role } = useAuth();
  useEffect(() => {
    if (role && role !== "admin") navigate({ to: "/dashboard", replace: true });
  }, [role, navigate]);
  const fetchTickets = useServerFn(listDeptTickets);
  const updateStatus = useServerFn(updateAssignmentStatus);
  const reassign = useServerFn(reassignAssignment);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterPri, setFilterPri] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [notesTicket, setNotesTicket] = useState<Ticket | null>(null);
  const [detailsTicket, setDetailsTicket] = useState<Ticket | null>(null);
  const [reassignTarget, setReassignTarget] = useState<{
    ticket: Ticket;
    assignment: AssignmentRow;
  } | null>(null);

  const { counts: unreadCounts, clearTicket } = useNotesRealtime(
    "admin",
    tickets,
    notesTicket?.id ?? null,
  );

  const isSuperAdmin = department === null;

  async function refresh() {
    const r = (await fetchTickets()) as { tickets: Ticket[] };
    setTickets(r.tickets);
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link from notifications: open the referenced ticket once loaded.
  const search = Route.useSearch();
  const handledTicketRef = useRef<string | null>(null);
  useEffect(() => {
    const target = search.ticket;
    if (!target || loading) return;
    if (handledTicketRef.current === target) return;
    const found = tickets.find((t) => t.id === target);
    if (found) {
      handledTicketRef.current = target;
      if (search.focus === "notes") setNotesTicket(found);
      else setDetailsTicket(found);
      navigate({ to: "/admin/tickets", search: {}, replace: true }).catch(() => {});
    } else if (tickets.length > 0) {
      handledTicketRef.current = target;
      toast.error("That ticket is no longer available", {
        description: "It may have been removed or isn't in your department.",
      });
      navigate({ to: "/admin/tickets", search: {}, replace: true }).catch(() => {});
    }
  }, [search.ticket, search.focus, tickets, loading, navigate]);


  async function changeStatus(assignmentId: string, next: Status) {
    setSaving(assignmentId);
    try {
      const r = await updateStatus({ data: { assignment_id: assignmentId, status: next } });
      const em = await dispatchTicketEmails(r?.emails);
      if (em.failed === 0 && em.sent > 0) {
        toast.success("Status updated", { description: "Email notification sent successfully." });
      } else if (em.failed > 0) {
        toast.warning("Status updated", {
          description: `Email could not be sent: ${em.errors[0] ?? "unknown error"}`,
        });
      } else {
        toast.success("Status updated");
      }
      await refresh();
    } catch (e) {
      console.error("[updateAssignmentStatus] failed", e);
      alert(
        `Could not update status: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      );
    } finally {
      setSaving(null);
    }
  }

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        if (filterPri !== "all" && t.priority !== filterPri) return false;
        if (query) {
          const q = query.toLowerCase();
          if (
            !t.title.toLowerCase().includes(q) &&
            !t.user_name.toLowerCase().includes(q) &&
            !t.details.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      }),
    [tickets, query, filterPri],
  );

  const isActive = (t: Ticket) =>
    isSuperAdmin
      ? t.status !== "Resolved"
      : t.my_assignment
        ? t.my_assignment.status !== "Resolved"
        : t.status !== "Resolved";
  const active = filtered.filter(isActive);
  const resolved = filtered.filter((t) => !isActive(t));

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link to="/admin">
                <ArrowLeft size={14} className="mr-1.5" />
                Back
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link to="/admin/insights">
                <BarChart3 size={14} className="mr-1.5" />
                Insights
              </Link>
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {fullName ?? "Admin"}{" "}
              {department && (
                <span className="font-medium text-foreground">· {department}</span>
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="rounded-lg"
            >
              <LogOut size={14} className="mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isSuperAdmin ? "All tickets" : `${department} tickets`}
        </h1>
        <p className="text-sm text-muted-foreground">
          Active and resolved tickets, separated below.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, user, details..."
              className="pl-9"
            />
          </div>
          <Select value={filterPri} onValueChange={setFilterPri}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="mt-8 flex items-center justify-center rounded-2xl border border-border bg-card py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <TableSection title={`Active tickets (${active.length})`}>
              <TicketTable
                tickets={active}
                myDept={department}
                saving={saving}
                onStatus={changeStatus}
                onOpenNotes={setNotesTicket}
                onOpenDetails={setDetailsTicket}
                onReassign={(t, a) => setReassignTarget({ ticket: t, assignment: a })}
                unreadCounts={unreadCounts}
              />
            </TableSection>
            <TableSection title={`Resolved tickets (${resolved.length})`}>
              <TicketTable
                tickets={resolved}
                myDept={department}
                saving={saving}
                onStatus={changeStatus}
                showAi
                showFeedback
                onOpenNotes={setNotesTicket}
                onOpenDetails={setDetailsTicket}
                onReassign={(t, a) => setReassignTarget({ ticket: t, assignment: a })}
                unreadCounts={unreadCounts}
              />
            </TableSection>
          </>
        )}
      </main>
      {notesTicket && (
        <NotesDialog
          ticketId={notesTicket.id}
          ticketTitle={notesTicket.title}
          viewerRole="admin"
          ticketResolved={notesTicket.status === "Resolved"}
          onClose={() => {
            clearTicket(notesTicket.id);
            setNotesTicket(null);
            refresh();
          }}
        />
      )}
      {detailsTicket && (
        <TicketDetailsDialog
          ticket={detailsTicket}
          onClose={() => setDetailsTicket(null)}
        />
      )}
      {reassignTarget && (
        <ReassignDialog
          ticket={reassignTarget.ticket}
          assignment={reassignTarget.assignment}
          onClose={() => setReassignTarget(null)}
          onSubmit={async (newDept, note) => {
            await reassign({
              data: {
                assignment_id: reassignTarget.assignment.id,
                new_department: newDept,
                note,
              },
            });
            setReassignTarget(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function TableSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {children}
      </div>
    </div>
  );
}

function TicketTable({
  tickets,
  myDept,
  saving,
  onStatus,
  showAi,
  showFeedback,
  onOpenNotes,
  onOpenDetails,
  onReassign,
  unreadCounts,
}: {
  tickets: Ticket[];
  myDept: Department | null;
  saving: string | null;
  onStatus: (assignmentId: string, next: Status) => void;
  showAi?: boolean;
  showFeedback?: boolean;
  onOpenNotes: (t: Ticket) => void;
  onOpenDetails: (t: Ticket) => void;
  onReassign: (t: Ticket, a: AssignmentRow) => void;
  unreadCounts: Record<string, number>;
}) {
  if (tickets.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">No tickets.</div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Ticket</th>
            <th className="px-4 py-3 font-medium">Departments</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Assignee</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Time</th>
            {showFeedback && <th className="px-4 py-3 font-medium">Rating</th>}
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const rowAssignments = myDept
              ? t.my_assignment
                ? [t.my_assignment]
                : []
              : t.assignments;
            return (
              <tr
                key={t.id}
                onClick={() => onOpenDetails(t)}
                className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3 font-medium">{t.user_name}</td>
                <td className="max-w-sm px-4 py-3">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    {t.title}
                    {showAi && t.resolved_by_ai && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-accent ring-1 ring-inset ring-purple-accent/20">
                        <Bot size={10} /> AI
                      </span>
                    )}
                  </div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">
                    {t.details}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <CategoryPills values={t.categories} />
                </td>
                <td className="px-4 py-3">
                  <PriorityPill value={t.priority} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {rowAssignments.map((a) => (
                    <div key={a.id}>
                      {!myDept && (
                        <span className="font-medium text-foreground">
                          {a.department}:{" "}
                        </span>
                      )}
                      {a.assignee_name ?? "Unassigned"}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-1.5">
                    {rowAssignments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2">
                        {!myDept && (
                          <span className="text-[11px] font-medium text-muted-foreground w-16">
                            {a.department}
                          </span>
                        )}
                        <Select
                          value={a.status}
                          onValueChange={(v) => onStatus(a.id, v as Status)}
                          disabled={!!myDept && a.department !== myDept}
                        >
                          <SelectTrigger className="h-8 w-[130px] rounded-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Open">Open</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                        {saving === a.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {elapsed(t.created_at, t.resolved_at)}
                </td>
                {showFeedback && (
                  <td className="px-4 py-3">
                    {t.feedback ? (
                      <div className="flex flex-col gap-1">
                        <RatingStars value={t.feedback.rating} size={14} />
                        {t.feedback.comment && (
                          <span className="line-clamp-2 max-w-[180px] text-xs text-muted-foreground">
                            “{t.feedback.comment}”
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                <td
                  className="px-4 py-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {rowAssignments
                      .filter((a) => !myDept || a.department === myDept)
                      .filter((a) => a.status !== "Resolved")
                      .map((a) => (
                        <button
                          key={`re-${a.id}`}
                          type="button"
                          onClick={() => onReassign(t, a)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                          title={`Reassign ${a.department} assignment`}
                        >
                          <ArrowRightLeft size={13} className="text-warning" /> Reassign
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => onOpenNotes(t)}
                      className="relative inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                      title="Open conversation"
                    >
                      <MessageSquare size={13} className="text-soft-blue" /> Notes
                      {t.status !== "Resolved" && (unreadCounts[t.id] ?? 0) > 0 && (
                        <span
                          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-card"
                          aria-label={`${unreadCounts[t.id]} new message${unreadCounts[t.id] > 1 ? "s" : ""}`}
                        >
                          {unreadCounts[t.id] > 9 ? "9+" : unreadCounts[t.id]}
                        </span>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const DEPTS: Department[] = ["HR", "IT", "Finance", "Operations"];
function ReassignDialog({
  ticket,
  assignment,
  onClose,
  onSubmit,
}: {
  ticket: Ticket;
  assignment: AssignmentRow;
  onClose: () => void;
  onSubmit: (newDept: Department, note: string) => Promise<void>;
}) {
  const occupied = new Set(ticket.assignments.map((a) => a.department));
  const options = DEPTS.filter(
    (d) => d !== assignment.department && !occupied.has(d),
  );
  const [newDept, setNewDept] = useState<Department | "">(options[0] ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle() {
    if (!newDept) return;
    if (note.trim().length < 3) {
      setErr("Please add a short note explaining the reassignment.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(newDept as Department, note.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reassign.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-warning" /> Reassign ticket
          </DialogTitle>
          <DialogDescription>
            Move{" "}
            <span className="font-medium text-foreground">{ticket.title}</span> from{" "}
            <span className="font-medium text-foreground">{assignment.department}</span>{" "}
            to another department. A note is required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-dept">New department</Label>
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other department is available — this ticket is already routed
                everywhere.
              </p>
            ) : (
              <Select
                value={newDept}
                onValueChange={(v) => setNewDept(v as Department)}
              >
                <SelectTrigger id="new-dept">
                  <SelectValue placeholder="Pick a department" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reason">Reason / note</Label>
            <Textarea
              id="reason"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this being moved to the other department?"
            />
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={handle}
              disabled={busy || !newDept || options.length === 0}
            >
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Reassign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

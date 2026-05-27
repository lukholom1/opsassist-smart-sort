import { createFileRoute, useNavigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listDeptTickets, updateAssignmentStatus, reassignAssignment, type AssignmentRow } from "@/lib/tickets.functions";
import {
  createPendingUser,
  deletePendingUser,
  deleteUser,
  listUsers,
  reclassifyUser,
} from "@/lib/users.functions";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
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
import { LogOut, Loader2, Search, UserPlus, Bot, Copy, Check, Users, Mail, Trash2, MessageSquare, BarChart3, ArrowRightLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  elapsed,
  CategoryPills,
  PriorityPill,
  RatingStars,
} from "@/components/ticket-bits";
import { NotesDialog } from "@/components/NotesDialog";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { AdminCharts } from "@/components/AdminCharts";
import { getAdminAnalytics } from "@/lib/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — OpsAssist" }] }),
  component: AdminPage,
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
};

function AdminPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { signOut, fullName, department } = useAuth();
  const fetchTickets = useServerFn(listDeptTickets);
  const updateStatus = useServerFn(updateAssignmentStatus);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterPri, setFilterPri] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [showUsers, setShowUsers] = useState(false);
  const [notesTicket, setNotesTicket] = useState<Ticket | null>(null);
  const [detailsTicket, setDetailsTicket] = useState<Ticket | null>(null);
  const [reassignTarget, setReassignTarget] = useState<{ ticket: Ticket; assignment: AssignmentRow } | null>(null);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getAdminAnalytics>> | null>(null);
  const fetchAnalytics = useServerFn(getAdminAnalytics);
  const reassign = useServerFn(reassignAssignment);

  const isSuperAdmin = department === null;

  if (pathname !== "/admin") {
    return <Outlet />;
  }

  async function refresh() {
    const r = (await fetchTickets()) as { tickets: Ticket[] };
    setTickets(r.tickets);
    fetchAnalytics().then(setAnalytics).catch(() => {});
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  async function changeStatus(assignmentId: string, next: Status) {
    setSaving(assignmentId);
    try {
      await updateStatus({ data: { assignment_id: assignmentId, status: next } });
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

  // For dept admin: split by *their* assignment status. For super admin: by parent status.
  const isActive = (t: Ticket) =>
    isSuperAdmin
      ? t.status !== "Resolved"
      : t.my_assignment
        ? t.my_assignment.status !== "Resolved"
        : t.status !== "Resolved";
  const active = filtered.filter(isActive);
  const resolved = filtered.filter((t) => !isActive(t));

  const stats = useMemo(() => {
    const all = tickets;
    return {
      total: all.length,
      open: all.filter(isActive).length,
      resolved: all.filter((t) => !isActive(t)).length,
      byAi: all.filter((t) => t.resolved_by_ai).length,
      avgRating:
        (() => {
          const f = all.map((t) => t.feedback?.rating).filter((r): r is number => !!r);
          if (f.length === 0) return 0;
          return Math.round((f.reduce((a, b) => a + b, 0) / f.length) * 10) / 10;
        })(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, isSuperAdmin]);

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
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-lg"
            >
              <Link to="/admin/insights">
                <BarChart3 size={14} className="mr-1.5" />
                Insights
              </Link>
            </Button>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowUsers(true)} className="rounded-lg">
                <Users size={14} className="mr-1.5" /> Users
              </Button>
            )}
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {fullName ?? "Admin"} {department && <span className="font-medium text-foreground">· {department}</span>}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="rounded-lg">
              <LogOut size={14} className="mr-1.5" /> Sign out
            </Button>
          </div>
        </div>

        {analytics && (
          <div className="mt-6">
            <AdminCharts data={analytics} />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isSuperAdmin ? "Admin dashboard" : `${department} dashboard`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? "All tickets, all departments, full control."
            : `Tickets routed to ${department}.`}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total" value={stats.total} />
          <Stat label="Active" value={stats.open} tone="warning" />
          <Stat label="Resolved" value={stats.resolved} tone="success" />
          <Stat label="By AI" value={stats.byAi} tone="purple" />
          <Stat label="Avg rating" value={stats.avgRating || "—"} tone="blue" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, user, details..."
              className="pl-9"
            />
          </div>
          <Select value={filterPri} onValueChange={setFilterPri}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Priority" /></SelectTrigger>
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
              />
            </TableSection>
          </>
        )}
      </main>
      <Footer />
      {showUsers && <UsersDialog onClose={() => setShowUsers(false)} />}
      {notesTicket && (
        <NotesDialog
          ticketId={notesTicket.id}
          ticketTitle={notesTicket.title}
          viewerRole="admin"
          ticketResolved={notesTicket.status === "Resolved"}
          onClose={() => setNotesTicket(null)}
        />
      )}
      {detailsTicket && (
        <TicketDetailsDialog ticket={detailsTicket} onClose={() => setDetailsTicket(null)} />
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warning" | "blue" | "success" | "purple";
}) {
  const toneCls: Record<string, string> = {
    warning: "text-warning",
    blue: "text-soft-blue",
    success: "text-success",
    purple: "text-purple-accent",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ? toneCls[tone] : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function TableSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
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
}) {
  if (tickets.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No tickets.</div>;
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
            // For department admins, show ONLY their assignment row in the status cell.
            // For super admin, show every assignment status.
            const rowAssignments = myDept ? (t.my_assignment ? [t.my_assignment] : []) : t.assignments;
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
                  <div className="line-clamp-1 text-xs text-muted-foreground">{t.details}</div>
                </td>
                <td className="px-4 py-3"><CategoryPills values={t.categories} /></td>
                <td className="px-4 py-3"><PriorityPill value={t.priority} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {rowAssignments.map((a) => (
                    <div key={a.id}>
                      {!myDept && <span className="font-medium text-foreground">{a.department}: </span>}
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
                        {saving === a.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{elapsed(t.created_at, t.resolved_at)}</td>
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
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                      title="Open conversation"
                    >
                      <MessageSquare size={13} className="text-soft-blue" /> Notes
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

// ---- Reassign dialog ----
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
  const options = DEPTS.filter((d) => d !== assignment.department && !occupied.has(d));
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
            Move <span className="font-medium text-foreground">{ticket.title}</span> from{" "}
            <span className="font-medium text-foreground">{assignment.department}</span> to another department.
            A note is required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-dept">New department</Label>
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other department is available — this ticket is already routed everywhere.
              </p>
            ) : (
              <Select value={newDept} onValueChange={(v) => setNewDept(v as Department)}>
                <SelectTrigger id="new-dept">
                  <SelectValue placeholder="Pick a department" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
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
            <Button onClick={handle} disabled={busy || !newDept || options.length === 0}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Reassign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function UsersDialog({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const fetchUsers = useServerFn(listUsers);
  const createUser = useServerFn(createPendingUser);
  const removeUser = useServerFn(deleteUser);
  const removePending = useServerFn(deletePendingUser);
  const reclassify = useServerFn(reclassifyUser);
  const [data, setData] = useState<{
    users: Array<{ id: string; full_name: string; email: string; role: string; department: string | null }>;
    pending: Array<{ email: string; full_name: string; role: string; otp_code: string; department: string | null }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdOtp, setCreatedOtp] = useState<{
    email: string;
    otp: string;
    full_name: string;
    role: string;
    department: string | null;
    email_sent: boolean;
    email_error: string | null;
  } | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [dept, setDept] = useState<"HR" | "IT" | "Finance" | "Operations">("IT");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const r = (await fetchUsers()) as typeof data;
    setData(r);
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await createUser({
        data: {
          full_name: fullName,
          email,
          role,
          department: role === "admin" ? dept : undefined,
        },
      });
      setCreatedOtp(r);
      setShowCreate(false);
      setFullName("");
      setEmail("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function copyOtp() {
    if (!createdOtp) return;
    await navigator.clipboard.writeText(createdOtp.otp);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function onReclassify(
    userId: string,
    role: "employee" | "admin",
    department: "HR" | "IT" | "Finance" | "Operations" | null,
  ) {
    try {
      await reclassify({ data: { user_id: userId, role, department } });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to reclassify user.");
    }
  }

  async function onDelete(userId: string, label: string) {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      await removeUser({ data: { user_id: userId } });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete user.");
    }
  }

  async function onCancelPending(email: string) {
    if (!confirm(`Cancel pending invite for ${email}?`)) return;
    try {
      await removePending({ data: { email } });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to cancel invite.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Users</DialogTitle>
          <DialogDescription>
            Create Employees or Department Admins. OTPs are emailed automatically.
          </DialogDescription>
        </DialogHeader>

        {createdOtp && (
          <div className="rounded-2xl border border-purple-accent/30 bg-purple-accent/5 p-4">
            <p className="text-sm font-medium">
              Activation code for {createdOtp.full_name} ({createdOtp.email})
              {createdOtp.department && (
                <span className="ml-2 text-xs text-muted-foreground">— {createdOtp.department}</span>
              )}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <code className="rounded-lg bg-card px-4 py-2 text-2xl font-bold tracking-widest">
                {createdOtp.otp}
              </code>
              <Button size="sm" variant="outline" onClick={copyOtp} className="rounded-lg">
                {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                Copy
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail size={12} />
              {createdOtp.email_sent
                ? "Code emailed to the user."
                : `Email could not be sent (${createdOtp.email_error ?? "unknown"}). Share the code manually.`}
            </p>
          </div>
        )}

        {!showCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            className="w-fit rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            <UserPlus size={14} className="mr-1.5" /> Create user
          </Button>
        )}

        {showCreate && (
          <form onSubmit={onCreate} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="user@company.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Account type</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Department Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role === "admin" && (
                <div className="grid gap-1.5">
                  <Label>Department</Label>
                  <Select value={dept} onValueChange={(v) => setDept(v as typeof dept)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HR">HR</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {err && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create & send OTP
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="rounded-xl">
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading users...
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.users ?? []).map((u) => {
                  const isSelf = u.id === myId;
                  const isSuper = u.role === "admin" && !u.department;
                  return (
                    <tr key={u.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">{u.full_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2">
                        {isSelf || isSuper ? (
                          <span className="text-xs text-muted-foreground">
                            {isSuper ? "super admin" : u.role}
                          </span>
                        ) : (
                          <Select
                            value={u.role === "admin" ? "admin" : "employee"}
                            onValueChange={(v) =>
                              onReclassify(
                                u.id,
                                v as "employee" | "admin",
                                v === "admin" ? (u.department as "HR" | "IT" | "Finance" | "Operations" | null) ?? "IT" : null,
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[150px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="employee">Employee</SelectItem>
                              <SelectItem value="admin">Department Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {u.role === "admin" && !isSuper && !isSelf ? (
                          <Select
                            value={u.department ?? "IT"}
                            onValueChange={(v) =>
                              onReclassify(u.id, "admin", v as "HR" | "IT" | "Finance" | "Operations")
                            }
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HR">HR</SelectItem>
                              <SelectItem value="IT">IT</SelectItem>
                              <SelectItem value="Finance">Finance</SelectItem>
                              <SelectItem value="Operations">Operations</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{u.department ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!isSelf && !isSuper && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(u.id, u.full_name || u.email)}
                            className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(data?.pending ?? []).map((p) => (
                  <tr key={p.email} className="border-b border-border/60 bg-warning/5 last:border-0">
                    <td className="px-3 py-2">{p.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.email}</td>
                    <td className="px-3 py-2">{p.role} · pending</td>
                    <td className="px-3 py-2">{p.department ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancelPending(p.email)}
                        className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

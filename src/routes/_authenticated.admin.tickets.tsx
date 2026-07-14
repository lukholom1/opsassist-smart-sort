import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { AdminHeader } from "@/components/AdminHeader";
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
  Loader2,
  Search,
  Bot,
  MessageSquare,
  ArrowRightLeft,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  CheckCircle2,
  Clock3,
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
import { cn } from "@/lib/utils";

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
  approval_lock: boolean;
  assignments: AssignmentRow[];
  my_assignment: AssignmentRow | null;
  feedback: { rating: number; comment: string | null } | null;
  last_note_at: string | null;
  last_note_role: "user" | "admin" | null;
  escalated?: boolean | null;
  escalation_reason?: string | null;
  escalation_notes?: string | null;
  escalated_by_name?: string | null;
  escalated_by_department?: string | null;
  escalated_at?: string | null;
};

type SortKey = "user" | "title" | "priority" | "status" | "time";
type SortState = { key: SortKey; dir: "asc" | "desc" };
const PRIORITY_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const STATUS_ORDER: Record<string, number> = { Open: 1, "In Progress": 2, Resolved: 3 };
const PAGE_SIZE = 10;

function AdminTicketsPage() {
  const navigate = useNavigate();
  const { department, role } = useAuth();
  useEffect(() => {
    if (role && role !== "admin") navigate({ to: "/dashboard", replace: true });
  }, [role, navigate]);
  const fetchTickets = useServerFn(listDeptTickets);
  const updateStatus = useServerFn(updateAssignmentStatus);
  const reassign = useServerFn(reassignAssignment);
  const touchInProgress = useServerFn(touchTicketInProgress);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterPri, setFilterPri] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [notesTicket, setNotesTicket] = useState<Ticket | null>(null);
  const [detailsTicket, setDetailsTicket] = useState<Ticket | null>(null);
  const [reassignTarget, setReassignTarget] = useState<{
    ticket: Ticket;
    assignment: AssignmentRow;
  } | null>(null);

  const [activeSort, setActiveSort] = useState<SortState>({ key: "time", dir: "desc" });
  const [resolvedSort, setResolvedSort] = useState<SortState>({ key: "time", dir: "desc" });
  const [activePage, setActivePage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);

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

  const search = Route.useSearch();
  const handledTicketRef = useRef<string | null>(null);
  useEffect(() => {
    const target = search.ticket;
    if (!target || loading) return;
    if (handledTicketRef.current === target) return;
    const found = tickets.find((t) => t.id === target);
    if (found) {
      handledTicketRef.current = target;
      if (search.focus === "notes") touchAndOpen(found, setNotesTicket);
      else touchAndOpen(found, setDetailsTicket);
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
      toast.error(
        `Could not update status: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    } finally {
      setSaving(null);
    }
  }

  async function touchAndOpen(t: Ticket, opener: (t: Ticket) => void) {
    opener(t);
    const isOpen =
      t.status === "Open" ||
      t.assignments.some((a) => a.status === "Open") ||
      t.my_assignment?.status === "Open";
    if (!isOpen) return;
    try {
      await touchInProgress({ data: { ticket_id: t.id } });
      await refresh();
    } catch (e) {
      console.warn("[touchTicketInProgress] failed", e);
    }
  }

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        if (filterPri !== "all" && t.priority !== filterPri) return false;
        if (filterStatus !== "all" && t.status !== filterStatus) return false;
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
    [tickets, query, filterPri, filterStatus],
  );

  const isActive = (t: Ticket) =>
    isSuperAdmin
      ? t.status !== "Resolved"
      : t.my_assignment
        ? t.my_assignment.status !== "Resolved"
        : t.status !== "Resolved";
  const active = useMemo(() => filtered.filter(isActive), [filtered, isSuperAdmin]);
  const resolved = useMemo(
    () => filtered.filter((t) => !isActive(t)),
    [filtered, isSuperAdmin],
  );

  const kpi = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === "Open").length;
    const inProg = tickets.filter((t) => t.status === "In Progress").length;
    const res = tickets.filter((t) => t.status === "Resolved").length;
    return { total, open, inProg, res };
  }, [tickets]);

  // Reset paging when filters/search change
  useEffect(() => {
    setActivePage(1);
    setResolvedPage(1);
  }, [query, filterPri, filterStatus]);

  return (
    <div className="min-h-screen">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Hero */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-soft-blue opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-soft-blue" />
              </span>
              Live queue
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
              {isSuperAdmin ? "All tickets" : `${department} tickets`}
            </h1>
            <p className="text-sm text-muted-foreground">
              Sort, filter, and paginate through active and resolved work.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiChip icon={<Inbox size={14} />} label="Total" value={kpi.total} tone="muted" />
            <KpiChip icon={<Clock3 size={14} />} label="Open" value={kpi.open} tone="warning" />
            <KpiChip icon={<Loader2 size={14} />} label="In Progress" value={kpi.inProg} tone="blue" />
            <KpiChip icon={<CheckCircle2 size={14} />} label="Resolved" value={kpi.res} tone="success" />
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3 backdrop-blur md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
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
          <div className="flex flex-wrap gap-2">
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
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            {(query || filterPri !== "all" || filterStatus !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilterPri("all");
                  setFilterStatus("all");
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="mt-8 grid gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-2xl border border-border bg-card/60"
              />
            ))}
          </div>
        ) : (
          <>
            <TableSection
              title="Active"
              count={active.length}
              accent="warning"
            >
              <SortablePaginatedTable
                tickets={active}
                myDept={department}
                saving={saving}
                onStatus={changeStatus}
                onOpenNotes={(t) => touchAndOpen(t, setNotesTicket)}
                onOpenDetails={(t) => touchAndOpen(t, setDetailsTicket)}
                onReassign={(t, a) => setReassignTarget({ ticket: t, assignment: a })}
                unreadCounts={unreadCounts}
                sort={activeSort}
                onSortChange={setActiveSort}
                page={activePage}
                onPageChange={setActivePage}
              />
            </TableSection>
            <TableSection
              title="Resolved"
              count={resolved.length}
              accent="success"
            >
              <SortablePaginatedTable
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
                sort={resolvedSort}
                onSortChange={setResolvedSort}
                page={resolvedPage}
                onPageChange={setResolvedPage}
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

function KpiChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "muted" | "warning" | "blue" | "success";
}) {
  const toneMap: Record<string, string> = {
    muted: "text-muted-foreground bg-muted/40 ring-border",
    warning: "text-warning bg-warning/10 ring-warning/20",
    blue: "text-soft-blue bg-soft-blue/10 ring-soft-blue/20",
    success: "text-success bg-success/10 ring-success/20",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2 backdrop-blur">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset", toneMap[tone])}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight text-foreground">{value}</div>
      </div>
    </div>
  );
}

function TableSection({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: "warning" | "success";
  children: React.ReactNode;
}) {
  const dot = accent === "warning" ? "bg-warning" : "bg-success";
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {children}
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSortChange,
  className,
}: {
  label: string;
  sortKey?: SortKey;
  sort: SortState;
  onSortChange: (s: SortState) => void;
  className?: string;
}) {
  if (!sortKey) {
    return <th className={cn("px-4 py-3 font-medium", className)}>{label}</th>;
  }
  const active = sort.key === sortKey;
  return (
    <th className={cn("px-4 py-3 font-medium", className)}>
      <button
        type="button"
        onClick={() =>
          onSortChange({
            key: sortKey,
            dir: active && sort.dir === "asc" ? "desc" : "asc",
          })
        }
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <span className="inline-block h-3 w-3 opacity-0" />
        )}
      </button>
    </th>
  );
}

function sortTickets(list: Ticket[], sort: SortState): Ticket[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const arr = [...list];
  arr.sort((a, b) => {
    let av: number | string = 0;
    let bv: number | string = 0;
    switch (sort.key) {
      case "user":
        av = a.user_name.toLowerCase();
        bv = b.user_name.toLowerCase();
        break;
      case "title":
        av = a.title.toLowerCase();
        bv = b.title.toLowerCase();
        break;
      case "priority":
        av = PRIORITY_ORDER[a.priority] ?? 0;
        bv = PRIORITY_ORDER[b.priority] ?? 0;
        break;
      case "status":
        av = STATUS_ORDER[a.status] ?? 0;
        bv = STATUS_ORDER[b.status] ?? 0;
        break;
      case "time":
        av = new Date(a.created_at).getTime();
        bv = new Date(b.created_at).getTime();
        break;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return arr;
}

function SortablePaginatedTable(props: {
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
  sort: SortState;
  onSortChange: (s: SortState) => void;
  page: number;
  onPageChange: (n: number) => void;
}) {
  const { tickets, sort, onSortChange, page, onPageChange, showFeedback } = props;

  const sorted = useMemo(() => sortTickets(tickets, sort), [tickets, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox size={18} />
        </div>
        <p className="text-sm text-muted-foreground">No tickets in this view.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="User" sortKey="user" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Ticket" sortKey="title" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Departments" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Priority" sortKey="priority" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Assignee" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Status" sortKey="status" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Time" sortKey="time" sort={sort} onSortChange={onSortChange} />
              {showFeedback && (
                <SortableHeader label="Rating" sort={sort} onSortChange={onSortChange} />
              )}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((t) => (
              <TicketRow key={t.id} t={t} {...props} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:flex-row">
        <div>
          Showing{" "}
          <span className="font-medium text-foreground">
            {sorted.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, sorted.length)}
          </span>{" "}
          of <span className="font-medium text-foreground">{sorted.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="px-2 tabular-nums">
            Page <span className="font-medium text-foreground">{safePage}</span> / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </>
  );
}

function TicketRow({
  t,
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
  t: Ticket;
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
  const rowAssignments = myDept
    ? t.my_assignment
      ? [t.my_assignment]
      : []
    : t.assignments;

  return (
    <tr
      onClick={() => onOpenDetails(t)}
      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
    >
      <td className="px-4 py-3 font-medium">{t.user_name}</td>
      <td className="max-w-sm px-4 py-3">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <span className="truncate">{t.title}</span>
          {showAi && t.resolved_by_ai && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-accent ring-1 ring-inset ring-purple-accent/20">
              <Bot size={10} /> AI
            </span>
          )}
        </div>
        <div className="line-clamp-1 text-xs text-muted-foreground">{t.details}</div>
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
              <span className="font-medium text-foreground">{a.department}: </span>
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
                <span className="w-16 text-[11px] font-medium text-muted-foreground">
                  {a.department}
                </span>
              )}
              <Select
                value={a.status}
                onValueChange={(v) => onStatus(a.id, v as Status)}
                disabled={(!!myDept && a.department !== myDept) || t.approval_lock}
              >
                <SelectTrigger className="h-8 w-[130px] rounded-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  {a.status === "In Progress" && (
                    <SelectItem value="In Progress" disabled>
                      In Progress (auto)
                    </SelectItem>
                  )}
                  <SelectItem value="Resolved" disabled={t.approval_lock}>
                    Resolved
                  </SelectItem>
                </SelectContent>
              </Select>
              {saving === a.id && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          ))}
          {t.approval_lock && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning ring-1 ring-inset ring-warning/30"
              title="Waiting for approval — resolution is disabled until the approval workflow completes."
            >
              Awaiting approval
            </span>
          )}
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

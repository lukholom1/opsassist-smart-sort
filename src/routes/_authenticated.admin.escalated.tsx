import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { useAuth } from "@/hooks/use-auth";
import {
  listEscalatedTickets,
  ESCALATION_REASON_OPTIONS,
  type EscalatedTicketRow,
} from "@/lib/escalations.functions";
import { TicketDetailsDialog } from "@/components/TicketDetailsDialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShieldAlert, MessageSquare } from "lucide-react";
import { PriorityPill, CategoryPills, StatusPill } from "@/components/ticket-bits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NotesDialog } from "@/components/NotesDialog";
import { listDeptTickets, type AssignmentRow } from "@/lib/tickets.functions";

export const Route = createFileRoute("/_authenticated/admin/escalated")({
  head: () => ({ meta: [{ title: "Escalated tickets — OpsAssist" }] }),
  component: EscalatedPage,
});

function EscalatedPage() {
  const navigate = useNavigate();
  const { department, role, loading: authLoading } = useAuth();
  const fetchEscalated = useServerFn(listEscalatedTickets);
  const fetchAll = useServerFn(listDeptTickets);

  const [rows, setRows] = useState<EscalatedTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [pri, setPri] = useState("all");
  const [status, setStatus] = useState("all");
  const [reason, setReason] = useState("all");
  const [details, setDetails] = useState<any | null>(null);
  const [notes, setNotes] = useState<{ id: string; title: string; status: string } | null>(null);

  // Redirect non-SuperAdmins away. Wait until role is loaded to avoid a
  // race where auth session is ready but the role query is still pending.
  useEffect(() => {
    if (authLoading || role === null) return;
    if (role !== "admin" || department !== null) {
      navigate({ to: "/admin", replace: true });
    }
  }, [authLoading, role, department, navigate]);

  useEffect(() => {
    if (role !== "admin" || department !== null) return;
    let alive = true;
    (async () => {
      try {
        const r = (await fetchEscalated()) as { tickets: EscalatedTicketRow[] };
        if (alive) setRows(r.tickets);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchEscalated, role, department]);

  const filtered = useMemo(() => {
    return rows.filter((t) => {
      if (dept !== "all" && t.escalated_by_department !== dept) return false;
      if (pri !== "all" && t.priority !== pri) return false;
      if (status !== "all" && t.status !== status) return false;
      if (reason !== "all" && t.escalation_reason !== reason) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !t.user_name.toLowerCase().includes(q) &&
          !(t.escalated_by_name ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rows, dept, pri, status, reason, query]);

  async function openDetails(t: EscalatedTicketRow) {
    // Ticket details dialog expects a fuller shape; fetch through listDeptTickets.
    try {
      const r = (await fetchAll()) as {
        tickets: Array<{
          id: string;
          user_name: string;
          title: string;
          details: string;
          categories: string[];
          priority: string;
          status: "Open" | "In Progress" | "Resolved";
          created_at: string;
          resolved_at: string | null;
          resolved_by_ai: boolean;
          assignments: AssignmentRow[];
          feedback: { rating: number; comment: string | null } | null;
        }>;
      };
      const found = r.tickets.find((x) => x.id === t.id);
      if (found) setDetails(found);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-destructive" size={22} />
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Escalated tickets</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tickets escalated by Department Admins for SuperAdmin review. Newest first.
        </p>

        <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-3 md:grid-cols-[1fr_repeat(4,minmax(0,160px))]">
          <div className="relative min-w-0">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, user, escalator..."
              className="pl-9"
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
              <SelectItem value="IT">IT</SelectItem>
              <SelectItem value="Finance">Finance</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pri} onValueChange={setPri}>
            <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue placeholder="Reason" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              {ESCALATION_REASON_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="mt-8 flex items-center justify-center rounded-2xl border border-border bg-card py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading escalations...
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
            No escalated tickets match these filters.
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {filtered.map((t) => (
              <article
                key={t.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => openDetails(t)}
                        className="text-left font-semibold text-foreground hover:underline"
                      >
                        {t.title}
                      </button>
                      <PriorityPill value={t.priority} />
                      <StatusPill value={t.status as "Open" | "In Progress" | "Resolved"} />
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive ring-1 ring-inset ring-destructive/25">
                        <ShieldAlert size={10} /> Escalated
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.details}</p>
                    <div className="mt-2">
                      <CategoryPills values={t.categories} />
                    </div>
                  </div>
                  <button
                    onClick={() => setNotes({ id: t.id, title: t.title, status: t.status })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                    title="Open conversation"
                  >
                    <MessageSquare size={13} className="text-soft-blue" /> Notes
                  </button>
                </div>

                <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 text-xs sm:grid-cols-2 md:grid-cols-4">
                  <MetaRow label="Requester" value={t.user_name} />
                  <MetaRow
                    label="Escalated by"
                    value={
                      t.escalated_by_name
                        ? `${t.escalated_by_name}${t.escalated_by_department ? ` · ${t.escalated_by_department}` : ""}`
                        : "—"
                    }
                  />
                  <MetaRow label="Reason" value={t.escalation_reason ?? "—"} />
                  <MetaRow
                    label="Escalated at"
                    value={new Date(t.escalated_at).toLocaleString()}
                  />
                </div>

                {t.escalation_notes && (
                  <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Escalation notes
                    </div>
                    <p className="whitespace-pre-wrap text-foreground/90">{t.escalation_notes}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      {details && (
        <TicketDetailsDialog ticket={details} onClose={() => setDetails(null)} />
      )}
      {notes && (
        <NotesDialog
          ticketId={notes.id}
          ticketTitle={notes.title}
          viewerRole="admin"
          ticketResolved={notes.status === "Resolved"}
          onClose={() => setNotes(null)}
        />
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-foreground">{value}</div>
    </div>
  );
}

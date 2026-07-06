import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  submitTicket,
  listMyTickets,
  generateTicketResponse,
  markResolvedByAI,
  submitFeedback,
  type AssignmentRow,
} from "@/lib/tickets.functions";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { NotificationsBell } from "@/components/NotificationsBell";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, LogOut, CheckCircle2, Plus, X, Bot } from "lucide-react";
import {
  elapsed,
  CategoryPills,
  PriorityPill,
  StatusPill,
  DepartmentStatusPills,
  RatingStars,
} from "@/components/ticket-bits";
// NotesDialog still used elsewhere; admin uses it directly. Chatbot replaces it for users.
import { ChatbotDialog } from "@/components/ChatbotDialog";
import { useNotesRealtime } from "@/hooks/use-notes-realtime";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — OpsAssist" }] }),
  component: DashboardPage,
});

type Ticket = {
  id: string;
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
  last_note_at: string | null;
  last_note_role: "user" | "admin" | null;
};

function DashboardPage() {
  const navigate = useNavigate();
  const { signOut, fullName, role } = useAuth();
  useEffect(() => {
    if (role === "admin") navigate({ to: "/admin", replace: true });
  }, [role, navigate]);
  const fetchMine = useServerFn(listMyTickets);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [aiTicket, setAiTicket] = useState<Ticket | null>(null);
  const [rateTicket, setRateTicket] = useState<Ticket | null>(null);
  const [chatTicket, setChatTicket] = useState<Ticket | null>(null);
  const { counts: unreadCounts, clearTicket } = useNotesRealtime(
    "user",
    tickets,
    chatTicket?.id ?? null,
  );

  async function refresh() {
    const r = (await fetchMine()) as { tickets: Ticket[] };
    setTickets(r.tickets);
  }

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    (async () => {
      // Wait for Supabase to hydrate the session from storage before calling
      // any protected server fn, otherwise no Bearer token is attached.
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.getSession();
      try {
        await refresh();
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
      id = setInterval(() => {
        refresh().catch(() => {});
      }, 15000);
    })();
    return () => {
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <NotificationsBell />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Hi, <span className="font-medium text-foreground">{fullName ?? "there"}</span>
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="rounded-lg">
              <LogOut size={14} className="mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My tickets</h1>
            <p className="text-sm text-muted-foreground">
              Submit a new request and track its progress per department.
            </p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            <Plus size={16} className="mr-1.5" /> New ticket
          </Button>
        </div>

        <div className="mt-6 grid gap-3">
          {loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center text-sm text-muted-foreground">
              You don't have any tickets yet. Click <span className="font-semibold text-foreground">New ticket</span> to start.
            </div>
          ) : (
            tickets.map((t) => {
              const unreadCount = t.status !== "Resolved" ? (unreadCounts[t.id] ?? 0) : 0;
              const dimmed = t.status === "Resolved" && !!t.feedback;
              return (
              <div
                key={t.id}
                className={`rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition ${dimmed ? "opacity-60 grayscale" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
                      {t.resolved_by_ai && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-accent ring-1 ring-inset ring-purple-accent/20">
                          <Bot size={10} /> Resolved by AI
                        </span>
                      )}
                      {dimmed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ring-1 ring-inset ring-border">
                          Closed
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.details}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <CategoryPills values={t.categories} />
                      <PriorityPill value={t.priority} />
                      <StatusPill value={t.status} />
                      <span className="text-muted-foreground">· {elapsed(t.created_at, t.resolved_at)}</span>
                    </div>
                    {t.assignments.length > 0 && (
                      <div className="mt-2">
                        <DepartmentStatusPills assignments={t.assignments} />
                      </div>
                    )}
                    {t.feedback && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Your rating:</span>
                        <RatingStars value={t.feedback.rating} size={12} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setChatTicket(t)}
                      className="relative rounded-full"
                    >
                      <Bot size={14} className="mr-1.5 text-purple-accent" /> Chatbot
                      {unreadCount > 0 && (
                        <span
                          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-card"
                          aria-label={`${unreadCount} new message${unreadCount > 1 ? "s" : ""}`}
                        >
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </Button>
                    {t.status === "Resolved" && !t.feedback && (
                      <Button
                        size="sm"
                        onClick={() => setRateTicket(t)}
                        className="rounded-full bg-warning text-warning-foreground hover:bg-warning/90"
                      >
                        Rate experience
                      </Button>
                    )}
                  </div>

                </div>
              </div>
              );
            })
          )}
        </div>
      </main>

      {showForm && (
        <NewTicketDialog
          onClose={() => setShowForm(false)}
          onCreated={async () => {
            setShowForm(false);
            await refresh();
            // Open AI dialog for the newest ticket
            const r = (await new Promise<{ tickets: Ticket[] }>((res) =>
              fetchMine().then((x) => res(x as { tickets: Ticket[] })),
            ));
            if (r.tickets[0]) setAiTicket(r.tickets[0]);
          }}
        />
      )}
      {aiTicket && (
        <AiSupportDialog
          ticket={aiTicket}
          onClose={() => setAiTicket(null)}
          onResolved={() => {
            setAiTicket(null);
            refresh();
          }}
        />
      )}
      {rateTicket && (
        <RatingDialog
          ticket={rateTicket}
          onClose={() => setRateTicket(null)}
          onSubmitted={() => {
            setRateTicket(null);
            refresh();
          }}
        />
      )}
      {chatTicket && (
        <ChatbotDialog
          ticketId={chatTicket.id}
          ticketTitle={chatTicket.title}
          ticketResolved={chatTicket.status === "Resolved"}
          assignments={chatTicket.assignments}
          onClose={() => {
            clearTicket(chatTicket.id);
            setChatTicket(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ----- New Ticket dialog -----
function NewTicketDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const submit = useServerFn(submitTicket);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await submit({ data: { title, details } });
      if (r?.emailSent) {
        toast.success("Ticket submitted", { description: "Email notification sent successfully." });
      } else {
        toast.success("Ticket submitted", { description: "Ticket created, but email could not be sent." });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit a new ticket</DialogTitle>
          <DialogDescription>
            AI will classify your ticket across HR, IT, Finance and Operations, route it, and offer a response.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Cannot access VPN"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Describe the issue</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={2000}
              placeholder="Provide as much context as possible..."
              className="min-h-[120px]"
              required
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit ticket
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----- AI support dialog -----
function AiSupportDialog({
  ticket,
  onClose,
  onResolved,
}: {
  ticket: Ticket;
  onClose: () => void;
  onResolved: () => void;
}) {
  const generate = useServerFn(generateTicketResponse);
  const resolveAi = useServerFn(markResolvedByAI);
  const { fullName } = useAuth();
  const [text, setText] = useState("");
  const [tone, setTone] = useState<string>("");
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [loading, setLoading] = useState(true);
  const [forwarded, setForwarded] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    generate({
      data: {
        ticket_id: ticket.id,
        user_name: fullName ?? "there",
        title: ticket.title,
        details: ticket.details,
        categories: ticket.categories as ("HR" | "IT" | "Finance" | "Operations")[],
        priority: ticket.priority,
      },
    })
      .then((r) => {
        if (cancelled) return;
        setText(r.response);
        setTone(r.tone);
        setSource(r.source);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ticket.id, ticket.title, ticket.details, ticket.priority, fullName, generate, ticket.categories]);

  async function handleResolved() {
    setResolving(true);
    try {
      await resolveAi({ data: { id: ticket.id } });
      onResolved();
    } finally {
      setResolving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-accent" /> AI support
          </DialogTitle>
          <DialogDescription>
            Routed to <span className="font-medium">{ticket.categories.join(", ")}</span>
            {tone && <> · tone: <span className="font-medium">{tone}</span></>}
            {source === "template" && <> · template fallback</>}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-[160px] whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-4 text-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating response...
            </div>
          ) : (
            text
          )}
        </div>

        {forwarded ? (
          <div className="rounded-md bg-soft-blue/10 px-3 py-3 text-sm text-soft-blue">
            Your ticket has been forwarded to the relevant department(s) for review.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleResolved}
              disabled={loading || resolving}
              className="rounded-xl bg-success text-white hover:bg-success/90"
            >
              {resolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Issue resolved
            </Button>
            <Button variant="outline" onClick={() => setForwarded(true)} className="rounded-xl">
              <X className="mr-2 h-4 w-4" /> Not resolved — forward to team
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ----- Rating dialog (shown when ticket fully resolved & not yet rated) -----
function RatingDialog({
  ticket,
  onClose,
  onSubmitted,
}: {
  ticket: Ticket;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const submit = useServerFn(submitFeedback);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      await submit({ data: { ticket_id: ticket.id, rating, comment: comment || undefined } });
      onSubmitted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate your support experience</DialogTitle>
          <DialogDescription>
            “{ticket.title}” — {ticket.resolved_by_ai ? "Resolved by AI" : "Resolved by team"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="flex justify-center py-2">
            <RatingStars value={rating} onChange={setRating} size={32} />
          </div>
          <div className="grid gap-2">
            <Label>Optional comment</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              placeholder="Anything else you'd like us to know?"
            />
          </div>
          {err && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit feedback
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

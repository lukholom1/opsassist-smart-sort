import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  submitTicket,
  listMyTickets,
  generateTicketResponse,
  markResolvedByAI,
} from "@/lib/tickets.functions";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
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
import { elapsed, CategoryPill, PriorityPill, StatusPill } from "@/components/ticket-bits";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — OpsAssist" }] }),
  component: DashboardPage,
});

type Ticket = {
  id: string;
  title: string;
  details: string;
  category: string;
  priority: string;
  status: "Open" | "In Progress" | "Resolved";
  created_at: string;
  resolved_at: string | null;
  resolved_by_ai: boolean;
  assignee_name?: string | null;
};

function DashboardPage() {
  const navigate = useNavigate();
  const { signOut, fullName } = useAuth();
  const fetchMine = useServerFn(listMyTickets);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [aiTicket, setAiTicket] = useState<Ticket | null>(null);

  async function refresh() {
    const r = await fetchMine();
    setTickets(r.tickets as Ticket[]);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
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
              Submit a new request and track its progress in real time.
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
            tickets.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
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
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.details}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <CategoryPill value={t.category} />
                      <PriorityPill value={t.priority} />
                      <StatusPill value={t.status} />
                      <span className="text-muted-foreground">
                        {t.assignee_name ? `· Assigned to ${t.assignee_name}` : ""}
                      </span>
                      <span className="text-muted-foreground">· {elapsed(t.created_at, t.resolved_at)}</span>
                    </div>
                  </div>
                  {t.status !== "Resolved" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAiTicket(t)}
                      className="rounded-full"
                    >
                      <Sparkles size={14} className="mr-1.5 text-purple-accent" /> AI support
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
      <Footer />

      {showForm && (
        <NewTicketDialog
          onClose={() => setShowForm(false)}
          onCreated={(t) => {
            setShowForm(false);
            setAiTicket(t);
            refresh();
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
    </div>
  );
}

// ----- New Ticket dialog: always creates the ticket BEFORE AI interaction -----
function NewTicketDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: Ticket) => void;
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
      const res = await submit({ data: { title, details } });
      onCreated({
        id: res.id,
        title,
        details,
        category: res.category,
        priority: res.priority,
        status: "Open",
        created_at: new Date().toISOString(),
        resolved_at: null,
        resolved_by_ai: false,
      });
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
            AI will classify your ticket, assign it, and offer a support response.
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

// ----- AI support dialog: shows generated response and "Issue Resolved" / forward CTA -----
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
    setText("");
    setSource(null);
    generate({
      data: {
        ticket_id: ticket.id,
        user_name: fullName ?? "there",
        title: ticket.title,
        details: ticket.details,
        category: ticket.category,
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
  }, [ticket.id, ticket.title, ticket.details, ticket.category, ticket.priority, fullName, generate]);

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
            Reply tailored to your <span className="font-medium">{ticket.category}</span> ticket
            {tone && <> · tone: <span className="font-medium">{tone}</span></>}
            {source === "template" && <> · template fallback</>}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap min-h-[160px]">
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
            Your ticket has been forwarded to the relevant department for review.
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listAssignedTickets, updateTicketStatus, generateTicketResponse } from "@/lib/tickets.functions";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Loader2, Sparkles, Copy, Check } from "lucide-react";
import { elapsed, CategoryPill, PriorityPill } from "@/components/ticket-bits";

export const Route = createFileRoute("/_authenticated/it")({
  head: () => ({ meta: [{ title: "IT Personnel — OpsAssist" }] }),
  component: ItPage,
});

type Status = "Open" | "In Progress" | "Resolved";
type Ticket = {
  id: string;
  title: string;
  details: string;
  category: string;
  priority: string;
  status: Status;
  created_at: string;
  resolved_at: string | null;
  resolved_by_ai: boolean;
  requester_name?: string | null;
};

function ItPage() {
  const navigate = useNavigate();
  const { signOut, fullName } = useAuth();
  const fetchAssigned = useServerFn(listAssignedTickets);
  const updateStatus = useServerFn(updateTicketStatus);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [reply, setReply] = useState<Ticket | null>(null);

  async function refresh() {
    const r = await fetchAssigned();
    setTickets(r.tickets as Ticket[]);
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeStatus(id: string, next: Status) {
    const prev = tickets;
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status: next } : t)));
    setSaving(id);
    try {
      await updateStatus({ data: { id, status: next } });
      if (next === "Resolved") await refresh();
    } catch {
      setTickets(prev);
    } finally {
      setSaving(null);
    }
  }

  const active = useMemo(() => tickets.filter((t) => t.status !== "Resolved"), [tickets]);
  const resolved = useMemo(() => tickets.filter((t) => t.status === "Resolved"), [tickets]);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              IT · <span className="font-medium text-foreground">{fullName ?? ""}</span>
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="rounded-lg">
              <LogOut size={14} className="mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">My assigned tickets</h1>
        <p className="text-sm text-muted-foreground">Update status, respond, and resolve.</p>

        {loading ? (
          <div className="mt-8 flex items-center justify-center rounded-2xl border border-border bg-card py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <Section title={`Active (${active.length})`}>
              <TicketTable tickets={active} saving={saving} onStatus={changeStatus} onReply={setReply} />
            </Section>
            <Section title={`Resolved (${resolved.length})`}>
              <TicketTable tickets={resolved} saving={saving} onStatus={changeStatus} onReply={setReply} />
            </Section>
          </>
        )}
      </main>
      <Footer />
      {reply && <ReplyDialog ticket={reply} onClose={() => setReply(null)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
  saving,
  onStatus,
  onReply,
}: {
  tickets: Ticket[];
  saving: string | null;
  onStatus: (id: string, next: Status) => void;
  onReply: (t: Ticket) => void;
}) {
  if (tickets.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No tickets here.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">Requester</th>
            <th className="px-4 py-3 font-medium">Ticket</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{t.requester_name ?? "—"}</td>
              <td className="max-w-md px-4 py-3">
                <div className="font-medium text-foreground">{t.title}</div>
                <div className="line-clamp-1 text-xs text-muted-foreground">{t.details}</div>
              </td>
              <td className="px-4 py-3"><CategoryPill value={t.category} /></td>
              <td className="px-4 py-3"><PriorityPill value={t.priority} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Select value={t.status} onValueChange={(v) => onStatus(t.id, v as Status)}>
                    <SelectTrigger className="h-8 w-[140px] rounded-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                  {saving === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{elapsed(t.created_at, t.resolved_at)}</td>
              <td className="px-4 py-3 text-right">
                <Button variant="outline" size="sm" onClick={() => onReply(t)} className="rounded-full">
                  <Sparkles size={14} className="mr-1.5 text-purple-accent" /> AI reply
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReplyDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const generate = useServerFn(generateTicketResponse);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [tone, setTone] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    generate({
      data: {
        ticket_id: ticket.id,
        user_name: ticket.requester_name ?? "there",
        title: ticket.title,
        details: ticket.details,
        category: ticket.category,
        priority: ticket.priority,
      },
    })
      .then((r) => {
        setText(r.response);
        setTone(r.tone);
      })
      .finally(() => setLoading(false));
  }, [ticket, generate]);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI-drafted reply</DialogTitle>
          <DialogDescription>
            Tone auto-selected: <span className="font-medium">{tone}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[200px]"
          />
          {loading && (
            <div className="absolute inset-0 grid place-items-center rounded bg-card/60 backdrop-blur-sm text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
        <Button onClick={copy} variant="outline" className="rounded-xl">
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          Copy reply
        </Button>
      </DialogContent>
    </Dialog>
  );
}

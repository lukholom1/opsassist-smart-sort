import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  addTicketNote,
  askTicketBot,
  listTicketNotes,
  type AssignmentRow,
  type TicketNote,
} from "@/lib/tickets.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bot, Loader2, Lock, MessageSquare, Send, Sparkles, Users } from "lucide-react";

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

type Mode = "ai" | "admin";

export function ChatbotDialog({
  ticketId,
  ticketTitle,
  ticketResolved,
  assignments,
  onClose,
}: {
  ticketId: string;
  ticketTitle: string;
  ticketResolved: boolean;
  assignments: AssignmentRow[];
  onClose: () => void;
}) {
  const listFn = useServerFn(listTicketNotes);
  const addNoteFn = useServerFn(addTicketNote);
  const askBotFn = useServerFn(askTicketBot);

  const deptAdmins = (() => {
    const seen = new Set<string>();
    const out: { department: string; name: string | null }[] = [];
    for (const a of assignments) {
      if (seen.has(a.department)) continue;
      seen.add(a.department);
      out.push({ department: a.department, name: a.assignee_name ?? null });
    }
    return out;
  })();

  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(ticketResolved);
  const [mode, setMode] = useState<Mode>("ai");
  const [selectedDept, setSelectedDept] = useState<string>(deptAdmins[0]?.department ?? "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const selectedAdmin = deptAdmins.find((d) => d.department === selectedDept) ?? deptAdmins[0];
  const conversationStarted = notes.some(
    (n) => n.author_role === "admin" || n.author_role === "user",
  );

  async function refresh() {
    try {
      const r = await listFn({ data: { ticket_id: ticketId } });
      setNotes(r.notes);
      setLocked(r.locked);
    } finally {
      setLoading(false);
      queueMicrotask(() => {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
      });
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function send() {
    if (!body.trim() || sending || locked) return;
    const message = body.trim();
    setSending(true);
    setErr(null);
    try {
      if (mode === "ai") {
        setAiThinking(true);
        setBody("");
        await askBotFn({ data: { ticket_id: ticketId, message } });
      } else {
        const tag =
          deptAdmins.length > 1 && selectedAdmin
            ? `[To ${selectedAdmin.department}${selectedAdmin.name ? ` – ${selectedAdmin.name}` : ""}] `
            : "";
        await addNoteFn({ data: { ticket_id: ticketId, body: tag + message } });
        setBody("");
      }
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setAiThinking(false);
      setSending(false);
    }
  }

  function switchToAdmin() {
    setMode("admin");
    setEscalated(true);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot size={18} className="text-purple-accent" /> Chatbot
          </DialogTitle>
          <DialogDescription className="line-clamp-1">{ticketTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              mode === "ai"
                ? "border-purple-accent/50 bg-purple-accent/15 text-purple-accent"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles size={12} className="mr-1 inline" /> Ask AI
          </button>
          <button
            type="button"
            onClick={switchToAdmin}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              mode === "admin"
                ? "border-soft-blue/50 bg-soft-blue/15 text-soft-blue"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users size={12} className="mr-1 inline" /> Message Admin
          </button>
        </div>

        <div
          ref={scrollerRef}
          className="max-h-[50vh] min-h-[240px] space-y-3 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3"
        >
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : notes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. {locked ? "" : "Start the conversation below."}
            </p>
          ) : (
            notes.map((n) => {
              const mine = n.author_role === "user";
              const isAdmin = n.author_role === "admin";
              const isAi = n.author_role === "ai";
              const initials = isAi
                ? "AI"
                : (n.author_name || "?")
                    .split(" ")
                    .map((p) => p[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
              const avatar = (
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ${
                    isAi
                      ? "bg-purple-accent/15 text-purple-accent ring-purple-accent/30"
                      : isAdmin
                        ? "bg-soft-blue/15 text-soft-blue ring-soft-blue/30"
                        : "bg-warning/15 text-warning ring-warning/30"
                  }`}
                  title={n.author_name}
                >
                  {initials}
                </div>
              );
              return (
                <div
                  key={n.id}
                  className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
                >
                  {!mine && avatar}
                  <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span className="font-semibold text-foreground/80">{n.author_name}</span>
                      <span
                        className={`rounded-full px-1.5 py-px text-[9px] font-medium ring-1 ring-inset ${
                          isAi
                            ? "bg-purple-accent/10 text-purple-accent ring-purple-accent/30"
                            : isAdmin
                              ? "bg-soft-blue/10 text-soft-blue ring-soft-blue/30"
                              : "bg-warning/10 text-warning ring-warning/30"
                        }`}
                      >
                        {isAi ? "AI" : isAdmin ? "Admin" : "You"}
                      </span>
                      <span>· {relTime(n.created_at)}</span>
                    </div>
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                        mine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : isAi
                            ? "rounded-bl-sm bg-purple-accent/10 text-foreground ring-1 ring-purple-accent/30"
                            : "rounded-bl-sm bg-soft-blue/10 text-foreground ring-1 ring-soft-blue/30"
                      }`}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed">{n.body}</div>
                    </div>
                  </div>
                  {mine && avatar}
                </div>
              );
            })
          )}
          {aiThinking && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> AI is thinking…
            </div>
          )}
        </div>

        {mode === "admin" && !locked && deptAdmins.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Route to:
            </span>
            {deptAdmins.map((d) => (
              <button
                key={d.department}
                type="button"
                onClick={() => setSelectedDept(d.department)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  selectedDept === d.department
                    ? "border-soft-blue/60 bg-soft-blue/15 text-soft-blue"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
                title={d.name ?? "Unassigned"}
              >
                {d.department}
                {d.name ? ` · ${d.name}` : ""}
              </button>
            ))}
          </div>
        )}

        {mode === "admin" && escalated && !locked && !conversationStarted && (
          <div className="flex items-center gap-2 rounded-xl border border-soft-blue/30 bg-soft-blue/10 px-3 py-2 text-xs text-soft-blue">
            <MessageSquare size={14} />
            {selectedAdmin?.name
              ? `Connecting you to ${selectedAdmin.name}${selectedAdmin.department ? ` (${selectedAdmin.department})` : ""}…`
              : "Connecting you to your assigned administrator…"}
          </div>
        )}

        {locked ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Lock size={14} /> This ticket is resolved — the conversation is closed.
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                mode === "ai"
                  ? "Ask the AI about your ticket…"
                  : selectedAdmin
                    ? `Message ${selectedAdmin.name ?? `${selectedAdmin.department} admin`}…`
                    : "Write a message to your assigned admin…"
              }
              rows={3}
              maxLength={2000}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
              }}
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">Cmd/Ctrl + Enter to send</p>
              <Button onClick={send} disabled={sending || !body.trim()} className="rounded-full">
                {sending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send size={14} className="mr-1.5" />
                )}
                Send
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

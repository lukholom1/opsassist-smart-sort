import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { addTicketNote, listTicketNotes, type TicketNote } from "@/lib/tickets.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Send, MessageSquare, Lock } from "lucide-react";

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

export function NotesDialog({
  ticketId,
  ticketTitle,
  viewerRole,
  ticketResolved,
  onClose,
}: {
  ticketId: string;
  ticketTitle: string;
  viewerRole: "user" | "admin";
  ticketResolved: boolean;
  onClose: () => void;
}) {
  const listFn = useServerFn(listTicketNotes);
  const addFn = useServerFn(addTicketNote);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(ticketResolved);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const r = await listFn({ data: { ticket_id: ticketId } });
    setNotes(r.notes);
    setLocked(r.locked);
    setLoading(false);
    queueMicrotask(() => {
      scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
    });
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function send() {
    if (!body.trim() || sending || locked) return;
    setSending(true);
    setErr(null);
    try {
      await addFn({ data: { ticket_id: ticketId, body: body.trim() } });
      setBody("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare size={18} className="text-soft-blue" /> Conversation
          </DialogTitle>
          <DialogDescription className="line-clamp-1">{ticketTitle}</DialogDescription>
        </DialogHeader>

        <div
          ref={scrollerRef}
          className="max-h-[50vh] min-h-[200px] space-y-3 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3"
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
              const mine = n.author_role === viewerRole;
              const isAdmin = n.author_role === "admin";
              const initials = (n.author_name || "?")
                .split(" ")
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const avatar = (
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ${
                    isAdmin
                      ? "bg-soft-blue/15 text-soft-blue ring-soft-blue/30"
                      : "bg-purple-accent/15 text-purple-accent ring-purple-accent/30"
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
                          isAdmin
                            ? "bg-soft-blue/10 text-soft-blue ring-soft-blue/30"
                            : "bg-purple-accent/10 text-purple-accent ring-purple-accent/30"
                        }`}
                      >
                        {isAdmin ? "Support" : "User"}
                      </span>
                      <span>· {relTime(n.created_at)}</span>
                    </div>
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                        mine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : isAdmin
                            ? "rounded-bl-sm bg-soft-blue/10 text-foreground ring-1 ring-soft-blue/30"
                            : "rounded-bl-sm bg-purple-accent/10 text-foreground ring-1 ring-purple-accent/30"
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
        </div>

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
                viewerRole === "admin"
                  ? "Reply to the user…"
                  : "Reply to the support team…"
              }
              rows={3}
              maxLength={4000}
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

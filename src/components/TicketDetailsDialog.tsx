import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CategoryPills, PriorityPill, StatusPill, RatingStars, elapsed } from "@/components/ticket-bits";
import { WorkflowProgress } from "@/components/WorkflowProgress";
import { Bot, Calendar, User, Building2, ShieldAlert, Loader2 } from "lucide-react";
import type { AssignmentRow } from "@/lib/tickets.functions";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { escalateTicket, ESCALATION_REASON_OPTIONS } from "@/lib/escalations.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Ticket = {
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
  escalated?: boolean | null;
  escalation_reason?: string | null;
  escalation_notes?: string | null;
  escalated_by_name?: string | null;
  escalated_by_department?: string | null;
  escalated_at?: string | null;
};

export function TicketDetailsDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const { role, department } = useAuth();
  const isDeptAdmin = role === "admin" && department !== null;
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalated, setEscalated] = useState<boolean>(!!ticket.escalated);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            {ticket.title}
            {ticket.resolved_by_ai && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-accent ring-1 ring-inset ring-purple-accent/20">
                <Bot size={10} /> AI
              </span>
            )}
            {escalated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive ring-1 ring-inset ring-destructive/25">
                <ShieldAlert size={10} /> Escalated
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Submitted {new Date(ticket.created_at).toLocaleString()} · {elapsed(ticket.created_at, ticket.resolved_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={ticket.status} />
            <PriorityPill value={ticket.priority} />
            <CategoryPills values={ticket.categories} />
          </div>

          {isDeptAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
              <div className="text-sm">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-destructive" /> SuperAdmin escalation
                </p>
                <p className="text-xs text-muted-foreground">
                  Escalate this ticket when you need higher-level intervention or a system-wide decision.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowEscalate(true)}
                disabled={escalated}
                className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <ShieldAlert size={14} className="mr-1.5" />
                {escalated ? "Already escalated" : "Escalate to SuperAdmin"}
              </Button>
            </div>
          )}

          {escalated && (ticket.escalation_reason || ticket.escalation_notes) && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-destructive">
                <ShieldAlert size={12} /> Escalation details
              </div>
              <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
                {ticket.escalation_reason && (
                  <div><dt className="text-muted-foreground">Reason</dt><dd className="font-medium">{ticket.escalation_reason}</dd></div>
                )}
                {ticket.escalated_by_name && (
                  <div><dt className="text-muted-foreground">Escalated by</dt><dd className="font-medium">{ticket.escalated_by_name}{ticket.escalated_by_department ? ` · ${ticket.escalated_by_department}` : ""}</dd></div>
                )}
                {ticket.escalated_at && (
                  <div><dt className="text-muted-foreground">Escalated at</dt><dd className="font-medium">{new Date(ticket.escalated_at).toLocaleString()}</dd></div>
                )}
              </dl>
              {ticket.escalation_notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.escalation_notes}</p>
              )}
            </div>
          )}

          <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <User size={12} /> Submitted by
            </div>
            <div className="font-medium">{ticket.user_name}</div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Calendar size={12} /> Details
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.details}</p>
          </div>

          <WorkflowProgress ticketId={ticket.id} />

          {ticket.assignments.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Building2 size={12} /> Department assignments
              </div>
              <ul className="grid gap-2 text-sm">
                {ticket.assignments.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2"
                  >
                    <span className="font-medium">{a.department}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.assignee_name ?? "Unassigned"}
                    </span>
                    <StatusPill value={a.status as "Open" | "In Progress" | "Resolved"} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ticket.feedback && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                User rating
              </div>
              <RatingStars value={ticket.feedback.rating} size={18} />
              {ticket.feedback.comment && (
                <p className="mt-2 text-sm text-muted-foreground">“{ticket.feedback.comment}”</p>
              )}
            </div>
          )}
        </div>

        {showEscalate && (
          <EscalateDialog
            ticketId={ticket.id}
            ticketTitle={ticket.title}
            onClose={() => setShowEscalate(false)}
            onDone={() => {
              setEscalated(true);
              setShowEscalate(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EscalateDialog({
  ticketId,
  ticketTitle,
  onClose,
  onDone,
}: {
  ticketId: string;
  ticketTitle: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const escalate = useServerFn(escalateTicket);
  const [reason, setReason] = useState<(typeof ESCALATION_REASON_OPTIONS)[number] | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle() {
    if (!reason) {
      setErr("Please select an escalation reason.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await escalate({ data: { ticket_id: ticketId, reason, notes: notes.trim() || undefined } });
      toast.success("Ticket escalated to SuperAdmin");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to escalate.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-destructive" /> Escalate to SuperAdmin
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{ticketTitle}</span> will be reassigned to
            the SuperAdmin for higher-level review. The conversation is preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="reason">Escalation reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {ESCALATION_REASON_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Additional notes (optional)</Label>
            <Textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide any context that will help the SuperAdmin..."
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handle} disabled={busy || !reason} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldAlert size={14} className="mr-1.5" />}
              Confirm escalation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

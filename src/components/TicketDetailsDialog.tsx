import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CategoryPills, PriorityPill, StatusPill, RatingStars, elapsed } from "@/components/ticket-bits";
import { Bot, Calendar, User, Building2 } from "lucide-react";
import { WorkflowTracker, type WorkflowStage } from "@/components/WorkflowTracker";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import type { AssignmentRow } from "@/lib/tickets.functions";


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
  workflow_stage?: string | null;
  approval_required?: boolean | null;
  assignments: AssignmentRow[];
  feedback: { rating: number; comment: string | null } | null;
};


export function TicketDetailsDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            {ticket.title}
            {ticket.resolved_by_ai && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-accent ring-1 ring-inset ring-purple-accent/20">
                <Bot size={10} /> AI
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Submitted {new Date(ticket.created_at).toLocaleString()} · {elapsed(ticket.created_at, ticket.resolved_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={ticket.status} />
            <PriorityPill value={ticket.priority} />
            <CategoryPills values={ticket.categories} />
          </div>

          <WorkflowTracker
            current={(ticket.workflow_stage as WorkflowStage | undefined) ?? "assigned"}
            approvalRequired={!!ticket.approval_required}
          />


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

          <ActivityTimeline ticketId={ticket.id} />
        </div>

      </DialogContent>
    </Dialog>
  );
}

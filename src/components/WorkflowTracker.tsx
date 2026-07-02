import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowStage =
  | "submitted"
  | "ai_classified"
  | "pending_approval"
  | "approved"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

const STAGES: { key: WorkflowStage; label: string }[] = [
  { key: "submitted", label: "Submitted" },
  { key: "ai_classified", label: "AI Classified" },
  { key: "pending_approval", label: "Pending Approval" },
  { key: "approved", label: "Approved" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

export function WorkflowTracker({
  current,
  approvalRequired = false,
}: {
  current: WorkflowStage;
  approvalRequired?: boolean;
}) {
  // Hide approval stages when the ticket doesn't need approval.
  const visible = STAGES.filter(
    (s) =>
      approvalRequired ||
      (s.key !== "pending_approval" && s.key !== "approved"),
  );

  const currentIdx = visible.findIndex((s) => s.key === current);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
        Workflow
      </div>
      <ol className="flex w-full items-start gap-1 overflow-x-auto pb-1">
        {visible.map((stage, i) => {
          const isDone = currentIdx > i;
          const isCurrent = currentIdx === i;
          return (
            <li
              key={stage.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <div className="flex w-full items-center">
                <div
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    i === 0 ? "opacity-0" : isDone || isCurrent ? "bg-success" : "bg-border",
                  )}
                />
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-2 transition-colors",
                    isDone && "bg-success text-success-foreground ring-success/30",
                    isCurrent &&
                      "bg-primary text-primary-foreground ring-primary/30 shadow-md shadow-primary/20",
                    !isDone &&
                      !isCurrent &&
                      "bg-muted text-muted-foreground ring-border",
                  )}
                >
                  {isDone ? <Check size={12} /> : i + 1}
                </div>
                <div
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    i === visible.length - 1 ? "opacity-0" : isDone ? "bg-success" : "bg-border",
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-center text-[10px] font-medium leading-tight",
                  isCurrent && "text-primary",
                  isDone && "text-success",
                  !isDone && !isCurrent && "text-muted-foreground",
                )}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

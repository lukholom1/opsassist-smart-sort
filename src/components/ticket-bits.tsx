// Small shared ticket UI bits + elapsed-time helper.
import type { JSX } from "react";
import { Star } from "lucide-react";

export function elapsed(createdAt: string, resolvedAt?: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

const CATEGORY_STYLES: Record<string, string> = {
  IT: "bg-soft-blue/10 text-soft-blue ring-soft-blue/20",
  HR: "bg-purple-accent/10 text-purple-accent ring-purple-accent/20",
  Finance: "bg-success/10 text-success ring-success/20",
  Operations: "bg-warning/10 text-warning ring-warning/20",
};

export function CategoryPill({ value }: { value: string }): JSX.Element {
  const cls = CATEGORY_STYLES[value] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {value}
    </span>
  );
}

export function CategoryPills({ values }: { values: string[] }): JSX.Element {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {values.map((v) => (
        <CategoryPill key={v} value={v} />
      ))}
    </span>
  );
}

export function PriorityPill({ value }: { value: string }): JSX.Element {
  const map: Record<string, string> = {
    High: "bg-destructive/10 text-destructive ring-destructive/20",
    Medium: "bg-warning/10 text-warning ring-warning/20",
    Low: "bg-success/10 text-success ring-success/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${map[value] ?? ""}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}

export function StatusPill({ value }: { value: string }): JSX.Element {
  const map: Record<string, string> = {
    Open: "bg-warning/10 text-warning ring-warning/20",
    "In Progress": "bg-soft-blue/10 text-soft-blue ring-soft-blue/20",
    Resolved: "bg-success/10 text-success ring-success/20",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${map[value] ?? ""}`}>
      {value}
    </span>
  );
}

// Per-department status badges, e.g.  IT: Resolved · Operations: In Progress
export function DepartmentStatusPills({
  assignments,
}: {
  assignments: Array<{ department: string; status: string; resolved_by_ai?: boolean }>;
}): JSX.Element {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {assignments.map((a, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
            CATEGORY_STYLES[a.department] ?? "bg-muted text-muted-foreground ring-border"
          }`}
        >
          <span className="font-semibold">{a.department}</span>
          <span className="opacity-70">·</span>
          <span>{a.status}</span>
        </span>
      ))}
    </span>
  );
}

export function RatingStars({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: number;
}): JSX.Element {
  const interactive = !!onChange;
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(i)}
          className={interactive ? "cursor-pointer transition hover:scale-110" : "cursor-default"}
          aria-label={`${i} star`}
        >
          <Star
            size={size}
            className={
              i <= value
                ? "fill-warning text-warning"
                : "text-muted-foreground/40"
            }
          />
        </button>
      ))}
    </div>
  );
}

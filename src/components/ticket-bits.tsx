// Small shared ticket UI bits + elapsed-time helper.
import type { JSX } from "react";

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

export function CategoryPill({ value }: { value: string }): JSX.Element {
  const map: Record<string, string> = {
    IT: "bg-soft-blue/10 text-soft-blue ring-soft-blue/20",
    HR: "bg-purple-accent/10 text-purple-accent ring-purple-accent/20",
    Finance: "bg-success/10 text-success ring-success/20",
    Operations: "bg-warning/10 text-warning ring-warning/20",
  };
  const cls = map[value] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {value}
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Shield,
  Sparkles,
  AlertTriangle,
  Eye,
  FileText,
  Download,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import {
  getComplianceReport,
  type ComplianceReport,
  type DecisionEntry,
  type RiskRow,
  type TransparencyRow,
} from "@/lib/compliance.functions";

export const Route = createFileRoute("/_authenticated/admin/compliance")({
  head: () => ({ meta: [{ title: "Compliance & Risk — OpsAssist" }] }),
  component: CompliancePage,
});

function CompliancePage() {
  const navigate = useNavigate();
  const fetchReport = useServerFn(getComplianceReport);
  const [data, setData] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchReport()
      .then((d) => active && setData(d))
      .catch((e) => console.error("[compliance] failed", e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fetchReport]);

  async function downloadReport() {
    if (!data) return;
    const {
      createReport,
      finalizeReport,
      sectionHeading,
      paragraph,
      kpiGrid,
      keyValueList,
      table,
      bulletList,
    } = await import("@/lib/pdf-report");

    const ctx = await createReport({
      title: "Compliance & Risk Report",
      subtitle: "Governance, transparency and audit trail for AI-assisted operations",
      scope: "All Departments",
      generatedAt: new Date(data.generatedAt),
    });

    sectionHeading(ctx, "Executive Summary");
    paragraph(
      ctx,
      `This report summarises AI activity, risk detection, and human oversight across ${data.totals.tickets} ticket(s). It highlights auto-classification quality, moderation flags, rejected suggestions, and the reviews still requiring administrator attention.`,
      { muted: true },
    );

    sectionHeading(ctx, "AI Activity Overview");
    kpiGrid(ctx, [
      { label: "AI Responses", value: data.totals.aiResponses, tone: "purple" },
      { label: "Auto-Classified", value: data.totals.autoClassified, tone: "success" },
      { label: "High-Risk Cases", value: data.totals.highRisk, tone: "warning" },
      { label: "Human Reviews", value: data.totals.humanReviews, tone: "blue" },
    ]);

    sectionHeading(ctx, "Governance Metrics");
    keyValueList(ctx, [
      ["Tickets analysed", data.totals.tickets],
      ["Resolved by AI", data.totals.resolvedByAi],
      ["Average confidence", `${(data.totals.avgConfidence * 100).toFixed(0)}%`],
      ["Average user rating", data.totals.avgRating != null ? `${data.totals.avgRating} / 5` : "n/a"],
      ["Rejected AI suggestions", data.totals.rejectedAiCount],
      ["Language moderation flags", data.totals.languageFlags],
    ]);

    sectionHeading(ctx, "Frequently Rejected Categories");
    if (data.topRejectedCategories.length) {
      table(
        ctx,
        ["Category", "Rejections"],
        data.topRejectedCategories.map((c) => [c.category, c.count]),
      );
    } else {
      paragraph(ctx, "No categories with recurring rejections.", { muted: true });
    }

    if (data.reviewQueue?.length) {
      sectionHeading(ctx, "Outstanding Human Review Queue");
      table(
        ctx,
        ["Ticket", "Risk", "Department", "Status"],
        data.reviewQueue.slice(0, 25).map((r) => [
          `${r.ticketShort} — ${r.title}`,
          r.level,
          r.department,
          r.status,
        ]),
      );
    }

    sectionHeading(ctx, "Recommendations");
    if (data.recommendations.length) {
      bulletList(ctx, data.recommendations, true);
    } else {
      paragraph(ctx, "No recommendations at this time.", { muted: true });
    }

    finalizeReport(ctx);
    ctx.doc.save(`OpsAssist_Compliance_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="min-h-screen">
      <AdminHeader
        rightSlot={
          <Button
            size="sm"
            onClick={downloadReport}
            disabled={!data}
            className="rounded-lg bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
            aria-label="Generate Compliance Report"
          >
            <Download size={14} className="sm:mr-1.5" />
            <span className="hidden sm:inline">Generate Compliance Report</span>
            <span className="sm:hidden">Report</span>
          </Button>
        }
      />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-purple-accent/15 p-2.5 text-purple-accent">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Compliance & Risk</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Transparency, governance, and audit trail for every AI-assisted action across the platform.
            </p>
          </div>
        </div>

        {loading && !data ? (
          <div className="mt-10 flex h-[320px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building compliance report…
          </div>
        ) : data ? (
          <Sections data={data} />
        ) : (
          <div className="mt-10 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No compliance data available.
          </div>
        )}
      </main>
    </div>
  );
}

function Sections({ data }: { data: ComplianceReport }) {
  return (
    <>
      <Overview data={data} />
      <DecisionLog entries={data.decisions} />
      <Transparency rows={data.transparency} />
      <RiskTable rows={data.risks} />
      <ReviewQueue rows={data.reviewQueue} />
      <ReportSummary data={data} />
    </>
  );
}

function Overview({ data }: { data: ComplianceReport }) {
  const t = data.totals;
  const cards = [
    { label: "AI Responses Generated", value: t.aiResponses, icon: <Sparkles size={14} />, tone: "purple" as const },
    { label: "Tickets Auto-Classified", value: t.autoClassified, icon: <CheckCircle2 size={14} />, tone: "success" as const },
    { label: "High Risk Cases", value: t.highRisk, icon: <AlertTriangle size={14} />, tone: "warning" as const },
    { label: "Human Reviews Required", value: t.humanReviews, icon: <Eye size={14} />, tone: "blue" as const },
  ];
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        AI Activity Overview
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Kpi key={c.label} {...c} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs text-muted-foreground">
        <Stat label="Average confidence" value={`${(t.avgConfidence * 100).toFixed(0)}%`} />
        <Stat label="Resolved by AI" value={String(t.resolvedByAi)} />
        <Stat label="Rejected suggestions" value={String(t.rejectedAiCount)} />
        <Stat label="Language flags" value={String(t.languageFlags)} />
        <Stat label="Average rating" value={t.avgRating == null ? "—" : `${t.avgRating}/5`} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: "blue" | "success" | "purple" | "warning";
}) {
  const toneRing =
    tone === "success"
      ? "from-success/25 to-transparent"
      : tone === "purple"
        ? "from-purple-accent/25 to-transparent"
        : tone === "warning"
          ? "from-warning/30 to-transparent"
          : "from-soft-blue/25 to-transparent";
  const toneText =
    tone === "success"
      ? "text-success"
      : tone === "purple"
        ? "text-purple-accent"
        : tone === "warning"
          ? "text-warning"
          : "text-soft-blue";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 shadow-[var(--shadow-soft)]">
      <div className={`pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-gradient-to-br ${toneRing} blur-2xl`} />
      <div className="relative flex items-center gap-2">
        <span className={toneText}>{icon}</span>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="relative mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function ConfBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.8
      ? "bg-success/15 text-success"
      : value >= 0.6
        ? "bg-soft-blue/15 text-soft-blue"
        : "bg-warning/15 text-warning";
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{pct}%</span>;
}

function RiskBadge({ level }: { level: "Low" | "Medium" | "High" }) {
  const cls =
    level === "High"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : level === "Medium"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-success/15 text-success border-success/30";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{level}</span>;
}

function DecisionLog({ entries }: { entries: DecisionEntry[] }) {
  const [filter, setFilter] = useState<string>("All");
  const actions = useMemo(
    () => ["All", ...Array.from(new Set(entries.map((e) => e.action)))],
    [entries],
  );
  const visible = filter === "All" ? entries : entries.filter((e) => e.action === filter);
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            AI Decision Log
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Audit trail of every AI-assisted action with timestamps and confidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <button
              key={a}
              onClick={() => setFilter(a)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                filter === a
                  ? "border-purple-accent/50 bg-purple-accent/15 text-purple-accent"
                  : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 max-h-[420px] overflow-auto rounded-2xl border border-border bg-card/60">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-card/95 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Timestamp</th>
              <th className="px-3 py-2 font-medium">Ticket</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 text-right font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} className="border-b border-border/40 last:border-0 align-top">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(e.ts).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono text-[11px] text-muted-foreground">{e.ticketShort}</div>
                  <div className="text-xs text-foreground/80">{e.ticketTitle}</div>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-md bg-soft-blue/10 px-2 py-0.5 text-[11px] font-medium text-soft-blue">
                    {e.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-foreground/80">{e.detail}</td>
                <td className="px-3 py-2 text-right">
                  <ConfBadge value={e.confidence} />
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No decisions recorded for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Transparency({ rows }: { rows: TransparencyRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        AI Transparency Panel
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Per-ticket breakdown of AI involvement, categories, and a plain-language explanation.
      </p>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 50).map((r) => {
          const isOpen = open === r.ticketId;
          return (
            <div key={r.ticketId} className="rounded-2xl border border-border bg-card/60">
              <button
                onClick={() => setOpen(isOpen ? null : r.ticketId)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{r.ticketShort}</span> · {r.categories.join(", ")}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                      r.aiInvolved
                        ? "bg-purple-accent/15 text-purple-accent"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.aiInvolved ? "AI involved" : "No AI"}
                  </span>
                  <ConfBadge value={r.confidence} />
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border/60 px-4 py-3 text-xs space-y-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Explanation
                    </div>
                    <div className="mt-0.5 text-foreground/85">{r.explanation}</div>
                  </div>
                  {r.suggestedSolution && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Suggested solution
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap text-foreground/85">
                        {r.suggestedSolution}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!rows.length && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No ticket data yet.
          </div>
        )}
      </div>
    </section>
  );
}

function RiskTable({ rows }: { rows: RiskRow[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Risk Detection Engine
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Automatically flagged tickets based on confidence, conflicting categories, rejections, and priority.
      </p>
      <div className="mt-3 max-h-[360px] overflow-auto rounded-2xl border border-border bg-card/60">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-card/95 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Ticket</th>
              <th className="px-3 py-2 font-medium">Risk</th>
              <th className="px-3 py-2 font-medium">Reasons</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 text-right font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticketId} className="border-b border-border/40 last:border-0 align-top">
                <td className="px-3 py-2">
                  <div className="font-mono text-[11px] text-muted-foreground">{r.ticketShort}</div>
                  <div className="text-xs">{r.title}</div>
                </td>
                <td className="px-3 py-2"><RiskBadge level={r.level} /></td>
                <td className="px-3 py-2 text-xs text-foreground/80">
                  <ul className="list-inside list-disc space-y-0.5">
                    {r.reasons.map((rs) => <li key={rs}>{rs}</li>)}
                  </ul>
                </td>
                <td className="px-3 py-2 text-xs">{r.department}</td>
                <td className="px-3 py-2 text-xs">{r.priority}</td>
                <td className="px-3 py-2 text-right"><ConfBadge value={r.confidence} /></td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No risks detected — all AI actions look healthy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewQueue({ rows }: { rows: RiskRow[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Human Review Queue
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Unresolved tickets that require administrator attention, sorted by risk level.
      </p>
      <div className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-border bg-card/60">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-card/95 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Ticket ID</th>
              <th className="px-3 py-2 font-medium">Risk Level</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticketId} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2 font-mono text-[11px]">{r.ticketShort}</td>
                <td className="px-3 py-2"><RiskBadge level={r.level} /></td>
                <td className="px-3 py-2 text-xs">{r.reasons[0]}</td>
                <td className="px-3 py-2 text-xs">{r.department}</td>
                <td className="px-3 py-2 text-xs">{r.status}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Nothing in the review queue right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportSummary({ data }: { data: ComplianceReport }) {
  return (
    <section className="mt-10 mb-10">
      <div className="rounded-3xl border border-purple-accent/30 bg-purple-accent/5 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-purple-accent/15 p-2 text-purple-accent">
            <FileText size={18} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">Compliance Report Summary</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Click <span className="font-medium text-foreground">Generate Compliance Report</span> at the top to export the full report as Markdown.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Frequently rejected suggestions
                </div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {data.topRejectedCategories.length ? (
                    data.topRejectedCategories.map((c) => (
                      <li key={c.category}>
                        {c.category} — <span className="text-muted-foreground">{c.count}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-muted-foreground">None recorded.</li>
                  )}
                </ul>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Recommendations
                </div>
                <ol className="mt-1 list-inside list-decimal space-y-1 text-xs">
                  {data.recommendations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

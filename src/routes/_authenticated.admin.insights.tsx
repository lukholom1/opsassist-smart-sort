import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
// jsPDF is dynamically imported inside handleDownload to avoid SSR crashes
// (it touches window/document at module load).
import { ArrowLeft, Download, Loader2, RefreshCw, Sparkles, Brain, Clock, Wrench, TrendingUp, AlertTriangle } from "lucide-react";
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
import { AdminCharts } from "@/components/AdminCharts";
import { useAuth } from "@/hooks/use-auth";
import {
  getAdminAnalytics,
  generateInsightsReport,
  generateDeepInsights,
} from "@/lib/analytics.functions";

type Week = { value: string; label: string; from: string; to: string };

function buildWeeks(count = 12): Week[] {
  const weeks: Week[] = [];
  const now = new Date();
  // Find Monday of current week
  const day = now.getDay(); // 0=Sun..6=Sat
  const diffToMon = (day + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
  for (let i = 0; i < count; i++) {
    const from = new Date(monday);
    from.setDate(monday.getDate() - i * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 7);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endLabel = new Date(to);
    endLabel.setDate(to.getDate() - 1);
    weeks.push({
      value: from.toISOString().slice(0, 10),
      label:
        i === 0
          ? `This week (${fmt(from)} – ${fmt(endLabel)})`
          : i === 1
            ? `Last week (${fmt(from)} – ${fmt(endLabel)})`
            : `${fmt(from)} – ${fmt(endLabel)}`,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }
  return weeks;
}

export const Route = createFileRoute("/_authenticated/admin/insights")({
  head: () => ({ meta: [{ title: "Insights — OpsAssist" }] }),
  component: InsightsPage,
});

type Analytics = Awaited<ReturnType<typeof getAdminAnalytics>>;
type Report = Awaited<ReturnType<typeof generateInsightsReport>>;
type Deep = Awaited<ReturnType<typeof generateDeepInsights>>;

function InsightsPage() {
  const { department, fullName } = useAuth();
  const navigate = useNavigate();
  const fetchAnalytics = useServerFn(getAdminAnalytics);
  const fetchInsights = useServerFn(generateInsightsReport);
  const fetchDeep = useServerFn(generateDeepInsights);

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [deep, setDeep] = useState<Deep | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [loadingReport, setLoadingReport] = useState(true);
  const [loadingDeep, setLoadingDeep] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const weeks = useState<Week[]>(() => buildWeeks(12))[0];
  const [weekValue, setWeekValue] = useState<string>("all");

  const isSuperAdmin = department === null;
  const scopeLabel = isSuperAdmin ? "All Departments" : `${department}`;

  async function loadAll(range: { from?: string; to?: string }) {
    setLoadingAnalytics(true);
    setLoadingReport(true);
    setLoadingDeep(true);
    try {
      const a = await fetchAnalytics({ data: range });
      setAnalytics(a);
    } catch (e) {
      console.error("[insights] analytics failed", e);
    } finally {
      setLoadingAnalytics(false);
    }
    try {
      const r = await fetchInsights({ data: range });
      setReport(r);
    } catch (e) {
      console.error("[insights] report failed", e);
    } finally {
      setLoadingReport(false);
    }
    try {
      const d = await fetchDeep({ data: range });
      setDeep(d);
    } catch (e) {
      console.error("[insights] deep failed", e);
    } finally {
      setLoadingDeep(false);
    }
  }

  function currentRange(): { from?: string; to?: string } {
    const w = weeks.find((x) => x.value === weekValue);
    return w ? { from: w.from, to: w.to } : {};
  }

  useEffect(() => {
    loadAll(currentRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekValue]);

  async function handleDownload() {
    if (!report) return;
    setDownloading(true);
    try {
      const narrative =
        typeof report.narrative === "string" && report.narrative.length > 0
          ? report.narrative
          : "No narrative generated.";
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 48;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("OpsAssist — Insights Report", margin, y);
      y += 22;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(110);
      doc.text(`Scope: ${report.summary.scope}`, margin, y);
      y += 14;
      doc.text(
        `Generated: ${new Date(report.summary.generated_at).toLocaleString()}`,
        margin,
        y,
      );
      y += 22;
      doc.setTextColor(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Summary", margin, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = [
        `Total tickets: ${report.summary.total_tickets}`,
        `Resolved: ${report.summary.resolved} (${report.summary.resolution_rate}%)`,
        `Resolved by AI: ${report.summary.resolved_by_ai}`,
        `Priority — High: ${report.summary.by_priority.High} · Medium: ${report.summary.by_priority.Medium} · Low: ${report.summary.by_priority.Low}`,
        `Average rating: ${report.summary.avg_rating || "n/a"} / 5 (${report.summary.feedback_count} responses)`,
        `Avg business-hours resolution: ${report.summary.avg_business_resolution_minutes} min`,
      ];
      for (const l of lines) {
        doc.text(l, margin, y);
        y += 14;
      }
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(
        `AI Narrative${report.source === "fallback" ? " (auto-generated)" : ""}`,
        margin,
        y,
      );
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const wrapped = doc.splitTextToSize(narrative, pageWidth - margin * 2);
      for (const ln of wrapped) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(ln, margin, y);
        y += 13;
      }
      const fileScope = (report.summary.scope || "report").replace(/\s+/g, "_");
      doc.save(
        `OpsAssist_Insights_${fileScope}_${new Date().toISOString().slice(0, 10)}.pdf`,
      );
    } catch (e) {
      console.error("[insights] pdf failed", e);
      alert(
        `Could not generate PDF: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    } finally {
      setDownloading(false);
    }
  }

  const s = report?.summary;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/admin" })}
              className="rounded-lg"
            >
              <ArrowLeft size={14} className="mr-1.5" /> Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAll(currentRange())}
              disabled={loadingAnalytics || loadingReport}
              className="rounded-lg"
            >
              <RefreshCw
                size={14}
                className={`mr-1.5 ${loadingAnalytics || loadingReport ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={!report || downloading}
              className="rounded-lg"
            >
              {downloading ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Download size={14} className="mr-1.5" />
              )}
              Download PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Insights
              </p>
              <Select value={weekValue} onValueChange={setWeekValue}>
                <SelectTrigger
                  className="h-8 w-[240px] rounded-full border-0 bg-gradient-to-r from-purple-accent to-soft-blue px-4 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 focus:ring-2 focus:ring-purple-accent/50 [&>svg]:text-primary-foreground [&>svg]:opacity-100"
                >
                  <SelectValue placeholder="Select week" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  {weeks.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {scopeLabel} dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSuperAdmin
                ? "Aggregated view across HR, IT, Finance, and Operations."
                : `Tickets, resolution metrics, and feedback for the ${department} team.`}
            </p>
          </div>
          <Link
            to="/admin"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            ← Back to {isSuperAdmin ? "admin" : department} dashboard
          </Link>
        </div>

        {/* Stat cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Total tickets" value={s?.total_tickets ?? "—"} />
          <Kpi label="Resolved" value={s?.resolved ?? "—"} tone="success" />
          <Kpi
            label="Resolution rate"
            value={s ? `${s.resolution_rate}%` : "—"}
            tone="blue"
          />
          <Kpi
            label="Resolved by AI"
            value={s?.resolved_by_ai ?? "—"}
            tone="purple"
          />
          <Kpi
            label="Avg rating"
            value={s?.avg_rating ? `${s.avg_rating}/5` : "—"}
            tone="warning"
          />
          <Kpi
            label="Avg resolution"
            value={
              s ? `${s.avg_business_resolution_minutes} min` : "—"
            }
          />
        </div>

        {/* Charts */}
        <section className="mt-8">
          {loadingAnalytics && !analytics ? (
            <div className="flex h-[300px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading analytics…
            </div>
          ) : analytics ? (
            <AdminCharts data={analytics} />
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
              No analytics available.
            </div>
          )}
        </section>

        {/* AI Narrative */}
        <section className="mt-8 rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[var(--shadow-soft)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-purple-accent" />
              <h2 className="text-sm font-semibold tracking-tight">
                AI narrative report
                {report?.source === "fallback" && (
                  <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    auto-generated
                  </span>
                )}
              </h2>
            </div>
            {s && (
              <span className="text-xs text-muted-foreground">
                Generated {new Date(s.generated_at).toLocaleString()}
              </span>
            )}
          </div>

          {loadingReport ? (
            <div className="mt-6 flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating insights…
            </div>
          ) : report ? (
            <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
              {report.narrative}
            </pre>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Could not generate report. Try refreshing.
            </p>
          )}
        </section>

        {/* Deep AI insights */}
        <section className="mt-8 rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[var(--shadow-soft)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-purple-accent" />
              <h2 className="text-sm font-semibold tracking-tight">
                AI deep insights
                {deep?.source === "fallback" && (
                  <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    heuristic
                  </span>
                )}
              </h2>
            </div>
            {deep && (
              <span className="text-xs text-muted-foreground">
                {deep.stats.total} tickets analysed
              </span>
            )}
          </div>

          {loadingDeep ? (
            <div className="mt-6 flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analysing tickets…
            </div>
          ) : deep ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <InsightCard icon={<Clock size={14} />} title="Time analysis">
                <p className="text-sm leading-relaxed text-foreground">{deep.time_analysis}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Mini label="Median" value={`${deep.stats.median_resolution_minutes} min`} />
                  <Mini label="Average" value={`${deep.stats.avg_resolution_minutes} min`} />
                  <Mini label="Fastest" value={`${deep.stats.fastest_minutes} min`} />
                  <Mini label="Backlog >24h" value={String(deep.stats.backlog_over_24h)} />
                </div>
              </InsightCard>

              <InsightCard icon={<AlertTriangle size={14} />} title="Common issues">
                {deep.common_issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recurring themes detected yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {deep.common_issues.slice(0, 6).map((i, idx) => (
                      <li key={idx} className="text-sm">
                        <span className="font-medium text-foreground">{i.theme}</span>
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">×{i.count}</span>
                        {i.example && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">e.g. {i.example}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </InsightCard>

              <InsightCard icon={<Wrench size={14} />} title="Common fixes">
                {deep.common_fixes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not enough resolution notes yet to summarise fixes.</p>
                ) : (
                  <ul className="space-y-2">
                    {deep.common_fixes.slice(0, 6).map((f, idx) => (
                      <li key={idx} className="text-sm">
                        <span className="text-foreground">{f.fix}</span>
                        <p className="mt-0.5 text-xs text-muted-foreground">Applies to: {f.applies_to}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </InsightCard>

              <InsightCard icon={<TrendingUp size={14} />} title="Business insights">
                <ul className="space-y-1.5">
                  {deep.business_insights.map((b, idx) => (
                    <li key={idx} className="text-sm text-foreground">• {b}</li>
                  ))}
                </ul>
                {deep.recommendations.length > 0 && (
                  <>
                    <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recommendations</div>
                    <ul className="mt-1 space-y-1.5">
                      {deep.recommendations.map((r, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground">→ {r}</li>
                      ))}
                    </ul>
                  </>
                )}
              </InsightCard>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No deep insights available.</p>
          )}
        </section>

        {/* Bottom download CTA */}
        <section className="mt-10 flex flex-col items-center justify-center gap-3 rounded-3xl border border-border/60 bg-gradient-to-br from-soft-blue/10 via-purple-accent/5 to-transparent p-8 text-center shadow-[var(--shadow-soft)]">
          <h3 className="text-lg font-semibold tracking-tight">
            Download the {scopeLabel} report
          </h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Export the full insights report — summary metrics and AI narrative — as a PDF for sharing or archiving.
          </p>
          <Button
            size="lg"
            onClick={handleDownload}
            disabled={!report || downloading}
            className="mt-2 rounded-xl"
          >
            {downloading ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Download size={16} className="mr-2" />
            )}
            Download PDF report
          </Button>
        </section>

        <p className="mt-6 text-xs text-muted-foreground">
          Signed in as {fullName ?? "Admin"}
          {department && <> · {department}</>}
        </p>
      </main>
      <Footer />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warning" | "purple" | "blue";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "purple"
          ? "text-purple-accent"
          : tone === "blue"
            ? "text-soft-blue"
            : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-purple-accent">{icon}</span>
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

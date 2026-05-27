import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
// jsPDF is dynamically imported inside handleDownload to avoid SSR crashes
// (it touches window/document at module load).
import { ArrowLeft, Download, Loader2, RefreshCw, Sparkles, Brain, Clock, Wrench, TrendingUp, AlertTriangle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { AdminCharts } from "@/components/AdminCharts";
import { useAuth } from "@/hooks/use-auth";
import {
  getAdminAnalytics,
  generateInsightsReport,
  generateDeepInsights,
} from "@/lib/analytics.functions";

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

  const isSuperAdmin = department === null;
  const scopeLabel = isSuperAdmin ? "All Departments" : `${department}`;

  async function loadAll() {
    setLoadingAnalytics(true);
    setLoadingReport(true);
    setLoadingDeep(true);
    try {
      const a = await fetchAnalytics();
      setAnalytics(a);
    } catch (e) {
      console.error("[insights] analytics failed", e);
    } finally {
      setLoadingAnalytics(false);
    }
    try {
      const r = await fetchInsights();
      setReport(r);
    } catch (e) {
      console.error("[insights] report failed", e);
    } finally {
      setLoadingReport(false);
    }
    try {
      const d = await fetchDeep();
      setDeep(d);
    } catch (e) {
      console.error("[insights] deep failed", e);
    } finally {
      setLoadingDeep(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              onClick={loadAll}
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
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Insights
            </p>
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

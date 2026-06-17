import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Activity,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceDot,
} from "recharts";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getWorkloadForecast, type Forecast } from "@/lib/predictions.functions";

export const Route = createFileRoute("/_authenticated/admin/predictions")({
  head: () => ({ meta: [{ title: "Predictions — OpsAssist" }] }),
  component: PredictionsPage,
});

function PredictionsPage() {
  const { fullName, department } = useAuth();
  const navigate = useNavigate();
  const fetchForecast = useServerFn(getWorkloadForecast);
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchForecast()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => console.error("[predictions] failed", e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fetchForecast]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link to="/admin">
                <ArrowLeft size={14} className="mr-1.5" /> Admin
              </Link>
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {fullName ?? "Admin"} {department && <span className="font-medium text-foreground">· {department}</span>}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Predictive Insights</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Forecast tomorrow's ticket workload using historical patterns, recent trends, and day-of-week seasonality.
            </p>
          </div>
        </div>

        {loading && (
          <div className="mt-10 flex h-[300px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating forecast…
          </div>
        )}

        {!loading && data && !data.hasEnoughData && (
          <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{data.message}</p>
            <p className="text-xs text-muted-foreground">
              Forecasts will appear once a week or more of ticket history accumulates.
            </p>
          </div>
        )}

        {!loading && data && data.hasEnoughData && <ForecastView data={data} />}
      </main>
    </div>
  );
}

function ForecastView({ data }: { data: Forecast }) {
  const TrendIcon =
    data.trend.direction === "Increasing"
      ? TrendingUp
      : data.trend.direction === "Decreasing"
        ? TrendingDown
        : Minus;
  const trendTone =
    data.trend.direction === "Increasing"
      ? "text-warning"
      : data.trend.direction === "Decreasing"
        ? "text-success"
        : "text-muted-foreground";
  const riskTone =
    data.risk.level === "High"
      ? "text-destructive"
      : data.risk.level === "Medium"
        ? "text-warning"
        : "text-success";

  return (
    <div className="mt-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Projected workload"
          value={data.forecast.value}
          sub={`Expected tickets ${data.forecast.date ? "on " + data.forecast.date : "tomorrow"}`}
          icon={<Activity size={14} />}
          tone="blue"
        />
        <SummaryCard
          label="Trend direction"
          value={data.trend.direction}
          sub={`${data.trend.deltaPct >= 0 ? "+" : ""}${data.trend.deltaPct}% vs prior week`}
          icon={<TrendIcon size={14} />}
          tone={data.trend.direction === "Increasing" ? "warning" : data.trend.direction === "Decreasing" ? "success" : "blue"}
          textTone={trendTone}
        />
        <SummaryCard
          label="Risk level"
          value={data.risk.level}
          sub={data.risk.surgeExpected ? "Surge expected" : `Threshold: ${data.risk.threshold}/day`}
          icon={<ShieldAlert size={14} />}
          tone={data.risk.level === "High" ? "warning" : "purple"}
          textTone={riskTone}
        />
        <SummaryCard
          label="Confidence range"
          value={`${data.forecast.lower}–${data.forecast.upper}`}
          sub="Lower / upper estimate"
          icon={<Sparkles size={14} />}
          tone="purple"
        />
      </div>

      {/* Forecast chart */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[var(--shadow-soft)]">
        <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-soft-blue/25 via-purple-accent/10 to-transparent blur-3xl" />
        <h3 className="relative text-sm font-semibold tracking-tight">Workload forecast</h3>
        <p className="relative text-xs text-muted-foreground">
          Historical daily ticket counts with tomorrow's projection and confidence band.
        </p>
        <div className="relative mt-4 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={buildChartSeries(data)}>
              <defs>
                <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--soft-blue))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--soft-blue))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--purple-accent))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--purple-accent))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="url(#bandFill)"
                isAnimationActive={false}
                name="Confidence range"
              />
              <Area
                type="monotone"
                dataKey="history"
                stroke="hsl(var(--soft-blue))"
                strokeWidth={2}
                fill="url(#histFill)"
                connectNulls
                name="Historical"
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="hsl(var(--purple-accent))"
                strokeWidth={2.5}
                strokeDasharray="5 4"
                dot={{ r: 4, fill: "hsl(var(--purple-accent))" }}
                connectNulls
                name="Forecast"
              />
              <ReferenceDot
                x={data.forecast.date}
                y={data.forecast.value}
                r={5}
                fill="hsl(var(--purple-accent))"
                stroke="hsl(var(--card))"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category & Department forecasts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ForecastList
          title="Category forecasts"
          subtitle="Which categories will drive workload"
          items={data.categoryForecasts.map((c) => ({
            label: c.category,
            value: c.predicted,
            badge: c.level,
            tone:
              c.level === "High" ? "warning" : c.level === "Low" ? "success" : "blue",
          }))}
        />
        <ForecastList
          title="Department forecasts"
          subtitle="Expected workload by department"
          items={data.departmentForecasts.map((d) => ({
            label: d.department,
            value: d.predicted,
            badge: `${d.predicted} tickets`,
            tone: "purple",
          }))}
        />
      </div>

      {/* Insight panel */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-[image:var(--gradient-hero)]/10 bg-card/80 p-6 shadow-[var(--shadow-soft)]">
        <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-purple-accent/25 via-soft-blue/10 to-transparent blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="rounded-full bg-purple-accent/15 p-2 text-purple-accent">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Business insight</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{data.insight}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Recent 7-day average: {data.trend.recentAvg} · Prior 7-day average: {data.trend.previousAvg} · Surge threshold (P90): {data.risk.threshold}/day
            </p>
          </div>
        </div>
      </div>

      {/* Day-of-week pattern */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-semibold tracking-tight">Day-of-week pattern</h3>
        <p className="text-xs text-muted-foreground">Average tickets received per weekday in the historical window.</p>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {data.dayOfWeekAverages.map((d) => {
            const max = Math.max(...data.dayOfWeekAverages.map((x) => x.avg), 1);
            const pct = (d.avg / max) * 100;
            return (
              <div key={d.day} className="flex flex-col items-center gap-1.5">
                <div className="relative h-24 w-full overflow-hidden rounded-lg bg-muted/40">
                  <div
                    className="absolute bottom-0 w-full rounded-lg bg-[image:var(--gradient-hero)]"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {d.day}
                </span>
                <span className="text-xs font-semibold tabular-nums">{d.avg}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function buildChartSeries(data: Forecast) {
  const hist = data.history.map((h) => ({
    date: h.date,
    history: h.count,
    forecast: null as number | null,
    band: null as [number, number] | null,
  }));
  // Bridge last historical point to forecast
  const last = data.history[data.history.length - 1];
  if (last) {
    hist[hist.length - 1] = {
      ...hist[hist.length - 1],
      forecast: last.count,
    };
  }
  hist.push({
    date: data.forecast.date,
    history: null as unknown as number,
    forecast: data.forecast.value,
    band: [data.forecast.lower, data.forecast.upper],
  });
  return hist;
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  tone = "blue",
  textTone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "blue" | "success" | "purple" | "warning";
  textTone?: string;
}) {
  const ring =
    tone === "success"
      ? "from-success/20 to-transparent"
      : tone === "purple"
        ? "from-purple-accent/25 to-transparent"
        : tone === "warning"
          ? "from-warning/25 to-transparent"
          : "from-soft-blue/25 to-transparent";
  const iconTone =
    tone === "success"
      ? "text-success"
      : tone === "purple"
        ? "text-purple-accent"
        : tone === "warning"
          ? "text-warning"
          : "text-soft-blue";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 shadow-[var(--shadow-soft)] backdrop-blur-sm">
      <div className={`pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-gradient-to-br ${ring} blur-2xl`} />
      <div className="relative flex items-center gap-2">
        <span className={iconTone}>{icon}</span>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={`relative mt-2 text-2xl font-semibold tracking-tight ${textTone ?? "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="relative mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ForecastList({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: { label: string; value: number; badge: string; tone: "blue" | "purple" | "warning" | "success" }[];
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[var(--shadow-soft)]">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <div className="mt-4 space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">No recent activity to project from.</p>
        )}
        {items.map((it) => {
          const max = Math.max(...items.map((x) => x.value), 1);
          const pct = (it.value / max) * 100;
          const badgeTone =
            it.tone === "warning"
              ? "bg-warning/15 text-warning"
              : it.tone === "success"
                ? "bg-success/15 text-success"
                : it.tone === "purple"
                  ? "bg-purple-accent/15 text-purple-accent"
                  : "bg-soft-blue/15 text-soft-blue";
          return (
            <div key={it.label} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{it.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeTone}`}>
                  {it.badge}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full bg-[image:var(--gradient-hero)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{it.value} predicted tickets</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

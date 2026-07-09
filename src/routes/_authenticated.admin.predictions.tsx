import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
  Lightbulb,
  CalendarDays,
  Building2,
  Target,
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
  BarChart,
  Bar,
  Cell,
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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link to="/admin">
                <ArrowLeft size={14} className="mr-1.5" /> Admin
              </Link>
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {fullName ?? "Admin"}{" "}
              {department && <span className="font-medium text-foreground">· {department}</span>}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Predictive Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A quick read on tomorrow's expected workload and where to focus your team.
          </p>
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

  const topDept = data.departmentForecasts[0];
  const recommendedAction = useMemo(() => buildAction(data), [data]);
  const weekdayInsight = useMemo(() => buildWeekdayInsight(data), [data]);
  const forecastDow = useMemo(() => {
    if (!data.forecast.date) return -1;
    return new Date(data.forecast.date).getDay();
  }, [data.forecast.date]);

  return (
    <div className="mt-6 space-y-8">
      {/* 1. Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Projected workload"
          value={data.forecast.value}
          sub={`Expected tickets ${data.forecast.date ? "on " + data.forecast.date : "tomorrow"}`}
          icon={<Activity size={16} />}
          tone="blue"
          big
        />
        <SummaryCard
          label="Trend"
          value={data.trend.direction}
          sub={`${data.trend.deltaPct >= 0 ? "▲ +" : "▼ "}${data.trend.deltaPct}% vs prior week`}
          icon={<TrendIcon size={16} />}
          tone={
            data.trend.direction === "Increasing"
              ? "warning"
              : data.trend.direction === "Decreasing"
                ? "success"
                : "blue"
          }
          textTone={trendTone}
        />
        <SummaryCard
          label="Risk level"
          value={data.risk.level}
          sub={data.risk.surgeExpected ? "Surge expected" : "Within normal range"}
          icon={<ShieldAlert size={16} />}
          tone={
            data.risk.level === "High"
              ? "warning"
              : data.risk.level === "Medium"
                ? "warning"
                : "success"
          }
          textTone={riskTone}
        />
        <SummaryCard
          label="Confidence range"
          value={`${data.forecast.lower}–${data.forecast.upper}`}
          sub="Expected ticket range"
          icon={<Target size={16} />}
          tone="purple"
        />
      </div>

      {/* 2. AI Recommendation */}
      <Panel tone="purple" icon={<Sparkles size={16} />} title="AI Recommendation">
        <p className="text-sm leading-relaxed text-foreground/90">{data.insight}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Based on recent 7-day average of {data.trend.recentAvg} tickets/day vs prior week
          {" "}({data.trend.previousAvg}).
        </p>
      </Panel>

      {/* 3. Forecast chart (compact) */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[var(--shadow-soft)]">
        <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-soft-blue/25 via-purple-accent/10 to-transparent blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Tomorrow's Forecast</h3>
            <p className="text-xs text-muted-foreground">
              Recent history with tomorrow's projection and confidence band.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <LegendDot color="hsl(var(--soft-blue))" label="History" />
            <LegendDot color="hsl(var(--purple-accent))" label="Forecast" dashed />
            <LegendDot color="hsl(var(--purple-accent))" label="Confidence" faded />
          </div>
        </div>
        <div className="relative mt-4 h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={buildChartSeries(data)} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
              <Area type="monotone" dataKey="band" stroke="none" fill="url(#bandFill)" isAnimationActive={false} name="Confidence range" />
              <Area type="monotone" dataKey="history" stroke="hsl(var(--soft-blue))" strokeWidth={2} fill="url(#histFill)" connectNulls name="Historical" />
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
                r={6}
                fill="hsl(var(--purple-accent))"
                stroke="hsl(var(--card))"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Department Workload Forecast (merged) */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-soft-blue" />
          <h3 className="text-sm font-semibold tracking-tight">Department Workload Forecast</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Predicted tickets per department for tomorrow, ranked by expected volume.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {data.departmentForecasts.length === 0 && (
            <p className="text-xs text-muted-foreground">No recent activity to project from.</p>
          )}
          {data.departmentForecasts.map((d) => {
            const maxVal = Math.max(...data.departmentForecasts.map((x) => x.predicted), 1);
            const pct = (d.predicted / maxVal) * 100;
            const cat = data.categoryForecasts.find((c) => c.category === d.department);
            const level = cat?.level ?? "Normal";
            const trend =
              level === "High"
                ? { icon: TrendingUp, tone: "text-warning", label: "Increasing" }
                : level === "Low"
                  ? { icon: TrendingDown, tone: "text-success", label: "Low workload" }
                  : { icon: Minus, tone: "text-muted-foreground", label: "Stable" };
            const TIcon = trend.icon;
            return (
              <div
                key={d.department}
                className="rounded-2xl border border-border/60 bg-background/40 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{d.department}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${trend.tone}`}>
                    <TIcon size={13} /> {trend.label}
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {d.predicted}{" "}
                  <span className="text-xs font-normal text-muted-foreground">predicted tickets</span>
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-[image:var(--gradient-hero)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Historical Weekly Trends */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-soft-blue" />
          <h3 className="text-sm font-semibold tracking-tight">Historical Weekly Trends</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Average tickets received per weekday. The highlighted bar is tomorrow's forecast day.
        </p>
        <div className="mt-4 h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dayOfWeekAverages} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                {data.dayOfWeekAverages.map((_, i) => (
                  <Cell
                    key={i}
                    fill={i === forecastDow ? "hsl(var(--purple-accent))" : "hsl(var(--soft-blue))"}
                    fillOpacity={i === forecastDow ? 1 : 0.55}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{weekdayInsight}</p>
      </div>

      {/* 6. Recommended Action */}
      <Panel tone="warning" icon={<Lightbulb size={16} />} title="Recommended Action">
        <p className="text-sm leading-relaxed text-foreground/90">{recommendedAction}</p>
        {topDept && (
          <p className="mt-2 text-xs text-muted-foreground">
            Focus department: <span className="font-medium text-foreground">{topDept.department}</span>{" "}
            · expected volume {topDept.predicted} tickets.
          </p>
        )}
      </Panel>
    </div>
  );
}

function buildAction(data: Forecast): string {
  const top = data.departmentForecasts[0];
  if (data.risk.level === "High" || data.risk.surgeExpected) {
    return `A workload surge is likely tomorrow. Consider assigning at least one additional ${
      top ? top.department + " " : ""
    }support agent and prioritising high-impact tickets early in the day.`;
  }
  if (data.trend.direction === "Increasing") {
    return `Ticket volume is trending upward (${data.trend.deltaPct}% vs last week). ${
      top ? `Monitor ${top.department} response times closely` : "Monitor response times closely"
    } and prepare backup capacity in case the trend continues.`;
  }
  if (data.trend.direction === "Decreasing") {
    return `Workload is easing compared to last week. Current staffing levels should be sufficient — a good window to clear backlog and catch up on long-running tickets.`;
  }
  return `No significant workload change expected. Current staffing levels should be sufficient${
    top ? `, with ${top.department} likely to see the most activity.` : "."
  }`;
}

function buildWeekdayInsight(data: Forecast): string {
  const days = data.dayOfWeekAverages;
  if (!days.length) return "";
  const sorted = [...days].sort((a, b) => b.avg - a.avg);
  const high = sorted[0];
  const low = sorted[sorted.length - 1];
  if (!high || !low || high.avg === 0) return "Not enough weekday history to identify a pattern yet.";
  return `Historically, ${high.day} sees the highest activity (~${high.avg}/day) while ${low.day} is the quietest (~${low.avg}/day).`;
}

function buildChartSeries(data: Forecast) {
  const hist = data.history.map((h) => ({
    date: h.date,
    history: h.count,
    forecast: null as number | null,
    band: null as [number, number] | null,
  }));
  const last = data.history[data.history.length - 1];
  if (last) {
    hist[hist.length - 1] = { ...hist[hist.length - 1], forecast: last.count };
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
  big,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "blue" | "success" | "purple" | "warning";
  textTone?: string;
  big?: boolean;
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
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 shadow-[var(--shadow-soft)] backdrop-blur-sm">
      <div
        className={`pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-gradient-to-br ${ring} blur-2xl`}
      />
      <div className="relative flex items-center gap-2">
        <span className={iconTone}>{icon}</span>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p
        className={`relative mt-2 font-semibold tracking-tight ${big ? "text-4xl" : "text-3xl"} ${
          textTone ?? "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="relative mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Panel({
  tone,
  icon,
  title,
  children,
}: {
  tone: "purple" | "warning";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const accent =
    tone === "warning"
      ? { bg: "bg-warning/15", text: "text-warning", glow: "from-warning/25 via-warning/5 to-transparent" }
      : {
          bg: "bg-purple-accent/15",
          text: "text-purple-accent",
          glow: "from-purple-accent/25 via-soft-blue/10 to-transparent",
        };
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[var(--shadow-soft)]">
      <div
        className={`pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br ${accent.glow} blur-3xl`}
      />
      <div className="relative flex items-start gap-3">
        <div className={`rounded-full ${accent.bg} p-2 ${accent.text}`}>{icon}</div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed, faded }: { color: string; label: string; dashed?: boolean; faded?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{
          background: faded ? `${color}` : color,
          opacity: faded ? 0.35 : 1,
          border: dashed ? `1px dashed ${color}` : "none",
        }}
      />
      {label}
    </span>
  );
}

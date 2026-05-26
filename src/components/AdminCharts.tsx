import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Analytics = {
  traffic: { hour: string; High: number; Medium: number; Low: number }[];
  handling: { metric: string; minutes: number }[];
  ratings: { rating: string; count: number }[];
};

function ChartCard({
  title,
  subtitle,
  children,
  accent = "blue",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: "blue" | "purple" | "warning";
}) {
  const ring =
    accent === "purple"
      ? "from-purple-accent/20 via-soft-blue/10"
      : accent === "warning"
        ? "from-warning/20 via-purple-accent/10"
        : "from-soft-blue/25 via-purple-accent/10";
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[var(--shadow-soft)] backdrop-blur-sm transition hover:shadow-[var(--shadow-glow)]">
      <div
        className={`pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br ${ring} to-transparent blur-3xl`}
      />
      <h3 className="relative text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      {subtitle && <p className="relative text-xs text-muted-foreground">{subtitle}</p>}
      <div className="relative mt-4 h-[240px] w-full">{children}</div>
    </div>
  );
}

function formatMinutes(m: number) {
  if (!m) return "0m";
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "var(--shadow-soft)",
};

function HandlingGauges({ data }: { data: Analytics["handling"] }) {
  // cap reference for each gauge (so the dial fills meaningfully)
  const max = Math.max(60, ...data.map((d) => d.minutes)) * 1.25;
  const colors = ["var(--soft-blue)", "var(--purple-accent)", "var(--warning)", "var(--success)"];
  return (
    <div className="grid h-full grid-cols-2 gap-2">
      {data.slice(0, 4).map((d, i) => {
        const pct = max ? (d.minutes / max) * 100 : 0;
        const chartData = [{ name: d.metric, value: pct, fill: colors[i % colors.length] }];
        return (
          <div key={d.metric} className="relative flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={chartData}
                startAngle={210}
                endAngle={-30}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "var(--muted)" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-4">
              <span className="text-base font-semibold text-foreground">
                {formatMinutes(d.minutes)}
              </span>
            </div>
            <p className="-mt-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {d.metric}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function RatingsGauge({ data }: { data: Analytics["ratings"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const weighted = data.reduce((s, d) => s + parseInt(d.rating, 10) * d.count, 0);
  const avg = total ? weighted / total : 0;
  const pct = (avg / 5) * 100;
  const ringData = [{ name: "avg", value: pct, fill: "var(--purple-accent)" }];

  return (
    <div className="grid h-full grid-cols-5 items-center gap-3">
      <div className="relative col-span-2 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="68%"
            outerRadius="100%"
            data={ringData}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "var(--muted)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-foreground">{avg.toFixed(1)}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            / 5 · {total}
          </span>
        </div>
      </div>
      <div className="col-span-3 space-y-1.5">
        {[...data].reverse().map((d) => {
          const w = total ? (d.count / total) * 100 : 0;
          const star = parseInt(d.rating, 10);
          const tone =
            star >= 4
              ? "from-success to-soft-blue"
              : star === 3
                ? "from-warning to-purple-accent"
                : "from-destructive to-warning";
          return (
            <div key={d.rating} className="flex items-center gap-2">
              <span className="w-6 text-right text-[11px] font-medium text-muted-foreground">
                {d.rating}★
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className="w-6 text-[11px] tabular-nums text-muted-foreground">{d.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminCharts({ data }: { data: Analytics }) {
  const axisStroke = "var(--muted-foreground)";
  const gridStroke = "var(--border)";

  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-6 pb-2 lg:grid-cols-3">
      <ChartCard
        title="Traffic Analysis"
        subtitle="Tickets per business hour (Mon–Sat · 8–17), by priority"
        accent="blue"
      >
        <ResponsiveContainer>
          <BarChart data={data.traffic} barGap={2}>
            <defs>
              <linearGradient id="g-high" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="g-med" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--warning)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="var(--warning)" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="g-low" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--success)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="var(--success)" stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.3} />
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke={axisStroke} />
            <YAxis tick={{ fontSize: 11 }} stroke={axisStroke} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="High" stackId="a" fill="url(#g-high)" />
            <Bar dataKey="Medium" stackId="a" fill="url(#g-med)" />
            <Bar dataKey="Low" stackId="a" fill="url(#g-low)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Average Handling Time"
        subtitle="Business-hours averages across all tickets"
        accent="warning"
      >
        <HandlingGauges data={data.handling} />
      </ChartCard>

      <ChartCard
        title="Ticket Rating"
        subtitle="User satisfaction distribution"
        accent="purple"
      >
        <RatingsGauge data={data.ratings} />
      </ChartCard>
    </div>
  );
}

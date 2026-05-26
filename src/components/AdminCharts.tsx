import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-3 h-[220px] w-full">{children}</div>
    </div>
  );
}

function formatMinutes(m: number) {
  if (!m) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function AdminCharts({ data }: { data: Analytics }) {
  const tooltipStyle = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--foreground)",
  };
  const axisStroke = "var(--muted-foreground)";
  const gridStroke = "var(--border)";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard
        title="Traffic Analysis"
        subtitle="Tickets submitted in business hours (Mon–Sat · 8–17), by priority"
      >
        <ResponsiveContainer>
          <BarChart data={data.traffic}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.3} />
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke={axisStroke} />
            <YAxis tick={{ fontSize: 11 }} stroke={axisStroke} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="High" stackId="a" fill="var(--destructive)" />
            <Bar dataKey="Medium" stackId="a" fill="var(--warning)" />
            <Bar dataKey="Low" stackId="a" fill="var(--success)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Average Handling Time" subtitle="Business-hours average across all tickets">
        <ResponsiveContainer>
          <BarChart data={data.handling} layout="vertical" margin={{ left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.3} />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              stroke={axisStroke}
              tickFormatter={formatMinutes}
            />
            <YAxis
              type="category"
              dataKey="metric"
              width={110}
              tick={{ fontSize: 11 }}
              stroke={axisStroke}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [formatMinutes(v), "Avg time"]}
            />
            <Bar dataKey="minutes" radius={[0, 8, 8, 0]} fill="var(--primary)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Ticket Rating" subtitle="User satisfaction distribution">
        <ResponsiveContainer>
          <BarChart data={data.ratings}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.3} />
            <XAxis dataKey="rating" tick={{ fontSize: 11 }} stroke={axisStroke} />
            <YAxis tick={{ fontSize: 11 }} stroke={axisStroke} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="var(--purple-accent)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// Workload forecasting based on historical ticket data.
// Lightweight model: moving average + trend + day-of-week seasonality.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";

type Department = "HR" | "IT" | "Finance" | "Operations";
type TrendDirection = "Increasing" | "Stable" | "Decreasing";
type RiskLevel = "Low" | "Medium" | "High";

export type Forecast = {
  hasEnoughData: boolean;
  message?: string;
  scope: string;
  generatedAt: string;
  history: { date: string; count: number }[]; // last 30 days
  forecast: {
    date: string;
    value: number;
    lower: number;
    upper: number;
  };
  trend: {
    direction: TrendDirection;
    recentAvg: number;
    previousAvg: number;
    deltaPct: number;
  };
  risk: {
    level: RiskLevel;
    surgeExpected: boolean;
    threshold: number;
  };
  dayOfWeekAverages: { day: string; avg: number }[];
  categoryForecasts: { category: string; predicted: number; level: "High" | "Normal" | "Low" }[];
  departmentForecasts: { department: string; predicted: number }[];
  insight: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export const getWorkloadForecast = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .handler(async ({ context }): Promise<Forecast> => {
    const dept = (context.department ?? null) as Department | null;

    // Pull up to 90 days of historical tickets
    const since = new Date();
    since.setDate(since.getDate() - 90);

    let q = supabaseAdmin
      .from("tickets")
      .select("id, created_at, categories, priority, status")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })
      .limit(5000);
    if (dept) q = q.contains("categories", [dept]);

    const { data: tickets, error } = await q;
    if (error) throw new Error(error.message);
    const rows = tickets ?? [];

    const scope = dept ?? "All Departments";
    const generatedAt = new Date().toISOString();

    if (rows.length < 7) {
      return {
        hasEnoughData: false,
        message: "Not enough historical ticket data is available to generate a reliable forecast.",
        scope,
        generatedAt,
        history: [],
        forecast: { date: "", value: 0, lower: 0, upper: 0 },
        trend: { direction: "Stable", recentAvg: 0, previousAvg: 0, deltaPct: 0 },
        risk: { level: "Low", surgeExpected: false, threshold: 0 },
        dayOfWeekAverages: DAYS.map((d) => ({ day: d, avg: 0 })),
        categoryForecasts: [],
        departmentForecasts: [],
        insight: "",
      };
    }

    // Build continuous daily series from earliest ticket to today
    const earliest = new Date(rows[0].created_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDay = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());

    const daily = new Map<string, number>();
    for (
      let d = new Date(startDay);
      d <= today;
      d.setDate(d.getDate() + 1)
    ) {
      daily.set(toDateKey(d.toISOString()), 0);
    }
    for (const t of rows) {
      const k = toDateKey(t.created_at);
      daily.set(k, (daily.get(k) ?? 0) + 1);
    }

    const series = Array.from(daily.entries()).map(([date, count]) => ({ date, count }));
    const counts = series.map((s) => s.count);

    // Moving averages
    const last7 = counts.slice(-7);
    const prev7 = counts.slice(-14, -7);
    const recentAvg = mean(last7);
    const previousAvg = mean(prev7);
    const deltaPct = previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;
    const direction: TrendDirection =
      deltaPct > 10 ? "Increasing" : deltaPct < -10 ? "Decreasing" : "Stable";

    // Day-of-week averages
    const dowBuckets: number[][] = Array.from({ length: 7 }, () => []);
    for (const s of series) {
      const d = new Date(s.date);
      dowBuckets[d.getDay()].push(s.count);
    }
    const dowAvg = dowBuckets.map((b) => mean(b));
    const overallAvg = mean(counts);

    // Tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowDow = tomorrow.getDay();
    const dowAdjustment = dowAvg[tomorrowDow] - overallAvg;

    // Trend adjustment (small nudge)
    const trendAdjustment = (recentAvg - previousAvg) * 0.5;

    let forecastValue = recentAvg + trendAdjustment + dowAdjustment;
    forecastValue = Math.max(0, Math.round(forecastValue));

    // Confidence range using stddev of last 14 days
    const recent14 = counts.slice(-14);
    const sd = stddev(recent14);
    const lower = Math.max(0, Math.round(forecastValue - sd));
    const upper = Math.round(forecastValue + sd);

    // Surge detection — 90th percentile of historical daily counts
    const threshold = percentile(counts, 90);
    const surgeExpected = forecastValue >= threshold && threshold > 0;
    const risk: RiskLevel = surgeExpected
      ? "High"
      : forecastValue > overallAvg * 1.15
        ? "Medium"
        : "Low";

    // Category & department forecasts (proportional to last 14 days share)
    const lastNDays = 14;
    const recentCutoff = new Date(today);
    recentCutoff.setDate(today.getDate() - lastNDays);
    const recentTickets = rows.filter((t) => new Date(t.created_at) >= recentCutoff);

    const catCounts = new Map<string, number>();
    for (const t of recentTickets) {
      const cats = (t.categories ?? []) as string[];
      for (const c of cats) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    }
    const totalRecent = recentTickets.length || 1;
    const departmentForecasts = Array.from(catCounts.entries())
      .map(([department, count]) => ({
        department,
        predicted: Math.max(0, Math.round((count / totalRecent) * forecastValue)),
      }))
      .sort((a, b) => b.predicted - a.predicted);

    // Category forecasts — same as department for this schema (categories ARE departments)
    // Use priority distribution to flavour "level"
    const allCats = Array.from(catCounts.values());
    const catP75 = percentile(allCats, 75);
    const catP25 = percentile(allCats, 25);
    const categoryForecasts = Array.from(catCounts.entries())
      .map(([category, count]) => ({
        category,
        predicted: Math.max(0, Math.round((count / totalRecent) * forecastValue)),
        level: (count >= catP75 ? "High" : count <= catP25 ? "Low" : "Normal") as
          | "High"
          | "Normal"
          | "Low",
      }))
      .sort((a, b) => b.predicted - a.predicted);

    // Plain-language insight
    const topDept = departmentForecasts[0];
    const trendPhrase =
      direction === "Increasing"
        ? "expected to increase"
        : direction === "Decreasing"
          ? "expected to decrease"
          : "expected to remain stable";
    const dowName = DAYS[tomorrowDow];
    const surgePhrase = surgeExpected
      ? " A workload surge is likely — consider allocating additional support resources."
      : risk === "Medium"
        ? " Volume is moderately elevated; monitor closely."
        : "";
    const deptPhrase = topDept
      ? ` The ${topDept.department} department is expected to receive the highest number of requests (~${topDept.predicted}).`
      : "";
    const insight = `Ticket volume is ${trendPhrase} on ${dowName} based on recent activity and historical weekday patterns.${deptPhrase}${surgePhrase}`;

    // Trim history to last 30 days for the chart
    const history = series.slice(-30);

    return {
      hasEnoughData: true,
      scope,
      generatedAt,
      history,
      forecast: {
        date: toDateKey(tomorrow.toISOString()),
        value: forecastValue,
        lower,
        upper,
      },
      trend: {
        direction,
        recentAvg: Math.round(recentAvg * 10) / 10,
        previousAvg: Math.round(previousAvg * 10) / 10,
        deltaPct: Math.round(deltaPct),
      },
      risk: {
        level: risk,
        surgeExpected,
        threshold: Math.round(threshold * 10) / 10,
      },
      dayOfWeekAverages: DAYS.map((day, i) => ({ day, avg: Math.round(dowAvg[i] * 10) / 10 })),
      categoryForecasts,
      departmentForecasts,
      insight,
    };
  });

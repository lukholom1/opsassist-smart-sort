// Admin analytics + AI insights. All times computed in business hours (Mon–Sat 8–17).
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";

const BUSINESS_DAYS = new Set([1, 2, 3, 4, 5, 6]); // Mon..Sat
const START_HOUR = 8;
const END_HOUR = 17;

export function businessMinutesBetween(fromIso: string | null, toIso: string | null): number {
  if (!fromIso || !toIso) return 0;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (!(to > from)) return 0;
  let total = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (cursor <= to) {
    if (BUSINESS_DAYS.has(cursor.getDay())) {
      const dayStart = new Date(cursor);
      dayStart.setHours(START_HOUR, 0, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(END_HOUR, 0, 0, 0);
      const s = from > dayStart ? from : dayStart;
      const e = to < dayEnd ? to : dayEnd;
      if (e > s) total += (e.getTime() - s.getTime()) / 60000;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.round(total);
}

type Department = "HR" | "IT" | "Finance" | "Operations";

export type AnalyticsRange = { from?: string; to?: string; label?: string };

function parseRange(input: unknown): AnalyticsRange {
  const r = (input ?? {}) as AnalyticsRange;
  return {
    from: typeof r.from === "string" ? r.from : undefined,
    to: typeof r.to === "string" ? r.to : undefined,
    label: typeof r.label === "string" ? r.label : undefined,
  };
}

async function scopedTickets(dept: Department | null, range?: AnalyticsRange) {
  let q = supabaseAdmin
    .from("tickets")
    .select("id, created_at, resolved_at, priority, categories, status, resolved_by_ai")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (dept) q = q.contains("categories", [dept]);
  if (range?.from) q = q.gte("created_at", range.from);
  if (range?.to) q = q.lte("created_at", range.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const getAdminAnalytics = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator(parseRange)
  .handler(async ({ context, data }) => {
    const dept = (context.department ?? null) as Department | null;
    const tickets = await scopedTickets(dept, data);
    const ids = tickets.map((t) => t.id);

    // Notes for response calculations
    const { data: notes } = ids.length
      ? await supabaseAdmin
          .from("ticket_notes")
          .select("ticket_id, author_role, created_at")
          .in("ticket_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] as { ticket_id: string; author_role: string; created_at: string }[] };

    // Feedback for ratings
    const { data: feedback } = ids.length
      ? await supabaseAdmin
          .from("ticket_feedback")
          .select("ticket_id, rating")
          .in("ticket_id", ids)
      : { data: [] as { ticket_id: string; rating: number }[] };

    // Traffic: hour x priority counts during business hours
    const traffic = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => ({
      hour: `${START_HOUR + i}:00`,
      High: 0,
      Medium: 0,
      Low: 0,
    }));
    for (const t of tickets) {
      const d = new Date(t.created_at);
      if (!BUSINESS_DAYS.has(d.getDay())) continue;
      const h = d.getHours();
      if (h < START_HOUR || h >= END_HOUR) continue;
      const bucket = traffic[h - START_HOUR];
      const p = (t.priority as "High" | "Medium" | "Low") ?? "Medium";
      if (p === "High" || p === "Medium" || p === "Low") bucket[p] += 1;
    }

    // Notes per ticket sorted asc
    const notesByTicket = new Map<string, { author_role: string; created_at: string }[]>();
    for (const n of notes ?? []) {
      const arr = notesByTicket.get(n.ticket_id) ?? [];
      arr.push({ author_role: n.author_role, created_at: n.created_at });
      notesByTicket.set(n.ticket_id, arr);
    }

    const firstResp: number[] = [];
    const resp: number[] = [];
    const resolution: number[] = [];

    for (const t of tickets) {
      const tNotes = notesByTicket.get(t.id) ?? [];
      const firstAdminNote = tNotes.find((n) => n.author_role === "admin");
      if (firstAdminNote) {
        firstResp.push(businessMinutesBetween(t.created_at, firstAdminNote.created_at));
      } else if (t.resolved_at) {
        firstResp.push(businessMinutesBetween(t.created_at, t.resolved_at));
      }

      // Avg admin response time: for each user note followed by an admin note
      for (let i = 0; i < tNotes.length - 1; i++) {
        if (tNotes[i].author_role === "user" && tNotes[i + 1].author_role === "admin") {
          resp.push(businessMinutesBetween(tNotes[i].created_at, tNotes[i + 1].created_at));
        }
      }

      if (t.resolved_at) {
        resolution.push(businessMinutesBetween(t.created_at, t.resolved_at));
      }
    }

    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

    const handling = [
      { metric: "First Response", minutes: avg(firstResp) },
      { metric: "Response Time", minutes: avg(resp) },
      { metric: "Resolution", minutes: avg(resolution) },
    ];

    // Ratings distribution
    const ratings = [1, 2, 3, 4, 5].map((star) => ({
      rating: `${star}★`,
      count: (feedback ?? []).filter((f) => f.rating === star).length,
    }));
    const avgRating =
      (feedback ?? []).length === 0
        ? 0
        : Math.round(
            ((feedback ?? []).reduce((s, f) => s + f.rating, 0) / (feedback ?? []).length) * 10,
          ) / 10;

    return {
      scope: dept ?? "All Departments",
      totals: {
        tickets: tickets.length,
        resolved: tickets.filter((t) => t.status === "Resolved").length,
        byAi: tickets.filter((t) => t.resolved_by_ai).length,
        feedbackCount: (feedback ?? []).length,
        avgRating,
      },
      traffic,
      handling,
      ratings,
    };
  });

// ---- AI insights report ----
export const generateInsightsReport = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator(parseRange)
  .handler(async ({ context, data }) => {
    const dept = (context.department ?? null) as Department | null;
    const tickets = await scopedTickets(dept, data);
    const ids = tickets.map((t) => t.id);

    const { data: feedback } = ids.length
      ? await supabaseAdmin.from("ticket_feedback").select("ticket_id, rating, comment").in("ticket_id", ids)
      : { data: [] as { ticket_id: string; rating: number; comment: string | null }[] };

    const total = tickets.length;
    const resolved = tickets.filter((t) => t.status === "Resolved").length;
    const byAi = tickets.filter((t) => t.resolved_by_ai).length;
    const byPriority = {
      High: tickets.filter((t) => t.priority === "High").length,
      Medium: tickets.filter((t) => t.priority === "Medium").length,
      Low: tickets.filter((t) => t.priority === "Low").length,
    };
    const ratings = (feedback ?? []).map((f) => f.rating);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const resolvedTimes = tickets
      .filter((t) => t.resolved_at)
      .map((t) => businessMinutesBetween(t.created_at, t.resolved_at));
    const avgResMin = resolvedTimes.length
      ? Math.round(resolvedTimes.reduce((a, b) => a + b, 0) / resolvedTimes.length)
      : 0;

    const summary = {
      scope: dept ?? "All Departments (Super Admin)",
      generated_at: new Date().toISOString(),
      total_tickets: total,
      resolved,
      resolution_rate: total ? Math.round((resolved / total) * 100) : 0,
      resolved_by_ai: byAi,
      by_priority: byPriority,
      avg_rating: Math.round(avgRating * 10) / 10,
      feedback_count: ratings.length,
      avg_business_resolution_minutes: avgResMin,
      comments_sample: (feedback ?? [])
        .filter((f) => f.comment)
        .slice(0, 12)
        .map((f) => ({ rating: f.rating, comment: f.comment })),
    };

    const apiKey = process.env.LOVABLE_API_KEY;
    const fallbackNarrative = buildFallbackNarrative(summary);
    if (!apiKey) return { summary, narrative: fallbackNarrative, source: "fallback" as const };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are a senior operations analyst. Given JSON support-ticket statistics, produce a concise executive insights report. Use these sections, each as a header on its own line followed by 3-6 short bullet lines starting with '- ': OVERVIEW, KEY METRICS, STRENGTHS, RISKS, RECOMMENDATIONS. Plain text only, no markdown symbols, no asterisks. Keep total under 450 words.",
            },
            { role: "user", content: JSON.stringify(summary) },
          ],
        }),
      });
      if (!res.ok) return { summary, narrative: fallbackNarrative, source: "fallback" as const };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) return { summary, narrative: fallbackNarrative, source: "fallback" as const };
      return { summary, narrative: text, source: "ai" as const };
    } catch {
      return { summary, narrative: fallbackNarrative, source: "fallback" as const };
    }
  });

function buildFallbackNarrative(s: {
  scope: string;
  total_tickets: number;
  resolved: number;
  resolution_rate: number;
  resolved_by_ai: number;
  by_priority: { High: number; Medium: number; Low: number };
  avg_rating: number;
  avg_business_resolution_minutes: number;
}) {
  return [
    "OVERVIEW",
    `- Scope: ${s.scope}`,
    `- Total tickets analysed: ${s.total_tickets}`,
    `- Resolution rate: ${s.resolution_rate}%`,
    "",
    "KEY METRICS",
    `- Resolved tickets: ${s.resolved}`,
    `- Resolved by AI: ${s.resolved_by_ai}`,
    `- Average business-hours resolution: ${s.avg_business_resolution_minutes} min`,
    `- Average satisfaction: ${s.avg_rating || "n/a"} / 5`,
    `- Priority mix: High ${s.by_priority.High} · Medium ${s.by_priority.Medium} · Low ${s.by_priority.Low}`,
    "",
    "RECOMMENDATIONS",
    "- Continue monitoring high-priority traffic during peak business hours.",
    "- Encourage feedback collection to refine future analysis.",
  ].join("\n");
}

// ---- Deep AI insights: common issues, fixes, time analysis ----
type DeepInsights = {
  scope: string;
  generated_at: string;
  source: "ai" | "fallback";
  stats: {
    total: number;
    resolved: number;
    open: number;
    in_progress: number;
    avg_resolution_minutes: number;
    median_resolution_minutes: number;
    fastest_minutes: number;
    slowest_minutes: number;
    backlog_over_24h: number;
    ai_resolution_rate: number;
  };
  common_issues: { theme: string; count: number; example: string }[];
  common_fixes: { fix: string; applies_to: string }[];
  time_analysis: string;
  business_insights: string[];
  recommendations: string[];
};

export const generateDeepInsights = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .handler(async ({ context }): Promise<DeepInsights> => {
    const dept = (context.department ?? null) as Department | null;

    let q = supabaseAdmin
      .from("tickets")
      .select("id, title, details, category, categories, priority, status, created_at, resolved_at, resolved_by_ai, resolution_source")
      .order("created_at", { ascending: false })
      .limit(500);
    if (dept) q = q.contains("categories", [dept]);
    const { data: tickets, error } = await q;
    if (error) throw new Error(error.message);
    const rows = tickets ?? [];
    const ids = rows.map((t) => t.id);

    const { data: notes } = ids.length
      ? await supabaseAdmin
          .from("ticket_notes")
          .select("ticket_id, author_role, body, created_at")
          .in("ticket_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] as { ticket_id: string; author_role: string; body: string; created_at: string }[] };

    const notesByTicket = new Map<string, { author_role: string; body: string }[]>();
    for (const n of notes ?? []) {
      const arr = notesByTicket.get(n.ticket_id) ?? [];
      arr.push({ author_role: n.author_role, body: n.body });
      notesByTicket.set(n.ticket_id, arr);
    }

    // Stats
    const resTimes = rows
      .filter((t) => t.resolved_at)
      .map((t) => businessMinutesBetween(t.created_at, t.resolved_at))
      .sort((a, b) => a - b);
    const median = resTimes.length ? resTimes[Math.floor(resTimes.length / 2)] : 0;
    const avg = resTimes.length ? Math.round(resTimes.reduce((a, b) => a + b, 0) / resTimes.length) : 0;
    const now = Date.now();
    const backlogOver24h = rows.filter(
      (t) => t.status !== "Resolved" && now - new Date(t.created_at).getTime() > 24 * 3600 * 1000,
    ).length;
    const total = rows.length;
    const resolved = rows.filter((t) => t.status === "Resolved").length;
    const aiResolved = rows.filter((t) => t.resolved_by_ai).length;

    const stats = {
      total,
      resolved,
      open: rows.filter((t) => t.status === "Open").length,
      in_progress: rows.filter((t) => t.status === "In Progress").length,
      avg_resolution_minutes: avg,
      median_resolution_minutes: median,
      fastest_minutes: resTimes[0] ?? 0,
      slowest_minutes: resTimes[resTimes.length - 1] ?? 0,
      backlog_over_24h: backlogOver24h,
      ai_resolution_rate: total ? Math.round((aiResolved / total) * 100) : 0,
    };

    // Compact sample for the model
    const sample = rows.slice(0, 120).map((t) => ({
      title: t.title,
      details: (t.details ?? "").slice(0, 280),
      category: t.category,
      priority: t.priority,
      status: t.status,
      resolution_minutes: t.resolved_at ? businessMinutesBetween(t.created_at, t.resolved_at) : null,
      resolved_by_ai: t.resolved_by_ai,
      resolution_notes: (notesByTicket.get(t.id) ?? [])
        .filter((n) => n.author_role === "admin" || n.author_role === "it_personnel")
        .slice(0, 2)
        .map((n) => n.body.slice(0, 200)),
    }));

    const scope = dept ?? "All Departments (Super Admin)";
    const fallback: DeepInsights = {
      scope,
      generated_at: new Date().toISOString(),
      source: "fallback",
      stats,
      common_issues: topThemes(rows.map((t) => `${t.title}`)).map((x) => ({
        theme: x.term,
        count: x.count,
        example: rows.find((t) => t.title.toLowerCase().includes(x.term))?.title ?? x.term,
      })),
      common_fixes: [],
      time_analysis: `Average resolution ${avg} business minutes (median ${median}). Fastest ${stats.fastest_minutes} min, slowest ${stats.slowest_minutes} min. ${backlogOver24h} tickets unresolved beyond 24h.`,
      business_insights: [
        `${stats.ai_resolution_rate}% of tickets resolved automatically by AI.`,
        `Resolution rate: ${total ? Math.round((resolved / total) * 100) : 0}%.`,
      ],
      recommendations: ["Add AI key to enable deeper analysis."],
    };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey || rows.length === 0) return fallback;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You analyse support-ticket data and return STRICT JSON only — no prose, no markdown fences. Identify recurring issue themes, common fixes used by admins, time/resolution patterns, and business insights a department head would care about. Be specific and reference actual ticket patterns from the data.",
            },
            {
              role: "user",
              content: `Scope: ${scope}. Stats: ${JSON.stringify(stats)}. Tickets sample: ${JSON.stringify(sample)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_insights",
                description: "Structured deep insights",
                parameters: {
                  type: "object",
                  properties: {
                    common_issues: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          theme: { type: "string" },
                          count: { type: "number" },
                          example: { type: "string" },
                        },
                        required: ["theme", "count", "example"],
                        additionalProperties: false,
                      },
                    },
                    common_fixes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          fix: { type: "string" },
                          applies_to: { type: "string" },
                        },
                        required: ["fix", "applies_to"],
                        additionalProperties: false,
                      },
                    },
                    time_analysis: { type: "string" },
                    business_insights: { type: "array", items: { type: "string" } },
                    recommendations: { type: "array", items: { type: "string" } },
                  },
                  required: ["common_issues", "common_fixes", "time_analysis", "business_insights", "recommendations"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "report_insights" } },
        }),
      });
      if (!res.ok) return fallback;
      const json = (await res.json()) as {
        choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
      };
      const argStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argStr) return fallback;
      const parsed = JSON.parse(argStr) as Omit<DeepInsights, "scope" | "generated_at" | "source" | "stats">;
      return { scope, generated_at: new Date().toISOString(), source: "ai", stats, ...parsed };
    } catch {
      return fallback;
    }
  });

function topThemes(titles: string[]) {
  const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "have", "not", "you", "are", "was", "but", "all", "can", "issue", "problem", "help", "need", "please", "request"]);
  const counts = new Map<string, number>();
  for (const t of titles) {
    for (const w of t.toLowerCase().split(/[^a-z]+/)) {
      if (w.length < 4 || stop.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term, count]) => ({ term, count }));
}

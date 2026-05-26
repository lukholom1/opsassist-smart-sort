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

async function scopedTickets(dept: Department | null) {
  let q = supabaseAdmin
    .from("tickets")
    .select("id, created_at, resolved_at, priority, categories, status, resolved_by_ai")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (dept) q = q.contains("categories", [dept]);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async ({ context }) => {
    const dept = (context.department ?? null) as Department | null;
    const tickets = await scopedTickets(dept);
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
  .handler(async ({ context }) => {
    const dept = (context.department ?? null) as Department | null;
    const tickets = await scopedTickets(dept);
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

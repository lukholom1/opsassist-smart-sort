import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";

const DEPARTMENTS = ["HR", "IT", "Finance", "Operations"] as const;
const PRIORITIES = ["High", "Medium", "Low"] as const;
const STATUSES = ["Open", "In Progress", "Resolved"] as const;
const TONES = ["formal", "friendly", "urgent", "empathetic"] as const;

type Department = (typeof DEPARTMENTS)[number];
type Priority = (typeof PRIORITIES)[number];
type Tone = (typeof TONES)[number];

// ----------------------------- Classification (multi-department) -----------------------------

function heuristicClassify(
  title: string,
  details: string,
): { categories: Department[]; priority: Priority } {
  const text = `${title} ${details}`.toLowerCase();

  const cats = new Set<Department>();

  if (
    /(payroll|salary|leave|hr|hiring|benefit|vacation|holiday|harass|discriminat|onboard)/.test(
      text,
    )
  ) {
    cats.add("HR");
  }

  if (
    /(laptop|wifi|wi-fi|vpn|server|password|login|software|computer|email|network|system|bug|outage|router|access point|printer)/.test(
      text,
    )
  ) {
    cats.add("IT");
  }

  if (
    /(invoice|payment|reimburs|finance|budget|expense|tax|refund|salary|payroll)/.test(
      text,
    )
  ) {
    cats.add("Finance");
  }

  if (
    /(facilit|office|ceiling|door|cleaning|supplies|building|maintenance|elevator|hvac|operations|logistics)/.test(
      text,
    )
  ) {
    cats.add("Operations");
  }

  if (cats.size === 0) {
    cats.add("Operations");
  }

  let priority: Priority = "Medium";

  if (
    /(urgent|asap|immediately|critical|down|outage|cannot work|blocker|emergency)/.test(
      text,
    )
  ) {
    priority = "High";
  } else if (
    /(whenever|low priority|minor|nice to have|sometime)/.test(text)
  ) {
    priority = "Low";
  }

  return {
    categories: Array.from(cats),
    priority,
  };
}

async function classifyWithAI(title: string, details: string) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return heuristicClassify(title, details);
  }

  try {
    const prompt = `
You are an AI ticket classifier.

Classify the support request into one or more departments:
HR, IT, Finance, Operations.

Also determine priority:
High, Medium, or Low.

Return ONLY valid JSON.

Example:
{
  "categories": ["IT", "Operations"],
  "priority": "High"
}

Title: ${title}

Details:
${details}
`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      },
    );

    if (!res.ok) {
      console.error("Gemini API error:", await res.text());
      return heuristicClassify(title, details);
    }

    const json = await res.json();

    const content =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const cleaned = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    const fallback = heuristicClassify(title, details);

    const cats: Department[] = Array.isArray(parsed.categories)
      ? parsed.categories.filter(
          (c: unknown): c is Department =>
            typeof c === "string" &&
            (DEPARTMENTS as readonly string[]).includes(c),
        )
      : [];

    return {
      categories: cats.length ? cats : fallback.categories,
      priority: (
        (PRIORITIES as readonly string[]).includes(parsed.priority)
          ? parsed.priority
          : fallback.priority
      ) as Priority,
    };
  } catch (err) {
    console.error("Classification failed:", err);
    return heuristicClassify(title, details);
  }
}

// ----------------------------- Load-balanced assignment -----------------------------

async function pickLeastBusyAdminForDept(
  dept: Department,
): Promise<string | null> {
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("department", dept);

  const profIds = (profs ?? []).map((p) => p.id);

  if (profIds.length === 0) return null;

  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .in("user_id", profIds);

  const adminIds = (roleRows ?? []).map((r) => r.user_id);

  if (adminIds.length === 0) return null;

  const { data: active } = await supabaseAdmin
    .from("ticket_assignments")
    .select("assigned_to")
    .in("status", ["Open", "In Progress"])
    .in("assigned_to", adminIds);

  const counts = new Map(
    adminIds.map((id) => [id, 0] as [string, number]),
  );

  for (const row of active ?? []) {
    if (row.assigned_to) {
      counts.set(
        row.assigned_to,
        (counts.get(row.assigned_to) ?? 0) + 1,
      );
    }
  }

  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

// ----------------------------- Submit ticket -----------------------------

const SubmitSchema = z.object({
  title: z.string().trim().min(3).max(200),
  details: z.string().trim().min(5).max(2000),
});

export const submitTicket = createServerFn({ method: "POST" })
  .middleware([requireRole(["employee", "admin"])])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { categories, priority } = await classifyWithAI(
      data.title,
      data.details,
    );

    const userName = context.profile?.full_name ?? "User";

    const { data: row, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        user_id: context.userId,
        user_name: userName,
        title: data.title,
        details: data.details,
        category: categories[0],
        categories,
        priority,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    const rows = await Promise.all(
      categories.map(async (dept) => ({
        ticket_id: row.id,
        department: dept,
        assigned_to: await pickLeastBusyAdminForDept(dept),
      })),
    );

    const { error: aerr } = await supabaseAdmin
      .from("ticket_assignments")
      .insert(rows);

    if (aerr) throw new Error(aerr.message);

    return { id: row.id, categories, priority };
  });

// ----------------------------- Listings -----------------------------

export type AssignmentRow = {
  id: string;
  ticket_id: string;
  department: string;
  assigned_to: string | null;
  status: string;
  resolved_at: string | null;
  resolved_by_ai: boolean;
  created_at: string;
  assignee_name?: string | null;
};

async function fetchAssignmentsForTickets(ticketIds: string[]) {
  const byTicket = new Map<string, AssignmentRow[]>();

  if (ticketIds.length === 0) return byTicket;

  const { data } = await supabaseAdmin
    .from("ticket_assignments")
    .select("*")
    .in("ticket_id", ticketIds);

  const rows = (data ?? []) as AssignmentRow[];

  for (const a of rows) {
    const arr = byTicket.get(a.ticket_id) ?? [];
    arr.push(a);
    byTicket.set(a.ticket_id, arr);
  }

  const assigneeIds = Array.from(
    new Set(rows.map((a) => a.assigned_to).filter((v): v is string => !!v)),
  );

  if (assigneeIds.length) {
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", assigneeIds);

    const nameById = new Map(
      (profs ?? []).map((p) => [p.id, p.full_name]),
    );

    for (const arr of byTicket.values()) {
      for (const a of arr) {
        a.assignee_name = a.assigned_to
          ? (nameById.get(a.assigned_to) ?? null)
          : null;
      }
    }
  }

  return byTicket;
}

async function fetchFeedbackForTickets(ticketIds: string[]) {
  if (ticketIds.length === 0) {
    return new Map<
      string,
      { rating: number; comment: string | null }
    >();
  }

  const { data } = await supabaseAdmin
    .from("ticket_feedback")
    .select("ticket_id, rating, comment")
    .in("ticket_id", ticketIds);

  return new Map(
    (data ?? []).map((f) => [
      f.ticket_id,
      {
        rating: f.rating,
        comment: f.comment,
      },
    ]),
  );
}

// ----------------------------- My Tickets -----------------------------

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((t) => t.id);

    const [assignments, feedback] = await Promise.all([
      fetchAssignmentsForTickets(ids),
      fetchFeedbackForTickets(ids),
    ]);

    return {
      tickets: (data ?? []).map((t) => ({
        ...t,
        assignments: assignments.get(t.id) ?? [],
        feedback: feedback.get(t.id) ?? null,
      })),
    };
  });

// ----------------------------- Department Tickets -----------------------------

export const listDeptTickets = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async ({ context }) => {
    const dept = context.department as Department | null;

    let q = supabaseAdmin
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (dept) {
      q = q.contains("categories", [dept]);
    }

    const { data, error } = await q;

    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((t) => t.id);

    const [assignments, feedback] = await Promise.all([
      fetchAssignmentsForTickets(ids),
      fetchFeedbackForTickets(ids),
    ]);

    return {
      isSuperAdmin: dept === null,
      department: dept,
      tickets: (data ?? []).map((t) => ({
        ...t,
        assignments: assignments.get(t.id) ?? [],
        feedback: feedback.get(t.id) ?? null,
        my_assignment:
          (assignments.get(t.id) ?? []).find(
            (a) => !dept || a.department === dept,
          ) ?? null,
      })),
    };
  });

// ----------------------------- Updates -----------------------------

const UpdateAssignmentSchema = z.object({
  assignment_id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export const updateAssignmentStatus = createServerFn({
  method: "POST",
})
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) =>
    UpdateAssignmentSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const dept = context.department as Department | null;

    if (dept) {
      const { data: row } = await supabaseAdmin
        .from("ticket_assignments")
        .select("department")
        .eq("id", data.assignment_id)
        .single();

      if (row?.department !== dept) {
        throw new Error("Not in your department.");
      }
    }

    const patch: {
      status: typeof data.status;
      resolved_at?: string;
    } = {
      status: data.status,
    };

    if (data.status === "Resolved") {
      patch.resolved_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from("ticket_assignments")
      .update(patch)
      .eq("id", data.assignment_id);

    if (error) throw new Error(error.message);

    return { ok: true };
  });

// ----------------------------- Resolve by AI -----------------------------

const ResolveByAiSchema = z.object({
  id: z.string().uuid(),
});

export const markResolvedByAI = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    ResolveByAiSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("user_id")
      .eq("id", data.id)
      .single();

    if (t?.user_id !== context.userId) {
      throw new Error("Not your ticket.");
    }

    const { error: aerr } = await supabaseAdmin
      .from("ticket_assignments")
      .update({
        status: "Resolved",
        resolved_at: new Date().toISOString(),
        resolved_by_ai: true,
      })
      .eq("ticket_id", data.id)
      .neq("status", "Resolved");

    if (aerr) throw new Error(aerr.message);

    await supabaseAdmin
      .from("tickets")
      .update({
        status: "Resolved",
        resolved_at: new Date().toISOString(),
        resolved_by_ai: true,
        resolution_source: "ai",
      })
      .eq("id", data.id);

    return { ok: true };
  });

// ----------------------------- Feedback -----------------------------

const FeedbackSchema = z.object({
  ticket_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const submitFeedback = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FeedbackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select(
        "user_id, status, resolution_source, resolved_by_ai",
      )
      .eq("id", data.ticket_id)
      .single();

    if (!t || t.user_id !== context.userId) {
      throw new Error("Not your ticket.");
    }

    if (t.status !== "Resolved") {
      throw new Error("Ticket is not resolved yet.");
    }

    const { error } = await supabaseAdmin
      .from("ticket_feedback")
      .upsert(
        {
          ticket_id: data.ticket_id,
          user_id: context.userId,
          rating: data.rating,
          comment: data.comment ?? null,
          resolution_source:
            t.resolution_source ??
            (t.resolved_by_ai ? "ai" : "department"),
        },
        { onConflict: "ticket_id" },
      );

    if (error) throw new Error(error.message);

    return { ok: true };
  });

// ----------------------------- AI Response Generator -----------------------------

const ALLOWED_TOPIC_REFUSAL =
  "This platform only supports HR, IT, Finance, and Operations related requests.";

const DEPT_BEHAVIOR: Record<Department, string> = {
  IT: "You are IT Support. You MAY troubleshoot, suggest fixes, and attempt resolution.",
  Operations:
    "You are Operations. You MAY suggest operational procedures and workflow steps.",
  HR: "You are HR. You MUST NOT give legal advice or make HR decisions.",
  Finance:
    "You are Finance. You MUST NOT give tax advice or salary decisions.",
};

export function autoTone(
  categories: string[],
  priority: string,
  text: string,
): Tone {
  const t = text.toLowerCase();

  if (
    categories.includes("HR") ||
    /(harass|discriminat|sensitive|complaint)/.test(t)
  ) {
    return "empathetic";
  }

  if (
    priority === "High" ||
    /(outage|down|critical|asap|urgent|emergency)/.test(t)
  ) {
    return "urgent";
  }

  if (
    categories.includes("Finance") ||
    /(payroll|salary|invoice|tax)/.test(t)
  ) {
    return "formal";
  }

  return "friendly";
}

function templateResponse(input: {
  user_name: string;
  title: string;
  categories: string[];
  tone: Tone;
}) {
  const list = input.categories.join(" & ");

  const opener =
    input.tone === "friendly"
      ? `Hi ${input.user_name}, thanks for reaching out!`
      : input.tone === "urgent"
        ? `Hello ${input.user_name}, we've flagged this as urgent and are acting now.`
        : input.tone === "empathetic"
          ? `Hi ${input.user_name}, we understand this may be a sensitive matter.`
          : `Dear ${input.user_name},`;

  const body = `We've received your request regarding "${input.title}" and routed it to the ${list} team${input.categories.length > 1 ? "s" : ""}. A team member will follow up shortly.`;

  const closing =
    input.tone === "formal"
      ? `\n\nKind regards,\nThe ${list} Team`
      : `\n\nThanks,\nOpsAssist`;

  return `${opener}\n\n${body}${closing}`;
}

const GenerateResponseSchema = z.object({
  ticket_id: z.string().uuid().optional(),
  user_name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().min(1).max(2000),
  categories: z.array(z.enum(DEPARTMENTS)).min(1).max(4),
  priority: z.string().trim().min(1).max(20),
  tone: z.enum(TONES).optional(),
});

export const generateTicketResponse = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    GenerateResponseSchema.parse(input),
  )
  .handler(async ({ data }) => {
    const tone: Tone =
      data.tone ??
      autoTone(
        data.categories,
        data.priority,
        `${data.title} ${data.details}`,
      );

    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return {
        response: templateResponse({ ...data, tone }),
        source: "template" as const,
        tone,
      };
    }

    const behavior = data.categories
      .map((c) => DEPT_BEHAVIOR[c])
      .join(" ");

    const system = [
      `You are OpsAssist, an enterprise support assistant. You MAY ONLY discuss HR, IT, Finance, or Operations topics. If the user's request is not related to those four departments, reply EXACTLY: "${ALLOWED_TOPIC_REFUSAL}"`,
      "Be concise: 60–140 words.",
      "Tone: " + tone + ".",
      behavior,
      "Always acknowledge, confirm the ticket exists in the system, and outline next steps. No markdown.",
    ].join(" ");

    try {
      const prompt = `
${system}

User: ${data.user_name}
Departments: ${data.categories.join(", ")}
Priority: ${data.priority}

Title:
${data.title}

Details:
${data.details}

Write the response now.
`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature:
                tone === "formal"
                  ? 0.2
                  : tone === "empathetic"
                    ? 0.6
                    : 0.5,
            },
          }),
        },
      );

      if (!res.ok) {
        console.error(
          "Gemini response error:",
          await res.text(),
        );

        return {
          response: templateResponse({ ...data, tone }),
          source: "template" as const,
          tone,
        };
      }

      const json = await res.json();

      const content =
        json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!content) {
        return {
          response: templateResponse({ ...data, tone }),
          source: "template" as const,
          tone,
        };
      }

      return {
        response: content,
        source: "ai" as const,
        tone,
      };
    } catch (err) {
      console.error("Gemini generation failed:", err);

      return {
        response: templateResponse({ ...data, tone }),
        source: "template" as const,
        tone,
      };
    }
  });
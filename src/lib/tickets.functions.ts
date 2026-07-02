import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";
import { detectTemplateFor, bootstrapWorkflowForTicket } from "./workflow.functions";

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
  if (/(payroll|salary|leave|hr|hiring|benefit|vacation|holiday|harass|discriminat|onboard)/.test(text)) cats.add("HR");
  if (/(laptop|wifi|wi-fi|vpn|server|password|login|software|computer|email|network|system|bug|outage|router|access point|printer)/.test(text)) cats.add("IT");
  if (/(invoice|payment|reimburs|finance|budget|expense|tax|refund|salary|payroll)/.test(text)) cats.add("Finance");
  if (/(facilit|office|ceiling|door|cleaning|supplies|building|maintenance|elevator|hvac|operations|logistics)/.test(text)) cats.add("Operations");
  if (cats.size === 0) cats.add("Operations");

  let priority: Priority = "Medium";
  if (/(urgent|asap|immediately|critical|down|outage|cannot work|blocker|emergency)/.test(text)) priority = "High";
  else if (/(whenever|low priority|minor|nice to have|sometime)/.test(text)) priority = "Low";

  return { categories: Array.from(cats), priority };
}

async function classifyWithAI(title: string, details: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return heuristicClassify(title, details);
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
              'Classify business support tickets. A ticket may affect MULTIPLE departments. Respond ONLY with strict JSON like {"categories":["HR"|"IT"|"Finance"|"Operations"],"priority":"High"|"Medium"|"Low"}. Use one or more categories.',
          },
          { role: "user", content: `Title: ${title}\nDetails: ${details}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return heuristicClassify(title, details);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const fb = heuristicClassify(title, details);
    const cats: Department[] = Array.isArray(parsed.categories)
      ? parsed.categories.filter((c: unknown): c is Department =>
          typeof c === "string" && (DEPARTMENTS as readonly string[]).includes(c),
        )
      : [];
    return {
      categories: cats.length ? cats : fb.categories,
      priority: ((PRIORITIES as readonly string[]).includes(parsed.priority)
        ? parsed.priority
        : fb.priority) as Priority,
    };
  } catch {
    return heuristicClassify(title, details);
  }
}

// ----------------------------- Load-balanced assignment -----------------------------

// Pick the department admin (admin + profiles.department=dept) with the fewest active assignments.
async function pickLeastBusyAdminForDept(dept: Department): Promise<string | null> {
  // Admins with this department.
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

  const counts = new Map(adminIds.map((id) => [id, 0] as [string, number]));
  for (const row of active ?? []) {
    if (row.assigned_to) counts.set(row.assigned_to, (counts.get(row.assigned_to) ?? 0) + 1);
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
    const { categories, priority } = await classifyWithAI(data.title, data.details);
    const userName = context.profile?.full_name ?? "User";

    const { data: row, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        user_id: context.userId,
        user_name: userName,
        title: data.title,
        details: data.details,
        category: categories[0], // legacy single field
        categories,
        priority,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Create per-department assignments with load balancing.
    const rows = await Promise.all(
      categories.map(async (dept) => ({
        ticket_id: row.id,
        department: dept,
        assigned_to: await pickLeastBusyAdminForDept(dept),
      })),
    );
    const { error: aerr } = await supabaseAdmin.from("ticket_assignments").insert(rows);
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
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    for (const arr of byTicket.values()) {
      for (const a of arr) {
        a.assignee_name = a.assigned_to ? (nameById.get(a.assigned_to) ?? null) : null;
      }
    }
  }
  return byTicket;
}

async function fetchFeedbackForTickets(ticketIds: string[]) {
  if (ticketIds.length === 0) return new Map<string, { rating: number; comment: string | null }>();
  const { data } = await supabaseAdmin
    .from("ticket_feedback")
    .select("ticket_id, rating, comment")
    .in("ticket_id", ticketIds);
  return new Map((data ?? []).map((f) => [f.ticket_id, { rating: f.rating, comment: f.comment }]));
}

async function fetchLatestNotesForTickets(ticketIds: string[]) {
  const map = new Map<string, { last_note_at: string; last_note_role: "user" | "admin" }>();
  if (ticketIds.length === 0) return map;
  const { data } = await supabaseAdmin
    .from("ticket_notes")
    .select("ticket_id, author_role, created_at")
    .in("ticket_id", ticketIds)
    .in("author_role", ["user", "admin"])
    .order("created_at", { ascending: false });
  for (const row of data ?? []) {
    if (!map.has(row.ticket_id)) {
      map.set(row.ticket_id, {
        last_note_at: row.created_at,
        last_note_role: row.author_role as "user" | "admin",
      });
    }
  }
  return map;
}

// Caller's own tickets.
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
    const [assignments, feedback, latestNotes] = await Promise.all([
      fetchAssignmentsForTickets(ids),
      fetchFeedbackForTickets(ids),
      fetchLatestNotesForTickets(ids),
    ]);
    return {
      tickets: (data ?? []).map((t) => ({
        ...t,
        assignments: assignments.get(t.id) ?? [],
        feedback: feedback.get(t.id) ?? null,
        last_note_at: latestNotes.get(t.id)?.last_note_at ?? null,
        last_note_role: latestNotes.get(t.id)?.last_note_role ?? null,
      })),
    };
  });

// Department-scoped tickets for Department Admins (and all for Super Admins).
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
      // department admin: only tickets that include their department
      q = q.contains("categories", [dept]);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((t) => t.id);
    const [assignments, feedback, latestNotes] = await Promise.all([
      fetchAssignmentsForTickets(ids),
      fetchFeedbackForTickets(ids),
      fetchLatestNotesForTickets(ids),
    ]);
    return {
      isSuperAdmin: dept === null,
      department: dept,
      tickets: (data ?? []).map((t) => ({
        ...t,
        assignments: assignments.get(t.id) ?? [],
        feedback: feedback.get(t.id) ?? null,
        last_note_at: latestNotes.get(t.id)?.last_note_at ?? null,
        last_note_role: latestNotes.get(t.id)?.last_note_role ?? null,
        // Per-department status visible to this admin
        my_assignment:
          (assignments.get(t.id) ?? []).find((a) => !dept || a.department === dept) ?? null,
      })),
    };
  });

// ----------------------------- Updates -----------------------------

const UpdateAssignmentSchema = z.object({
  assignment_id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export const updateAssignmentStatus = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => UpdateAssignmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const dept = context.department as Department | null;
    // Department admin may only touch own department assignments.
    if (dept) {
      const { data: row } = await supabaseAdmin
        .from("ticket_assignments")
        .select("department")
        .eq("id", data.assignment_id)
        .single();
      if (row?.department !== dept) throw new Error("Not in your department.");
    }
    const patch: { status: typeof data.status; resolved_at?: string } = { status: data.status };
    if (data.status === "Resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("ticket_assignments")
      .update(patch)
      .eq("id", data.assignment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Reassign an assignment to a different department (with mandatory note).
const ReassignSchema = z.object({
  assignment_id: z.string().uuid(),
  new_department: z.enum(DEPARTMENTS),
  note: z.string().trim().min(3).max(2000),
});

export const reassignAssignment = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => ReassignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const dept = context.department as Department | null;
    const { data: current, error: cErr } = await supabaseAdmin
      .from("ticket_assignments")
      .select("id, ticket_id, department, status")
      .eq("id", data.assignment_id)
      .single();
    if (cErr || !current) throw new Error("Assignment not found.");
    if (dept && current.department !== dept) {
      throw new Error("You can only reassign tickets in your department.");
    }
    if (current.department === data.new_department) {
      throw new Error("Ticket is already assigned to that department.");
    }

    // Refuse if the ticket already has an assignment for the target department.
    const { data: existing } = await supabaseAdmin
      .from("ticket_assignments")
      .select("id")
      .eq("ticket_id", current.ticket_id)
      .eq("department", data.new_department)
      .maybeSingle();
    if (existing) {
      throw new Error(`This ticket is already routed to ${data.new_department}.`);
    }

    const newAssignee = await pickLeastBusyAdminForDept(data.new_department);

    const { error: uErr } = await supabaseAdmin
      .from("ticket_assignments")
      .update({
        department: data.new_department,
        assigned_to: newAssignee,
        status: "Open",
        resolved_at: null,
        resolved_by_ai: false,
      })
      .eq("id", data.assignment_id);
    if (uErr) throw new Error(uErr.message);

    // Update ticket categories: swap old dept for new (preserve other depts).
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("categories, status")
      .eq("id", current.ticket_id)
      .single();
    const cats = new Set<string>((ticket?.categories ?? []) as string[]);
    cats.delete(current.department);
    cats.add(data.new_department);
    const newCats = Array.from(cats);
    await supabaseAdmin
      .from("tickets")
      .update({
        categories: newCats,
        category: newCats[0] ?? data.new_department,
        // If the parent was Resolved (edge case), re-open it.
        ...(ticket?.status === "Resolved"
          ? { status: "Open", resolved_at: null, resolved_by_ai: false, resolution_source: null }
          : {}),
      })
      .eq("id", current.ticket_id);

    // Author note documenting the reassignment.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const author_name = profile?.full_name ?? "Admin";
    const body = `🔁 Reassigned from ${current.department} to ${data.new_department}.\n\nReason: ${data.note}`;
    await supabaseAdmin.from("ticket_notes").insert({
      ticket_id: current.ticket_id,
      author_id: context.userId,
      author_name,
      author_role: "admin",
      body,
    });

    return { ok: true };
  });

// User marks their ticket resolved by AI.
const ResolveByAiSchema = z.object({ id: z.string().uuid() });
export const markResolvedByAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResolveByAiSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("user_id")
      .eq("id", data.id)
      .single();
    if (t?.user_id !== context.userId) throw new Error("Not your ticket.");
    // Resolve every assignment — trigger will then resolve the parent.
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
    // Also stamp the parent directly (trigger may not fire if there were 0 assignments).
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

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FeedbackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("user_id, status, resolution_source, resolved_by_ai")
      .eq("id", data.ticket_id)
      .single();
    if (!t || t.user_id !== context.userId) throw new Error("Not your ticket.");
    if (t.status !== "Resolved") throw new Error("Ticket is not resolved yet.");

    const { error } = await supabaseAdmin.from("ticket_feedback").upsert(
      {
        ticket_id: data.ticket_id,
        user_id: context.userId,
        rating: data.rating,
        comment: data.comment ?? null,
        resolution_source: t.resolution_source ?? (t.resolved_by_ai ? "ai" : "department"),
      },
      { onConflict: "ticket_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------------- AI Response Generator (controlled) -----------------------------

const ALLOWED_TOPIC_REFUSAL =
  "This platform only supports HR, IT, Finance, and Operations related requests.";

const DEPT_BEHAVIOR: Record<Department, string> = {
  IT: "You are IT Support. You MAY troubleshoot, suggest fixes, and attempt resolution (VPN, passwords, network, devices, software). Provide concrete technical steps the user can try.",
  Operations:
    "You are Operations. You MAY suggest operational procedures and workflow steps. Keep guidance practical and limited to operational coordination.",
  HR: "You are People & Culture. You MUST NOT give legal advice, make HR decisions, handle disciplinary actions, or investigate harassment claims. Acknowledge respectfully, show empathy, confirm the ticket was created, and indicate it has been securely escalated to the HR team.",
  Finance:
    "You are Finance. You MUST NOT give tax advice, make salary decisions, or resolve payroll disputes. Acknowledge the request formally, confirm ticket creation, and indicate it has been escalated to the Finance team.",
};

export function autoTone(categories: string[], priority: string, text: string): Tone {
  const t = text.toLowerCase();
  if (categories.includes("HR") || /(harass|discriminat|sensitive|complaint)/.test(t)) return "empathetic";
  if (priority === "High" || /(outage|down|critical|asap|urgent|emergency)/.test(t)) return "urgent";
  if (categories.includes("Finance") || /(payroll|salary|invoice|tax)/.test(t)) return "formal";
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
    input.tone === "formal" ? `\n\nKind regards,\nThe ${list} Team` : `\n\nThanks,\nOpsAssist`;
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

const AI_AUTHOR_ID = "00000000-0000-0000-0000-000000000000";

async function persistAiNoteIfFirst(ticketId: string, body: string) {
  const { data: existing } = await supabaseAdmin
    .from("ticket_notes")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("author_role", "ai")
    .limit(1)
    .maybeSingle();
  if (existing) return;
  await supabaseAdmin.from("ticket_notes").insert({
    ticket_id: ticketId,
    author_id: AI_AUTHOR_ID,
    author_name: "AI Assistant",
    author_role: "ai",
    body,
  });
}

export const generateTicketResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateResponseSchema.parse(input))
  .handler(async ({ data }) => {
    const tone: Tone =
      data.tone ?? autoTone(data.categories, data.priority, `${data.title} ${data.details}`);

    const finalize = async (response: string, source: "ai" | "template") => {
      if (data.ticket_id) {
        try {
          await persistAiNoteIfFirst(data.ticket_id, response);
        } catch {
          /* ignore note persistence errors */
        }
      }
      return { response, source, tone };
    };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return finalize(templateResponse({ ...data, tone }), "template");
    }

    const behavior = data.categories.map((c) => DEPT_BEHAVIOR[c]).join(" ");
    const system = [
      `You are OpsAssist, an enterprise support assistant. You MAY ONLY discuss HR, IT, Finance, or Operations topics. If the user's request is not related to those four departments, reply EXACTLY: "${ALLOWED_TOPIC_REFUSAL}"`,
      "Be concise: 60–140 words.",
      "Tone: " + tone + ".",
      behavior,
      "Always acknowledge, confirm the ticket exists in the system, and outline next steps. No markdown. Sign off as the team.",
    ].join(" ");

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: `User: ${data.user_name}\nDepartments: ${data.categories.join(", ")}\nPriority: ${data.priority}\nTitle: ${data.title}\nDetails: ${data.details}\n\nWrite the reply now.`,
            },
          ],
        }),
      });
      if (!res.ok) return finalize(templateResponse({ ...data, tone }), "template");
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) return finalize(templateResponse({ ...data, tone }), "template");
      return finalize(content, "ai");
    } catch {
      return finalize(templateResponse({ ...data, tone }), "template");
    }
  });

// ----------------------------- Ticket-aware Chatbot -----------------------------

const AskBotSchema = z.object({
  ticket_id: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
});

export const askTicketBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AskBotSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ reply: string }> => {
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (!ticket) throw new Error("Ticket not found.");
    if (ticket.user_id !== context.userId) throw new Error("Not your ticket.");
    if (ticket.status === "Resolved")
      throw new Error("This ticket is resolved — the conversation is closed.");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const userName = profile?.full_name ?? "User";

    await supabaseAdmin.from("ticket_notes").insert({
      ticket_id: data.ticket_id,
      author_id: context.userId,
      author_name: userName,
      author_role: "user",
      body: data.message,
    });

    const [{ data: notes }, { data: assignments }] = await Promise.all([
      supabaseAdmin
        .from("ticket_notes")
        .select("author_role, author_name, body, created_at")
        .eq("ticket_id", data.ticket_id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("ticket_assignments")
        .select("department, status, assigned_to, resolved_at")
        .eq("ticket_id", data.ticket_id),
    ]);

    const assigneeIds = (assignments ?? [])
      .map((a) => a.assigned_to)
      .filter((v): v is string => !!v);
    const nameById = new Map<string, string>();
    if (assigneeIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", assigneeIds);
      for (const p of profs ?? []) nameById.set(p.id, p.full_name ?? "Admin");
    }

    const assignmentLines = (assignments ?? [])
      .map((a) => {
        const who = a.assigned_to ? (nameById.get(a.assigned_to) ?? "Unassigned") : "Unassigned";
        return `- ${a.department}: ${a.status} (assignee: ${who})`;
      })
      .join("\n");

    const lastNote = (notes ?? []).filter((n) => n.author_role !== "user").slice(-1)[0];
    const ticketContext = [
      `Ticket ID: ${ticket.id}`,
      `Title: ${ticket.title}`,
      `Details: ${ticket.details}`,
      `Status: ${ticket.status}`,
      `Priority: ${ticket.priority}`,
      `Categories: ${(ticket.categories ?? []).join(", ")}`,
      `Created: ${new Date(ticket.created_at).toUTCString()}`,
      ticket.resolved_at ? `Resolved at: ${new Date(ticket.resolved_at).toUTCString()}` : null,
      ticket.resolved_by_ai ? `Resolved by AI: yes` : null,
      assignmentLines ? `Department assignments:\n${assignmentLines}` : null,
      lastNote ? `Last update: ${new Date(lastNote.created_at).toUTCString()} by ${lastNote.author_name}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    let aiResponse: string;

    if (!apiKey) {
      aiResponse =
        "I'm temporarily unable to respond. Your message has been recorded — an admin will follow up shortly.";
    } else {
      const system = [
        "You are OpsAssist, a helpful support chatbot for an enterprise ticketing system.",
        "You ONLY discuss the user's specific ticket and HR, IT, Finance, or Operations topics.",
        "Use the ticket context below to answer questions about status, assignee, department, priority, dates, etc.",
        "Be concise (under 120 words), warm, and professional. No markdown.",
        "If the user asks to speak to a human or admin, tell them to use the 'Message Admin' option in the chatbot to reach their assigned administrator.",
        "Never invent information that isn't in the ticket context.",
        "",
        "TICKET CONTEXT:",
        ticketContext,
      ].join("\n");

      const history = (notes ?? []).slice(-20).map((n) => ({
        role: n.author_role === "ai" ? ("assistant" as const) : ("user" as const),
        content:
          n.author_role === "admin"
            ? `[Admin ${n.author_name}]: ${n.body}`
            : n.body,
      }));

      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "system", content: system }, ...history],
          }),
        });
        if (!res.ok) throw new Error("ai failed");
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        aiResponse =
          json.choices?.[0]?.message?.content?.trim() ||
          "I couldn't generate a response. Please try again or message an admin.";
      } catch {
        aiResponse =
          "I had trouble reaching the assistant. Please try again, or use 'Message Admin' to contact your assigned administrator.";
      }
    }

    await supabaseAdmin.from("ticket_notes").insert({
      ticket_id: data.ticket_id,
      author_id: AI_AUTHOR_ID,
      author_name: "AI Assistant",
      author_role: "ai",
      body: aiResponse,
    });

    return { reply: aiResponse };
  });

// ----------------------------- Ticket conversation notes -----------------------------

export type TicketNote = {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string;
  author_role: "user" | "admin" | "ai";
  body: string;
  created_at: string;
};

async function loadTicketForNotes(ticketId: string) {
  const { data, error } = await supabaseAdmin
    .from("tickets")
    .select("id, user_id, status, categories")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ticket not found.");
  return data as { id: string; user_id: string; status: string; categories: string[] };
}

async function assertNoteAccess(
  ticketId: string,
  userId: string,
): Promise<{ ticket: Awaited<ReturnType<typeof loadTicketForNotes>>; role: "user" | "admin"; name: string }> {
  const ticket = await loadTicketForNotes(ticketId);
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, department")
    .eq("id", userId)
    .maybeSingle();
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const isAdmin = roleRow?.role === "admin";
  const dept = profile?.department ?? null;
  const isSuper = isAdmin && dept === null;
  const isDeptAdmin = isAdmin && dept !== null && ticket.categories.includes(dept);
  const isOwner = ticket.user_id === userId;
  if (!isOwner && !isSuper && !isDeptAdmin) {
    throw new Error("You can't access this conversation.");
  }
  // Admins always post as "admin" — even if they happen to own the ticket
  // (e.g. super admin testing). Only non-admin owners post as "user".
  const role: "user" | "admin" = isAdmin ? "admin" : "user";
  return {
    ticket,
    role,
    name: profile?.full_name ?? "Unknown",
  };
}

export const listTicketNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ticket_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ notes: TicketNote[]; locked: boolean }> => {
    const { ticket } = await assertNoteAccess(data.ticket_id, context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("ticket_notes")
      .select("*")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { notes: (rows ?? []) as TicketNote[], locked: ticket.status === "Resolved" };
  });

const AddNoteSchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const addTicketNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddNoteSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ note: TicketNote }> => {
    const { ticket, role, name } = await assertNoteAccess(data.ticket_id, context.userId);
    if (ticket.status === "Resolved") {
      throw new Error("This ticket is resolved — the conversation is closed.");
    }
    const { data: row, error } = await supabaseAdmin
      .from("ticket_notes")
      .insert({
        ticket_id: data.ticket_id,
        author_id: context.userId,
        author_name: name,
        author_role: role,
        body: data.body,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { note: row as TicketNote };
  });


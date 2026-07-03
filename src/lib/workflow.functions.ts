import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";

export type WorkflowStage = {
  id: string;
  template_id: string;
  position: number;
  name: string;
  type: "approval" | "operational" | "terminal";
  approver_kind: "department" | "user" | "none" | null;
  approver_department: string | null;
  approver_user_id: string | null;
};

export type WorkflowTemplate = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  trigger_keywords: string[];
  active: boolean;
  stages?: WorkflowStage[];
};

export type WorkflowApproval = {
  id: string;
  ticket_id: string;
  stage_id: string | null;
  department: string | null;
  approver_user_id: string | null;
  status: "pending" | "approved" | "rejected" | "info_requested";
  decision_note: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
  request_note: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
};

export type WorkflowHistoryRow = {
  id: string;
  ticket_id: string;
  stage_id: string | null;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_department: string | null;
  comment: string | null;
  created_at: string;
};

export type TicketWorkflowRow = {
  ticket_id: string;
  template_id: string;
  current_stage_id: string | null;
  status: "in_progress" | "completed" | "rejected";
  created_at: string;
  updated_at: string;
};

// ---------- Template detection & bootstrap (called from tickets submit) ----------

export async function detectTemplateFor(
  title: string,
  details: string,
): Promise<{ template: WorkflowTemplate; stages: WorkflowStage[] } | null> {
  const text = `${title} ${details}`.toLowerCase();
  const { data: tmpls } = await supabaseAdmin
    .from("workflow_templates")
    .select("*")
    .eq("active", true);
  const list = (tmpls ?? []) as WorkflowTemplate[];
  for (const t of list) {
    const kws = (t.trigger_keywords ?? []).map((k) => k.toLowerCase());
    if (kws.some((k) => k && text.includes(k))) {
      const { data: stages } = await supabaseAdmin
        .from("workflow_stages")
        .select("*")
        .eq("template_id", t.id)
        .order("position", { ascending: true });
      return { template: t, stages: (stages ?? []) as WorkflowStage[] };
    }
  }
  return null;
}

export async function bootstrapWorkflowForTicket(params: {
  ticket_id: string;
  template: WorkflowTemplate;
  stages: WorkflowStage[];
  actor_id: string;
  actor_name: string;
}) {
  const { ticket_id, template, stages, actor_id, actor_name } = params;
  if (stages.length === 0) return;

  // First stage = "Request Submitted" (already done). Advance to stage 2.
  const first = stages[0];
  const next = stages[1] ?? null;

  await supabaseAdmin.from("ticket_workflow").insert({
    ticket_id,
    template_id: template.id,
    current_stage_id: next?.id ?? first.id,
    status: "in_progress",
  });

  await supabaseAdmin.from("workflow_history").insert({
    ticket_id,
    stage_id: first.id,
    action: "submitted",
    actor_id,
    actor_name,
    comment: `Workflow "${template.name}" started.`,
  });

  if (next) {
    await maybeCreateApprovalRow(ticket_id, next);
    await supabaseAdmin.from("workflow_history").insert({
      ticket_id,
      stage_id: next.id,
      action: next.type === "approval" ? "awaiting_approval" : "started",
      actor_id: null,
      actor_name: "System",
      comment: `Stage: ${next.name}`,
    });
  }
}

async function maybeCreateApprovalRow(ticket_id: string, stage: WorkflowStage) {
  if (stage.type !== "approval") return;
  await supabaseAdmin.from("workflow_approvals").insert({
    ticket_id,
    stage_id: stage.id,
    department: stage.approver_department,
    approver_user_id: stage.approver_user_id,
    status: "pending",
  });
}

// ---------- Client-facing server functions ----------

export const listWorkflowTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: tmpls } = await supabaseAdmin
      .from("workflow_templates")
      .select("*")
      .order("name", { ascending: true });
    const { data: stages } = await supabaseAdmin
      .from("workflow_stages")
      .select("*")
      .order("position", { ascending: true });
    const byT = new Map<string, WorkflowStage[]>();
    for (const s of (stages ?? []) as WorkflowStage[]) {
      const arr = byT.get(s.template_id) ?? [];
      arr.push(s);
      byT.set(s.template_id, arr);
    }
    return {
      templates: ((tmpls ?? []) as WorkflowTemplate[]).map((t) => ({
        ...t,
        stages: byT.get(t.id) ?? [],
      })),
    };
  });

export const getTicketWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: wf } = await supabaseAdmin
      .from("ticket_workflow")
      .select("*")
      .eq("ticket_id", data.ticket_id)
      .maybeSingle();
    if (!wf) return { workflow: null };
    const [{ data: stages }, { data: approvals }, { data: history }] = await Promise.all([
      supabaseAdmin
        .from("workflow_stages")
        .select("*")
        .eq("template_id", (wf as TicketWorkflowRow).template_id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("workflow_approvals")
        .select("*")
        .eq("ticket_id", data.ticket_id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("workflow_history")
        .select("*")
        .eq("ticket_id", data.ticket_id)
        .order("created_at", { ascending: true }),
    ]);
    const { data: tmpl } = await supabaseAdmin
      .from("workflow_templates")
      .select("*")
      .eq("id", (wf as TicketWorkflowRow).template_id)
      .maybeSingle();
    return {
      workflow: wf as TicketWorkflowRow,
      template: tmpl as WorkflowTemplate | null,
      stages: (stages ?? []) as WorkflowStage[],
      approvals: (approvals ?? []) as WorkflowApproval[],
      history: (history ?? []) as WorkflowHistoryRow[],
    };
  });

// Pending approvals for the current admin (their department, or all for super admin).
export const listPendingApprovals = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async ({ context }) => {
    const dept = context.department as string | null;
    let q = supabaseAdmin
      .from("workflow_approvals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (dept) q = q.eq("department", dept);
    const { data: approvals } = await q;
    const rows = (approvals ?? []) as WorkflowApproval[];
    const ticketIds = Array.from(new Set(rows.map((r) => r.ticket_id)));
    const stageIds = Array.from(new Set(rows.map((r) => r.stage_id).filter((s): s is string => !!s)));
    const [{ data: tickets }, { data: stages }] = await Promise.all([
      ticketIds.length
        ? supabaseAdmin
            .from("tickets")
            .select("id, title, user_name, priority, created_at, categories")
            .in("id", ticketIds)
        : Promise.resolve({ data: [] as unknown[] }),
      stageIds.length
        ? supabaseAdmin.from("workflow_stages").select("*").in("id", stageIds)
        : Promise.resolve({ data: [] as WorkflowStage[] }),
    ]);
    const ticketById = new Map((tickets ?? []).map((t: any) => [t.id, t]));
    const stageById = new Map(((stages ?? []) as WorkflowStage[]).map((s) => [s.id, s]));
    return {
      approvals: rows.map((a) => ({
        ...a,
        ticket: ticketById.get(a.ticket_id) ?? null,
        stage: a.stage_id ? (stageById.get(a.stage_id) ?? null) : null,
      })),
    };
  });

const DecisionSchema = z
  .object({
    approval_id: z.string().uuid(),
    decision: z.enum(["approve", "reject", "info"]),
    comment: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.decision === "reject" && (!val.comment || val.comment.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message: "A reason is required when rejecting an approval.",
      });
    }
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => DecisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const dept = context.department as string | null;
    const actorName = (context.profile as any)?.full_name ?? "Admin";
    const { data: appr } = await supabaseAdmin
      .from("workflow_approvals")
      .select("*")
      .eq("id", data.approval_id)
      .maybeSingle();
    if (!appr) throw new Error("Approval not found.");
    const approval = appr as WorkflowApproval;
    if (approval.status !== "pending") throw new Error("Already decided.");
    if (dept && approval.department && approval.department !== dept) {
      throw new Error("You can only decide approvals for your department.");
    }

    const newStatus: WorkflowApproval["status"] =
      data.decision === "approve"
        ? "approved"
        : data.decision === "reject"
          ? "rejected"
          : "info_requested";

    await supabaseAdmin
      .from("workflow_approvals")
      .update({
        status: newStatus,
        decision_note: data.comment ?? null,
        decided_by: context.userId,
        decided_by_name: actorName,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.approval_id);

    await supabaseAdmin.from("workflow_history").insert({
      ticket_id: approval.ticket_id,
      stage_id: approval.stage_id,
      action:
        data.decision === "approve"
          ? "approved"
          : data.decision === "reject"
            ? "rejected"
            : "info_requested",
      actor_id: context.userId,
      actor_name: actorName,
      actor_department: dept,
      comment: data.comment ?? null,
    });

    // Notify the requester of the outcome.
    const requesterId = (approval as any).requested_by as string | null;
    if (requesterId && data.decision !== "info") {
      const { data: ticket } = await supabaseAdmin
        .from("tickets")
        .select("title")
        .eq("id", approval.ticket_id)
        .maybeSingle();
      const title = (ticket as any)?.title ?? "Ticket";
      const isApprove = data.decision === "approve";
      await supabaseAdmin.from("notifications").insert({
        user_id: requesterId,
        ticket_id: approval.ticket_id,
        type: isApprove ? "approval_granted" : "approval_denied",
        title: `${isApprove ? "Approval granted" : "Approval denied"}${
          approval.department ? ` (${approval.department})` : ""
        }: ${title}`,
        body:
          data.comment ??
          (isApprove
            ? `${actorName} approved your request.`
            : `${actorName} denied your request.`),
        metadata: {
          ticket_id: approval.ticket_id,
          approval_id: approval.id,
          decision: data.decision,
        },
      });
    } else if (requesterId && data.decision === "info") {
      const { data: ticket } = await supabaseAdmin
        .from("tickets")
        .select("title")
        .eq("id", approval.ticket_id)
        .maybeSingle();
      const title = (ticket as any)?.title ?? "Ticket";
      await supabaseAdmin.from("notifications").insert({
        user_id: requesterId,
        ticket_id: approval.ticket_id,
        type: "approval_info_requested",
        title: `More info needed${approval.department ? ` (${approval.department})` : ""}: ${title}`,
        body: data.comment ?? `${actorName} requested more information.`,
        metadata: { ticket_id: approval.ticket_id, approval_id: approval.id },
      });
    }

    if (data.decision === "info") {
      return { ok: true };
    }

    if (data.decision === "reject") {
      await supabaseAdmin
        .from("ticket_workflow")
        .update({ status: "rejected" })
        .eq("ticket_id", approval.ticket_id);
      return { ok: true };
    }

    // Manual (stage-less) approval — no workflow to advance.
    if (!approval.stage_id) return { ok: true };

    // Approved — check if all approvals for this stage are approved, then advance.
    const { data: sibling } = await supabaseAdmin
      .from("workflow_approvals")
      .select("status")
      .eq("ticket_id", approval.ticket_id)
      .eq("stage_id", approval.stage_id);
    const allDone = (sibling ?? []).every((r: any) => r.status === "approved");
    if (!allDone) return { ok: true };

    await advanceToNextStage(approval.ticket_id, approval.stage_id, {
      actor_id: context.userId,
      actor_name: actorName,
      actor_department: dept,
    });

    return { ok: true };
  });


const CompleteOpSchema = z.object({
  ticket_id: z.string().uuid(),
  comment: z.string().trim().max(2000).optional(),
});

export const completeCurrentOperationalStage = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => CompleteOpSchema.parse(input))
  .handler(async ({ data, context }) => {
    const dept = context.department as string | null;
    const actorName = (context.profile as any)?.full_name ?? "Admin";
    const { data: wf } = await supabaseAdmin
      .from("ticket_workflow")
      .select("*")
      .eq("ticket_id", data.ticket_id)
      .maybeSingle();
    if (!wf) throw new Error("No workflow on this ticket.");
    const workflow = wf as TicketWorkflowRow;
    if (workflow.status !== "in_progress") throw new Error("Workflow is not active.");
    if (!workflow.current_stage_id) throw new Error("No active stage.");
    const { data: stage } = await supabaseAdmin
      .from("workflow_stages")
      .select("*")
      .eq("id", workflow.current_stage_id)
      .maybeSingle();
    const s = stage as WorkflowStage | null;
    if (!s) throw new Error("Stage missing.");
    if (s.type !== "operational")
      throw new Error("Current stage is not an operational stage.");
    if (dept && s.approver_department && s.approver_department !== dept) {
      throw new Error("Only the assigned department can complete this stage.");
    }

    await supabaseAdmin.from("workflow_history").insert({
      ticket_id: data.ticket_id,
      stage_id: s.id,
      action: "completed",
      actor_id: context.userId,
      actor_name: actorName,
      actor_department: dept,
      comment: data.comment ?? null,
    });

    await advanceToNextStage(data.ticket_id, s.id, {
      actor_id: context.userId,
      actor_name: actorName,
      actor_department: dept,
    });
    return { ok: true };
  });

async function advanceToNextStage(
  ticket_id: string,
  from_stage_id: string,
  actor: { actor_id: string; actor_name: string; actor_department: string | null },
) {
  const { data: wf } = await supabaseAdmin
    .from("ticket_workflow")
    .select("template_id")
    .eq("ticket_id", ticket_id)
    .maybeSingle();
  if (!wf) return;
  const { data: stages } = await supabaseAdmin
    .from("workflow_stages")
    .select("*")
    .eq("template_id", (wf as any).template_id)
    .order("position", { ascending: true });
  const list = (stages ?? []) as WorkflowStage[];
  const idx = list.findIndex((s) => s.id === from_stage_id);
  const next = idx >= 0 ? list[idx + 1] : null;

  if (!next) {
    await supabaseAdmin
      .from("ticket_workflow")
      .update({ status: "completed", current_stage_id: null })
      .eq("ticket_id", ticket_id);
    await supabaseAdmin.from("workflow_history").insert({
      ticket_id,
      stage_id: null,
      action: "workflow_completed",
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_department: actor.actor_department,
      comment: null,
    });
    return;
  }

  await supabaseAdmin
    .from("ticket_workflow")
    .update({ current_stage_id: next.id })
    .eq("ticket_id", ticket_id);

  if (next.type === "terminal") {
    await supabaseAdmin
      .from("ticket_workflow")
      .update({ status: "completed", current_stage_id: null })
      .eq("ticket_id", ticket_id);
    await supabaseAdmin.from("workflow_history").insert({
      ticket_id,
      stage_id: next.id,
      action: "workflow_completed",
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_department: actor.actor_department,
      comment: null,
    });
    return;
  }

  if (next.type === "approval") {
    await maybeCreateApprovalRow(ticket_id, next);
    await supabaseAdmin.from("workflow_history").insert({
      ticket_id,
      stage_id: next.id,
      action: "awaiting_approval",
      actor_id: null,
      actor_name: "System",
      comment: `Stage: ${next.name}`,
    });
    return;
  }

  // operational — awaiting department action
  await supabaseAdmin.from("workflow_history").insert({
    ticket_id,
    stage_id: next.id,
    action: "started",
    actor_id: null,
    actor_name: "System",
    comment: `Stage: ${next.name}`,
  });
}

// ============================================================================
// Manual (ad-hoc) approval requests — admins request approvals per-ticket
// without a preconfigured workflow template.
// ============================================================================

const RequestManualSchema = z.object({
  ticket_id: z.string().uuid(),
  approvers: z
    .array(
      z.object({
        department: z.string().trim().min(1).max(60).optional(),
        user_id: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(10),
  note: z.string().trim().max(2000).optional(),
});

export const requestManualApprovals = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => RequestManualSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actorName = (context.profile as any)?.full_name ?? "Admin";
    const actorDept = (context.department as string | null) ?? null;

    const rows = data.approvers.map((a) => ({
      ticket_id: data.ticket_id,
      stage_id: null,
      department: a.department ?? null,
      approver_user_id: a.user_id ?? null,
      status: "pending" as const,
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("workflow_approvals")
      .insert(rows)
      .select("id, department, approver_user_id");
    if (error) throw new Error(error.message);

    // Log to workflow_history so it shows in the timeline.
    await supabaseAdmin.from("workflow_history").insert({
      ticket_id: data.ticket_id,
      stage_id: null,
      action: "approval_requested",
      actor_id: context.userId,
      actor_name: actorName,
      actor_department: actorDept,
      comment:
        (data.note ? data.note + " — " : "") +
        "Requested approval from: " +
        data.approvers
          .map((a) => a.department ?? a.user_id ?? "unknown")
          .join(", "),
    });

    // Notify approvers.
    const notifications: any[] = [];
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("title")
      .eq("id", data.ticket_id)
      .maybeSingle();
    const title = (ticket as any)?.title ?? "Ticket";

    for (const a of data.approvers) {
      if (a.user_id) {
        notifications.push({
          user_id: a.user_id,
          ticket_id: data.ticket_id,
          type: "approval_required",
          title: `Approval requested: ${title}`,
          body: data.note ?? "You have been asked to review this ticket.",
          metadata: { ticket_id: data.ticket_id },
        });
      } else if (a.department) {
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, profiles!inner(department)")
          .in("role", ["admin", "manager"] as any);
        for (const r of (admins ?? []) as any[]) {
          if (r.profiles?.department === a.department) {
            notifications.push({
              user_id: r.user_id,
              ticket_id: data.ticket_id,
              type: "approval_required",
              title: `Approval requested (${a.department}): ${title}`,
              body: data.note ?? "Your department has been asked to review this ticket.",
              metadata: { ticket_id: data.ticket_id, department: a.department },
            });
          }
        }
      }
    }
    if (notifications.length) {
      await supabaseAdmin.from("notifications").insert(notifications);
    }

    return { ok: true, approvals: inserted ?? [] };
  });

const SkipSchema = z.object({
  ticket_id: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

export const skipWorkflow = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => SkipSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actorName = (context.profile as any)?.full_name ?? "Admin";
    await supabaseAdmin
      .from("tickets")
      .update({
        workflow_skipped: true,
        workflow_skipped_at: new Date().toISOString(),
        workflow_skipped_by: context.userId,
        workflow_skipped_reason: data.reason ?? null,
      })
      .eq("id", data.ticket_id);

    await supabaseAdmin.from("workflow_history").insert({
      ticket_id: data.ticket_id,
      stage_id: null,
      action: "workflow_skipped",
      actor_id: context.userId,
      actor_name: actorName,
      actor_department: (context.department as string | null) ?? null,
      comment: data.reason ?? "Marked as no approval required.",
    });
    return { ok: true };
  });

const UnskipSchema = z.object({ ticket_id: z.string().uuid() });
export const unskipWorkflow = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => UnskipSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actorName = (context.profile as any)?.full_name ?? "Admin";
    await supabaseAdmin
      .from("tickets")
      .update({
        workflow_skipped: false,
        workflow_skipped_at: null,
        workflow_skipped_by: null,
        workflow_skipped_reason: null,
      })
      .eq("id", data.ticket_id);
    await supabaseAdmin.from("workflow_history").insert({
      ticket_id: data.ticket_id,
      stage_id: null,
      action: "workflow_reopened",
      actor_id: context.userId,
      actor_name: actorName,
      comment: "Approval workflow re-enabled.",
    });
    return { ok: true };
  });

export const getTicketApprovalState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const [{ data: ticket }, { data: approvals }, { data: history }] = await Promise.all([
      supabaseAdmin
        .from("tickets")
        .select("id, workflow_skipped, workflow_skipped_reason, workflow_skipped_at")
        .eq("id", data.ticket_id)
        .maybeSingle(),
      supabaseAdmin
        .from("workflow_approvals")
        .select("*")
        .eq("ticket_id", data.ticket_id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("workflow_history")
        .select("*")
        .eq("ticket_id", data.ticket_id)
        .order("created_at", { ascending: true }),
    ]);
    // Enrich approvers with names.
    const userIds = Array.from(
      new Set(
        ((approvals ?? []) as any[])
          .map((a) => a.approver_user_id)
          .filter((u): u is string => !!u),
      ),
    );
    let nameById = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      nameById = new Map(
        (profs ?? []).map((p: any) => [p.id, p.full_name ?? p.email ?? "User"]),
      );
    }
    return {
      ticket: (ticket ?? null) as any,
      approvals: ((approvals ?? []) as WorkflowApproval[]).map((a) => ({
        ...a,
        approver_name: a.approver_user_id ? (nameById.get(a.approver_user_id) ?? null) : null,
      })),
      history: (history ?? []) as WorkflowHistoryRow[],
    };
  });

// Simple list of admin/manager users an admin can pick as an individual approver.
export const listApproverCandidates = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async () => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager"] as any);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return { users: [] };
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, department")
      .in("id", ids);
    const roleById = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
    return {
      users: (profs ?? []).map((p: any) => ({
        id: p.id,
        name: p.full_name ?? p.email ?? "User",
        email: p.email ?? null,
        department: p.department ?? null,
        role: roleById.get(p.id) ?? "admin",
      })),
    };
  });

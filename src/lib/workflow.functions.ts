import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";
import { sendNotificationEmail } from "./email.server";

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
  origin_department: string | null;
  delegated_from_id: string | null;
  delegated_to_id: string | null;
  awaiting_delegation: boolean;
  assigned_user_id: string | null;
  sequence: number;
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
// Excludes parent rows that are currently awaiting a delegated child decision —
// they'll return to actionable state automatically once the delegate decides.
// Includes delegated child rows targeted at the admin's department or user id.
export const listPendingApprovals = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async ({ context }) => {
    const dept = context.department as string | null;
    const userId = context.userId as string;
    let q = supabaseAdmin
      .from("workflow_approvals")
      .select("*")
      .eq("status", "pending")
      .eq("awaiting_delegation", false)
      .order("created_at", { ascending: true });
    if (dept) {
      // Department admin sees rows for their department OR delegated rows assigned to them personally.
      q = q.or(`department.eq.${dept},assigned_user_id.eq.${userId}`);
    }
    const { data: approvals } = await q;
    const rows = (approvals ?? []) as WorkflowApproval[];
    const ticketIds = Array.from(new Set(rows.map((r) => r.ticket_id)));
    const stageIds = Array.from(new Set(rows.map((r) => r.stage_id).filter((s): s is string => !!s)));
    const [{ data: tickets }, { data: stages }] = await Promise.all([
      ticketIds.length
        ? supabaseAdmin
            .from("tickets")
            .select("id, title, details, user_name, priority, created_at, categories, status")
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
        is_delegated: !!a.delegated_from_id,
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

    // Notify the requester of the outcome (in-app + email).
    const requesterId = (approval as any).requested_by as string | null;
    if (requesterId) {
      const [{ data: ticket }, { data: requester }] = await Promise.all([
        supabaseAdmin
          .from("tickets")
          .select("title")
          .eq("id", approval.ticket_id)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("email, full_name")
          .eq("id", requesterId)
          .maybeSingle(),
      ]);
      const title = (ticket as any)?.title ?? "Ticket";
      const deptTag = approval.department ? ` (${approval.department})` : "";
      const isApprove = data.decision === "approve";
      const isReject = data.decision === "reject";
      const notifType = isApprove
        ? "approval_granted"
        : isReject
          ? "approval_denied"
          : "approval_info_requested";
      const notifTitle = isApprove
        ? `Approval granted${deptTag}: ${title}`
        : isReject
          ? `Approval denied${deptTag}: ${title}`
          : `More info needed${deptTag}: ${title}`;
      const notifBody =
        data.comment ??
        (isApprove
          ? `${actorName} approved your request.`
          : isReject
            ? `${actorName} denied your request.`
            : `${actorName} requested more information.`);

      await supabaseAdmin.from("notifications").insert({
        user_id: requesterId,
        ticket_id: approval.ticket_id,
        type: notifType,
        title: notifTitle,
        body: notifBody,
        metadata: {
          ticket_id: approval.ticket_id,
          approval_id: approval.id,
          decision: data.decision,
        },
      });

      const email = (requester as any)?.email as string | undefined;
      if (email) {
        await sendNotificationEmail({
          to: email,
          subject: notifTitle,
          heading: isApprove
            ? "Your approval request was granted"
            : isReject
              ? "Your approval request was denied"
              : "More information requested",
          intro: `${actorName}${approval.department ? ` (${approval.department})` : ""} ${
            isApprove
              ? "approved your request."
              : isReject
                ? "denied your request."
                : "asked for more information on your request."
          }`,
          ticketTitle: title,
          body: data.comment ?? undefined,
          accent: isApprove ? "success" : isReject ? "danger" : "primary",
        }).catch(() => ({ sent: false }));
      }
    }

    if (data.decision === "info") {
      return { ok: true };
    }

    // === Delegated-child handling ===
    // If this row is a delegated child, do NOT complete the parent's approval —
    // return control to the parent department. The parent department must still
    // click Approve/Reject themselves to keep them accountable.
    if (approval.delegated_from_id) {
      const parentId = approval.delegated_from_id;
      if (data.decision === "approve") {
        await supabaseAdmin
          .from("workflow_approvals")
          .update({ awaiting_delegation: false })
          .eq("id", parentId);
        await supabaseAdmin.from("workflow_history").insert({
          ticket_id: approval.ticket_id,
          stage_id: approval.stage_id,
          action: "delegation_returned",
          actor_id: context.userId,
          actor_name: actorName,
          actor_department: dept,
          comment: `${approval.department ?? "Delegate"} approved — returned to ${approval.origin_department ?? "originating department"} for final approval.`,
        });
        // Notify the parent department admins that they need to finalise.
        const { data: parent } = await supabaseAdmin
          .from("workflow_approvals")
          .select("department, ticket_id")
          .eq("id", parentId)
          .maybeSingle();
        const parentDept = (parent as any)?.department as string | null;
        if (parentDept) {
          const { data: ticket } = await supabaseAdmin
            .from("tickets")
            .select("title")
            .eq("id", approval.ticket_id)
            .maybeSingle();
          const title = (ticket as any)?.title ?? "Ticket";
          const { data: admins } = await supabaseAdmin
            .from("user_roles")
            .select("user_id, profiles!inner(department, email, full_name)")
            .in("role", ["admin", "manager"] as any);
          const notifs: any[] = [];
          for (const r of (admins ?? []) as any[]) {
            if (r.profiles?.department === parentDept) {
              notifs.push({
                user_id: r.user_id,
                ticket_id: approval.ticket_id,
                type: "approval_required",
                title: `Delegate approved (${approval.department}): ${title}`,
                body: `${actorName} approved the delegated request. ${parentDept} must now provide the final department approval.`,
                metadata: {
                  ticket_id: approval.ticket_id,
                  approval_id: parentId,
                  delegated_from: approval.department,
                },
              });
            }
          }
          if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);
        }
        return { ok: true };
      }
      // Reject on child → send back to parent as pending with the rejection note attached.
      if (data.decision === "reject") {
        await supabaseAdmin
          .from("workflow_approvals")
          .update({
            awaiting_delegation: false,
            request_note: `Delegate ${approval.department} rejected: ${data.comment ?? "(no reason)"}`,
          })
          .eq("id", parentId);
        await supabaseAdmin.from("workflow_history").insert({
          ticket_id: approval.ticket_id,
          stage_id: approval.stage_id,
          action: "delegation_rejected",
          actor_id: context.userId,
          actor_name: actorName,
          actor_department: dept,
          comment: `${approval.department ?? "Delegate"} rejected: ${data.comment ?? ""}`,
        });
        return { ok: true };
      }
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
  departments: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
  note: z
    .string()
    .trim()
    .min(1, "Please explain why approval is being requested.")
    .max(2000),
});

export const requestManualApprovals = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => RequestManualSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actorName = (context.profile as any)?.full_name ?? "Admin";
    const actorDept = (context.department as string | null) ?? null;


    const rows = data.departments.map((d) => ({
      ticket_id: data.ticket_id,
      stage_id: null,
      department: d,
      origin_department: d,
      approver_user_id: null,
      assigned_user_id: null,
      status: "pending" as const,
      request_note: data.note,
      requested_by: context.userId,
      requested_by_name: actorName,
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from("workflow_approvals")
      .insert(rows as any)
      .select("id, department");
    if (error) throw new Error(error.message);

    // Log to workflow_history so it shows in the timeline.
    await supabaseAdmin.from("workflow_history").insert({
      ticket_id: data.ticket_id,
      stage_id: null,
      action: "approval_requested",
      actor_id: context.userId,
      actor_name: actorName,
      actor_department: actorDept,
      comment: `${data.note} — Requested approval from: ${data.departments.join(", ")}`,
    });

    // Notify approvers (all admins/managers of the target departments).
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("title")
      .eq("id", data.ticket_id)
      .maybeSingle();
    const title = (ticket as any)?.title ?? "Ticket";

    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, profiles!inner(department, email, full_name)")
      .in("role", ["admin", "manager"] as any);

    const notifications: any[] = [];
    const emailTargets: { email: string; name: string | null; department: string }[] = [];
    for (const d of data.departments) {
      for (const r of (admins ?? []) as any[]) {
        if (r.profiles?.department === d && r.user_id !== context.userId) {
          notifications.push({
            user_id: r.user_id,
            ticket_id: data.ticket_id,
            type: "approval_required",
            title: `Approval requested (${d}): ${title}`,
            body: data.note,
            metadata: { ticket_id: data.ticket_id, department: d, requested_by: actorName },
          });
          if (r.profiles?.email) {
            emailTargets.push({
              email: r.profiles.email,
              name: r.profiles.full_name ?? null,
              department: d,
            });
          }
        }
      }
    }
    if (notifications.length) {
      await supabaseAdmin.from("notifications").insert(notifications);
    }

    // Fire-and-forget approval-request emails.
    await Promise.all(
      emailTargets.map((t) =>
        sendNotificationEmail({
          to: t.email,
          subject: `Approval requested (${t.department}): ${title}`,
          heading: "New approval request",
          intro: `${actorName} has requested ${t.department} department approval on the ticket below. Please review and take action in OpsAssist.`,
          ticketTitle: title,
          body: data.note,
          accent: "warning",
        }).catch(() => ({ sent: false })),
      ),
    );

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

// ============================================================================
// Delegated (forwarded) approvals
// ============================================================================

const ForwardSchema = z.object({
  approval_id: z.string().uuid(),
  to_department: z.string().trim().min(1).max(60),
  to_user_id: z.string().uuid().optional().nullable(),
  note: z.string().trim().min(1, "Please explain why you're forwarding this approval.").max(2000),
});

export const forwardApproval = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => ForwardSchema.parse(input))
  .handler(async ({ data, context }) => {
    const dept = context.department as string | null;
    const actorName = (context.profile as any)?.full_name ?? "Admin";

    const { data: parentRow } = await supabaseAdmin
      .from("workflow_approvals")
      .select("*")
      .eq("id", data.approval_id)
      .maybeSingle();
    if (!parentRow) throw new Error("Approval not found.");
    const parent = parentRow as WorkflowApproval;
    if (parent.status !== "pending") throw new Error("This approval has already been decided.");
    if (parent.awaiting_delegation) throw new Error("This approval is already awaiting a delegate.");
    if (dept && parent.department && parent.department !== dept) {
      throw new Error("You can only forward approvals in your department.");
    }
    if (parent.department === data.to_department && !data.to_user_id) {
      throw new Error("Pick a different department (or an individual approver) to forward to.");
    }

    // Create the delegated child.
    const { data: childRows, error: cErr } = await supabaseAdmin
      .from("workflow_approvals")
      .insert({
        ticket_id: parent.ticket_id,
        stage_id: parent.stage_id,
        department: data.to_department,
        origin_department: parent.origin_department ?? parent.department,
        approver_user_id: null,
        assigned_user_id: data.to_user_id ?? null,
        status: "pending",
        request_note:
          `Forwarded from ${parent.department ?? "originating department"} by ${actorName}: ${data.note}`,
        requested_by: context.userId,
        requested_by_name: actorName,
        delegated_from_id: parent.id,
      } as any)
      .select("id")
      .single();
    if (cErr || !childRows) throw new Error(cErr?.message ?? "Failed to forward");

    await supabaseAdmin
      .from("workflow_approvals")
      .update({ delegated_to_id: (childRows as any).id, awaiting_delegation: true })
      .eq("id", parent.id);

    await supabaseAdmin.from("workflow_history").insert({
      ticket_id: parent.ticket_id,
      stage_id: parent.stage_id,
      action: "approval_delegated",
      actor_id: context.userId,
      actor_name: actorName,
      actor_department: dept,
      comment: `${parent.department ?? "Approver"} delegated to ${data.to_department}${
        data.to_user_id ? " (specific user)" : ""
      }: ${data.note}`,
    });

    // Notify the delegates (specific user OR everyone in the target department).
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("title")
      .eq("id", parent.ticket_id)
      .maybeSingle();
    const title = (ticket as any)?.title ?? "Ticket";

    const emailTargets: { email: string; name: string | null }[] = [];
    const notifs: any[] = [];
    if (data.to_user_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", data.to_user_id)
        .maybeSingle();
      notifs.push({
        user_id: data.to_user_id,
        ticket_id: parent.ticket_id,
        type: "approval_required",
        title: `Approval delegated to you: ${title}`,
        body: data.note,
        metadata: {
          ticket_id: parent.ticket_id,
          approval_id: (childRows as any).id,
          delegated_from: parent.department,
        },
      });
      if ((prof as any)?.email) {
        emailTargets.push({
          email: (prof as any).email,
          name: (prof as any).full_name ?? null,
        });
      }
    } else {
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, profiles!inner(department, email, full_name)")
        .in("role", ["admin", "manager"] as any);
      for (const r of (admins ?? []) as any[]) {
        if (r.profiles?.department === data.to_department) {
          notifs.push({
            user_id: r.user_id,
            ticket_id: parent.ticket_id,
            type: "approval_required",
            title: `Approval delegated (${data.to_department}): ${title}`,
            body: data.note,
            metadata: {
              ticket_id: parent.ticket_id,
              approval_id: (childRows as any).id,
              delegated_from: parent.department,
            },
          });
          if (r.profiles?.email) {
            emailTargets.push({
              email: r.profiles.email,
              name: r.profiles.full_name ?? null,
            });
          }
        }
      }
    }
    if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);
    await Promise.all(
      emailTargets.map((t) =>
        sendNotificationEmail({
          to: t.email,
          subject: `Approval delegated (${data.to_department}): ${title}`,
          heading: "You've been asked to review an approval",
          intro: `${actorName}${parent.department ? ` (${parent.department})` : ""} has delegated an approval to ${data.to_department}. Please review in OpsAssist.`,
          ticketTitle: title,
          body: data.note,
          accent: "warning",
        }).catch(() => ({ sent: false })),
      ),
    );

    return { ok: true, child_id: (childRows as any).id };
  });

// ============================================================================
// Requester provides more info on an approval currently in `info_requested`.
// ============================================================================

const RespondInfoSchema = z.object({
  approval_id: z.string().uuid(),
  message: z.string().trim().min(1, "Please add a message.").max(2000),
});

export const respondToApprovalInfoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RespondInfoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: appr } = await supabaseAdmin
      .from("workflow_approvals")
      .select("*")
      .eq("id", data.approval_id)
      .maybeSingle();
    if (!appr) throw new Error("Approval not found.");
    const approval = appr as WorkflowApproval;
    if (approval.status !== "info_requested") {
      throw new Error("This approval is no longer waiting on you.");
    }

    // Only the ticket owner (requester) may respond.
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("id, user_id, title")
      .eq("id", approval.ticket_id)
      .maybeSingle();
    if (!ticket) throw new Error("Ticket not found.");
    if ((ticket as any).user_id !== context.userId) {
      throw new Error("You can't respond to this approval.");
    }

    // Content moderation.
    const { detectStrongLanguage, STRONG_LANGUAGE_ADVISORY } = await import("./moderation");
    const mod = detectStrongLanguage(data.message);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const userName = (profile as any)?.full_name ?? "User";
    if (mod.flagged) {
      await supabaseAdmin.from("ticket_activity").insert({
        ticket_id: approval.ticket_id,
        actor_id: context.userId,
        actor_name: userName,
        actor_role: "user",
        event_type: "strong_language_blocked",
        description: "Blocked user response to approval info request for strong language",
        metadata: { matches: mod.matches.slice(0, 8), channel: "approval_info" },
      });
      throw new Error(
        `${STRONG_LANGUAGE_ADVISORY} Your response wasn't sent — please rephrase and try again.`,
      );
    }

    // Return the approval to pending, attach the requester's response as request_note.
    const prevNote = approval.request_note ? `${approval.request_note}\n\n---\n` : "";
    await supabaseAdmin
      .from("workflow_approvals")
      .update({
        status: "pending",
        request_note: `${prevNote}Requester response (${userName}): ${data.message}`,
        decision_note: null,
        decided_by: null,
        decided_by_name: null,
        decided_at: null,
      })
      .eq("id", data.approval_id);

    // Timeline entry.
    await supabaseAdmin.from("workflow_history").insert({
      ticket_id: approval.ticket_id,
      stage_id: approval.stage_id,
      action: "info_provided",
      actor_id: context.userId,
      actor_name: userName,
      actor_department: null,
      comment: data.message,
    });

    // Post as a ticket note so it's visible in the chat / notes UI too.
    await supabaseAdmin.from("ticket_notes").insert({
      ticket_id: approval.ticket_id,
      author_id: context.userId,
      author_name: userName,
      author_role: "user",
      body: `[Approval response · ${approval.department ?? "approval"}] ${data.message}`,
    });

    // Notify the admin who requested the info (falls back to department admins).
    const notifyIds = new Set<string>();
    if (approval.decided_by) notifyIds.add(approval.decided_by);
    if (approval.requested_by) notifyIds.add(approval.requested_by);
    if (notifyIds.size === 0 && approval.department) {
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, profiles!inner(department)")
        .eq("role", "admin");
      for (const a of (admins ?? []) as any[]) {
        if (a.profiles?.department === approval.department) notifyIds.add(a.user_id);
      }
    }
    const title = (ticket as any)?.title ?? "Ticket";
    if (notifyIds.size) {
      await supabaseAdmin.from("notifications").insert(
        Array.from(notifyIds).map((uid) => ({
          user_id: uid,
          ticket_id: approval.ticket_id,
          type: "approval_info_provided",
          title: `Info provided: ${title}`,
          body: data.message.slice(0, 200),
          metadata: { approval_id: approval.id, department: approval.department },
        })),
      );
    }

    return { ok: true };
  });


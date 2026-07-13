// Ticket escalation to SuperAdmin.
// Department Admins can escalate a ticket they can access to the SuperAdmin(s).
// Adds audit + in-app + email notifications. Preserves conversation.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";

const ESCALATION_REASONS = [
  "Insufficient permissions",
  "Cross-department issue",
  "Policy decision required",
  "User dispute",
  "Technical limitation",
  "Other",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

const EscalateSchema = z.object({
  ticket_id: z.string().uuid(),
  reason: z.enum(ESCALATION_REASONS),
  notes: z.string().trim().max(2000).optional(),
});

async function sendEscalationEmail(opts: {
  to: string;
  recipientName: string;
  ticket: { id: string; title: string; priority: string; categories: string[] };
  originalAdmin: string;
  originalDepartment: string;
  reason: string;
  notes: string | null;
  escalatedAt: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const when = new Date(opts.escalatedAt).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  });
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <div style="border-left:4px solid #dc2626;padding-left:12px;margin-bottom:16px">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#dc2626;font-weight:700">Ticket escalated</p>
        <h2 style="margin:4px 0 0;font-size:20px">${escape(opts.ticket.title)}</h2>
      </div>
      <p style="margin:0 0 12px;color:#475569">Hi ${escape(opts.recipientName)}, a ticket has been escalated to you for review.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0 16px">
        <tr><td style="padding:6px 0;color:#64748b;width:40%">Ticket ID</td><td style="padding:6px 0;font-family:ui-monospace,Menlo,monospace">${opts.ticket.id.slice(0, 8)}…</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Department</td><td style="padding:6px 0">${escape(opts.originalDepartment)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Escalated by</td><td style="padding:6px 0">${escape(opts.originalAdmin)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Reason</td><td style="padding:6px 0;font-weight:600">${escape(opts.reason)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Priority</td><td style="padding:6px 0">${escape(opts.ticket.priority)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Escalated at</td><td style="padding:6px 0">${when} SAST</td></tr>
      </table>
      ${opts.notes ? `<div style="background:#f8fafc;border-radius:12px;padding:12px 14px;font-size:14px;color:#334155;white-space:pre-wrap">${escape(opts.notes)}</div>` : ""}
      <p style="margin-top:20px;color:#94a3b8;font-size:12px">Open OpsAssist → Admin → Escalated tickets to review.</p>
    </div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: "OpsAssist <no-reply@lukholo.online>",
        to: [opts.to],
        subject: `Ticket escalated — ${opts.ticket.title}`,
        html,
      }),
    });
  } catch (e) {
    console.error("[sendEscalationEmail] failed", e);
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

export const escalateTicket = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => EscalateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const dept = (context.department ?? null) as string | null;
    // SuperAdmins cannot escalate to themselves.
    if (dept === null) {
      throw new Error("SuperAdmins cannot escalate tickets.");
    }

    const { data: ticket, error: tErr } = await supabaseAdmin
      .from("tickets")
      .select("id, title, priority, categories, escalated, user_id")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (tErr || !ticket) throw new Error("Ticket not found.");
    if (!(ticket.categories ?? []).includes(dept)) {
      throw new Error("You can only escalate tickets in your department.");
    }
    if (ticket.escalated) {
      throw new Error("This ticket has already been escalated to the SuperAdmin.");
    }

    const adminName = context.profile?.full_name ?? "Department Admin";
    const escalatedAt = new Date().toISOString();

    // Find SuperAdmin(s) — admins whose profile.department IS NULL.
    const { data: allAdmins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (allAdmins ?? []).map((r) => r.user_id);
    let superAdminIds: string[] = [];
    let primarySuperAdminId: string | null = null;
    if (adminIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, department")
        .in("id", adminIds);
      const supers = (profs ?? []).filter((p) => p.department === null);
      superAdminIds = supers.map((s) => s.id);
      primarySuperAdminId = superAdminIds[0] ?? null;

      // Emails.
      for (const s of supers) {
        if (!s.email) continue;
        await sendEscalationEmail({
          to: s.email,
          recipientName: s.full_name ?? "SuperAdmin",
          ticket: {
            id: ticket.id,
            title: ticket.title,
            priority: ticket.priority,
            categories: ticket.categories ?? [],
          },
          originalAdmin: adminName,
          originalDepartment: dept,
          reason: data.reason,
          notes: data.notes ?? null,
          escalatedAt,
        });
      }
    }

    // Update ticket with escalation fields + reassign to primary SuperAdmin.
    const { error: uErr } = await supabaseAdmin
      .from("tickets")
      .update({
        escalated: true,
        escalated_at: escalatedAt,
        escalated_by: context.userId,
        escalated_by_name: adminName,
        escalated_by_department: dept,
        escalation_reason: data.reason,
        escalation_notes: data.notes ?? null,
        escalation_status: "Pending",
        ...(primarySuperAdminId ? { assigned_to: primarySuperAdminId } : {}),
      })
      .eq("id", data.ticket_id);
    if (uErr) throw new Error(uErr.message);

    // Audit trail entry.
    await supabaseAdmin.from("ticket_activity").insert({
      ticket_id: data.ticket_id,
      actor_id: context.userId,
      actor_name: adminName,
      actor_role: "admin",
      event_type: "escalated",
      description: `${dept} Admin ${adminName} escalated this ticket to the SuperAdmin. Reason: ${data.reason}.`,
      metadata: {
        reason: data.reason,
        notes: data.notes ?? null,
        from_department: dept,
      },
    });

    // In-app notifications to every SuperAdmin.
    if (superAdminIds.length) {
      await supabaseAdmin.from("notifications").insert(
        superAdminIds.map((uid) => ({
          user_id: uid,
          ticket_id: data.ticket_id,
          type: "ticket_escalated",
          title: `Escalated: ${ticket.title}`,
          body: `${adminName} (${dept}) escalated this ticket. Reason: ${data.reason}.`,
          metadata: {
            reason: data.reason,
            from_department: dept,
            escalated_by: adminName,
          },
        })),
      );
    }

    return { ok: true };
  });

export type EscalatedTicketRow = {
  id: string;
  title: string;
  details: string;
  user_name: string;
  priority: string;
  status: string;
  categories: string[];
  created_at: string;
  escalated_at: string;
  escalated_by: string | null;
  escalated_by_name: string | null;
  escalated_by_department: string | null;
  escalation_reason: string | null;
  escalation_notes: string | null;
  escalation_status: string | null;
};

export const listEscalatedTickets = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async ({ context }) => {
    const dept = (context.department ?? null) as string | null;
    // Only SuperAdmins (admins with no department) can view the escalations queue.
    if (dept !== null) {
      return { tickets: [] as EscalatedTicketRow[] };
    }
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select(
        "id, title, details, user_name, priority, status, categories, created_at, escalated_at, escalated_by, escalated_by_name, escalated_by_department, escalation_reason, escalation_notes, escalation_status",
      )
      .eq("escalated", true)
      .order("escalated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { tickets: (data ?? []) as EscalatedTicketRow[] };
  });

export const ESCALATION_REASON_OPTIONS = ESCALATION_REASONS;

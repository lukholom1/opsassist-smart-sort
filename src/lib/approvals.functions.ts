import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ApprovalRow = {
  id: string;
  ticket_id: string;
  department: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "info_requested";
  decision_note: string | null;
  decided_by_name: string | null;
  created_at: string;
  decided_at: string | null;
  ticket_title: string;
  ticket_priority: string;
  ticket_user_name: string;
};

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "pending" | "all" } = {}) => input)
  .handler(async ({ data, context }): Promise<ApprovalRow[]> => {
    let q = context.supabase
      .from("ticket_approvals")
      .select("id, ticket_id, department, reason, status, decision_note, decided_by_name, created_at, decided_at, tickets(title, priority, user_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", "pending");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      ticket_id: r.ticket_id,
      department: r.department,
      reason: r.reason,
      status: r.status,
      decision_note: r.decision_note,
      decided_by_name: r.decided_by_name,
      created_at: r.created_at,
      decided_at: r.decided_at,
      ticket_title: r.tickets?.title ?? "(untitled)",
      ticket_priority: r.tickets?.priority ?? "Medium",
      ticket_user_name: r.tickets?.user_name ?? "User",
    }));
  });

const decisionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "info_requested"]),
  note: z.string().max(1000).optional(),
});

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { error } = await context.supabase
      .from("ticket_approvals")
      .update({
        status: data.status,
        decision_note: data.note ?? null,
        decided_by: context.userId,
        decided_by_name: profile?.full_name ?? "Manager",
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

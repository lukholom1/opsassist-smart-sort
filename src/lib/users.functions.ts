// User management: admin invites users (issuing an OTP), users activate accounts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./auth-helpers.server";

const ROLES = ["admin", "employee", "it_personnel"] as const;

// 6-digit numeric OTP shown once to the admin.
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalize "username" inputs (e.g. "Admin") into a usable email.
function normalizeEmail(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@opsassist.local`;
}

// ---- Get the signed-in user's role + profile (used by client to route them) ----
export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      userId: context.userId,
      role: (roles?.[0]?.role ?? "employee") as "admin" | "employee" | "it_personnel",
      profile,
    };
  });

// ---- Admin: create a pending user account, returns the OTP to share ----
const CreatePendingSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(3).max(120),
  role: z.enum(ROLES),
  department: z.string().trim().max(80).optional(),
});

export const createPendingUser = createServerFn({ method: "POST" })
  .middleware([requireRole(["admin"])])
  .inputValidator((input: unknown) => CreatePendingSchema.parse(input))
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);

    // Reject if a user with that email already exists in auth.
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    if (existingUsers.users.some((u) => u.email === email)) {
      throw new Error("A user with that email already exists.");
    }

    const otp = generateOtp();
    // Upsert so re-inviting the same email re-issues the OTP.
    const { error } = await supabaseAdmin
      .from("pending_activations")
      .upsert(
        {
          email,
          full_name: data.full_name,
          role: data.role,
          department: data.department ?? null,
          otp_code: otp,
          used_at: null,
        },
        { onConflict: "email" },
      );
    if (error) throw new Error(error.message);

    return { email, otp, full_name: data.full_name, role: data.role };
  });

// ---- Admin: list all users (profiles + role) ----
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async () => {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: pending } = await supabaseAdmin
      .from("pending_activations")
      .select("*")
      .is("used_at", null)
      .order("created_at", { ascending: false });
    const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    return {
      users: (profiles ?? []).map((p) => ({ ...p, role: roleByUser.get(p.id) ?? "employee" })),
      pending: pending ?? [],
    };
  });

// ---- Admin: list IT personnel (used by the assignment dropdown) ----
export const listItPersonnel = createServerFn({ method: "GET" })
  .middleware([requireRole(["admin"])])
  .handler(async () => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "it_personnel");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return { it: [] };
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    return { it: profiles ?? [] };
  });

// ---- Public: activate an account using OTP -> creates auth user + profile + role ----
const ActivateSchema = z.object({
  email: z.string().trim().min(3).max(120),
  otp: z.string().trim().length(6),
  password: z.string().min(8).max(72),
});

export const activateAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ActivateSchema.parse(input))
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);

    const { data: pending, error: fetchErr } = await supabaseAdmin
      .from("pending_activations")
      .select("*")
      .eq("email", email)
      .is("used_at", null)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!pending) throw new Error("No pending invitation for that email.");
    if (pending.otp_code !== data.otp) throw new Error("Incorrect activation code.");

    // Create the auth user with the chosen password — email auto-confirmed.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: pending.full_name },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user.");

    const userId = created.user.id;

    // Profile + role rows.
    await supabaseAdmin.from("profiles").insert({
      id: userId,
      full_name: pending.full_name,
      email,
      department: pending.department,
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: pending.role });

    // Mark invitation used.
    await supabaseAdmin
      .from("pending_activations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", pending.id);

    return { ok: true, email };
  });

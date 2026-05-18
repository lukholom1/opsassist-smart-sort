// Server-only auth helpers. NEVER import from client code.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Loads the caller's role and profile (from service-role client to bypass RLS recursion).
export const requireRole = (allowed: ("admin" | "employee" | "it_personnel")[]) =>
  createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuth])
    .server(async ({ next, context }) => {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);

      const userRole = roles?.[0]?.role as "admin" | "employee" | "it_personnel" | undefined;
      if (!userRole || !allowed.includes(userRole)) {
        throw new Error("Forbidden: insufficient role");
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", context.userId)
        .single();

      return next({ context: { ...context, role: userRole, profile } });
    });

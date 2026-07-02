import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationRow = {
  id: string;
  ticket_id: string | null;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationRow[]> => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, ticket_id, type, title, body, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as NotificationRow[];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids?: string[]; all?: boolean }) => input)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (!data.all && data.ids && data.ids.length) {
      q = q.in("id", data.ids);
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const _z = z; // keep import used
void _z;

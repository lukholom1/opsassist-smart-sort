// Public cron endpoint (called every minute by pg_cron) that flushes
// pending admin-message follow-up emails whose 2-minute grace window has
// expired without a user reply.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/admin-message-followup")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendNotificationEmail } = await import("@/lib/email.server");

        const nowIso = new Date().toISOString();
        const { data: pending, error } = await supabaseAdmin
          .from("pending_admin_message_notifications")
          .select("id, ticket_id, user_email, user_name, ticket_title, admin_name, message_preview")
          .is("sent_at", null)
          .is("cancelled_at", null)
          .lte("notify_at", nowIso)
          .limit(100);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let sent = 0;
        for (const row of pending ?? []) {
          const adminName = row.admin_name ?? "Your administrator";
          const preview = (row.message_preview ?? "").slice(0, 500);
          const r = await sendNotificationEmail({
            to: row.user_email,
            subject: `New message from ${adminName} on your support ticket`,
            heading: "You have an unread message from your admin",
            intro: `Hi ${row.user_name ?? "there"}, ${adminName} sent you a message on your ticket and it hasn't been read yet. Please open the chatbot to reply — timely responses help resolve your ticket faster.`,
            body: preview || undefined,
            ticketTitle: row.ticket_title,
            ctaLabel: "Open ticket",
            ctaUrl: "https://opsassist-smart-sort.lovable.app/dashboard",
            accent: "primary",
          });
          await supabaseAdmin
            .from("pending_admin_message_notifications")
            .update({
              sent_at: new Date().toISOString(),
              cancelled_at: r.sent ? null : new Date().toISOString(),
            })
            .eq("id", row.id);
          if (r.sent) sent += 1;
        }

        return new Response(
          JSON.stringify({ ok: true, processed: pending?.length ?? 0, sent }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

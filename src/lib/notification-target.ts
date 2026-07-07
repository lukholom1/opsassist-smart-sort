// Scalable resolver mapping a notification row to a navigation target.
// New notification types only need to add an entry here — no other code changes.

import type { Role } from "@/hooks/use-auth";

export type NotificationLike = {
  type: string;
  ticket_id: string | null;
  metadata?: Record<string, any> | null;
};

export type NotificationTarget = {
  to: string;
  search?: Record<string, string>;
  hash?: string;
};

/**
 * Resolve where clicking a notification should navigate the current viewer.
 * Falls back to a safe home route when nothing better can be determined.
 */
export function getNotificationTarget(
  n: NotificationLike,
  role: Role | null,
): NotificationTarget {
  const meta = (n.metadata ?? {}) as Record<string, any>;
  const ticketId: string | null =
    n.ticket_id ?? (typeof meta.ticket_id === "string" ? meta.ticket_id : null);
  const noteId: string | undefined =
    typeof meta.note_id === "string" ? meta.note_id : undefined;

  const isAdminViewer = role === "admin";
  const ticketRoute = isAdminViewer ? "/admin/tickets" : "/dashboard";
  const fallback: NotificationTarget = {
    to: isAdminViewer ? "/admin" : "/dashboard",
  };

  switch (n.type) {
    case "approval_required":
      // Only admins can act on approvals; regular users just see their ticket.
      return isAdminViewer
        ? { to: "/admin/approvals", search: ticketId ? { highlight: ticketId } : undefined }
        : ticketId
          ? { to: ticketRoute, search: { ticket: ticketId } }
          : fallback;

    case "approval_approved":
    case "approval_rejected":
    case "approval_info_requested":
    case "approval_granted":
    case "approval_denied":
    case "new_note":
    case "ticket_created":
    case "ticket_assigned":
    case "ticket_reassigned":
    case "status_changed":
    case "ticket_resolved":
      if (!ticketId) return fallback;
      return {
        to: ticketRoute,
        search: {
          ticket: ticketId,
          ...(n.type === "new_note" ? { focus: "notes" } : {}),
          ...(noteId ? { note: noteId } : {}),
        },
        ...(noteId ? { hash: `note-${noteId}` } : {}),
      };

    default:
      return ticketId
        ? { to: ticketRoute, search: { ticket: ticketId } }
        : fallback;
  }
}

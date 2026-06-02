import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { hasUnreadNote, markNotesSeen } from "@/lib/notes-unread";

export type NoteRow = {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: "user" | "admin";
  author_name: string;
  body: string;
  created_at: string;
};

type SeedTicket = {
  id: string;
  title: string;
  status: string;
  last_note_at: string | null;
  last_note_role: "user" | "admin" | null;
};

/**
 * Subscribes to ticket_notes inserts via Supabase Realtime.
 * - Maintains an unread count per ticket (other-role messages only).
 * - Shows a toast notification on each new message from the other role.
 * - Seeds initial unread state from the ticket list's last_note metadata.
 */
export function useNotesRealtime(
  viewerRole: "user" | "admin",
  tickets: SeedTicket[],
  openTicketId: string | null,
) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const titlesRef = useRef<Map<string, string>>(new Map());
  const openRef = useRef<string | null>(openTicketId);

  useEffect(() => {
    openRef.current = openTicketId;
  }, [openTicketId]);

  // Seed counts from server-provided last_note_at (1 if unread, else 0)
  // and keep a title map for toast messages.
  useEffect(() => {
    const map = new Map<string, string>();
    setCounts((prev) => {
      const next = { ...prev };
      for (const t of tickets) {
        map.set(t.id, t.title);
        if (next[t.id] === undefined) {
          const unread =
            t.status !== "Resolved" &&
            hasUnreadNote(t.id, t.last_note_at, t.last_note_role, viewerRole);
          next[t.id] = unread ? 1 : 0;
        }
      }
      return next;
    });
    titlesRef.current = map;
  }, [tickets, viewerRole]);

  // Realtime subscription — RLS scopes inserts to tickets the viewer can access.
  useEffect(() => {
    const channel = supabase
      .channel("ticket_notes_inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_notes" },
        (payload) => {
          const note = payload.new as NoteRow;
          if (note.author_role === viewerRole) return; // ignore own role's messages

          // If the relevant dialog is open, treat as read.
          if (openRef.current === note.ticket_id) {
            markNotesSeen(note.ticket_id, note.created_at);
            return;
          }

          setCounts((prev) => ({
            ...prev,
            [note.ticket_id]: (prev[note.ticket_id] ?? 0) + 1,
          }));

          const title = titlesRef.current.get(note.ticket_id) ?? "ticket";
          const who = note.author_role === "admin" ? "Support" : "User";
          toast.message(`${who} replied on "${title}"`, {
            description:
              note.body.length > 120 ? note.body.slice(0, 120) + "…" : note.body,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewerRole]);

  const clearTicket = useCallback((ticketId: string) => {
    setCounts((prev) => (prev[ticketId] ? { ...prev, [ticketId]: 0 } : prev));
    markNotesSeen(ticketId);
  }, []);

  return { counts, clearTicket };
}

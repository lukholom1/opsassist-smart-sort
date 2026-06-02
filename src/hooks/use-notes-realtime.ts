import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * Computes per-ticket unread indicator from the server-derived
 * `last_note_at` + a local "seen" timestamp in localStorage.
 *
 * - Recomputes on every tickets refresh (polling picks up new messages
 *   even when realtime is delayed or blocked).
 * - Subscribes to realtime INSERTs on ticket_notes as an enhancement:
 *   bumps the local count and fires a toast immediately.
 * - When the relevant dialog is open, marks notes as seen (no badge).
 */
export function useNotesRealtime(
  viewerRole: "user" | "admin",
  tickets: SeedTicket[],
  openTicketId: string | null,
) {
  // Tick used to force re-derivation of counts after a realtime event or
  // after the user opens/closes a dialog (which mutates localStorage).
  const [tick, setTick] = useState(0);
  const titlesRef = useRef<Map<string, string>>(new Map());
  const lastSeenAtRef = useRef<Map<string, string>>(new Map());
  const openRef = useRef<string | null>(openTicketId);

  useEffect(() => {
    openRef.current = openTicketId;
  }, [openTicketId]);

  // Seed counts from server-provided last_note_at (1 if unread, else 0)
  // and keep a title map for toast messages.
  useEffect(() => {
    const map = new Map<string, string>();
    for (const t of tickets) map.set(t.id, t.title);
    titlesRef.current = map;
  }, [tickets]);

  // Derive counts from current server data + local "seen" stamp.
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const t of tickets) {
      if (t.status === "Resolved") {
        result[t.id] = 0;
        continue;
      }
      // If this ticket's dialog is open, treat as read.
      if (openRef.current === t.id) {
        result[t.id] = 0;
        continue;
      }
      const unread = hasUnreadNote(
        t.id,
        t.last_note_at,
        t.last_note_role,
        viewerRole,
      );
      result[t.id] = unread ? 1 : 0;
    }
    return result;
    // `tick` is intentionally part of deps so realtime events recompute.
  }, [tickets, viewerRole, tick]);

  // Detect newly-arrived notes by comparing last_note_at to previous value;
  // fire a toast for messages from the other role.
  useEffect(() => {
    for (const t of tickets) {
      if (!t.last_note_at || !t.last_note_role) continue;
      const prev = lastSeenAtRef.current.get(t.id);
      lastSeenAtRef.current.set(t.id, t.last_note_at);
      if (!prev) continue; // first sighting — don't toast on initial load
      if (t.last_note_role === viewerRole) continue;
      if (new Date(t.last_note_at).getTime() <= new Date(prev).getTime()) continue;
      if (openRef.current === t.id) {
        markNotesSeen(t.id, t.last_note_at);
        continue;
      }
      const who = t.last_note_role === "admin" ? "Support" : "User";
      toast.message(`${who} replied on "${t.title}"`);
    }
  }, [tickets, viewerRole]);

  // Realtime subscription — when an INSERT lands, refresh derivation and
  // toast immediately with the message body.
  useEffect(() => {
    const channel = supabase
      .channel("ticket_notes_inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_notes" },
        (payload) => {
          const note = payload.new as NoteRow;
          if (note.author_role === viewerRole) return;

          if (openRef.current === note.ticket_id) {
            markNotesSeen(note.ticket_id, note.created_at);
            setTick((n) => n + 1);
            return;
          }

          const title = titlesRef.current.get(note.ticket_id) ?? "ticket";
          const who = note.author_role === "admin" ? "Support" : "User";
          toast.message(`${who} replied on "${title}"`, {
            description:
              note.body.length > 120 ? note.body.slice(0, 120) + "…" : note.body,
          });
          setTick((n) => n + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewerRole]);

  const clearTicket = useCallback((ticketId: string) => {
    markNotesSeen(ticketId);
    setTick((n) => n + 1);
  }, []);

  return { counts, clearTicket };
}

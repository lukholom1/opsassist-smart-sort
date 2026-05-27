// Per-user, per-ticket "last seen note" tracking via localStorage.
const KEY = (ticketId: string) => `notes_seen:${ticketId}`;

export function hasUnreadNote(
  ticketId: string,
  lastNoteAt: string | null | undefined,
  lastNoteRole: "user" | "admin" | null | undefined,
  viewerRole: "user" | "admin",
): boolean {
  if (!lastNoteAt || !lastNoteRole) return false;
  if (lastNoteRole === viewerRole) return false;
  if (typeof window === "undefined") return false;
  const seen = window.localStorage.getItem(KEY(ticketId));
  if (!seen) return true;
  return new Date(lastNoteAt).getTime() > new Date(seen).getTime();
}

export function markNotesSeen(ticketId: string, lastNoteAt?: string | null) {
  if (typeof window === "undefined") return;
  const stamp = lastNoteAt ?? new Date().toISOString();
  window.localStorage.setItem(KEY(ticketId), stamp);
}

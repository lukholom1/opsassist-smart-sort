import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getNotificationTarget } from "@/lib/notification-target";

type Notif = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  ticket_id: string | null;
  metadata: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
};

const APPROVAL_TYPES = new Set([
  "approval_required",
  "approval_granted",
  "approval_denied",
  "approval_info_requested",
]);

export function NotificationsBell() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const initialLoaded = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, type, ticket_id, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      setItems((data ?? []) as Notif[]);
      setLoading(false);
      initialLoaded.current = true;
    })();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Notif;
          setItems((prev) => [n, ...prev].slice(0, 50));
          // Popup toast for approval-related events.
          if (APPROVAL_TYPES.has(n.type)) {
            const variant =
              n.type === "approval_granted"
                ? "success"
                : n.type === "approval_denied"
                  ? "error"
                  : "info";
            const fn =
              variant === "success"
                ? toast.success
                : variant === "error"
                  ? toast.error
                  : toast;
            fn(n.title, { description: n.body ?? undefined, duration: 8000 });
          } else if (initialLoaded.current) {
            toast(n.title, { description: n.body ?? undefined });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const unread = items.filter((i) => !i.read_at).length;

  async function markAllRead() {
    if (!userId || unread === 0) return;
    const ids = items.filter((i) => !i.read_at).map((i) => i.id);
    setItems((prev) => prev.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() })));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  }

  async function markOneRead(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read_at: new Date().toISOString() } : i)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  }

  if (!userId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative rounded-lg" aria-label="Notifications">
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck size={12} className="mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const isUnread = !n.read_at;
                const accent =
                  n.type === "approval_required"
                    ? "border-l-warning"
                    : n.type === "approval_granted"
                      ? "border-l-emerald-500"
                      : n.type === "approval_denied"
                        ? "border-l-destructive"
                        : "border-l-primary";
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => markOneRead(n.id)}
                      className={cn(
                        "flex w-full items-start gap-2 border-l-2 px-4 py-3 text-left transition hover:bg-muted/50",
                        accent,
                        isUnread ? "bg-primary/[0.04]" : "opacity-80",
                      )}
                    >
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium leading-tight">{n.title}</div>
                          {isUnread && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {n.body && (
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </div>
                        )}
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {new Date(n.created_at).toLocaleString()}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listMyNotifications, markNotificationsRead, type NotificationRow } from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function NotificationBell() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const load = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationsRead);

  const unread = items.filter((n) => !n.read_at).length;

  async function refresh() {
    try {
      const rows = await load();
      setItems(rows);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      channel = supabase
        .channel(`notif-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as NotificationRow;
            setItems((prev) => [row, ...prev].slice(0, 50));
            toast.message(row.title, { description: row.body ?? undefined });
          },
        )
        .subscribe();
    })();
    return () => {
      clearInterval(t);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && unread > 0) {
      await markRead({ data: { all: true } });
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative rounded-lg">
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications yet</div>
        )}
        {items.map((n) => (
          <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium leading-tight">{n.title}</span>
              {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
            </div>
            {n.body && <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
            <span className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

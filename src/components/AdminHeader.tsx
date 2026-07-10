import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { NotificationsBell } from "@/components/NotificationsBell";

/**
 * Shared header used on every admin page EXCEPT the admin landing page.
 * Layout: [Admin Full Name · Department]  ...  [optional right slot] [Bell] [Back]
 * The Back button always returns to /admin.
 */
export function AdminHeader({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const { fullName, department } = useAuth();
  return (
    <header className="border-b border-border bg-card/40 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4">
        <div className="min-w-0 flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground truncate max-w-[45vw] sm:max-w-none">
            {fullName ?? "Admin"}
          </span>
          {department && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground truncate">{department}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rightSlot}
          <NotificationsBell />
          <Button asChild variant="outline" size="sm" className="rounded-lg" aria-label="Back to admin">
            <Link to="/admin">
              <ArrowLeft size={14} className="sm:mr-1.5" />
              <span className="hidden sm:inline">Back</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

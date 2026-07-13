import { createFileRoute, useNavigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  createPendingUser,
  deletePendingUser,
  deleteUser,
  listUsers,
  reclassifyUser,
} from "@/lib/users.functions";
import { getAdminAnalytics } from "@/lib/analytics.functions";
import { AdminCharts } from "@/components/AdminCharts";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { NotificationsBell } from "@/components/NotificationsBell";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogOut, Loader2, UserPlus, Copy, Check, Users, Mail, Trash2, BarChart3, TicketCheck, TrendingUp, CheckCircle2, Sparkles, Star, LineChart, Shield, ClipboardCheck, ShieldAlert, Menu } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — OpsAssist" }] }),
  component: AdminRoute,
});

function AdminRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname === "/admin" ? <AdminPage /> : <Outlet />;
}

function AdminPage() {
  const navigate = useNavigate();
  const { signOut, fullName, department, role } = useAuth();
  useEffect(() => {
    if (role && role !== "admin") navigate({ to: "/dashboard", replace: true });
  }, [role, navigate]);
  const [showUsers, setShowUsers] = useState(false);

  const isSuperAdmin = department === null;

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  const navLinks = (
    <>
      <Button asChild size="sm" className="w-full sm:w-auto justify-start sm:justify-center rounded-lg bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95">
        <Link to="/admin/tickets"><TicketCheck size={14} className="mr-1.5" />Tickets</Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="w-full sm:w-auto justify-start sm:justify-center rounded-lg">
        <Link to="/admin/insights"><BarChart3 size={14} className="mr-1.5" />Insights</Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="w-full sm:w-auto justify-start sm:justify-center rounded-lg border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10">
        <Link to="/admin/approvals"><ClipboardCheck size={14} className="mr-1.5" />Approvals</Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="w-full sm:w-auto justify-start sm:justify-center rounded-lg border-purple-accent/40 text-purple-accent hover:bg-purple-accent/10">
        <Link to="/admin/predictions"><LineChart size={14} className="mr-1.5" />Predictions</Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="w-full sm:w-auto justify-start sm:justify-center rounded-lg border-purple-accent/40 text-purple-accent hover:bg-purple-accent/10">
        <Link to="/admin/compliance"><Shield size={14} className="mr-1.5" />Compliance</Link>
      </Button>
      {isSuperAdmin && (
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto justify-start sm:justify-center rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10">
          <Link to="/admin/escalated"><ShieldAlert size={14} className="mr-1.5" />Escalated</Link>
        </Button>
      )}
      {isSuperAdmin && (
        <Button variant="outline" size="sm" onClick={() => setShowUsers(true)} className="w-full sm:w-auto justify-start sm:justify-center rounded-lg">
          <Users size={14} className="mr-1.5" /> Users
        </Button>
      )}
    </>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4">
          <Logo />
          <div className="flex items-center gap-2">
            {/* Desktop nav */}
            <div className="hidden lg:flex items-center gap-2">{navLinks}</div>
            <NotificationsBell />
            <span className="hidden xl:inline text-sm text-muted-foreground truncate max-w-[180px]">
              {fullName ?? "Admin"} {department && <span className="font-medium text-foreground">· {department}</span>}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden sm:inline-flex rounded-lg">
              <LogOut size={14} className="mr-1.5" /> Sign out
            </Button>
            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden rounded-lg" aria-label="Open menu">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-sm flex flex-col gap-3">
                <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
                <div className="text-sm text-muted-foreground">
                  {fullName ?? "Admin"} {department && <span className="font-medium text-foreground">· {department}</span>}
                </div>
                <div className="flex flex-col gap-2">{navLinks}</div>
                <Button variant="outline" size="sm" onClick={handleSignOut} className="justify-start rounded-lg mt-2">
                  <LogOut size={14} className="mr-1.5" /> Sign out
                </Button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          {isSuperAdmin ? "Admin dashboard" : `${department} dashboard`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A live snapshot of ticket activity. Open <span className="font-medium text-foreground">Tickets</span> to manage requests, or jump to <span className="font-medium text-foreground">Insights</span> for the full report.
        </p>

        <TicketAnalyticsSection />
      </main>
      {showUsers && <UsersDialog onClose={() => setShowUsers(false)} />}
    </div>
  );
}


type Analytics = Awaited<ReturnType<typeof getAdminAnalytics>>;

function TicketAnalyticsSection() {
  const fetchAnalytics = useServerFn(getAdminAnalytics);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAnalytics({ data: {} })
      .then((a) => {
        if (active) setData(a);
      })
      .catch((e) => console.error("[admin] analytics failed", e))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchAnalytics]);

  const t = data?.totals;
  const avgHandling = data?.handling.find((h) => h.metric === "Resolution")?.minutes ?? 0;

  return (
    <section className="mt-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total tickets" value={t?.tickets ?? "—"} icon={<TrendingUp size={14} />} tone="blue" />
        <Kpi label="Resolved" value={t?.resolved ?? "—"} icon={<CheckCircle2 size={14} />} tone="success" />
        <Kpi label="Resolved by AI" value={t?.byAi ?? "—"} icon={<Sparkles size={14} />} tone="purple" />
        <Kpi label="Avg rating" value={t?.avgRating ? `${t.avgRating}/5` : "—"} icon={<Star size={14} />} tone="warning" />
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Average business-hours resolution: <span className="font-medium text-foreground">{avgHandling} min</span>
      </div>

      <div className="mt-4">
        {loading && !data ? (
          <div className="flex h-[280px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading ticket analytics…
          </div>
        ) : data ? (
          <div className="-mx-4 sm:-mx-6 overflow-x-auto">
            <AdminCharts data={data} />
          </div>
        ) : (
          <div className="flex h-[200px] items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
            No analytics available yet.
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone = "blue",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "blue" | "success" | "purple" | "warning";
}) {
  const toneRing =
    tone === "success"
      ? "from-success/20 to-transparent"
      : tone === "purple"
        ? "from-purple-accent/25 to-transparent"
        : tone === "warning"
          ? "from-warning/25 to-transparent"
          : "from-soft-blue/25 to-transparent";
  const toneText =
    tone === "success"
      ? "text-success"
      : tone === "purple"
        ? "text-purple-accent"
        : tone === "warning"
          ? "text-warning"
          : "text-soft-blue";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 shadow-[var(--shadow-soft)] backdrop-blur-sm">
      <div className={`pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-gradient-to-br ${toneRing} blur-2xl`} />
      <div className="relative flex items-center gap-2">
        <span className={toneText}>{icon}</span>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="relative mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}



function UsersDialog({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const fetchUsers = useServerFn(listUsers);
  const createUser = useServerFn(createPendingUser);
  const removeUser = useServerFn(deleteUser);
  const removePending = useServerFn(deletePendingUser);
  const reclassify = useServerFn(reclassifyUser);
  const [data, setData] = useState<{
    users: Array<{ id: string; full_name: string; email: string; role: string; department: string | null }>;
    pending: Array<{ email: string; full_name: string; role: string; otp_code: string; department: string | null }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdOtp, setCreatedOtp] = useState<{
    email: string;
    otp: string;
    full_name: string;
    role: string;
    department: string | null;
    email_sent: boolean;
    email_error: string | null;
  } | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [dept, setDept] = useState<"HR" | "IT" | "Finance" | "Operations">("IT");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const r = (await fetchUsers()) as typeof data;
    setData(r);
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await createUser({
        data: {
          full_name: fullName,
          email,
          role,
          department: role === "admin" ? dept : undefined,
        },
      });
      setCreatedOtp(r);
      setShowCreate(false);
      setFullName("");
      setEmail("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function copyOtp() {
    if (!createdOtp) return;
    await navigator.clipboard.writeText(createdOtp.otp);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function onReclassify(
    userId: string,
    role: "employee" | "admin",
    department: "HR" | "IT" | "Finance" | "Operations" | null,
  ) {
    try {
      await reclassify({ data: { user_id: userId, role, department } });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to reclassify user.");
    }
  }

  async function onDelete(userId: string, label: string) {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      await removeUser({ data: { user_id: userId } });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete user.");
    }
  }

  async function onCancelPending(email: string) {
    if (!confirm(`Cancel pending invite for ${email}?`)) return;
    try {
      await removePending({ data: { email } });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to cancel invite.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Users</DialogTitle>
          <DialogDescription>
            Create Employees or Department Admins. OTPs are emailed automatically.
          </DialogDescription>
        </DialogHeader>

        {createdOtp && (
          <div className="rounded-2xl border border-purple-accent/30 bg-purple-accent/5 p-4">
            <p className="text-sm font-medium">
              Activation code for {createdOtp.full_name} ({createdOtp.email})
              {createdOtp.department && (
                <span className="ml-2 text-xs text-muted-foreground">— {createdOtp.department}</span>
              )}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <code className="rounded-lg bg-card px-4 py-2 text-2xl font-bold tracking-widest">
                {createdOtp.otp}
              </code>
              <Button size="sm" variant="outline" onClick={copyOtp} className="rounded-lg">
                {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                Copy
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail size={12} />
              {createdOtp.email_sent
                ? "Code emailed to the user."
                : `Email could not be sent (${createdOtp.email_error ?? "unknown"}). Share the code manually.`}
            </p>
          </div>
        )}

        {!showCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            className="w-fit rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            <UserPlus size={14} className="mr-1.5" /> Create user
          </Button>
        )}

        {showCreate && (
          <form onSubmit={onCreate} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="user@company.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Account type</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Department Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role === "admin" && (
                <div className="grid gap-1.5">
                  <Label>Department</Label>
                  <Select value={dept} onValueChange={(v) => setDept(v as typeof dept)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HR">HR</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {err && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create & send OTP
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="rounded-xl">
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading users...
            </div>
          ) : (
            <table className="w-full min-w-[600px] text-sm">

              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.users ?? []).map((u) => {
                  const isSelf = u.id === myId;
                  const isSuper = u.role === "admin" && !u.department;
                  return (
                    <tr key={u.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">{u.full_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2">
                        {isSelf || isSuper ? (
                          <span className="text-xs text-muted-foreground">
                            {isSuper ? "super admin" : u.role}
                          </span>
                        ) : (
                          <Select
                            value={u.role === "admin" ? "admin" : "employee"}
                            onValueChange={(v) =>
                              onReclassify(
                                u.id,
                                v as "employee" | "admin",
                                v === "admin" ? (u.department as "HR" | "IT" | "Finance" | "Operations" | null) ?? "IT" : null,
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[150px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="employee">Employee</SelectItem>
                              <SelectItem value="admin">Department Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {u.role === "admin" && !isSuper && !isSelf ? (
                          <Select
                            value={u.department ?? "IT"}
                            onValueChange={(v) =>
                              onReclassify(u.id, "admin", v as "HR" | "IT" | "Finance" | "Operations")
                            }
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HR">HR</SelectItem>
                              <SelectItem value="IT">IT</SelectItem>
                              <SelectItem value="Finance">Finance</SelectItem>
                              <SelectItem value="Operations">Operations</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{u.department ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!isSelf && !isSuper && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(u.id, u.full_name || u.email)}
                            className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(data?.pending ?? []).map((p) => (
                  <tr key={p.email} className="border-b border-border/60 bg-warning/5 last:border-0">
                    <td className="px-3 py-2">{p.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.email}</td>
                    <td className="px-3 py-2">{p.role} · pending</td>
                    <td className="px-3 py-2">{p.department ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancelPending(p.email)}
                        className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

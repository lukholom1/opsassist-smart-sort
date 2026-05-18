import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listAllTickets, updateTicketStatus, assignTicket } from "@/lib/tickets.functions";
import { createPendingUser, listUsers, listItPersonnel } from "@/lib/users.functions";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
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
import { LogOut, Loader2, Search, UserPlus, Bot, Copy, Check, Users } from "lucide-react";
import { elapsed, CategoryPill, PriorityPill } from "@/components/ticket-bits";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — OpsAssist" }] }),
  component: AdminPage,
});

type Status = "Open" | "In Progress" | "Resolved";
type Ticket = {
  id: string;
  user_name: string;
  title: string;
  details: string;
  category: string;
  priority: string;
  status: Status;
  created_at: string;
  resolved_at: string | null;
  resolved_by_ai: boolean;
  assigned_to: string | null;
  assignee_name?: string | null;
};

function AdminPage() {
  const navigate = useNavigate();
  const { signOut, fullName } = useAuth();
  const fetchAll = useServerFn(listAllTickets);
  const fetchIt = useServerFn(listItPersonnel);
  const updateStatus = useServerFn(updateTicketStatus);
  const assign = useServerFn(assignTicket);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [it, setIt] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterPri, setFilterPri] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [showUsers, setShowUsers] = useState(false);

  async function refresh() {
    const [t, p] = await Promise.all([fetchAll(), fetchIt()]);
    setTickets(t.tickets as Ticket[]);
    setIt(p.it);
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeStatus(id: string, next: Status) {
    const prev = tickets;
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, status: next } : t)));
    setSaving(id);
    try {
      await updateStatus({ data: { id, status: next } });
      if (next === "Resolved") await refresh();
    } catch {
      setTickets(prev);
    } finally {
      setSaving(null);
    }
  }

  async function reassign(id: string, who: string | null) {
    setSaving(id);
    try {
      await assign({ data: { id, assigned_to: who } });
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        if (filterCat !== "all" && t.category !== filterCat) return false;
        if (filterPri !== "all" && t.priority !== filterPri) return false;
        if (query) {
          const q = query.toLowerCase();
          if (
            !t.title.toLowerCase().includes(q) &&
            !t.user_name.toLowerCase().includes(q) &&
            !t.details.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      }),
    [tickets, query, filterCat, filterPri],
  );

  const active = filtered.filter((t) => t.status !== "Resolved");
  const resolved = filtered.filter((t) => t.status === "Resolved");

  const stats = useMemo(() => {
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === "Open").length,
      inProgress: tickets.filter((t) => t.status === "In Progress").length,
      resolved: tickets.filter((t) => t.status === "Resolved").length,
      byAi: tickets.filter((t) => t.resolved_by_ai).length,
    };
  }, [tickets]);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowUsers(true)} className="rounded-lg">
              <Users size={14} className="mr-1.5" /> Users
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {fullName ?? "Admin"}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="rounded-lg">
              <LogOut size={14} className="mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">All tickets, all users, full control.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total" value={stats.total} />
          <Stat label="Open" value={stats.open} tone="warning" />
          <Stat label="In progress" value={stats.inProgress} tone="blue" />
          <Stat label="Resolved" value={stats.resolved} tone="success" />
          <Stat label="By AI" value={stats.byAi} tone="purple" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, user, details..."
              className="pl-9"
            />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
              <SelectItem value="IT">IT</SelectItem>
              <SelectItem value="Finance">Finance</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPri} onValueChange={setFilterPri}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="mt-8 flex items-center justify-center rounded-2xl border border-border bg-card py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <TableSection title={`Active tickets (${active.length})`}>
              <Table
                tickets={active}
                it={it}
                saving={saving}
                onStatus={changeStatus}
                onAssign={reassign}
              />
            </TableSection>
            <TableSection title={`Resolved tickets (${resolved.length})`}>
              <Table
                tickets={resolved}
                it={it}
                saving={saving}
                onStatus={changeStatus}
                onAssign={reassign}
                showAi
              />
            </TableSection>
          </>
        )}
      </main>
      <Footer />
      {showUsers && <UsersDialog onClose={() => setShowUsers(false)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warning" | "blue" | "success" | "purple" }) {
  const toneCls: Record<string, string> = {
    warning: "text-warning",
    blue: "text-soft-blue",
    success: "text-success",
    purple: "text-purple-accent",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ? toneCls[tone] : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function TableSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {children}
      </div>
    </div>
  );
}

function Table({
  tickets,
  it,
  saving,
  onStatus,
  onAssign,
  showAi,
}: {
  tickets: Ticket[];
  it: { id: string; full_name: string }[];
  saving: string | null;
  onStatus: (id: string, next: Status) => void;
  onAssign: (id: string, who: string | null) => void;
  showAi?: boolean;
}) {
  if (tickets.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No tickets.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Ticket</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Assignee</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{t.user_name}</td>
              <td className="max-w-sm px-4 py-3">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  {t.title}
                  {showAi && t.resolved_by_ai && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-accent ring-1 ring-inset ring-purple-accent/20">
                      <Bot size={10} /> AI
                    </span>
                  )}
                </div>
                <div className="line-clamp-1 text-xs text-muted-foreground">{t.details}</div>
              </td>
              <td className="px-4 py-3"><CategoryPill value={t.category} /></td>
              <td className="px-4 py-3"><PriorityPill value={t.priority} /></td>
              <td className="px-4 py-3">
                <Select
                  value={t.assigned_to ?? "unassigned"}
                  onValueChange={(v) => onAssign(t.id, v === "unassigned" ? null : v)}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {it.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Select value={t.status} onValueChange={(v) => onStatus(t.id, v as Status)}>
                    <SelectTrigger className="h-8 w-[140px] rounded-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                  {saving === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{elapsed(t.created_at, t.resolved_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Users dialog: list, create new (returns OTP) ----
function UsersDialog({ onClose }: { onClose: () => void }) {
  const fetchUsers = useServerFn(listUsers);
  const createUser = useServerFn(createPendingUser);
  const [data, setData] = useState<{ users: Array<{ id: string; full_name: string; email: string; role: string; department: string | null }>; pending: Array<{ email: string; full_name: string; role: string; otp_code: string; department: string | null }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdOtp, setCreatedOtp] = useState<{ email: string; otp: string; full_name: string; role: string } | null>(null);

  // Form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"employee" | "it_personnel" | "admin">("employee");
  const [dept, setDept] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const r = await fetchUsers();
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
        data: { full_name: fullName, email, role, department: dept || undefined },
      });
      setCreatedOtp(r);
      setShowCreate(false);
      setFullName("");
      setEmail("");
      setDept("");
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Users</DialogTitle>
          <DialogDescription>Create accounts for employees and IT personnel.</DialogDescription>
        </DialogHeader>

        {createdOtp && (
          <div className="rounded-2xl border border-purple-accent/30 bg-purple-accent/5 p-4">
            <p className="text-sm font-medium">Activation code for {createdOtp.full_name} ({createdOtp.email})</p>
            <div className="mt-2 flex items-center gap-3">
              <code className="rounded-lg bg-card px-4 py-2 text-2xl font-bold tracking-widest">
                {createdOtp.otp}
              </code>
              <Button size="sm" variant="outline" onClick={copyOtp} className="rounded-lg">
                {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                Copy
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Share this code with the user. They activate at the login screen via "New user?".
            </p>
          </div>
        )}

        {!showCreate && (
          <Button onClick={() => setShowCreate(true)} className="rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95 w-fit">
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
                <Label>Email or username</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee / Client</SelectItem>
                    <SelectItem value="it_personnel">IT Personnel</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Department</Label>
                <Input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Engineering" />
              </div>
            </div>
            {err && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} className="rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate activation code
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="rounded-xl">
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div className="max-h-[40vh] overflow-auto rounded-xl border border-border">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-medium">{u.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2 capitalize">{u.role.replace("_", " ")}</td>
                    <td className="px-3 py-2 text-muted-foreground">{u.department ?? "—"}</td>
                    <td className="px-3 py-2"><span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Active</span></td>
                  </tr>
                ))}
                {data?.pending.map((p) => (
                  <tr key={p.email} className="border-b border-border/60 last:border-0 bg-warning/5">
                    <td className="px-3 py-2 font-medium">{p.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.email}</td>
                    <td className="px-3 py-2 capitalize">{p.role.replace("_", " ")}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.department ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
                        OTP: <code className="font-mono">{p.otp_code}</code>
                      </span>
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

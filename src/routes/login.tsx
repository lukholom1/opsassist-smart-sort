import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { activateAccount } from "@/lib/users.functions";
import { useServerFn } from "@tanstack/react-start";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, UserPlus, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — OpsAssist" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    admin: search.admin === 1 || search.admin === "1" ? 1 : undefined,
  }),
  // If already signed in, send them to the index router.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

type Mode = "signin" | "activate";

function LoginPage() {
  const { admin } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-soft)]">
          {mode === "signin" ? (
            <SignInForm onSwitch={() => setMode("activate")} isAdmin={admin === 1} />
          ) : (
            <ActivateForm onSwitch={() => setMode("signin")} />
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Built by <span className="font-semibold text-foreground">BYTEBUILDERS</span>
        </p>
      </div>
    </div>
  );
}

function normalizeEmail(input: string) {
  const t = input.trim().toLowerCase();
  return t.includes("@") ? t : `${t}@opsassist.local`;
}

function SignInForm({ onSwitch, isAdmin = false }: { onSwitch: () => void; isAdmin?: boolean }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState(isAdmin ? "Admin" : "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    setLoading(false);
    if (error) {
      setError("Invalid credentials. Try again.");
      return;
    }
    if (isAdmin) {
      navigate({ to: "/admin" });
    } else {
      navigate({ to: "/" });
    }
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold">Sign in to OpsAssist</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your email or username.</p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label>Email or username</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Admin or you@company.com"
            autoFocus
            required
          />
        </div>
        <div className="grid gap-2">
          <Label>Password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button
          type="submit"
          disabled={loading}
          className="h-11 rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign in
        </Button>
      </form>
      <button
        type="button"
        onClick={onSwitch}
        className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
      >
        <UserPlus size={14} /> New user? Activate your account
      </button>
      <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
        ← Back home
      </Link>
    </>
  );
}

function ActivateForm({ onSwitch }: { onSwitch: () => void }) {
  const activate = useServerFn(activateAccount);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await activate({ data: { email, otp, password } });
      // Auto-sign-in after activation.
      const { error: si } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });
      if (si) throw new Error("Activated, but sign-in failed. Try signing in manually.");
      setDone(true);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold">Activate your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the activation code (OTP) your admin gave you.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label>Email or username</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="grid gap-2">
          <Label>Activation code</Label>
          <Input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label>Choose a password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </div>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {done && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Account activated! Redirecting...</p>}
        <Button
          type="submit"
          disabled={loading}
          className="h-11 rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Activate & sign in
        </Button>
      </form>
      <button
        type="button"
        onClick={onSwitch}
        className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
      >
        <ArrowLeft size={14} /> Back to sign in
      </button>
    </>
  );
}

useEffect; // silence unused-import warning if tree-shaken

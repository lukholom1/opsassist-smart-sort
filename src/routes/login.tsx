import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  activateAccount,
  confirmPasswordReset,
  requestPasswordReset,
  resolveLoginEmail,
} from "@/lib/users.functions";
import { useServerFn } from "@tanstack/react-start";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, UserPlus, ArrowLeft, KeyRound } from "lucide-react";

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

type Mode = "signin" | "activate" | "forgot";

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
          {mode === "signin" && (
            <SignInForm
              onActivate={() => setMode("activate")}
              onForgot={() => setMode("forgot")}
              isAdmin={admin === 1}
            />
          )}
          {mode === "activate" && <ActivateForm onSwitch={() => setMode("signin")} />}
          {mode === "forgot" && <ForgotPasswordForm onSwitch={() => setMode("signin")} />}
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

function SignInForm({
  onActivate,
  onForgot,
  isAdmin = false,
}: {
  onActivate: () => void;
  onForgot: () => void;
  isAdmin?: boolean;
}) {
  const navigate = useNavigate();
  const resolve = useServerFn(resolveLoginEmail);
  const [identifier, setIdentifier] = useState(isAdmin ? "Admin" : "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { email } = await resolve({ data: { identifier } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("Invalid credentials. Try again.");
        return;
      }
      navigate({ to: isAdmin ? "/admin" : "/" });
    } catch {
      setError("Invalid credentials. Try again.");
    } finally {
      setLoading(false);
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
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
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
          {isAdmin ? "Sign in" : "User sign in"}
        </Button>
      </form>
      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={onForgot}
          className="text-center text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          Forgot password?
        </button>
        <button
          type="button"
          onClick={onActivate}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          <UserPlus size={14} /> New user? Activate your account
        </button>
      </div>
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
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await activate({ data: { email, otp, password, username } });
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
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. jane.doe@company.com"
            required
          />
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
          <Label>Create username</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. jane.doe"
            minLength={3}
            maxLength={30}
            pattern="[A-Za-z0-9._-]{3,30}"
            required
          />
          <p className="text-xs text-muted-foreground">3–30 chars: letters, numbers, . _ -</p>
        </div>
        <div className="grid gap-2">
          <Label>Create password</Label>
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

function ForgotPasswordForm({ onSwitch }: { onSwitch: () => void }) {
  const requestReset = useServerFn(requestPasswordReset);
  const confirmReset = useServerFn(confirmPasswordReset);
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await requestReset({ data: { email } });
      setInfo("If an account exists for that email, a reset code has been sent.");
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset code.");
    } finally {
      setLoading(false);
    }
  }

  async function submitConfirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await confirmReset({ data: { email, otp, password } });
      const { error: si } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });
      if (si) {
        setInfo("Password reset. You can now sign in with your new password.");
        setStep("request");
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "request"
            ? "Enter your email and we'll send you a one-time code."
            : "Enter the code we emailed you and set a new password."}
        </p>
      </div>

      {step === "request" ? (
        <form onSubmit={submitRequest} className="grid gap-4">
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. jane.doe@company.com"
              autoFocus
              required
            />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Send reset code
          </Button>
        </form>
      ) : (
        <form onSubmit={submitConfirm} className="grid gap-4">
          {info && (
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{info}</p>
          )}
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. jane.doe@company.com"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Reset code</Label>
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
            <Label>New password</Label>
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
          <Button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)] hover:opacity-95"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reset password & sign in
          </Button>
        </form>
      )}

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

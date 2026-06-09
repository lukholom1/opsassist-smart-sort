import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpsAssist — AI Internal Support Desk" },
      { name: "description", content: "AI-powered ticket classification, response, and routing." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const userId = data.session.user.id;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const role = roles?.[0]?.role;
    if (role === "admin") throw redirect({ to: "/admin" });
    throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-20 -top-20 h-[28rem] w-[28rem] rounded-full opacity-30 blur-[100px]"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div
          className="absolute -right-20 top-40 h-[22rem] w-[22rem] rounded-full opacity-20 blur-[100px]"
          style={{ background: "linear-gradient(135deg, oklch(0.65 0.13 245) 0%, oklch(0.6 0.2 290) 100%)" }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center">
        <Logo />

        <h1 className="mt-10 max-w-3xl text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          Support requests,
          <br />
          <span className="bg-gradient-to-r from-soft-blue to-purple-accent bg-clip-text text-transparent">
            intelligently resolved.
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          OpsAssist uses AI to classify, route, and respond to internal tickets.
        </p>

        <Link
          to="/login"
          className="mt-10 inline-flex h-14 items-center gap-2 rounded-2xl bg-[image:var(--gradient-hero)] px-8 text-base font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:brightness-110 hover:shadow-lg"
        >
          <LogIn size={18} /> Sign in
        </Link>
      </div>
    </div>
  );
}

import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  LogIn,
  
  Zap,
  BrainCircuit,
  BarChart3,
  MessageSquare,
  TicketCheck,
  Clock,
  Users,
  Layers,
  ArrowRight,
} from "lucide-react";

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

/* ── floating gradient orbs ── */
function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -left-20 -top-20 h-[28rem] w-[28rem] rounded-full opacity-30 blur-[100px]"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div
        className="absolute -right-20 top-40 h-[22rem] w-[22rem] rounded-full opacity-20 blur-[100px]"
        style={{ background: "linear-gradient(135deg, oklch(0.65 0.13 245) 0%, oklch(0.6 0.2 290) 100%)" }}
      />
      <div
        className="absolute bottom-0 left-1/2 h-[18rem] w-[18rem] -translate-x-1/2 rounded-full opacity-15 blur-[90px]"
        style={{ background: "linear-gradient(135deg, oklch(0.6 0.2 290) 0%, oklch(0.32 0.13 275) 100%)" }}
      />
    </div>
  );
}

/* ── feature card ── */
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative rounded-2xl border border-border bg-card/70 p-6 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:bg-card hover:shadow-[var(--shadow-glow)]">
      <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-[image:var(--gradient-hero)] p-3 text-white shadow-[var(--shadow-glow)] transition-transform duration-300 group-hover:scale-110">
        {icon}
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

/* ── stat pill ── */
function StatPill({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-4 shadow-[var(--shadow-soft)] backdrop-blur-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-glow)]">
        {icon}
      </div>
      <div className="text-left">
        <div className="text-lg font-bold leading-none text-foreground">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <AmbientBackground />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-[image:var(--gradient-hero)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition hover:brightness-110"
          >
            <LogIn size={14} /> Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-6xl px-6">
        <section className="flex flex-col items-center pt-10 pb-16 text-center sm:pt-14 sm:pb-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-[var(--shadow-soft)]">
            <Sparkles size={14} className="text-purple-accent" /> AI-powered support desk
          </span>

          <h1 className="mt-8 max-w-4xl text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Support requests,
            <br />
            <span className="bg-gradient-to-r from-soft-blue to-purple-accent bg-clip-text text-transparent">
              intelligently resolved.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            OpsAssist uses AI to classify, route, and respond to internal tickets — so your teams spend less time triaging and more time solving.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              to="/login"
              className="inline-flex h-14 items-center gap-2 rounded-2xl bg-[image:var(--gradient-hero)] px-8 text-base font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:brightness-110 hover:shadow-lg"
            >
              <LogIn size={18} /> Sign in <ArrowRight size={16} />
            </Link>
          </div>

          {/* Stats row */}
          <div className="mt-14 flex flex-wrap justify-center gap-4">
            <StatPill value="AI" label="Smart classification" icon={<BrainCircuit size={18} />} />
            <StatPill value="Auto" label="Department routing" icon={<Layers size={18} />} />
            <StatPill value="Fast" label="Instant responses" icon={<Zap size={18} />} />
          </div>
        </section>

        {/* Features grid */}
        <section className="pb-20">
          <div className="mx-auto mb-10 max-w-xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Everything you need for internal support
            </h2>
            <p className="mt-3 text-muted-foreground">
              A complete toolkit built for modern teams — from ticket creation to AI-powered resolution.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<TicketCheck size={22} />}
              title="Smart Ticketing"
              description="Submit requests with auto-categorization and AI-generated summaries that get your ticket to the right team instantly."
            />
            <FeatureCard
              icon={<Layers size={22} />}
              title="Department Routing"
              description="Tickets are automatically routed to HR, IT, Finance, or Operations based on content — no manual triage needed."
            />
            <FeatureCard
              icon={<BrainCircuit size={22} />}
              title="AI Responses"
              description="Get intelligent first-response suggestions and automated replies to reduce your team's workload."
            />
            <FeatureCard
              icon={<BarChart3 size={22} />}
              title="Real-time Analytics"
              description="Track resolution times, backlog trends, and team performance with live dashboards and AI-generated insights."
            />
            <FeatureCard
              icon={<MessageSquare size={22} />}
              title="Team Notes & Chat"
              description="Collaborate on tickets with threaded notes. Admins and users stay in sync with notifications on every update."
            />
            <FeatureCard
              icon={<Clock size={22} />}
              title="SLA Monitoring"
              description="Never miss a deadline. Visual alerts and gauges keep your team accountable to resolution targets."
            />
          </div>
        </section>

        {/* How it works */}
        <section className="pb-20">
          <div className="mx-auto mb-10 max-w-xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              How OpsAssist works
            </h2>
            <p className="mt-3 text-muted-foreground">
              Three simple steps from problem to resolution.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Submit",
                body: "Users describe their issue in plain language. AI suggests a category and priority automatically.",
                icon: <Users size={24} />,
              },
              {
                step: "02",
                title: "Route",
                body: "The ticket lands in the correct department queue. Admins get notified and can assign instantly.",
                icon: <Layers size={24} />,
              },
              {
                step: "03",
                title: "Resolve",
                body: "Teams collaborate with notes, AI suggestions, and real-time status updates until the ticket is closed.",
                icon: <TicketCheck size={24} />,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-border bg-card/60 p-8 shadow-[var(--shadow-soft)] transition-all hover:bg-card hover:shadow-[var(--shadow-glow)]"
              >
                <div className="absolute -top-4 left-8 inline-flex h-8 items-center rounded-lg bg-[image:var(--gradient-hero)] px-3 text-sm font-bold text-white shadow-[var(--shadow-glow)]">
                  {item.step}
                </div>
                <div className="mb-5 mt-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-soft-blue">
                  {item.icon}
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="pb-24 text-center">
          <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border bg-card/70 p-10 shadow-[var(--shadow-soft)] sm:p-14">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-[90px]"
              style={{ background: "var(--gradient-hero)" }}
            />
            <h2 className="relative z-10 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Ready to streamline your support?
            </h2>
            <p className="relative z-10 mx-auto mt-4 max-w-lg text-muted-foreground">
              Get started in minutes. Sign in to experience AI-powered ticketing.
            </p>
            <div className="relative z-10 mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/login"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-[image:var(--gradient-hero)] px-7 font-semibold text-white shadow-[var(--shadow-glow)] transition hover:brightness-110"
              >
                <LogIn size={18} /> Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export { Button };

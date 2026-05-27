import { Logo } from "./Logo";
import { Link } from "@tanstack/react-router";
import { Github, Twitter, Mail, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border/50 bg-card/40 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI-powered ticket classification, routing, and resolution for modern internal support teams.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="#"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/50 text-muted-foreground transition hover:text-foreground hover:shadow-[var(--shadow-soft)]"
                aria-label="GitHub"
              >
                <Github size={16} />
              </a>
              <a
                href="#"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/50 text-muted-foreground transition hover:text-foreground hover:shadow-[var(--shadow-soft)]"
                aria-label="Twitter"
              >
                <Twitter size={16} />
              </a>
              <a
                href="#"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/50 text-muted-foreground transition hover:text-foreground hover:shadow-[var(--shadow-soft)]"
                aria-label="Email"
              >
                <Mail size={16} />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold tracking-wide text-foreground">Product</h4>
            <ul className="mt-4 space-y-2.5">
              {[
                { label: "Features", to: "/" },
                { label: "Pricing", to: "/" },
                { label: "Security", to: "/" },
                { label: "Changelog", to: "/" },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold tracking-wide text-foreground">Company</h4>
            <ul className="mt-4 space-y-2.5">
              {[
                { label: "About", to: "/" },
                { label: "Blog", to: "/" },
                { label: "Careers", to: "/" },
                { label: "Contact", to: "/" },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-sm font-semibold tracking-wide text-foreground">Support</h4>
            <ul className="mt-4 space-y-2.5">
              {[
                { label: "Help Center", to: "/" },
                { label: "Documentation", to: "/" },
                { label: "Status", to: "/" },
                { label: "API", to: "/" },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/50 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} OpsAssist. All rights reserved.
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Built with <Heart size={12} className="fill-destructive text-destructive" /> by{" "}
            <span className="font-semibold text-foreground">BYTEBUILDERS</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

// Server-only email helper using Resend.
// NEVER import from client code (filename .server.ts is bundler-protected).

const RESEND_URL = "https://api.resend.com/emails";
// Verified domain on Resend — allows sending to any recipient.
const FROM = "OpsAssist <no-reply@lukholo.online>";

export async function sendOtpEmail(opts: {
  to: string;
  fullName: string;
  otp: string;
  role: string;
  department: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY missing" };

  const roleLabel =
    opts.role === "admin"
      ? opts.department
        ? `${opts.department} Department Admin`
        : "Administrator"
      : "Employee";

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px;font-size:20px">Welcome to OpsAssist 👋</h2>
    <p style="margin:0 0 16px;color:#475569">
      Hi ${escapeHtml(opts.fullName)}, your <strong>${escapeHtml(roleLabel)}</strong> account has been created.
    </p>
    <p style="margin:0 0 8px">Your one-time activation code:</p>
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;background:#f1f5f9;padding:16px 20px;border-radius:12px;text-align:center;color:#0f172a">
      ${opts.otp}
    </div>
    <p style="margin:20px 0 0;color:#475569;font-size:14px">
      Open the OpsAssist sign-in page, click <strong>“New user? Activate your account”</strong>, enter this code with your email and choose a password.
    </p>
    <p style="margin-top:28px;color:#94a3b8;font-size:12px">Built by BYTEBUILDERS</p>
  </div>`;

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: "Your OpsAssist activation code",
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  otp: string;
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY missing" };

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px;font-size:20px">Reset your OpsAssist password</h2>
    <p style="margin:0 0 16px;color:#475569">
      We received a request to reset your password. Use the one-time code below to continue. It expires in 15 minutes.
    </p>
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;background:#f1f5f9;padding:16px 20px;border-radius:12px;text-align:center;color:#0f172a">
      ${opts.otp}
    </div>
    <p style="margin:20px 0 0;color:#475569;font-size:14px">
      If you didn't request this, you can safely ignore this email.
    </p>
    <p style="margin-top:28px;color:#94a3b8;font-size:12px">Built by BYTEBUILDERS</p>
  </div>`;

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: "Your OpsAssist password reset code",
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Generic transactional email used for approval-workflow notifications
 * (request received, approval granted, approval denied, info requested).
 */
export async function sendNotificationEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  body?: string;
  ticketTitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  accent?: "primary" | "success" | "danger" | "warning";
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY missing" };

  const color =
    opts.accent === "success"
      ? "#059669"
      : opts.accent === "danger"
        ? "#dc2626"
        : opts.accent === "warning"
          ? "#d97706"
          : "#2563eb";

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
    <div style="border-left:4px solid ${color};padding:4px 0 4px 14px;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px">${escapeHtml(opts.heading)}</h2>
    </div>
    <p style="margin:0 0 12px;color:#475569;font-size:14px;line-height:1.55">${escapeHtml(opts.intro)}</p>
    ${
      opts.ticketTitle
        ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:12px 0">
             <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Ticket</div>
             <div style="font-weight:600;color:#0f172a;margin-top:2px">${escapeHtml(opts.ticketTitle)}</div>
           </div>`
        : ""
    }
    ${
      opts.body
        ? `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:12px 0;white-space:pre-wrap;font-size:14px;color:#1e293b">${escapeHtml(opts.body)}</div>`
        : ""
    }
    ${
      opts.ctaUrl && opts.ctaLabel
        ? `<p style="margin:20px 0"><a href="${opts.ctaUrl}" style="background:${color};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">${escapeHtml(opts.ctaLabel)}</a></p>`
        : ""
    }
    <p style="margin-top:28px;color:#94a3b8;font-size:12px">OpsAssist · Built by BYTEBUILDERS</p>
  </div>`;

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

// ---------------------------- Ticket lifecycle emails ----------------------------

export type TicketEmailEvent = "created" | "assigned" | "status_updated" | "completed";

export interface TicketEmailInput {
  event: TicketEmailEvent;
  to: string;
  recipientName: string;
  ticket: {
    id: string;
    title: string;
    category?: string | null;
    categories?: string[] | null;
    priority?: string | null;
    status?: string | null;
    created_at?: string | null;
  };
  department?: string | null;
  assigneeName?: string | null;
  newStatus?: string | null;
  ticketUrl?: string | null;
}

function subjectFor(event: TicketEmailEvent, ticket: TicketEmailInput["ticket"]): string {
  switch (event) {
    case "created": return `Support Ticket Received — ${ticket.title}`;
    case "assigned": return `New Ticket Assigned to You — ${ticket.title}`;
    case "completed": return `Ticket Completed — ${ticket.title}`;
    default: return `Ticket Status Update — ${ticket.title}`;
  }
}

function headingFor(event: TicketEmailEvent, newStatus?: string | null): string {
  switch (event) {
    case "created": return "We've received your support ticket";
    case "assigned": return "A new ticket has been assigned to you";
    case "completed": return "Your ticket has been completed";
    case "status_updated": return `Ticket status changed to ${newStatus ?? "Updated"}`;
  }
}

function accentFor(event: TicketEmailEvent): "primary" | "success" | "danger" | "warning" {
  if (event === "completed") return "success";
  if (event === "assigned") return "warning";
  return "primary";
}

function formatDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  } catch { return d; }
}

/**
 * Send a transactional email for a ticket lifecycle event.
 * Always resolves — never throws. Caller decides whether to await.
 */
export async function sendTicketEmail(input: TicketEmailInput): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY missing" };
  if (!input.to || !input.to.includes("@")) return { sent: false, error: "invalid recipient" };

  const accent = accentFor(input.event);
  const color =
    accent === "success" ? "#059669"
    : accent === "danger" ? "#dc2626"
    : accent === "warning" ? "#d97706"
    : "#2563eb";

  const cats = input.ticket.categories?.length
    ? input.ticket.categories.join(", ")
    : (input.ticket.category ?? "—");

  const rows: Array<[string, string]> = [
    ["Ticket ID", input.ticket.id],
    ["Title", input.ticket.title],
    ["Category", cats],
    ["Priority", input.ticket.priority ?? "—"],
    ["Status", input.newStatus ?? input.ticket.status ?? "—"],
    ["Date Created", formatDate(input.ticket.created_at)],
  ];
  if (input.event === "assigned") {
    if (input.department) rows.splice(2, 0, ["Assigned Department", input.department]);
    if (input.assigneeName) rows.splice(3, 0, ["Assigned Staff", input.assigneeName]);
  }

  const rowsHtml = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:8px 12px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e2e8f0;width:40%">${escapeHtml(k)}</td>
        <td style="padding:8px 12px;color:#0f172a;font-size:14px;border-bottom:1px solid #e2e8f0">${escapeHtml(v)}</td>
      </tr>`,
    )
    .join("");

  const heading = headingFor(input.event, input.newStatus);
  const intro =
    input.event === "created"
      ? `Hello ${escapeHtml(input.recipientName)}, thank you for contacting the AI Business Operations Assistant. Your ticket has been logged and routed to the right team.`
      : input.event === "assigned"
        ? `Hello ${escapeHtml(input.recipientName)}, a new support ticket has been routed to you. Please review the details below.`
        : input.event === "completed"
          ? `Hello ${escapeHtml(input.recipientName)}, your support ticket has been resolved. We hope everything is back on track.`
          : `Hello ${escapeHtml(input.recipientName)}, your support ticket status has been updated.`;

  const cta = input.ticketUrl
    ? `<p style="margin:20px 0"><a href="${input.ticketUrl}" style="background:${color};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">Open ticket</a></p>`
    : "";

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0f172a">
    <div style="border-left:4px solid ${color};padding:4px 0 4px 14px;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px">${escapeHtml(heading)}</h2>
    </div>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.55">${intro}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      ${rowsHtml}
    </table>
    ${cta}
    <p style="margin-top:24px;color:#475569;font-size:13px">Thank you for using the AI Business Operations Assistant.</p>
    <p style="margin:4px 0 0;color:#475569;font-size:13px">Regards,<br/>Support Team</p>
    <p style="margin-top:28px;color:#94a3b8;font-size:12px">OpsAssist · Built by BYTEBUILDERS</p>
  </div>`;

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: FROM,
        to: [input.to],
        subject: subjectFor(input.event, input.ticket),
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Fire-and-forget wrapper — logs failures without throwing so the caller's
 * workflow is never interrupted by email delivery issues.
 */
export function sendTicketEmailSafe(input: TicketEmailInput): Promise<{ sent: boolean; error?: string }> {
  return sendTicketEmail(input)
    .then((r) => {
      if (!r.sent) console.warn(`[email] ${input.event} → ${input.to} failed: ${r.error}`);
      return r;
    })
    .catch((e) => {
      console.warn(`[email] ${input.event} → ${input.to} threw`, e);
      return { sent: false, error: e instanceof Error ? e.message : "unknown" };
    });
}

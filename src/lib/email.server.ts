// Server-only email helper using Resend.
// NEVER import from client code (filename .server.ts is bundler-protected).

const RESEND_URL = "https://api.resend.com/emails";
// Resend's onboarding sender works without a verified domain — fine for OTP demos.
const FROM = "OpsAssist <onboarding@resend.dev>";

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

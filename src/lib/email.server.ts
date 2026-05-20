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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

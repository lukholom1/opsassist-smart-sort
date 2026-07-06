// EmailJS client-side service (browser-only).
// EmailJS is designed to run from the browser — the "public key" is safe to expose.
//
// Configure credentials via VITE_ env vars, with sensible defaults so the
// integration keeps working even without a .env override.

import emailjs from "@emailjs/browser";

const SERVICE_ID =
  import.meta.env.VITE_EMAILJS_SERVICE_ID ?? "service_fnf0a9b";
const TEMPLATE_ID =
  import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? "template_sn8eafw";
const PUBLIC_KEY =
  import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? "4tSCACs9s4rdKyGj9";

let initialized = false;
function ensureInit() {
  if (initialized) return;
  if (!PUBLIC_KEY) {
    console.error("[emailService] Missing EmailJS public key");
    return;
  }
  emailjs.init({ publicKey: PUBLIC_KEY });
  initialized = true;
}

// ----------------------------- Types -----------------------------

export type TicketEmailEvent = "created" | "assigned" | "status_updated" | "completed";

export interface TicketEmailPayload {
  event: TicketEmailEvent;
  to: string;                       // recipient email
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
}

// ----------------------------- Helpers -----------------------------

function formatDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d;
  }
}

function subjectFor(p: TicketEmailPayload): string {
  switch (p.event) {
    case "created": return `Support Ticket Received — ${p.ticket.title}`;
    case "assigned": return `New Ticket Assigned to You — ${p.ticket.title}`;
    case "completed": return `Ticket Completed — ${p.ticket.title}`;
    default: return `Ticket Status Update — ${p.ticket.title}`;
  }
}

function messageFor(p: TicketEmailPayload): string {
  const name = p.recipientName || "there";
  switch (p.event) {
    case "created":
      return `Hi ${name}, thanks for contacting the AI Business Operations Assistant. Your ticket has been logged and routed to the right team.`;
    case "assigned":
      return `Hi ${name}, a new ticket has been assigned to you${p.department ? ` in the ${p.department} department` : ""}. Please review the details.`;
    case "completed":
      return `Hi ${name}, your support ticket has been completed. We hope everything is back on track.`;
    case "status_updated":
      return `Hi ${name}, your ticket status has been updated${p.newStatus ? ` to "${p.newStatus}"` : ""}.`;
  }
}

function buildTemplateParams(p: TicketEmailPayload): Record<string, string> {
  const cats = p.ticket.categories?.length
    ? p.ticket.categories.join(", ")
    : (p.ticket.category ?? "—");

  return {
    // Recipient
    recipient_name: p.recipientName || "there",
    recipient_email: p.to,
    to_email: p.to,               // alias — many EmailJS templates use `to_email`
    to_name: p.recipientName || "there",
    // Ticket
    ticket_id: p.ticket.id,
    ticket_title: p.ticket.title,
    category: cats,
    priority: p.ticket.priority ?? "—",
    status: p.newStatus ?? p.ticket.status ?? "—",
    assigned_department: p.department ?? "—",
    assigned_staff: p.assigneeName ?? "—",
    created_date: formatDate(p.ticket.created_at),
    // Message/subject helpers
    event: p.event,
    subject: subjectFor(p),
    message: messageFor(p),
  };
}

// ----------------------------- Core send -----------------------------

export interface SendResult {
  sent: boolean;
  status?: number;
  text?: string;
  error?: string;
}

async function sendTicketEmail(payload: TicketEmailPayload): Promise<SendResult> {
  // Guard: recipient email must be a non-empty string containing '@'.
  const to = (payload.to ?? "").toString().trim();
  if (!to || !to.includes("@")) {
    const msg = `[emailService] Invalid recipient email for event=${payload.event} ticket=${payload.ticket?.id}: ${JSON.stringify(payload.to)}`;
    console.error(msg);
    return { sent: false, error: "invalid recipient email" };
  }

  ensureInit();
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    const msg = `[emailService] Missing EmailJS config (service=${!!SERVICE_ID}, template=${!!TEMPLATE_ID}, key=${!!PUBLIC_KEY})`;
    console.error(msg);
    return { sent: false, error: "EmailJS not configured" };
  }

  const params = buildTemplateParams(payload);

  // Pre-send debug log.
  console.info("[emailService] sending", {
    event: payload.event,
    recipient: to,
    ticket_id: payload.ticket.id,
    ticket_title: payload.ticket.title,
    status: params.status,
    template_id: TEMPLATE_ID,
    service_id: SERVICE_ID,
    params,
  });

  try {
    const res = await emailjs.send(SERVICE_ID, TEMPLATE_ID, params, { publicKey: PUBLIC_KEY });
    console.info("[emailService] sent OK", {
      event: payload.event,
      ticket_id: payload.ticket.id,
      status: res.status,
      text: res.text,
    });
    return { sent: true, status: res.status, text: res.text };
  } catch (err: unknown) {
    // EmailJS rejects with { status, text } — surface all of it.
    const e = err as { status?: number; text?: string; message?: string; stack?: string };
    console.error("[emailService] send FAILED", {
      event: payload.event,
      ticket_id: payload.ticket.id,
      recipient: to,
      status: e?.status,
      text: e?.text,
      message: e?.message,
      stack: e?.stack,
      raw: err,
    });
    return {
      sent: false,
      status: e?.status,
      text: e?.text,
      error: e?.text || e?.message || "EmailJS send failed",
    };
  }
}

// ----------------------------- Named helpers -----------------------------

export function sendTicketCreatedEmail(p: Omit<TicketEmailPayload, "event">) {
  return sendTicketEmail({ ...p, event: "created" });
}
export function sendTicketAssignedEmail(p: Omit<TicketEmailPayload, "event">) {
  return sendTicketEmail({ ...p, event: "assigned" });
}
export function sendStatusUpdateEmail(p: Omit<TicketEmailPayload, "event">) {
  return sendTicketEmail({ ...p, event: "status_updated" });
}
export function sendCompletedEmail(p: Omit<TicketEmailPayload, "event">) {
  return sendTicketEmail({ ...p, event: "completed" });
}

/**
 * Dispatch a batch of ticket emails returned by a server function.
 * Returns aggregate result — always resolves, never throws.
 */
export async function dispatchTicketEmails(
  payloads: TicketEmailPayload[] | undefined | null,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const list = Array.isArray(payloads) ? payloads : [];
  if (!list.length) return { sent: 0, failed: 0, errors: [] };

  const results = await Promise.all(list.map((p) => sendTicketEmail(p)));
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.sent) sent++;
    else {
      failed++;
      if (r.error) errors.push(r.error);
    }
  }
  return { sent, failed, errors };
}

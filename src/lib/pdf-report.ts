// Shared helper for building professional, on-brand PDF reports.
// Uses jsPDF + jspdf-autotable. Import lazily from callers to avoid SSR.

import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

export const BRAND = {
  navy: [30, 34, 71] as [number, number, number],
  navyDeep: [20, 24, 55] as [number, number, number],
  purple: [123, 63, 228] as [number, number, number],
  softBlue: [82, 141, 214] as [number, number, number],
  success: [56, 161, 105] as [number, number, number],
  warning: [217, 149, 20] as [number, number, number],
  danger: [200, 55, 55] as [number, number, number],
  ink: [30, 34, 44] as [number, number, number],
  mute: [110, 115, 130] as [number, number, number],
  paper: [248, 249, 253] as [number, number, number],
  hair: [225, 228, 236] as [number, number, number],
};

export type ReportCtx = {
  doc: jsPDF;
  autoTable: (opts: UserOptions) => void;
  pageW: number;
  pageH: number;
  margin: number;
  y: number;
  ensure: (needed: number) => void;
  addPage: () => void;
  moveTo: (y: number) => void;
  cursorY: () => number;
};

export async function createReport(header: {
  title: string;
  subtitle?: string;
  scope?: string;
  generatedAt?: Date;
}): Promise<ReportCtx> {
  const { default: JsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = (autoTableMod as any).default as (
    doc: jsPDF,
    opts: UserOptions,
  ) => void;

  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  const ctx: ReportCtx = {
    doc,
    autoTable: (opts) => autoTable(doc, opts),
    pageW,
    pageH,
    margin,
    y: 0,
    ensure(needed: number) {
      if (this.y + needed > pageH - margin) this.addPage();
    },
    addPage() {
      doc.addPage();
      drawPageFrame(doc, pageW, pageH, margin, header.title);
      this.y = margin + 44;
    },
    moveTo(y) {
      this.y = y;
    },
    cursorY() {
      return this.y;
    },
  };

  // First page cover header (larger)
  drawCoverHeader(doc, pageW, margin, header);
  ctx.y = 168;

  // Footer + top strip on subsequent pages handled by addPage()
  const _origAddPage = doc.addPage.bind(doc);
  // Draw footer on page 1 too via a hook when saving? Simpler: caller invokes finalize().
  (ctx as any)._finalize = () => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      drawFooter(doc, pageW, pageH, margin, i, total);
    }
  };

  return ctx;
}

export function finalizeReport(ctx: ReportCtx) {
  (ctx as any)._finalize?.();
}

function drawCoverHeader(
  doc: jsPDF,
  pageW: number,
  margin: number,
  header: { title: string; subtitle?: string; scope?: string; generatedAt?: Date },
) {
  // Navy band
  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, pageW, 120, "F");
  // Purple accent bar
  doc.setFillColor(...BRAND.purple);
  doc.rect(0, 120, pageW, 4, "F");

  // Brand line
  doc.setTextColor(210, 214, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("OPSASSIST", margin, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(180, 188, 220);
  doc.text("Operations Intelligence Platform", margin + 78, 42);

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(header.title, margin, 78);

  // Subtitle
  if (header.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(200, 208, 235);
    doc.text(header.subtitle, margin, 98);
  }

  // Meta chips (scope, date) on the right
  const rightX = pageW - margin;
  doc.setFontSize(9);
  doc.setTextColor(200, 208, 235);
  const gen = (header.generatedAt ?? new Date()).toLocaleString();
  doc.text(`Generated: ${gen}`, rightX, 78, { align: "right" });
  if (header.scope) doc.text(`Scope: ${header.scope}`, rightX, 94, { align: "right" });

  // Reset text color for body
  doc.setTextColor(...BRAND.ink);
}

function drawPageFrame(
  doc: jsPDF,
  pageW: number,
  _pageH: number,
  margin: number,
  title: string,
) {
  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(...BRAND.purple);
  doc.rect(0, 32, pageW, 2, "F");
  doc.setTextColor(230, 234, 250);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("OPSASSIST", margin, 20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 208, 235);
  doc.text(title, pageW - margin, 20, { align: "right" });
  doc.setTextColor(...BRAND.ink);
}

function drawFooter(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  margin: number,
  pageNum: number,
  total: number,
) {
  doc.setDrawColor(...BRAND.hair);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 30, pageW - margin, pageH - 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.mute);
  doc.text("Confidential — for internal use only", margin, pageH - 16);
  doc.text(`Page ${pageNum} of ${total}`, pageW - margin, pageH - 16, {
    align: "right",
  });
  doc.setTextColor(...BRAND.ink);
}

export function sectionHeading(ctx: ReportCtx, label: string) {
  ctx.ensure(38);
  const { doc, margin, pageW } = ctx;
  // purple left bar
  doc.setFillColor(...BRAND.purple);
  doc.rect(margin, ctx.y, 3, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND.navyDeep);
  doc.text(label, margin + 10, ctx.y + 12);
  // hair line
  doc.setDrawColor(...BRAND.hair);
  doc.setLineWidth(0.6);
  doc.line(margin, ctx.y + 22, pageW - margin, ctx.y + 22);
  doc.setTextColor(...BRAND.ink);
  ctx.y += 32;
}

export function paragraph(ctx: ReportCtx, text: string, opts?: { size?: number; muted?: boolean }) {
  const { doc, margin, pageW, pageH } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(opts?.size ?? 10);
  if (opts?.muted) doc.setTextColor(...BRAND.mute);
  else doc.setTextColor(...BRAND.ink);
  const wrapped = doc.splitTextToSize(text, pageW - margin * 2);
  const lh = (opts?.size ?? 10) + 3;
  for (const ln of wrapped) {
    if (ctx.y + lh > pageH - margin - 20) ctx.addPage();
    doc.text(ln, margin, ctx.y);
    ctx.y += lh;
  }
  doc.setTextColor(...BRAND.ink);
  ctx.y += 4;
}

type KpiTone = "purple" | "success" | "warning" | "blue" | "danger";
const toneColor = (t: KpiTone) =>
  t === "success"
    ? BRAND.success
    : t === "warning"
      ? BRAND.warning
      : t === "danger"
        ? BRAND.danger
        : t === "blue"
          ? BRAND.softBlue
          : BRAND.purple;

export function kpiGrid(
  ctx: ReportCtx,
  cards: Array<{ label: string; value: string | number; tone?: KpiTone }>,
  columns = 4,
) {
  const { doc, margin, pageW } = ctx;
  const gap = 10;
  const cardW = (pageW - margin * 2 - gap * (columns - 1)) / columns;
  const cardH = 56;
  const rows = Math.ceil(cards.length / columns);
  ctx.ensure(rows * (cardH + gap));

  cards.forEach((c, i) => {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const x = margin + col * (cardW + gap);
    const y = ctx.y + row * (cardH + gap);
    // card
    doc.setFillColor(...BRAND.paper);
    doc.setDrawColor(...BRAND.hair);
    doc.roundedRect(x, y, cardW, cardH, 6, 6, "FD");
    // tone strip
    const tc = toneColor(c.tone ?? "purple");
    doc.setFillColor(...tc);
    doc.roundedRect(x, y, 3, cardH, 1.5, 1.5, "F");
    // label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.mute);
    doc.text(c.label.toUpperCase(), x + 12, y + 18);
    // value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRAND.navyDeep);
    doc.text(String(c.value), x + 12, y + 42);
  });
  ctx.y += rows * (cardH + gap);
  doc.setTextColor(...BRAND.ink);
}

export function keyValueList(
  ctx: ReportCtx,
  entries: Array<[string, string | number]>,
) {
  const { doc, margin, pageW } = ctx;
  const rowH = 16;
  ctx.ensure(entries.length * rowH + 8);
  entries.forEach(([k, v], i) => {
    const y = ctx.y + i * rowH;
    if (i % 2 === 0) {
      doc.setFillColor(...BRAND.paper);
      doc.rect(margin, y - 11, pageW - margin * 2, rowH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.mute);
    doc.text(String(k), margin + 6, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.navyDeep);
    doc.text(String(v), pageW - margin - 6, y, { align: "right" });
  });
  ctx.y += entries.length * rowH + 8;
  doc.setTextColor(...BRAND.ink);
}

export function table(
  ctx: ReportCtx,
  head: string[],
  body: (string | number)[][],
) {
  ctx.ensure(60);
  ctx.autoTable({
    head: [head],
    body,
    startY: ctx.y,
    margin: { left: ctx.margin, right: ctx.margin },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 6,
      textColor: BRAND.ink,
      lineColor: BRAND.hair,
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: BRAND.navy,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: BRAND.paper },
    theme: "grid",
  });
  // @ts-expect-error autotable adds lastAutoTable
  const finalY = ctx.doc.lastAutoTable?.finalY ?? ctx.y;
  ctx.y = finalY + 14;
}

export function bulletList(ctx: ReportCtx, items: string[], numbered = false) {
  const { doc, margin, pageW, pageH } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.ink);
  items.forEach((it, idx) => {
    const marker = numbered ? `${idx + 1}.` : "•";
    const wrapped = doc.splitTextToSize(it, pageW - margin * 2 - 18);
    const need = wrapped.length * 13 + 2;
    if (ctx.y + need > pageH - margin - 20) ctx.addPage();
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.purple);
    doc.text(marker, margin + 2, ctx.y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.ink);
    wrapped.forEach((ln: string, i: number) => {
      doc.text(ln, margin + 18, ctx.y + i * 13);
    });
    ctx.y += wrapped.length * 13 + 4;
  });
  ctx.y += 4;
}

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Render an invoice as a PDF — A4 portrait, pure JS, no native binary.
 *
 * Same approach as `certificate-pdf.ts` (pdf-lib, already a dependency). Unlike
 * the certificate this is rendered **on demand** rather than uploaded to S3: the
 * bucket is private, and a bill must be retrievable whenever the client asks for
 * it, not only while a signed URL happens to be alive.
 *
 * Amounts are USD, as everything in this platform is. `localLine` carries an
 * optional "৳12,500 at $1 = ৳125" note — display only, and only shown when the
 * viewer's currency is configured, because an unverified conversion printed on a
 * document that says "invoice" is worse than no conversion at all.
 */

export interface InvoicePdfInput {
  number: string;
  kind: string; // BILL | RECEIPT
  status: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  paymentRef: string | null;
  notes: string | null;
  seller: {
    name: string;
    addressLines: string[];
    email: string;
    phone: string;
    taxId: string;
  };
  billTo: {
    name: string;
    email: string;
    phone: string;
    taxId: string;
    addressLines: string[];
  };
  lines: Array<{
    description: string;
    quantity: number;
    unitUsd: number;
    amountUsd: number;
  }>;
  subtotalUsd: number;
  discountUsd: number;
  taxPct: number;
  taxLabel: string | null;
  taxUsd: number;
  totalUsd: number;
  /** e.g. "≈ ৳12,500 at $1 = ৳125". Omitted when no local currency applies. */
  localLine?: string | null;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export async function renderInvoicePdf(inv: InvoicePdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.1, 0.12, 0.2);
  const muted = rgb(0.42, 0.45, 0.53);
  const accent = rgb(0.31, 0.27, 0.9);
  const line = rgb(0.85, 0.87, 0.91);

  const M = 48;
  let y = height - M;

  const text = (
    s: string,
    x: number,
    yy: number,
    size = 10,
    f = font,
    color = ink
  ) => page.drawText(s, { x, y: yy, size, font: f, color });

  const right = (s: string, xRight: number, yy: number, size = 10, f = font, color = ink) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y: yy, size, font: f, color });
  };

  // pdf-lib throws on characters the standard fonts cannot encode, and a bill
  // that fails to render is worse than one with a plain-ASCII line. WinAnsi
  // covers Latin-1; anything else (Bangla, emoji, ৳) is dropped rather than
  // allowed to take the whole document down.
  const safe = (s: string) =>
    (s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "").trim();

  const clamp = (s: string, max: number) =>
    s.length > max ? `${s.slice(0, max - 1)}…` : s;

  // Whatever the seller calls their tax number. Bangladesh issues a BIN, the
  // EU a VAT number; printing a hardcoded "Tax ID" over a BIN is wrong on a
  // document that has to satisfy an auditor. `billing.tax_label` already holds
  // this and every other total on the page already uses it.
  const taxIdLabel = safe(inv.taxLabel || "").trim() || "Tax ID";

  /* ── Header ─────────────────────────────────────────────────────────── */
  text(safe(inv.seller.name) || "Invoice", M, y - 4, 18, bold, accent);
  right(inv.kind === "RECEIPT" ? "RECEIPT" : "INVOICE", width - M, y - 2, 20, bold, ink);
  y -= 24;
  right(safe(inv.number), width - M, y, 11, bold, muted);
  y -= 14;

  for (const l of inv.seller.addressLines.slice(0, 3)) {
    text(safe(clamp(l, 60)), M, y, 9, font, muted);
    y -= 11;
  }
  const sellerContact = [inv.seller.email, inv.seller.phone].filter(Boolean).join("  ·  ");
  if (sellerContact) {
    text(safe(clamp(sellerContact, 70)), M, y, 9, font, muted);
    y -= 11;
  }
  if (inv.seller.taxId) {
    text(safe(`${taxIdLabel}: ${inv.seller.taxId}`), M, y, 9, font, muted);
    y -= 11;
  }

  y -= 10;
  page.drawLine({
    start: { x: M, y },
    end: { x: width - M, y },
    thickness: 1,
    color: line,
  });
  y -= 22;

  /* ── Bill to / dates ────────────────────────────────────────────────── */
  const colR = width / 2 + 20;
  const topY = y;
  text("BILL TO", M, y, 8, bold, muted);
  y -= 14;
  text(safe(clamp(inv.billTo.name, 42)), M, y, 11, bold);
  y -= 13;
  for (const l of inv.billTo.addressLines.slice(0, 4)) {
    text(safe(clamp(l, 46)), M, y, 9, font, muted);
    y -= 11;
  }
  if (inv.billTo.email) {
    text(safe(clamp(inv.billTo.email, 46)), M, y, 9, font, muted);
    y -= 11;
  }
  if (inv.billTo.taxId) {
    text(safe(`${taxIdLabel}: ${inv.billTo.taxId}`), M, y, 9, font, muted);
    y -= 11;
  }

  let ry = topY;
  const meta: Array<[string, string]> = [
    ["Issued", day(inv.issuedAt)],
    ...(inv.kind === "RECEIPT"
      ? ([["Paid", day(inv.paidAt)]] as Array<[string, string]>)
      : ([["Due", day(inv.dueAt)]] as Array<[string, string]>)),
    ["Status", inv.status],
    ...(inv.paymentRef
      ? ([["Payment ref", clamp(inv.paymentRef, 24)]] as Array<[string, string]>)
      : []),
  ];
  for (const [k, v] of meta) {
    text(k.toUpperCase(), colR, ry, 8, bold, muted);
    right(safe(v), width - M, ry, 9, font, ink);
    ry -= 15;
  }

  y = Math.min(y, ry) - 20;

  /* ── Lines ──────────────────────────────────────────────────────────── */
  const cQty = width - M - 250;
  const cUnit = width - M - 140;
  const cAmt = width - M;

  page.drawRectangle({
    x: M - 6,
    y: y - 6,
    width: width - 2 * M + 12,
    height: 20,
    color: rgb(0.96, 0.97, 0.99),
  });
  text("DESCRIPTION", M, y, 8, bold, muted);
  right("QTY", cQty, y, 8, bold, muted);
  right("UNIT", cUnit, y, 8, bold, muted);
  right("AMOUNT", cAmt, y, 8, bold, muted);
  y -= 22;

  for (const l of inv.lines) {
    if (y < 160) break; // one page; the on-screen invoice carries the full list
    text(safe(clamp(l.description, 52)), M, y, 10);
    right(String(l.quantity), cQty, y, 10, font, muted);
    right(money(l.unitUsd), cUnit, y, 10, font, muted);
    right(money(l.amountUsd), cAmt, y, 10);
    y -= 16;
    page.drawLine({
      start: { x: M, y: y + 5 },
      end: { x: width - M, y: y + 5 },
      thickness: 0.5,
      color: line,
    });
    y -= 4;
  }

  /* ── Totals ─────────────────────────────────────────────────────────── */
  y -= 10;
  const totalRow = (label: string, value: string, strong = false) => {
    right(label, cUnit, y, strong ? 11 : 9, strong ? bold : font, strong ? ink : muted);
    right(value, cAmt, y, strong ? 12 : 10, strong ? bold : font, strong ? ink : ink);
    y -= strong ? 20 : 15;
  };

  totalRow("Subtotal", money(inv.subtotalUsd));
  if (inv.discountUsd > 0) totalRow("Discount", `-${money(inv.discountUsd)}`);
  // No tax line at all when tax is off — an invoice showing "VAT $0.00" invites
  // a question that has no good answer.
  if (inv.taxPct > 0) {
    totalRow(`${safe(inv.taxLabel ?? "Tax")} (${inv.taxPct}%)`, money(inv.taxUsd));
  }
  page.drawLine({
    start: { x: cUnit - 60, y: y + 12 },
    end: { x: width - M, y: y + 12 },
    thickness: 1,
    color: line,
  });
  y -= 4;
  totalRow(inv.kind === "RECEIPT" ? "Paid" : "Total due", money(inv.totalUsd), true);

  if (inv.localLine) {
    const local = safe(inv.localLine);
    // The taka sign is not in WinAnsi and gets stripped, so an empty result
    // means the whole line was non-Latin — better to omit it than print a
    // half-sentence on a document that says "invoice".
    if (local.length > 4) right(local, cAmt, y, 9, font, muted);
    y -= 16;
  }

  /* ── Notes + footer ─────────────────────────────────────────────────── */
  if (inv.notes) {
    y -= 8;
    text("NOTES", M, y, 8, bold, muted);
    y -= 13;
    for (const chunk of safe(inv.notes).match(/.{1,88}/g)?.slice(0, 4) ?? []) {
      text(chunk, M, y, 9, font, muted);
      y -= 11;
    }
  }

  text(
    inv.kind === "RECEIPT"
      ? "Thank you — this is a receipt for payment already received."
      : "Please quote the invoice number with your payment.",
    M,
    M + 8,
    8,
    font,
    muted
  );

  return Buffer.from(await doc.save());
}

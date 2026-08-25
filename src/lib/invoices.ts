import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { creditAdCreditTx } from "@/lib/ad-credits";
import { clearRateCardCache } from "@/lib/ad-rate-card";
import { D, round2, toNum } from "@/lib/money";

/**
 * Advertiser invoices — bills sent before payment, and receipts for money taken.
 *
 * ## Why both
 *
 * The owner sells ads directly, and both gateways are written but
 * credential-gated, so real money arrives **offline** (bKash/Nagad) and is
 * confirmed by hand. That means the useful document is a *bill*: send it, they
 * pay, you mark it paid, and marking it paid is what actually moves the credit.
 *
 * Self-serve purchases go the other way — money first — so those get a `RECEIPT`
 * that is `PAID` from birth. One model, because they are the same document with
 * the payment in a different place, and reconciling one list is easier than two.
 *
 * ## What "mark paid" does
 *
 * It is the only place an invoice moves money, and it is idempotent by
 * construction: the ad-credit ledger reference is `invoice_<id>`, and
 * `AdCreditLedger` now carries `@@unique([userId, reference])`. A second "mark
 * paid" hits the constraint and credits nothing, rather than relying on an admin
 * not double-clicking a button that spends money.
 */

export const INVOICE_KINDS = ["BILL", "RECEIPT"] as const;
export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "VOID"] as const;
export const LINE_KINDS = ["AD_CREDIT", "SLOT_RENTAL", "ADJUSTMENT"] as const;

export interface TaxConfig {
  /** 0 turns tax off entirely — no line is rendered at all. */
  pct: number;
  /** e.g. "VAT 15%" — what the line is called on the document. */
  label: string;
  /** The seller's own registration number (BIN/TIN), printed in the header. */
  taxId: string;
}

export async function getTaxConfig(): Promise<TaxConfig> {
  const [pct, label, taxId] = await Promise.all([
    getSetting<number>("billing.tax_pct", 0),
    getSetting<string>("billing.tax_label", "VAT"),
    getSetting<string>("billing.tax_id", ""),
  ]);
  const n = Number(pct);
  return {
    pct: Number.isFinite(n) && n > 0 ? Math.min(100, n) : 0,
    label: String(label || "VAT"),
    taxId: String(taxId || ""),
  };
}

export interface SellerConfig {
  name: string;
  addressLines: string[];
  email: string;
  phone: string;
}

export async function getSellerConfig(): Promise<SellerConfig> {
  const [name, address, email, phone] = await Promise.all([
    getSetting<string>("billing.seller_name", ""),
    getSetting<string>("billing.seller_address", ""),
    getSetting<string>("billing.seller_email", ""),
    getSetting<string>("billing.seller_phone", ""),
  ]);
  return {
    name: String(name || process.env.NEXT_PUBLIC_APP_NAME || "EarnGPT"),
    addressLines: String(address || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    email: String(email || ""),
    phone: String(phone || ""),
  };
}

export interface DraftLine {
  description: string;
  quantity: number;
  unitUsd: number;
  kind?: (typeof LINE_KINDS)[number];
  refId?: string | null;
}

/**
 * Totals for a set of lines, computed on Decimal.
 *
 * Not floats: an invoice that adds up to a cent less than its lines is the kind
 * of thing a client notices and never forgets. `round2` at each boundary because
 * a document shows two decimal places and must total what it displays.
 */
export function computeTotals(
  lines: DraftLine[],
  opts: { discountUsd?: number; taxPct?: number }
) {
  // Every step stays on Decimal and only becomes a number at the very end.
  // `round2` returns a Decimal; mixing it with `+` would silently drop back to
  // float arithmetic, which is how an invoice comes to total a cent less than
  // its own lines.
  let subtotal = D(0);
  const priced = lines.map((l) => {
    const amount = round2(D(l.quantity).mul(D(l.unitUsd)));
    subtotal = subtotal.add(amount);
    return { ...l, amountUsd: toNum(amount) };
  });
  const sub = round2(subtotal);
  const requested = D(Math.max(0, opts.discountUsd ?? 0));
  // A discount can zero an invoice but never make it negative.
  const discount = round2(requested.gt(sub) ? sub : requested);
  const taxable = round2(sub.sub(discount));
  const taxPct = Math.max(0, Math.min(100, opts.taxPct ?? 0));
  const tax = taxPct > 0 ? round2(taxable.mul(D(taxPct)).div(D(100))) : D(0);
  return {
    lines: priced,
    subtotalUsd: toNum(sub),
    discountUsd: toNum(discount),
    taxPct,
    taxUsd: toNum(tax),
    totalUsd: toNum(round2(taxable.add(tax))),
  };
}

/**
 * The next invoice number for the current year, e.g. `INV-2026-0007`.
 *
 * Derived from the highest existing number rather than a counter row, so there
 * is nothing to drift out of sync with reality. A race produces a duplicate,
 * which the `@unique` on `number` refuses — so the caller retries. A counter
 * that could collide *silently* would be worse than one that occasionally
 * makes you try again.
 */
export async function nextInvoiceNumber(year = new Date().getUTCFullYear()): Promise<string> {
  const prefix = `INV-${year}-`;
  const last = await prisma.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = last ? Number(last.number.slice(prefix.length)) : 0;
  const next = (Number.isFinite(seq) ? seq : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/** Freeze the advertiser's billing details onto the document. */
export async function snapshotBillTo(userId: string) {
  const [profile, user] = await Promise.all([
    prisma.billingProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, country: true },
    }),
  ]);
  return {
    name: profile?.orgName || user?.name || "Advertiser",
    email: profile?.email || user?.email || "",
    phone: profile?.phone || "",
    taxId: profile?.taxId || "",
    addressLines: [
      profile?.addressLine1,
      profile?.addressLine2,
      [profile?.city, profile?.postalCode].filter(Boolean).join(" "),
      profile?.country || user?.country,
    ]
      .map((l) => (l ?? "").trim())
      .filter(Boolean),
  };
}

export interface CreateInvoiceInput {
  advertiserId: string;
  kind?: (typeof INVOICE_KINDS)[number];
  lines: DraftLine[];
  discountUsd?: number;
  dueAt?: Date | null;
  notes?: string | null;
  createdById?: string | null;
  /** RECEIPTs are paid at birth; a BILL starts SENT so the client can see it. */
  paid?: boolean;
  paymentRef?: string | null;
}

/**
 * Issue an invoice. Retries once on a number collision — see
 * `nextInvoiceNumber`.
 */
export async function createInvoice(input: CreateInvoiceInput) {
  const tax = await getTaxConfig();
  const totals = computeTotals(input.lines, {
    discountUsd: input.discountUsd,
    taxPct: tax.pct,
  });
  const billTo = await snapshotBillTo(input.advertiserId);
  const kind = input.kind ?? "BILL";
  const now = new Date();

  for (let attempt = 0; attempt < 4; attempt++) {
    const number = await nextInvoiceNumber();
    try {
      return await prisma.invoice.create({
        data: {
          number,
          advertiserId: input.advertiserId,
          kind,
          status: input.paid ? "PAID" : "SENT",
          issuedAt: now,
          dueAt: input.dueAt ?? null,
          paidAt: input.paid ? now : null,
          paymentRef: input.paymentRef ?? null,
          billTo,
          subtotalUsd: totals.subtotalUsd,
          discountUsd: totals.discountUsd,
          taxPct: totals.taxPct,
          taxLabel: totals.taxPct > 0 ? tax.label : null,
          taxUsd: totals.taxUsd,
          totalUsd: totals.totalUsd,
          notes: input.notes ?? null,
          createdById: input.createdById ?? null,
          lines: {
            create: totals.lines.map((l, i) => ({
              description: l.description,
              quantity: l.quantity,
              unitUsd: l.unitUsd,
              amountUsd: l.amountUsd,
              kind: l.kind ?? "AD_CREDIT",
              refId: l.refId ?? null,
              position: i,
            })),
          },
        },
        include: { lines: { orderBy: { position: "asc" } } },
      });
    } catch (e) {
      // Someone else took that number between the read and the write. Try again
      // rather than handing out a duplicate.
      if ((e as { code?: string })?.code === "P2002" && attempt < 3) continue;
      throw e;
    }
  }
  throw new Error("INVOICE_NUMBER_COLLISION");
}

export type SettleResult =
  | { ok: true; creditedUsd: number; activatedBookings: number }
  | { ok: false; reason: "NOT_FOUND" | "NOT_PAYABLE" | "ALREADY_PAID" };

/**
 * Mark an invoice paid, and do what being paid means.
 *
 * `AD_CREDIT` lines top up the advertiser's spending balance; `SLOT_RENTAL`
 * lines activate the booking they name. `ADJUSTMENT` lines move nothing — they
 * exist so a document can carry a discount, a correction or a note-with-a-number
 * without pretending to be a purchase.
 *
 * Idempotent by construction: the ledger reference is `invoice_<id>` and
 * `AdCreditLedger` is uniquely indexed on `(userId, reference)`, so a second
 * call cannot credit twice — the database refuses it. That matters more than it
 * sounds: this is a button that gives away money, and it is clicked by a human.
 */
export async function settleInvoice(
  invoiceId: string,
  opts: { paymentRef?: string | null } = {}
): Promise<SettleResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true },
  });
  if (!invoice) return { ok: false, reason: "NOT_FOUND" };
  if (invoice.status === "PAID") return { ok: false, reason: "ALREADY_PAID" };
  if (invoice.status === "VOID") return { ok: false, reason: "NOT_PAYABLE" };

  const creditUsd = invoice.lines
    .filter((l) => l.kind === "AD_CREDIT")
    .reduce((sum, l) => sum + toNum(l.amountUsd), 0);
  const bookingIds = invoice.lines
    .filter((l) => l.kind === "SLOT_RENTAL" && l.refId)
    .map((l) => l.refId as string);

  try {
    await prisma.$transaction(async (tx) => {
      // Status first, conditionally: if another request already settled this
      // invoice, zero rows match and the whole transaction aborts before any
      // money moves.
      const claimed = await tx.invoice.updateMany({
        where: { id: invoiceId, status: { in: ["DRAFT", "SENT"] } },
        data: {
          status: "PAID",
          paidAt: new Date(),
          ...(opts.paymentRef ? { paymentRef: opts.paymentRef } : {}),
        },
      });
      if (claimed.count === 0) throw new Error("ALREADY_SETTLED");

      if (creditUsd > 0) {
        await creditAdCreditTx(tx, invoice.advertiserId, creditUsd, {
          kind: "PURCHASE",
          reference: `invoice_${invoice.id}`,
          // `paidUsd` is what the "cash received" report reads, so a bonus-free
          // invoice payment is counted as exactly the money that arrived.
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            paidUsd: creditUsd,
          },
        });
      }

      if (bookingIds.length > 0) {
        await tx.adSlotBooking.updateMany({
          where: { id: { in: bookingIds }, status: "PENDING_PAYMENT" },
          data: { status: "ACTIVE" },
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const code = (e as { code?: string })?.code;
    // Either the status claim lost the race, or the ledger's unique reference
    // refused a replay. Both mean the same thing: it was already settled.
    if (msg === "ALREADY_SETTLED" || code === "P2002") {
      return { ok: false, reason: "ALREADY_PAID" };
    }
    throw e;
  }

  // A newly activated booking changes what serves — drop the memo.
  if (bookingIds.length > 0) clearRateCardCache();

  return { ok: true, creditedUsd: creditUsd, activatedBookings: bookingIds.length };
}

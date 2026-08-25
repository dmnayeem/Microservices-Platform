import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getSellerConfig, getTaxConfig } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { getCurrencyForCountry } from "@/lib/currencies";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface InvoiceWithLines {
  id: string;
  number: string;
  kind: string;
  status: string;
  advertiserId: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  paymentRef: string | null;
  notes: string | null;
  billTo: unknown;
  subtotalUsd: unknown;
  discountUsd: unknown;
  taxPct: unknown;
  taxLabel: string | null;
  taxUsd: unknown;
  totalUsd: unknown;
  lines: Array<{
    description: string;
    quantity: unknown;
    unitUsd: unknown;
    amountUsd: unknown;
  }>;
}

/**
 * Download an invoice as a PDF.
 *
 * Rendered on demand rather than stored: the S3 bucket is private, and a bill
 * has to be retrievable whenever the client asks for it — not only while some
 * signed URL happens to still be alive.
 *
 * Visible to the advertiser it belongs to, and to anyone with `ads.view`.
 * Ownership is checked before the permission, so a normal advertiser never
 * triggers a permission lookup for their own document.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Prisma's `include` generic degrades here (the same gotcha noted in
  // admin/analytics/page.tsx), so the line rows are typed explicitly.
  const invoice = (await prisma.invoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  })) as unknown as InvoiceWithLines | null;
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = invoice.advertiserId === session.user.id;
  if (!isOwner && !(await can(session.user.id, "ads.view"))) {
    // 404, not 403 — a stranger should not learn that this invoice exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [seller, tax] = await Promise.all([getSellerConfig(), getTaxConfig()]);

  const billTo = (invoice.billTo ?? {}) as {
    name?: string;
    email?: string;
    phone?: string;
    taxId?: string;
    addressLines?: string[];
  };

  // Local-currency courtesy line. Display only — nothing is stored in anything
  // but USD — and omitted entirely when the advertiser's country has no rate
  // configured, because a made-up conversion on a document titled "invoice" is
  // worse than none.
  let localLine: string | null = null;
  const country = billTo.addressLines?.slice(-1)[0] ?? null;
  if (country) {
    try {
      const cur = await getCurrencyForCountry(country);
      if (cur && cur.usdRate > 0) {
        const local = toNum(invoice.totalUsd as never) * cur.usdRate;
        localLine = `= ${cur.symbol}${local.toLocaleString("en-US", {
          maximumFractionDigits: 0,
        })} at $1 = ${cur.symbol}${cur.usdRate}`;
      }
    } catch {
      /* a courtesy line must never fail a download */
    }
  }

  const pdf = await renderInvoicePdf({
    number: invoice.number,
    kind: invoice.kind,
    status: invoice.status,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
    paymentRef: invoice.paymentRef,
    notes: invoice.notes,
    seller: { ...seller, taxId: tax.taxId },
    billTo: {
      name: billTo.name ?? "Advertiser",
      email: billTo.email ?? "",
      phone: billTo.phone ?? "",
      taxId: billTo.taxId ?? "",
      addressLines: billTo.addressLines ?? [],
    },
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: toNum(l.quantity as never),
      unitUsd: toNum(l.unitUsd as never),
      amountUsd: toNum(l.amountUsd as never),
    })),
    subtotalUsd: toNum(invoice.subtotalUsd as never),
    discountUsd: toNum(invoice.discountUsd as never),
    taxPct: toNum(invoice.taxPct as never),
    taxLabel: invoice.taxLabel,
    taxUsd: toNum(invoice.taxUsd as never),
    totalUsd: toNum(invoice.totalUsd as never),
    localLine,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      // A document can be reissued (notes, due date), so never cache it.
      "Cache-Control": "no-store",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import {
  createInvoice,
  settleInvoice,
  LINE_KINDS,
  type SettleResult,
} from "@/lib/invoices";

/**
 * Advertiser invoices — list and issue.
 *
 * Gated on the ad permissions rather than `finance.*`: that namespace is
 * FINANCE_ADMIN-only and stripped for non-super principals, which would lock the
 * owner's own ad staff out of the very invoices they need to send.
 */

interface InvoiceLineRow {
  id: string;
  description: string;
  quantity: unknown;
  unitUsd: unknown;
  amountUsd: unknown;
  kind: string;
  refId: string | null;
}

interface InvoiceRow {
  id: string;
  number: string;
  kind: string;
  status: string;
  advertiserId: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  paymentRef: string | null;
  subtotalUsd: unknown;
  discountUsd: unknown;
  taxPct: unknown;
  taxLabel: string | null;
  taxUsd: unknown;
  totalUsd: unknown;
  notes: string | null;
  lines: InvoiceLineRow[];
}

const lineSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().min(0.000001).max(1_000_000).default(1),
  unitUsd: z.number().min(0).max(1_000_000),
  kind: z.enum(LINE_KINDS).default("AD_CREDIT"),
  refId: z.string().optional().nullable(),
});

const createSchema = z.object({
  // One or the other. Resolving the email HERE rather than making the client
  // look it up first matters: the user-search route is gated on `users.view`,
  // which an ads-only admin does not have — they would be unable to bill anyone.
  advertiserId: z.string().min(1).optional(),
  advertiserEmail: z.string().email().optional(),
  lines: z.array(lineSchema).min(1).max(50),
  discountUsd: z.number().min(0).max(1_000_000).optional(),
  dueAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  /** Already paid — issue it as a receipt rather than a bill. */
  paid: z.boolean().default(false),
  paymentRef: z.string().max(120).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const advertiserId = sp.get("advertiserId");

  // Prisma's `include` generic degrades here (the same gotcha noted in
  // admin/analytics/page.tsx), so the row shape is stated explicitly.
  const invoices = (await prisma.invoice.findMany({
    where: {
      ...(status && status !== "all" ? { status } : {}),
      ...(advertiserId ? { advertiserId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { lines: { orderBy: { position: "asc" } } },
  })) as unknown as InvoiceRow[];

  const ids = [...new Set(invoices.map((i) => i.advertiserId))];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      kind: i.kind,
      status: i.status,
      advertiserId: i.advertiserId,
      advertiser: byId.get(i.advertiserId)?.email ?? "—",
      issuedAt: i.issuedAt,
      dueAt: i.dueAt,
      paidAt: i.paidAt,
      paymentRef: i.paymentRef,
      subtotalUsd: toNum(i.subtotalUsd as never),
      discountUsd: toNum(i.discountUsd as never),
      taxPct: toNum(i.taxPct as never),
      taxLabel: i.taxLabel,
      taxUsd: toNum(i.taxUsd as never),
      totalUsd: toNum(i.totalUsd as never),
      notes: i.notes,
      lines: i.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: toNum(l.quantity as never),
        unitUsd: toNum(l.unitUsd as never),
        amountUsd: toNum(l.amountUsd as never),
        kind: l.kind,
        refId: l.refId,
      })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid invoice" },
      { status: 400 }
    );
  }
  const d = v.data;
  if (!d.advertiserId && !d.advertiserEmail) {
    return NextResponse.json(
      { error: "Name the advertiser by id or email." },
      { status: 400 }
    );
  }

  const advertiser = await prisma.user.findFirst({
    where: d.advertiserId
      ? { id: d.advertiserId }
      : { email: { equals: d.advertiserEmail!, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  if (!advertiser) {
    return NextResponse.json(
      { error: "No user with that email or id." },
      { status: 400 }
    );
  }
  const advertiserId = advertiser.id;

  // A SLOT_RENTAL line has to name a booking that exists and belongs to nobody
  // else, or "mark paid" would activate a stranger's space.
  for (const l of d.lines) {
    if (l.kind !== "SLOT_RENTAL") continue;
    if (!l.refId) {
      return NextResponse.json(
        { error: "A slot rental line must name the booking it settles." },
        { status: 400 }
      );
    }
    const booking = await prisma.adSlotBooking.findUnique({
      where: { id: l.refId },
      select: { id: true, advertiserId: true, campaign: { select: { advertiserId: true } } },
    });
    if (!booking) {
      return NextResponse.json({ error: "Unknown booking on a rental line." }, { status: 400 });
    }
    const owner = booking.advertiserId ?? booking.campaign?.advertiserId ?? null;
    if (owner && owner !== advertiserId) {
      return NextResponse.json(
        { error: "That booking belongs to a different advertiser." },
        { status: 400 }
      );
    }
  }

  // Created UNPAID even when the admin says it is paid, then settled below.
  //
  // `settleInvoice` is the only code path that moves money, and it is the one
  // carrying the replay guard. Creating a row already marked PAID would skip it
  // and quietly leave the advertiser's credit untouched — an admin ticking
  // "already paid" means "the money arrived, give them their credit", not
  // "write PAID on a document and do nothing".
  const invoice = await createInvoice({
    advertiserId,
    kind: d.paid ? "RECEIPT" : "BILL",
    lines: d.lines,
    discountUsd: d.discountUsd,
    dueAt: d.dueAt ? new Date(d.dueAt) : null,
    notes: d.notes ?? null,
    createdById: session.user.id,
    paymentRef: d.paymentRef ?? null,
  });

  let settled: SettleResult | null = null;
  if (d.paid) {
    settled = await settleInvoice(invoice.id, { paymentRef: d.paymentRef ?? null });
  }

  await writeAudit({
    actorId: session.user.id,
    action: "INVOICE_ISSUED",
    entity: "Invoice",
    entityId: invoice.id,
    targetUserId: advertiserId,
    summary: `Issued ${invoice.number} to ${advertiser.email} — ${usd(toNum(invoice.totalUsd))}${d.paid ? " (paid on issue)" : ""}`,
    meta: {
      lines: d.lines.length,
      paid: d.paid,
      creditedUsd: settled?.ok ? settled.creditedUsd : 0,
    },
  });

  return NextResponse.json({
    invoice,
    creditedUsd: settled?.ok ? settled.creditedUsd : 0,
    activatedBookings: settled?.ok ? settled.activatedBookings : 0,
  });
}

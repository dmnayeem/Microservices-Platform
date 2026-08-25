import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

/**
 * An advertiser's own invoices and receipts.
 *
 * No feature gate: someone whose advertiser access was later revoked still has a
 * right to the documents for money they already paid. Ownership is the only
 * check, and it is the only one that matters here.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { advertiserId: session.user.id, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      kind: true,
      status: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      totalUsd: true,
      notes: true,
    },
  });

  return NextResponse.json({
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      kind: i.kind,
      status: i.status,
      issuedAt: i.issuedAt,
      dueAt: i.dueAt,
      paidAt: i.paidAt,
      totalUsd: toNum(i.totalUsd),
      notes: i.notes,
      // The document itself is rendered on demand — see /api/invoices/[id]/pdf.
      pdfUrl: `/api/invoices/${i.id}/pdf`,
    })),
  });
}

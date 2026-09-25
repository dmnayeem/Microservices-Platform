import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import { savePayee, type PayeeInput } from "@/lib/company-finance/books";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const payees = await prisma.payee.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { entries: true } } },
  });
  return NextResponse.json({ payees });
}

/** Adding a vendor is part of recording a bill, so the entry permission is enough. */
export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.entries.create");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as PayeeInput;
  const res = await savePayee(null, body);
  if (res.ok) {
    await auditFinance(g.caller, "PAYEE_CREATED", "Payee", res.data.id, `Added payee ${body.name} (${body.kind})`);
  }
  return reply(res, 201);
}

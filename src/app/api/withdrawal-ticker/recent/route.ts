import { NextResponse } from "next/server";
import { prisma, safeRead } from "@/lib/prisma";

/**
 * Recent completed withdrawals for the marquee ticker.
 *
 * Replaces the SSE stream, which held a serverless invocation open for five
 * minutes **per viewer** and ran an uncached query every 8 seconds inside each
 * one — for data that is byte-identical for everybody. At a few thousand
 * concurrent users that is thousands of held-open functions and thousands of
 * queries a minute to show the same list.
 *
 * One shared, cached query instead: whatever the concurrency, the database sees
 * roughly one read per TTL.
 */
interface TickerRow {
  id: string;
  amount: unknown;
  method: string;
  updatedAt: Date;
  user: { name: string | null; username: string | null; country: string | null } | null;
}

export async function GET() {
  const rows = (await safeRead(
    prisma.withdrawal.findMany({
      where: { status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        amount: true,
        method: true,
        updatedAt: true,
        user: { select: { name: true, username: true, country: true } },
      },
      // Shared across every viewer — this is the whole point.
      cacheStrategy: { ttl: 20, swr: 60 },
    }),
    [],
    "ticker:recent"
  )) as unknown as TickerRow[];

  return NextResponse.json({
    items: rows.map((w) => ({
      id: w.id,
      name: w.user?.name ?? w.user?.username ?? "Someone",
      amount: Number(w.amount),
      method: w.method,
      country: w.user?.country ?? null,
      at: w.updatedAt,
    })),
  });
}

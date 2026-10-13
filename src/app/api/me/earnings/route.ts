import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ledgerForUser } from "@/lib/ledger-display";
import { breakdownEarnings, resolveRange } from "@/lib/dashboard-earnings";
import { getPointsPerUsd } from "@/lib/economy";

// GET /api/me/earnings?range=today|7d|30d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// The signed-in member's own earnings by source over a range. The user id comes
// from the session ONLY — there is no parameter that names another account.
// Classification and the earned/not-earned rule live in lib/dashboard-earnings
// (isPointsEarned / magnitudePoints / pointSourceOf), shared with the dashboard
// and the wallet, so the three never disagree.

/** Rows read per request. A year of a very active account fits comfortably. */
const ROW_CAP = 20_000;

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const win = resolveRange(sp.get("range"), sp.get("from"), sp.get("to"));
  if (!win) {
    return NextResponse.json(
      { error: "Pick a valid date range (up to one year)." },
      { status: 400 }
    );
  }

  try {
    const [rows, pointsPerUsd] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, createdAt: { gte: win.start, lt: win.end } },
        orderBy: { createdAt: "desc" },
        take: ROW_CAP + 1,
        select: {
          type: true,
          status: true,
          points: true,
          amount: true,
          reference: true,
          // forUser() reads metadata.adjustedPoints for corrected rows.
          metadata: true,
          createdAt: true,
        },
      }),
      getPointsPerUsd(),
    ]);
    const truncated = rows.length > ROW_CAP;
    const data = breakdownEarnings(
      ledgerForUser(truncated ? rows.slice(0, ROW_CAP) : rows),
      win,
      truncated
    );
    return NextResponse.json(
      { ...data, pointsPerUsd },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("[api/me/earnings]", e);
    return NextResponse.json({ error: "Could not load your earnings. Try again." }, { status: 500 });
  }
}

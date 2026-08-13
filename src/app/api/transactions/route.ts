import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { TransactionType, TransactionStatus, Prisma } from "@/generated/prisma";
import { deriveSource, type SourceKey } from "@/lib/tx-sources";

/**
 * Translate a UI "source" into a Prisma where-fragment. Most sources map 1:1 to
 * a TransactionType; the EARNING/PURCHASE-derived ones are disambiguated by the
 * `reference` prefix (matches deriveSource()).
 */
function sourceWhere(source: SourceKey): Prisma.TransactionWhereInput | null {
  switch (source) {
    case "deposit": return { type: "DEPOSIT" };
    case "withdraw": return { type: "WITHDRAWAL" };
    case "convert": return { type: "POINTS_CONVERSION" };
    case "referral": return { type: "REFERRAL" };
    case "affiliate": return { type: "AFFILIATE_COMMISSION" };
    case "course": return { type: { in: ["COURSE_PURCHASE", "COURSE_TUTOR_EARNING", "COURSE_REFUND"] } };
    case "lottery": return { type: "LOTTERY_WIN" };
    case "adcredit": return { type: "AD_CREDIT_PURCHASE" };
    case "admin": return { type: { in: ["PENALTY", "ADMIN_FEE"] } };
    case "refund": return { type: "REFUND" };
    case "bonus": return { type: { in: ["BONUS", "GIFT"] } };
    case "checkin":
      return { OR: [{ type: "CHECKIN" }, { type: "EARNING", reference: { startsWith: "daily_" } }] };
    case "social":
      return { type: "EARNING", reference: { startsWith: "social_" } };
    case "marketplace":
      return {
        OR: [
          { type: "PURCHASE", reference: { startsWith: "order_" } },
          { reference: { startsWith: "deal_" } },
          { reference: { contains: "marketplace" } },
        ],
      };
    case "purchase":
      return { type: "PURCHASE" };
    case "task":
      return {
        type: "EARNING",
        NOT: { OR: [{ reference: { startsWith: "social_" } }, { reference: { startsWith: "daily_" } }] },
      };
    default:
      return null; // "other" — no clean server filter
  }
}

// GET /api/transactions — user transaction history with date + source filters.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as TransactionType | null;
    const status = searchParams.get("status") as TransactionStatus | null;
    const source = searchParams.get("source") as SourceKey | null;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    // Date range (inclusive). `to` date-only → extend to end of that day.
    let createdAt: Prisma.DateTimeFilter | undefined;
    const fromD = from ? new Date(from) : null;
    let toD = to ? new Date(to) : null;
    if (toD && /^\d{4}-\d{2}-\d{2}$/.test(to!)) toD = new Date(toD.getTime() + 86_400_000 - 1);
    if ((fromD && !isNaN(fromD.getTime())) || (toD && !isNaN(toD.getTime()))) {
      createdAt = {
        ...(fromD && !isNaN(fromD.getTime()) ? { gte: fromD } : {}),
        ...(toD && !isNaN(toD.getTime()) ? { lte: toD } : {}),
      };
    }

    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(source ? sourceWhere(source) ?? {} : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.transaction.count({ where }),
    ]);

    // Per-type points sum over the SAME filtered range (minus pagination), folded
    // into sources for the breakdown. Reference-derived splits (social/checkin)
    // fold into their base type here — row-level `source` stays exact.
    const rangeWhere: Prisma.TransactionWhereInput = {
      userId,
      status: "COMPLETED",
      ...(createdAt ? { createdAt } : {}),
    };
    const grouped = (await prisma.transaction.groupBy({
      by: ["type"],
      where: rangeWhere,
      _sum: { points: true, amount: true },
    })) as unknown as {
      type: TransactionType;
      _sum: { points: number | null; amount: Prisma.Decimal | null };
    }[];

    const bySource: Record<string, { points: number; amount: number }> = {};
    for (const g of grouped) {
      const key = deriveSource(g.type, null);
      const cur = bySource[key] ?? { points: 0, amount: 0 };
      cur.points += g._sum.points ?? 0;
      cur.amount += toNum(g._sum.amount ?? 0);
      bySource[key] = cur;
    }

    const sumByType = new Map(grouped.map((g) => [g.type, g._sum.points ?? 0]));
    const sumOf = (t: TransactionType) => sumByType.get(t) ?? 0;

    // Pending task earnings (not yet credited) so the user sees points coming.
    const pendingSubs = await prisma.taskSubmission.findMany({
      where: { userId, status: "PENDING" },
      select: { task: { select: { pointsReward: true } } },
    });
    const pendingEarnings = pendingSubs.reduce((s, sub) => s + (sub.task?.pointsReward ?? 0), 0);

    return NextResponse.json({
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        points: tx.points,
        amount: toNum(tx.amount),
        description: tx.description,
        reference: tx.reference,
        metadata: tx.metadata ?? null,
        source: deriveSource(tx.type, tx.reference),
        createdAt: tx.createdAt,
        isCredit: !["WITHDRAWAL", "PURCHASE", "PENALTY", "AD_CREDIT_PURCHASE"].includes(tx.type),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      // Period summary (respects the date filter) — NOT the lifetime totals; the
      // wallet reads User.totalEarnings for the lifetime headline.
      summary: {
        periodEarnings: sumOf("EARNING") + sumOf("CHECKIN"),
        periodWithdrawals: Math.abs(sumOf("WITHDRAWAL")),
        periodReferrals: sumOf("REFERRAL"),
        periodBonuses: sumOf("BONUS") + sumOf("LOTTERY_WIN") + sumOf("GIFT"),
        bySource,
        pendingEarnings,
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}

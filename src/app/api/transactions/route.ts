import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { TransactionType, TransactionStatus } from "@/generated/prisma";

// GET /api/transactions - Get user transaction history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as TransactionType | null;
    const status = searchParams.get("status") as TransactionStatus | null;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    // Build query
    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    // Fetch transactions
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    // Calculate summary stats from all completed transactions.
    // Aggregate per-type in the DB instead of loading the full history.
    const grouped = (await prisma.transaction.groupBy({
      by: ["type"],
      where: { userId: session.user.id, status: "COMPLETED" },
      _sum: { points: true },
    })) as unknown as { type: TransactionType; _sum: { points: number | null } }[];
    const sumByType = new Map(grouped.map((g) => [g.type, g._sum.points ?? 0]));
    const sumOf = (t: TransactionType) => sumByType.get(t) ?? 0;

    const summary = {
      totalEarnings: sumOf("EARNING") + sumOf("CHECKIN"),
      totalWithdrawals: Math.abs(sumOf("WITHDRAWAL")),
      totalReferrals: sumOf("REFERRAL"),
      totalBonuses: sumOf("BONUS") + sumOf("LOTTERY_WIN"),
    };

    return NextResponse.json({
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        points: tx.points,
        amount: toNum(tx.amount),
        description: tx.description,
        reference: tx.reference,
        createdAt: tx.createdAt,
        // Determine if it's a credit or debit
        isCredit: !["WITHDRAWAL", "PURCHASE", "PENALTY"].includes(tx.type),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

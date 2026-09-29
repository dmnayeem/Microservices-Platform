import { NextRequest, NextResponse } from "next/server";
import { forUser, HIDDEN_FROM_USER_PREFIX, userVisibleLedger } from "@/lib/ledger-display";
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
    // ADMIN_FEE covers both a penalty-style charge and the buyer commission,
    // so they are split by reference exactly as `deriveSource` splits them —
    // otherwise the "Task fees" chip existed in the UI with no server filter
    // behind it and quietly returned everything.
    case "admin":
      return {
        type: { in: ["PENALTY", "ADMIN_FEE"] },
        NOT: { reference: { startsWith: "task_fee_" } },
      };
    case "taskfee":
      return { type: "ADMIN_FEE", reference: { startsWith: "task_fee_" } };
    case "taskcredit":
      return {
        type: "PURCHASE",
        OR: [
          { reference: { startsWith: "taskcredit_" } },
          { reference: { startsWith: "taskspend_" } },
        ],
      };
    case "refund": return { type: "REFUND" };
    // Payroll is written as BONUS with a `payroll_` reference — there is no
    // SALARY type — so the two cases have to be written as a pair. Without the
    // NOT, picking "Bonus" would also list every wage payment, and the two chips
    // would disagree with the classifier in `tx-sources.ts`, which already sends
    // `payroll_` rows to their own bucket.
    case "bonus":
      return {
        OR: [
          { type: { in: ["BONUS", "GIFT"] }, NOT: { reference: { startsWith: "payroll_" } } },
          // Leaderboard prizes (tx-sources.ts files them under bonus).
          { type: "EARNING", reference: { startsWith: "leaderboard_" } },
        ],
      };
    case "payroll":
      return { type: "BONUS", reference: { startsWith: "payroll_" } };
    case "checkin":
      return { OR: [{ type: "CHECKIN" }, { type: "EARNING", reference: { startsWith: "daily_" } }] };
    case "social":
      return { type: "EARNING", reference: { startsWith: "social_" } };
    case "cpa":
      // Credits and their reversals both carry a `cpa_` reference.
      return { reference: { startsWith: "cpa_" } };
    case "marketplace":
      return {
        OR: [
          { type: "PURCHASE", reference: { startsWith: "order_" } },
          { reference: { startsWith: "deal_" } },
          { reference: { contains: "marketplace" } },
        ],
      };
    case "purchase":
      return {
        type: "PURCHASE",
        NOT: {
          OR: [
            { reference: { startsWith: "taskcredit_" } },
            { reference: { startsWith: "taskspend_" } },
          ],
        },
      };
    case "task":
      return {
        type: "EARNING",
        NOT: {
          OR: [
            { reference: { startsWith: "social_" } },
            { reference: { startsWith: "daily_" } },
            { reference: { startsWith: "leaderboard_" } },
            { reference: { startsWith: "cpa_" } },
          ],
        },
      };
    default:
      return null; // "other" — no clean server filter
  }
}

/**
 * The sources that are MONEY MOVING, as opposed to work being logged.
 *
 * A wallet history that lists every completed task alongside every deposit is
 * a task log with the occasional payment in it: on an active account the
 * earnings drown everything else, and "when did my withdrawal go out" becomes
 * unanswerable. Earnings are still available — they are just not the default
 * on a page whose job is the money record.
 */

/** `kind=money` → everything that is NOT a per-task earning row. */
function kindWhere(kind: string | null): Prisma.TransactionWhereInput | null {
  if (kind === "money") {
    return {
      NOT: {
        OR: [
          // Per-task and per-post earnings: the work log.
          {
            type: "EARNING",
            NOT: { reference: { startsWith: "daily_" } },
          },
          { type: { in: ["CHECKIN", "LOTTERY_WIN"] } },
        ],
      },
    };
  }
  if (kind === "earning") {
    return {
      OR: [
        { type: "EARNING" },
        { type: { in: ["CHECKIN", "LOTTERY_WIN", "REFERRAL", "AFFILIATE_COMMISSION", "BONUS", "GIFT"] } },
      ],
    };
  }
  return null;
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
    // "money" (the transactions page default), "earning", or absent for all.
    const kind = searchParams.get("kind");
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
      // A source chip is more specific than the kind, so it wins: picking
      // "Tasks" while on the money view should show tasks, not nothing.
      ...(!source ? kindWhere(kind) ?? {} : {}),
      // A correction is shown folded into the prize it corrects, not as its
      // own line (lib/ledger-display.ts).
      AND: [userVisibleLedger],
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

    // The hidden corrections still count in the period totals — they are real
    // — but as part of the earnings they corrected, not as a penalty line, so
    // the breakdown matches the rows the user can see.
    const hidden = await prisma.transaction.aggregate({
      where: { ...rangeWhere, reference: { startsWith: HIDDEN_FROM_USER_PREFIX } },
      _sum: { points: true, amount: true },
    });
    const hiddenPts = hidden._sum.points ?? 0;
    if (hiddenPts !== 0) {
      const move = (t: TransactionType, pts: number, amt: number) => {
        let g = grouped.find((x) => x.type === t);
        if (!g) grouped.push((g = { type: t, _sum: { points: 0, amount: null } }));
        g._sum.points = (g._sum.points ?? 0) + pts;
        g._sum.amount = new Prisma.Decimal(toNum(g._sum.amount ?? 0) + amt);
      };
      const hiddenAmt = toNum(hidden._sum.amount ?? 0);
      move("PENALTY" as TransactionType, -hiddenPts, -hiddenAmt);
      move("EARNING" as TransactionType, hiddenPts, hiddenAmt);
    }

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
      select: { taskId: true },
    });
    const rewardByTask = new Map<string, number>();
    if (pendingSubs.length) {
      const pendingTasks = await prisma.task.findMany({
        where: { id: { in: pendingSubs.map((s) => s.taskId) } },
        select: { id: true, pointsReward: true },
      });
      for (const t of pendingTasks) rewardByTask.set(t.id, t.pointsReward);
    }
    const pendingEarnings = pendingSubs.reduce(
      (sum, sub) => sum + (rewardByTask.get(sub.taskId) ?? 0),
      0
    );

    return NextResponse.json({
      transactions: transactions.map(forUser).map((tx) => ({
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

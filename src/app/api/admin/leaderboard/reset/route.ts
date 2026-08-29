import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma/client";
import { z } from "zod";
import {
  computeCombinedTopUsers,
  getEligiblePackages,
} from "@/lib/leaderboard";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";
import { invalidateSettingsCache } from "@/lib/system-settings";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { NON_STAFF_WHERE } from "@/lib/staff";

const schema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]),
});

/**
 * Stable identifier for the period a payout belongs to, in UTC.
 *
 * The point is that running the monthly reset twice in August produces the same
 * key both times, so the ledger's unique reference rejects the second payout.
 * Weekly uses the ISO week number rather than the calendar week so a cycle
 * never straddles a year boundary ambiguously.
 */
function cycleKey(period: "daily" | "weekly" | "monthly", at: Date): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  if (period === "monthly") return `${y}-${m}`;
  if (period === "daily") {
    return `${y}-${m}-${String(at.getUTCDate()).padStart(2, "0")}`;
  }
  // ISO-8601 week: Thursday of the current week decides the year.
  const d = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

type Metric =
  | "POINTS_EARNED"
  | "TASKS_COMPLETED"
  | "REFERRALS"
  | "XP_EARNED"
  | "COMBINED";

async function readSetting(key: string): Promise<unknown> {
  const r = await prisma.systemSetting.findUnique({ where: { key } });
  return r?.value;
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asArrayOfNumbers(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((n) => (typeof n === "number" ? n : Number(n)));
  return out.every((n) => Number.isFinite(n) && n >= 0) ? out : null;
}

function distributePrizes(total: number, count: number, custom: number[] | null) {
  if (custom && custom.length > 0) {
    const sliced = custom.slice(0, count);
    while (sliced.length < count) sliced.push(0);
    return sliced.map((n) => Math.max(0, Math.round(n)));
  }
  if (count <= 0 || total <= 0) return [];
  // Default weighted distribution: rank 1 gets 50%, rank 2 30%, rank 3 15%, rest split
  const weights =
    count === 1
      ? [1]
      : count === 2
      ? [0.65, 0.35]
      : count === 3
      ? [0.5, 0.3, 0.2]
      : [0.5, 0.25, 0.15, ...Array(count - 3).fill(0.1 / (count - 3))];
  return weights.map((w) => Math.round(total * w));
}

/**
 * The winners of one cycle, for whichever metric the admin configured.
 *
 * Every branch excludes staff. This function does not just rank people — its
 * result is paid out in real balance further down, so leaving an admin in the
 * pool is not a display bug, it is the platform paying its own staff a prize
 * from the prize pot.
 */
async function topUsers(metric: Metric, take: number, eligibleSet: Set<string>) {
  if (metric === "COMBINED") {
    // Use the shared lib — already applies eligibility AND the staff filter.
    const top = await computeCombinedTopUsers({
      limit: take,
      eligiblePackages: Array.from(eligibleSet),
      filterEligible: true,
    });
    return top.map((r) => ({
      userId: r.userId,
      name: r.name,
      value: Math.round(r.score),
    }));
  }

  // Single-metric branches: pull a generous candidate pool then trim down to
  // the top N eligible users.
  const POOL = take * 5;
  const filterByEligibility = <T extends { id: string; package: { slug: string } | null }>(
    rows: T[]
  ) => rows.filter((u) => u.package?.slug && eligibleSet.has(u.package.slug.toUpperCase())).slice(0, take);

  if (metric === "POINTS_EARNED") {
    const pointsPerUsd = await getPointsPerUsd();
    const usersRaw = await prisma.user.findMany({
      where: NON_STAFF_WHERE,
      orderBy: { totalEarnings: "desc" },
      take: POOL,
      select: {
        id: true,
        name: true,
        totalEarnings: true,
        package: { select: { slug: true } },
      },
    });
    const users = usersRaw as unknown as Array<{
      id: string;
      name: string | null;
      totalEarnings: number;
      package: { slug: string } | null;
    }>;
    return filterByEligibility(users).map((u) => ({
      userId: u.id,
      name: u.name,
      value: Math.round(toNum(u.totalEarnings) * pointsPerUsd),
    }));
  }
  if (metric === "XP_EARNED") {
    const usersRaw = await prisma.user.findMany({
      where: NON_STAFF_WHERE,
      orderBy: { xp: "desc" },
      take: POOL,
      select: {
        id: true,
        name: true,
        xp: true,
        package: { select: { slug: true } },
      },
    });
    const users = usersRaw as unknown as Array<{
      id: string;
      name: string | null;
      xp: number;
      package: { slug: string } | null;
    }>;
    return filterByEligibility(users).map((u) => ({
      userId: u.id,
      name: u.name,
      value: u.xp,
    }));
  }
  if (metric === "REFERRALS") {
    const usersRaw = await prisma.user.findMany({
      where: NON_STAFF_WHERE,
      orderBy: { referrals: { _count: "desc" } },
      take: POOL,
      select: {
        id: true,
        name: true,
        package: { select: { slug: true } },
      },
    });
    const users = usersRaw as unknown as Array<{
      id: string;
      name: string | null;
      package: { slug: string } | null;
    }>;
    const eligibleUsers = filterByEligibility(users);
    const counts = await Promise.all(
      eligibleUsers.map((u) =>
        prisma.user.count({ where: { referredById: u.id } })
      )
    );
    return eligibleUsers.map((u, i) => ({
      userId: u.id,
      name: u.name,
      value: counts[i],
    }));
  }
  // TASKS_COMPLETED
  const usersRaw = await prisma.user.findMany({
    where: NON_STAFF_WHERE,
    orderBy: { taskSubmissions: { _count: "desc" } },
    take: POOL,
    select: {
      id: true,
      name: true,
      package: { select: { slug: true } },
    },
  });
  const users = usersRaw as unknown as Array<{
    id: string;
    name: string | null;
    package: { slug: string } | null;
  }>;
  const eligibleUsers = filterByEligibility(users);
  const counts = await Promise.all(
    eligibleUsers.map((u) =>
      prisma.taskSubmission.count({ where: { userId: u.id } })
    )
  );
  return eligibleUsers.map((u, i) => ({
    userId: u.id,
    name: u.name,
    value: counts[i],
  }));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "leaderboards.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const { period } = v.data;

  // Pull settings
  const metric =
    ((await readSetting("lb_metric")) as Metric) || "COMBINED";
  const eligiblePackages = await getEligiblePackages();
  const eligibleSet = new Set(
    eligiblePackages.map((s) => s.toUpperCase())
  );
  const totalPrize = asNumber(
    await readSetting(`lb_${period}_prize`),
    period === "daily" ? 5000 : period === "weekly" ? 25000 : 100000
  );
  const winnerCount = asNumber(
    await readSetting(`lb_${period}_winners`),
    period === "daily" ? 1 : period === "weekly" ? 3 : 5
  );
  const minEntries = asNumber(await readSetting("lb_min_entries"), 5);
  const customDistribution = asArrayOfNumbers(
    await readSetting(`lb_${period}_distribution`)
  );

  // Counts the same population the prize is drawn from — staff cannot win it,
  // so they must not be what pushes a cycle over the minimum-entries gate.
  const totalUsers = await prisma.user.count({ where: NON_STAFF_WHERE });
  if (totalUsers < minEntries) {
    return NextResponse.json(
      { error: `Need at least ${minEntries} users to publish a cycle` },
      { status: 400 }
    );
  }

  const winners = await topUsers(metric, winnerCount, eligibleSet);
  if (winners.length === 0) {
    return NextResponse.json(
      {
        error:
          "No eligible users found. Check the eligible-plans list in Settings — none of the top performers qualify.",
      },
      { status: 400 }
    );
  }

  const prizes = distributePrizes(totalPrize, winners.length, customDistribution);
  const pointsPerUsd = await getPointsPerUsd();
  const cycledAt = new Date();
  // Identifies the cycle by the WINDOW it pays out, not by the moment the
  // button was pressed.
  //
  // It used to be `${Date.now()}_${period}`, which is a different string on
  // every invocation — so the ledger's @@unique([userId, reference]) could
  // never fire, and there was no "already published" check either. A
  // double-click, a proxy retry or a second admin paid the entire prize pool
  // again (100,000 points on the monthly default), every time.
  const cycleId = `${cycleKey(period, cycledAt)}_${period}`;
  const historyKey = `lb_history_${cycleId}`;

  const alreadyPublished = await prisma.systemSetting.findUnique({
    where: { key: historyKey },
    select: { key: true },
  });
  if (alreadyPublished) {
    return NextResponse.json(
      {
        error: `The ${period} leaderboard for this period has already been published and paid out. It can only run once per period.`,
        cycleId,
      },
      { status: 409 }
    );
  }

  // Award prizes
  const operations = winners.flatMap((w, i) => {
    const points = prizes[i] ?? 0;
    if (points <= 0) return [];
    return [
      prisma.user.update({
        where: { id: w.userId },
        data: {
          pointsBalance: { increment: points },
          totalEarnings: { increment: points / pointsPerUsd },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: w.userId,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          points,
          amount: points / pointsPerUsd,
          description: `Leaderboard prize: ${period} #${i + 1}`,
          reference: `leaderboard_${cycleId}_${w.userId}`,
          metadata: {
            period,
            rank: i + 1,
            metric,
            cycleId,
          },
        },
      }),
      prisma.notification.create({
        data: {
          userId: w.userId,
          type: NotificationType.ACHIEVEMENT,
          title: `🏆 Leaderboard Prize!`,
          message: `You ranked #${i + 1} on the ${period} leaderboard and earned ${points} points!`,
          data: { period, rank: i + 1, points, cycleId },
        },
      }),
    ];
  });

  if (operations.length > 0) {
    try {
      await prisma.$transaction(operations);
    } catch (error) {
      // Two admins pressing publish at the same moment: the reference is now
      // deterministic, so the second one collides here and the whole array
      // transaction rolls back. Nobody was paid twice.
      if (isDuplicateLedgerError(error)) {
        return NextResponse.json(
          {
            error: `The ${period} leaderboard for this period was just published by someone else. Nothing was paid twice.`,
            cycleId,
          },
          { status: 409 }
        );
      }
      throw error;
    }
  }

  // Persist cycle
  await prisma.systemSetting.upsert({
    where: { key: historyKey },
    create: {
      key: historyKey,
      category: "leaderboard_history",
      value: {
        cycleId,
        period,
        metric,
        totalPrize,
        cycledAt: cycledAt.toISOString(),
        winners: winners.map((w, i) => ({
          rank: i + 1,
          userId: w.userId,
          name: w.name ?? "Anonymous",
          value: w.value,
          prize: prizes[i] ?? 0,
        })),
      },
    },
    update: {
      category: "leaderboard_history",
      value: {
        cycleId,
        period,
        metric,
        totalPrize,
        cycledAt: cycledAt.toISOString(),
        winners: winners.map((w, i) => ({
          rank: i + 1,
          userId: w.userId,
          name: w.name ?? "Anonymous",
          value: w.value,
          prize: prizes[i] ?? 0,
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: `LEADERBOARD_RESET_${period.toUpperCase()}`,
      entity: "Leaderboard",
      entityId: cycleId,
      newData: { period, metric, totalPrize, winners: winners.length },
    },
  });

  invalidateSettingsCache();

  return NextResponse.json({
    success: true,
    cycleId,
    period,
    awarded: winners.length,
    totalDistributed: prizes.reduce((a, b) => a + b, 0),
  });
}

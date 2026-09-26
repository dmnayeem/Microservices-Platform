import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma/client";
import {
  computeCombinedTopUsers,
  getEligiblePackages,
  topTaskEarners,
} from "@/lib/leaderboard";
import { getPointsPerUsd } from "@/lib/economy";
import { invalidateSettingsCache } from "@/lib/system-settings";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { NON_STAFF_WHERE } from "@/lib/staff";
import { calculateLevel } from "@/lib/level";
import { cycleWindow, topUsersInWindow } from "@/lib/leaderboard-window";
import type { CelebrationPayload } from "@/lib/celebration";

/**
 * ONE leaderboard payout, used by both the admin button and the cron.
 *
 * This used to live entirely inside `api/admin/leaderboard/reset`. The
 * scheduled path needs the identical selection, the identical distribution and
 * — above all — the identical idempotency, so it calls this instead of growing
 * a second payout that drifts from the first.
 *
 * ─── The idempotency rule, stated once ───────────────────────────────────────
 * A cycle is identified by the WINDOW it pays for (`2026-09_monthly`), never by
 * the moment the job ran. One window is paid at most once, enforced in three
 * independent layers so no single failure mode can pay twice:
 *
 *   1. CLAIM   — `SystemSetting["lb_history_<cycleId>"]` is `create`d (not
 *                upserted) before a single point moves, freezing WHO won and
 *                WHAT they win. A second runner loses that create and resumes
 *                from the frozen list rather than re-ranking, so the winner set
 *                cannot drift between attempts.
 *   2. LEDGER  — every payout carries `reference = leaderboard_<cycleId>_<uid>`
 *                under `Transaction @@unique([userId, reference])`. A repeat is
 *                a P2002 inside that winner's transaction: it rolls back, and
 *                `isDuplicateLedgerError` records it as *skipped*, not failed.
 *   3. COMPLETE— the frozen row is marked `completed` once every winner is
 *                settled. A finished cycle short-circuits before any query.
 *
 * A partial run (timeout, deploy mid-flight) therefore RESUMES: already-paid
 * winners fall out at layer 2, the rest are paid, and the row completes.
 *
 * ─── Why not one big transaction ────────────────────────────────────────────
 * Accelerate rejects an interactive transaction over 15s (P6005). Each winner
 * gets their own short transaction; the loop is outside. That is also what
 * makes resume work.
 */

export type Period = "daily" | "weekly" | "monthly";

export type Metric =
  | "POINTS_EARNED"
  | "TASKS_COMPLETED"
  | "REFERRALS"
  | "XP_EARNED"
  | "COMBINED";

export interface FrozenWinner {
  rank: number;
  userId: string;
  name: string;
  value: number;
  prize: number;
  xp: number;
  gift: string | null;
}

export interface ResetOutcome {
  ok: boolean;
  cycleId: string;
  period: Period;
  /** Winners actually credited by THIS run. */
  paid: number;
  /** Winners this run found already credited (a resume, or a double-run). */
  skipped: number;
  /** Total points moved by THIS run only. */
  totalDistributed: number;
  totalXp: number;
  giftsAwarded: number;
  winners: FrozenWinner[];
  /** Set when the cycle was already fully settled before this run started. */
  alreadyCompleted?: boolean;
  /** Set when the run could not start at all. */
  error?: string;
  /** HTTP status the admin route should use for `error`. */
  status?: number;
}

/**
 * Stable identifier for the period a payout belongs to, in **UTC**.
 *
 * Every boundary in this file is UTC midnight, not server-local and not
 * Asia/Dhaka. Vercel cron fires on UTC, `cycleKey` already bucketed on UTC, and
 * a key computed in one zone but paid in another would let the same window be
 * claimed under two different ids — which is precisely the double-payout this
 * whole file exists to prevent.
 */
export function cycleKey(period: Period, at: Date): string {
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

/**
 * A moment inside the most recently CLOSED window of `period`, in UTC.
 *
 * The scheduled job pays the window that just ended, not the one now running —
 * a monthly reset firing at 2026-10-01T00:00Z owes September's winners. Anchor
 * it to a moment inside the closed window and `cycleKey` does the rest.
 *
 * This is also the missed-window rule: because the anchor is derived from the
 * calendar and not from "when did we last run", the cron can fire at 00:00 or
 * at 17:00 three days late and still compute the same `cycleId`. A deploy or an
 * outage across midnight delays the payout to the next tick; it never skips it,
 * and the claim + ledger layers mean the catch-up cannot pay twice.
 */
export function lastClosedWindowAnchor(period: Period, now: Date): Date {
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const d = now.getUTCDate();
  if (period === "monthly") {
    // Noon on the 15th of the previous month — far from any boundary.
    return new Date(Date.UTC(y, mo - 1, 15, 12, 0, 0));
  }
  if (period === "daily") {
    return new Date(Date.UTC(y, mo, d - 1, 12, 0, 0));
  }
  // Weekly: back up into the previous ISO week (Mon–Sun) from today's midday.
  const today = new Date(Date.UTC(y, mo, d, 12, 0, 0));
  const isoDow = today.getUTCDay() === 0 ? 7 : today.getUTCDay(); // Mon=1..Sun=7
  today.setUTCDate(today.getUTCDate() - isoDow - 3); // mid-week, previous week
  return today;
}

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

export interface GiftItem {
  rank: number;
  giftName: string;
  giftImage?: string;
}

function asGiftItems(v: unknown): GiftItem[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const o = raw as { rank?: unknown; giftName?: unknown; giftImage?: unknown };
    const rank = Number(o.rank);
    const giftName = typeof o.giftName === "string" ? o.giftName.trim() : "";
    if (!Number.isFinite(rank) || rank < 1 || !giftName) return [];
    return [
      {
        rank: Math.round(rank),
        giftName,
        giftImage:
          typeof o.giftImage === "string" && o.giftImage ? o.giftImage : undefined,
      },
    ];
  });
}

export function distributePrizes(
  total: number,
  count: number,
  custom: number[] | null
) {
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
 * XP prizes per rank. Unlike points there is no pool to spread — the admin
 * either typed a per-rank list or nobody gets XP, so an empty/absent setting
 * means zero rather than some invented default.
 */
export function distributeXp(count: number, custom: number[] | null): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const n = custom?.[i];
    out.push(Number.isFinite(n) && (n as number) > 0 ? Math.round(n as number) : 0);
  }
  return out;
}

/**
 * The winners of one cycle, for whichever metric the admin configured.
 *
 * Every branch excludes staff. This function does not just rank people — its
 * result is paid out in real balance further down, so leaving an admin in the
 * pool is not a display bug, it is the platform paying its own staff a prize
 * from the prize pot.
 */
export async function topUsers(
  metric: Metric,
  take: number,
  eligibleSet: Set<string>
) {
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
  const filterByEligibility = <
    T extends { id: string; package: { slug: string } | null }
  >(
    rows: T[]
  ) =>
    rows
      .filter((u) => u.package?.slug && eligibleSet.has(u.package.slug.toUpperCase()))
      .slice(0, take);

  if (metric === "POINTS_EARNED") {
    // POINTS EARNED means points earned FROM TASKS, and it is the exact same
    // `topTaskEarners` the public board ranks on. It used to be
    // `User.totalEarnings` DESC — a counter a marketplace sale also bumps, so a
    // pair of accounts trading with each other could buy their way into a prize
    // that this route then paid out in real balance.
    //
    // The board and the payout must agree; a leaderboard that ranks one way and
    // pays another is worse than either one on its own.
    const earners = await topTaskEarners(POOL);
    const usersRaw = await prisma.user.findMany({
      where: { id: { in: earners.map((e) => e.userId) }, ...NON_STAFF_WHERE },
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
    const byId = new Map(users.map((u) => [u.id, u]));
    // Re-ordered by the aggregate, not by whatever order the hydrate came back
    // in, then trimmed to the eligible top N.
    const ordered = earners.flatMap((e) => {
      const u = byId.get(e.userId);
      return u ? [{ ...u, value: e.points }] : [];
    });
    return filterByEligibility(ordered).map((u) => ({
      userId: u.id,
      name: u.name,
      value: u.value,
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
  //
  // "Completed" means APPROVED or AUTO_APPROVED — the exact status filter the
  // public /leaderboard "tasks" board and the TASKS component of the COMBINED
  // score both rank on (`api/leaderboard/route.ts` type=tasks,
  // `computeCombinedTopUsers` in leaderboard.ts). This used to count EVERY
  // submission a user had ever made, approved or not — same class of bug as
  // the POINTS_EARNED metric above (which now shares `topTaskEarners` with
  // the board it pays): a board that ranks one way and pays another. A user
  // could out-earn a real top performer here by submitting proof that was
  // never approved, since a pending or rejected submission was worth exactly
  // as much as a paid one.
  //
  // The initial pool is still ordered by the ALL-submissions relation count
  // (Prisma cannot filter a relation count by status inside `orderBy`), so a
  // wider net than the other single-metric branches is pulled before the
  // final approved-only count decides who actually ranks — then the list is
  // re-sorted by that real value, because the pool order is only a candidate
  // net, not the answer.
  const TASK_POOL = Math.max(POOL, 200);
  const usersRaw = await prisma.user.findMany({
    where: NON_STAFF_WHERE,
    orderBy: { taskSubmissions: { _count: "desc" } },
    take: TASK_POOL,
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
  const eligiblePool = users.filter(
    (u) => u.package?.slug && eligibleSet.has(u.package.slug.toUpperCase())
  );
  const counts = await Promise.all(
    eligiblePool.map((u) =>
      prisma.taskSubmission.count({
        where: { userId: u.id, status: { in: ["APPROVED", "AUTO_APPROVED"] } },
      })
    )
  );
  return eligiblePool
    .map((u, i) => ({ userId: u.id, name: u.name, value: counts[i] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, take);
}

/** Reads the frozen winner list back off a claimed cycle row. */
function parseFrozen(value: unknown): FrozenWinner[] | null {
  if (!value || typeof value !== "object") return null;
  const w = (value as { winners?: unknown }).winners;
  if (!Array.isArray(w)) return null;
  return w.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const o = raw as Record<string, unknown>;
    if (typeof o.userId !== "string") return [];
    return [
      {
        rank: asNumber(o.rank, 0),
        userId: o.userId,
        name: typeof o.name === "string" ? o.name : "Anonymous",
        value: asNumber(o.value, 0),
        prize: asNumber(o.prize, 0),
        xp: asNumber(o.xp, 0),
        gift: typeof o.gift === "string" ? o.gift : null,
      },
    ];
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Credit ONE winner: ledger row, balance, XP, level, notification.
 *
 * The ledger row is written first so a repeat aborts the transaction before a
 * single point moves. The balance itself is a compare-and-set — `updateMany`
 * with the pre-read `pointsBalance`/`xp` in the WHERE and `count === 1` checked
 * — so a concurrent credit from any other earning path cannot be clobbered by a
 * stale read. A lost CAS retries with fresh values; the ledger row rolls back
 * with it, so a retry is not a second payout.
 */
async function payWinner(args: {
  w: FrozenWinner;
  period: Period;
  metric: Metric;
  cycleId: string;
  pointsPerUsd: number;
  /** The whole frozen list, for the "who won what" celebration popup. */
  all: FrozenWinner[];
}): Promise<"paid" | "skipped" | "nothing"> {
  const { w, period, metric, cycleId, pointsPerUsd, all } = args;
  const points = Math.max(0, Math.round(w.prize));
  const xp = Math.max(0, Math.round(w.xp));
  if (points <= 0 && xp <= 0) return "nothing";

  const reference = `leaderboard_${cycleId}_${w.userId}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const beforeRaw = await prisma.user.findUnique({
      where: { id: w.userId },
      select: { pointsBalance: true, xp: true, level: true },
    });
    if (!beforeRaw) return "nothing";
    // Accelerate collapses narrow selects — restate the row shape.
    const before = beforeRaw as unknown as {
      pointsBalance: number;
      xp: number;
      level: number;
    };
    const nextXp = before.xp + xp;
    const nextLevel = Math.max(before.level, calculateLevel(nextXp));

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            userId: w.userId,
            type: TransactionType.EARNING,
            status: TransactionStatus.COMPLETED,
            points,
            amount: points / pointsPerUsd,
            description: `Leaderboard prize: ${period} #${w.rank}`,
            reference,
            metadata: { period, rank: w.rank, metric, cycleId, xp },
          },
        });
        // CAS: the row must still hold the values we costed this payout on.
        const cas = await tx.user.updateMany({
          where: {
            id: w.userId,
            pointsBalance: before.pointsBalance,
            xp: before.xp,
          },
          data: {
            pointsBalance: before.pointsBalance + points,
            xp: nextXp,
            level: nextLevel,
            totalEarnings: { increment: points / pointsPerUsd },
          },
        });
        if (cas.count !== 1) throw new Error("LB_CAS_LOST");
        await tx.notification.create({
          data: {
            userId: w.userId,
            type: NotificationType.ACHIEVEMENT,
            title: `🏆 Leaderboard Prize!`,
            message:
              `You ranked #${w.rank} on the ${period} leaderboard and earned ` +
              [
                points > 0 ? `${points} points` : null,
                xp > 0 ? `${xp} XP` : null,
              ]
                .filter(Boolean)
                .join(" + ") +
              `!`,
            popup: true,
            data: {
              period,
              rank: w.rank,
              points,
              xp,
              cycleId,
              popup: {
                kind: "leaderboard",
                headline: `#${w.rank} on the ${period} leaderboard!`,
                amount: [points > 0 ? `${points.toLocaleString()} points` : null, xp > 0 ? `${xp} XP` : null]
                  .filter(Boolean)
                  .join(" + "),
                winners: all.map((x) => ({
                  rank: x.rank,
                  // Frozen names are the ranking's own; "Anonymous" stays as is.
                  name: (x.name || "A member").slice(0, 40),
                  prize: [x.prize > 0 ? `${Math.round(x.prize).toLocaleString()} pts` : null, x.xp > 0 ? `${Math.round(x.xp)} XP` : null]
                    .filter(Boolean)
                    .join(" + ") || "—",
                  you: x.userId === w.userId,
                })),
                cta: { label: "See the leaderboard", href: "/leaderboard" },
              } satisfies CelebrationPayload,
            } as object,
          },
        });
        return "paid" as const;
      });
      return result;
    } catch (err) {
      if (isDuplicateLedgerError(err)) return "skipped";
      if (err instanceof Error && err.message === "LB_CAS_LOST") continue;
      throw err;
    }
  }
  // Four lost races on one user is not a transient blip — surface it rather
  // than reporting a payout that never happened.
  throw new Error(`Could not credit leaderboard prize for ${w.userId}`);
}

/**
 * Record the physical/digital gift a rank won, and tell the winner.
 *
 * There is no inventory or shipping system here and this does not build one.
 * It records the promise: WHO is owed WHAT for WHICH cycle, with a status an
 * admin flips to FULFILLED. Unique on `(cycleId, rank)`, so re-running a cycle
 * cannot owe the same gift twice.
 */
async function awardGift(args: {
  w: FrozenWinner;
  period: Period;
  cycleId: string;
  image: string | null;
}): Promise<boolean> {
  const { w, period, cycleId, image } = args;
  if (!w.gift) return false;
  try {
    await prisma.leaderboardGiftAward.create({
      data: {
        cycleId,
        period,
        rank: w.rank,
        userId: w.userId,
        giftName: w.gift,
        giftImage: image,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
  await prisma.notification.create({
    data: {
      userId: w.userId,
      type: NotificationType.ACHIEVEMENT,
      title: `🎁 You won a prize!`,
      message: `Rank #${w.rank} on the ${period} leaderboard wins: ${w.gift}. Our team will be in touch to hand it over.`,
      data: { period, rank: w.rank, cycleId, gift: w.gift },
    },
  });
  return true;
}

export interface RunResetArgs {
  period: Period;
  /** A moment INSIDE the window being paid. Defaults to now (manual reset). */
  at?: Date;
  /** Who pressed the button; omitted for the scheduler. */
  actorUserId?: string | null;
  source: "manual" | "cron";
}

export async function runLeaderboardReset(
  args: RunResetArgs
): Promise<ResetOutcome> {
  const { period, source } = args;
  const at = args.at ?? new Date();
  const cycleId = `${cycleKey(period, at)}_${period}`;
  const historyKey = `lb_history_${cycleId}`;

  const base: ResetOutcome = {
    ok: false,
    cycleId,
    period,
    paid: 0,
    skipped: 0,
    totalDistributed: 0,
    totalXp: 0,
    giftsAwarded: 0,
    winners: [],
  };

  // Fully settled already? Nothing to read, nothing to rank, nothing to pay.
  const existing = await prisma.systemSetting.findUnique({
    where: { key: historyKey },
    select: { value: true },
  });
  const existingValue = existing?.value as { completed?: boolean } | null;
  if (existing && existingValue?.completed) {
    return {
      ...base,
      alreadyCompleted: true,
      winners: parseFrozen(existing.value) ?? [],
      error: `The ${period} leaderboard for this period has already been published and paid out. It can only run once per period.`,
      status: 409,
    };
  }

  const metric = ((await readSetting("lb_metric")) as Metric) || "COMBINED";
  const pointsPerUsd = await getPointsPerUsd();

  let frozen = existing ? parseFrozen(existing.value) : null;
  let totalPrize = asNumber(
    await readSetting(`lb_${period}_prize`),
    period === "daily" ? 5000 : period === "weekly" ? 25000 : 100000
  );
  const giftItems = asGiftItems(await readSetting("lb_gift_items"));
  const giftImageByRank = new Map(
    giftItems.map((g) => [g.rank, g.giftImage ?? null])
  );

  if (!frozen || frozen.length === 0) {
    // Fresh cycle: rank, size the prizes, and FREEZE before paying anything.
    const eligiblePackages = await getEligiblePackages();
    const eligibleSet = new Set(eligiblePackages.map((s) => s.toUpperCase()));
    const winnerCount = asNumber(
      await readSetting(`lb_${period}_winners`),
      period === "daily" ? 1 : period === "weekly" ? 3 : 5
    );
    const minEntries = asNumber(await readSetting("lb_min_entries"), 5);
    const customDistribution = asArrayOfNumbers(
      await readSetting(`lb_${period}_distribution`)
    );
    const xpDistribution = asArrayOfNumbers(
      await readSetting(`lb_${period}_xp_distribution`)
    );

    // Counts the same population the prize is drawn from — staff cannot win it,
    // so they must not be what pushes a cycle over the minimum-entries gate.
    const totalUsers = await prisma.user.count({ where: NON_STAFF_WHERE });
    if (totalUsers < minEntries) {
      return {
        ...base,
        error: `Need at least ${minEntries} users to publish a cycle`,
        status: 400,
      };
    }

    // Ranked on what was done IN this cycle. `topUsers` ranks all-time totals
    // (it is what the public board shows), and paying from it handed the
    // daily prize to the all-time leader every day — see leaderboard-window.ts.
    const ranked = await topUsersInWindow(metric, winnerCount, eligibleSet, cycleWindow(period, at));
    if (ranked.length === 0) {
      return {
        ...base,
        error:
          "No eligible user did anything in this period (tasks completed, XP earned or referrals), so there is no winner and no prize. If people were active, check the eligible-plans list in Settings.",
        status: 400,
      };
    }

    const prizes = distributePrizes(totalPrize, ranked.length, customDistribution);
    const xps = distributeXp(ranked.length, xpDistribution);
    frozen = ranked.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: r.name ?? "Anonymous",
      value: r.value,
      prize: prizes[i] ?? 0,
      xp: xps[i] ?? 0,
      gift: giftItems.find((g) => g.rank === i + 1)?.giftName ?? null,
    }));

    const snapshot = {
      cycleId,
      period,
      metric,
      totalPrize,
      source,
      cycledAt: at.toISOString(),
      claimedAt: new Date().toISOString(),
      completed: false,
      winners: frozen,
    };

    try {
      // `create`, deliberately not `upsert`: losing this race means somebody
      // else already froze this cycle, and we must pay THEIR list, not ours.
      await prisma.systemSetting.create({
        data: {
          key: historyKey,
          category: "leaderboard_history",
          value: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await prisma.systemSetting.findUnique({
        where: { key: historyKey },
        select: { value: true },
      });
      const racedValue = raced?.value as
        | { completed?: boolean; totalPrize?: number }
        | null;
      if (racedValue?.completed) {
        return {
          ...base,
          alreadyCompleted: true,
          winners: parseFrozen(raced?.value) ?? [],
          error: `The ${period} leaderboard for this period was just published by someone else. Nothing was paid twice.`,
          status: 409,
        };
      }
      frozen = parseFrozen(raced?.value) ?? [];
      totalPrize = asNumber(racedValue?.totalPrize, totalPrize);
    }
  }

  // ── Pay the frozen list. One short transaction per winner (P6005). ──
  let paid = 0;
  let skipped = 0;
  let totalDistributed = 0;
  let totalXp = 0;
  let giftsAwarded = 0;
  for (const w of frozen) {
    const outcome = await payWinner({ w, period, metric, cycleId, pointsPerUsd, all: frozen });
    if (outcome === "paid") {
      paid++;
      totalDistributed += Math.max(0, Math.round(w.prize));
      totalXp += Math.max(0, Math.round(w.xp));
    } else if (outcome === "skipped") {
      skipped++;
    }
    // A gift is a promise to keep, not a payment — and it must never be the
    // thing that aborts a payout loop mid-way (e.g. before the
    // LeaderboardGiftAward migration is applied in an environment). Log and
    // carry on; the next run resumes and records it, because the unique on
    // (cycleId, rank) makes the retry safe.
    try {
      if (
        await awardGift({
          w,
          period,
          cycleId,
          image: giftImageByRank.get(w.rank) ?? null,
        })
      ) {
        giftsAwarded++;
      }
    } catch (err) {
      console.error(`[leaderboard] gift award failed for ${cycleId} #${w.rank}`, err);
    }
  }

  // Everyone settled — seal the cycle so a later run short-circuits.
  await prisma.systemSetting.update({
    where: { key: historyKey },
    data: {
      category: "leaderboard_history",
      value: {
        cycleId,
        period,
        metric,
        totalPrize,
        source,
        cycledAt: at.toISOString(),
        completedAt: new Date().toISOString(),
        completed: true,
        winners: frozen,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: args.actorUserId ?? null,
      action: `LEADERBOARD_RESET_${period.toUpperCase()}`,
      entity: "Leaderboard",
      entityId: cycleId,
      newData: {
        period,
        metric,
        totalPrize,
        source,
        winners: frozen.length,
        paid,
        skipped,
        totalXp,
        giftsAwarded,
      },
    },
  });

  invalidateSettingsCache();

  return {
    ok: true,
    cycleId,
    period,
    paid,
    skipped,
    totalDistributed,
    totalXp,
    giftsAwarded,
    winners: frozen,
  };
}

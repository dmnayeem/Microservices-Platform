import "server-only";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { direction, isSettled, magnitudePoints, magnitudeUsd, pointsDenominated } from "@/lib/finance/signing";
import { pointSourceOf, type PointSource } from "@/lib/finance/points-source";
import type { RevenueBreakdown } from "@/lib/finance/revenue";

/**
 * Every feature's money on one line: what it brings in, what it pays users, and
 * the difference.
 *
 * Revenue comes from `getRevenueBreakdown` (the columns that record each
 * stream); what a feature pays out comes from the ledger, labelled by
 * `pointSourceOf` — so a leaderboard prize is charged to "Leaderboard", not to
 * "Tasks", which is what made the old per-source view unreadable.
 *
 * A feature that earns nothing and costs something is not an error: check-ins
 * and welcome bonuses are what the platform spends to keep people coming back,
 * and this table is where the owner can see how much that is.
 */

export interface FeatureMoney {
  key: string;
  label: string;
  inUsd: number;
  outUsd: number;
  netUsd: number;
  /** One line on how the figures are read, shown under the name. */
  note: string;
  /** Where to manage it. */
  href?: string;
}

const FEATURES: Array<{
  key: string;
  label: string;
  revenue: string[];
  payouts: PointSource[];
  note: string;
  href?: string;
}> = [
  { key: "tasks", label: "Tasks (microtasks)", revenue: ["taskfee"], payouts: ["task", "board"], note: "In: commission when a buyer funds a task. Out: points paid for approved tasks and task boards.", href: "/admin/tasks" },
  { key: "marketplace", label: "Marketplace", revenue: ["marketplace", "mediation"], payouts: [], note: "In: the platform fee on each sale and deal mediation. Seller proceeds are the buyer's money, not a cost.", href: "/admin/marketplace" },
  { key: "courses", label: "Courses", revenue: ["course"], payouts: [], note: "In: the platform's commission on course sales.", href: "/admin/courses" },
  { key: "subscriptions", label: "Subscriptions (plans)", revenue: ["subscription"], payouts: [], note: "In: plan purchases and renewals.", href: "/admin/packages" },
  { key: "ads", label: "Ads", revenue: ["ads"], payouts: ["browse"], note: "In: advertiser spend. Out: Browse & Earn points paid for viewing ads.", href: "/admin/ads" },
  { key: "offerwalls", label: "Offerwalls", revenue: ["offerwall"], payouts: [], note: "In: the margin — what the network paid minus the user's share (already net).", href: "/admin/offerwalls" },
  { key: "withdrawals", label: "Withdrawal fees", revenue: ["withdrawal"], payouts: [], note: "In: the fee kept on each paid withdrawal.", href: "/admin/withdrawals" },
  { key: "lottery", label: "Lottery", revenue: ["lottery"], payouts: ["lottery"], note: "In: the house cut. Out: winnings, paid from the ticket pool.", href: "/admin/lottery" },
  { key: "team", label: "My Team & referrals", revenue: [], payouts: ["referral", "referral_bonus"], note: "Out: commission on referred users' earnings, and referral bonuses.", href: "/admin/referrals" },
  { key: "affiliate", label: "Affiliate program", revenue: [], payouts: ["affiliate"], note: "Out: affiliate commission.", href: "/admin/affiliate" },
  { key: "leaderboard", label: "Leaderboard prizes", revenue: [], payouts: ["leaderboard"], note: "Out: daily / weekly / monthly prizes.", href: "/admin/leaderboard" },
  { key: "engagement", label: "Check-in, missions, events", revenue: [], payouts: ["checkin", "daily_mission", "mission", "event", "achievement"], note: "Out: rewards for coming back and completing goals.", href: "/admin/missions" },
  { key: "quiz", label: "Quiz games", revenue: [], payouts: ["quiz_game"], note: "Out: quiz game rewards.", href: "/admin/quizzes" },
  { key: "social", label: "Social feed", revenue: [], payouts: ["social"], note: "Out: points for likes, posts and engagement.", href: "/admin/social-moderation" },
  { key: "welcome", label: "Welcome bonus", revenue: [], payouts: ["welcome"], note: "Out: paid once to each new account." },
  { key: "games", label: "Games & gifts", revenue: [], payouts: ["game", "donation"], note: "Out: mini-games and mystery boxes." },
  { key: "grants", label: "Admin hand grants", revenue: [], payouts: ["admin_grant"], note: "Out: balance added by an admin by hand — see Points → Points added by hand." },
];

export async function getMoneyByFeature(
  revenue: RevenueBreakdown,
  from: Date | undefined,
  to: Date
): Promise<{ rows: FeatureMoney[]; unassignedOutUsd: number }> {
  const [pointsPerUsd, ledger] = await Promise.all([
    getPointsPerUsd(),
    prisma.transaction.findMany({
      where: { createdAt: { ...(from ? { gte: from } : {}), lt: to } },
      select: { type: true, status: true, reference: true, amount: true, points: true },
    }),
  ]);

  // What each point source paid out, in USD. Payroll is the company's own wage
  // bill (Company books), not money paid to users, so it is left out here.
  const outBySource = new Map<PointSource, number>();
  for (const row of ledger) {
    const r = { type: row.type, status: row.status, reference: row.reference, amount: Number(row.amount ?? 0), points: row.points ?? 0 };
    if (!isSettled(r) || r.type === "PENALTY" || direction(r) !== "cost") continue;
    if ((r.reference ?? "").toLowerCase().startsWith("payroll_")) continue;
    const usdValue = pointsDenominated(r) ? magnitudePoints(r) / pointsPerUsd : magnitudeUsd(r);
    const src = pointSourceOf(r);
    outBySource.set(src, (outBySource.get(src) ?? 0) + usdValue);
  }
  const inByStream = new Map(revenue.streams.map((s) => [s.key, s.usd]));

  const used = new Set<PointSource>();
  const rows = FEATURES.map((f) => {
    const inUsd = f.revenue.reduce((a, k) => a + (inByStream.get(k) ?? 0), 0);
    const outUsd = f.payouts.reduce((a, k) => {
      used.add(k);
      return a + (outBySource.get(k) ?? 0);
    }, 0);
    return { key: f.key, label: f.label, inUsd, outUsd, netUsd: inUsd - outUsd, note: f.note, href: f.href };
  });
  let unassignedOutUsd = 0;
  for (const [k, v] of outBySource) if (!used.has(k)) unassignedOutUsd += v;
  return { rows, unassignedOutUsd };
}

export interface CashFlow {
  deposits: { count: number; usd: number };
  pendingDeposits: { count: number; usd: number };
  withdrawalsPaid: { count: number; usd: number };
  withdrawalsPending: { count: number; usd: number };
  recentDeposits: Array<{ id: string; userId: string; user: string; amount: number; method: string; status: string; createdAt: Date }>;
  recentWithdrawals: Array<{ id: string; userId: string; user: string; amount: number; method: string; status: string; createdAt: Date }>;
}

/** Real cash in and out: deposits and withdrawals, with who and when. */
export async function getCashFlow(from: Date | undefined): Promise<CashFlow> {
  const at = from ? { createdAt: { gte: from } } : {};
  const [dep, depPending, wPaid, wPending, recentD, recentW] = (await Promise.all([
    prisma.deposit.aggregate({ where: { status: "APPROVED", ...at }, _sum: { amount: true }, _count: true }),
    prisma.deposit.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: true }),
    prisma.withdrawal.aggregate({ where: { status: "COMPLETED", ...at }, _sum: { netAmount: true }, _count: true }),
    prisma.withdrawal.aggregate({ where: { status: { in: ["PENDING", "PROCESSING"] } }, _sum: { netAmount: true }, _count: true }),
    prisma.deposit.findMany({
      where: at,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, userId: true, amount: true, method: true, status: true, createdAt: true },
    }),
    prisma.withdrawal.findMany({
      where: at,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, userId: true, netAmount: true, method: true, status: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
  ])) as unknown as [
    { _sum: { amount: unknown }; _count: number },
    { _sum: { amount: unknown }; _count: number },
    { _sum: { netAmount: unknown }; _count: number },
    { _sum: { netAmount: unknown }; _count: number },
    Array<{ id: string; userId: string; amount: unknown; method: string; status: string; createdAt: Date }>,
    Array<{ id: string; userId: string; netAmount: unknown; method: string; status: string; createdAt: Date; user: { name: string | null; email: string } }>,
  ];
  // Deposit has no `user` relation in the schema — resolve names in one query.
  const depUsers = await prisma.user.findMany({
    where: { id: { in: [...new Set(recentD.map((d) => d.userId))] } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = new Map(depUsers.map((u) => [u.id, u.name || u.email]));
  const n = (v: unknown) => Number(v ?? 0);
  return {
    deposits: { count: dep._count, usd: n(dep._sum.amount) },
    pendingDeposits: { count: depPending._count, usd: n(depPending._sum.amount) },
    withdrawalsPaid: { count: wPaid._count, usd: n(wPaid._sum.netAmount) },
    withdrawalsPending: { count: wPending._count, usd: n(wPending._sum.netAmount) },
    recentDeposits: recentD.map((d) => ({ id: d.id, userId: d.userId, user: nameOf.get(d.userId) ?? "(deleted user)", amount: n(d.amount), method: d.method, status: d.status, createdAt: d.createdAt })),
    recentWithdrawals: recentW.map((w) => ({ id: w.id, userId: w.userId, user: w.user.name || w.user.email, amount: n(w.netAmount), method: w.method, status: w.status, createdAt: w.createdAt })),
  };
}

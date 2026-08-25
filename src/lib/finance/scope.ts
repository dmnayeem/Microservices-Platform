import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getPointsPerUsd } from "@/lib/economy";

/**
 * Balances, split between real users and staff.
 *
 * `/admin/finance` reported "Wallet Liability" as `SUM(User.cashBalance)` across
 * every account. Measured against the live database that is **$160,090** — of
 * which $49,950 sits on the superadmin and $25,000 on each of four seeded admin
 * accounts. Real users hold **$140.60**.
 *
 * Nobody is ever going to withdraw the seeded money, so presenting it as a
 * liability is not a rounding problem, it is a wrong number by three orders of
 * magnitude — and every ratio built on top of it inherits the error.
 *
 * Both figures are returned and both are shown. Nothing is deleted: the seeded
 * balances are still there if they turn out to matter, and zeroing them is a
 * separate decision with its own dry run.
 */

export interface BalanceScope {
  users: number;
  cashUsd: number;
  points: number;
  pointsUsd: number;
  adCreditUsd: number;
  /** Cash + points-at-rate. Ad credit is excluded: it is non-withdrawable. */
  walletLiabilityUsd: number;
}

export interface Balances {
  /** Accounts with role USER — the money the platform genuinely owes. */
  real: BalanceScope;
  /** Every account, staff and seeded fixtures included. */
  all: BalanceScope;
  /** all − real, i.e. what sits on staff accounts. */
  staffOnlyUsd: number;
  pointsPerUsd: number;
}

function shape(
  agg: {
    _sum: {
      cashBalance: unknown;
      pointsBalance: number | null;
      adCreditBalance: unknown;
    };
    _count: number;
  },
  pointsPerUsd: number
): BalanceScope {
  const cashUsd = toNum(agg._sum.cashBalance as never);
  const points = agg._sum.pointsBalance ?? 0;
  const pointsUsd = points / pointsPerUsd;
  return {
    users: agg._count,
    cashUsd,
    points,
    pointsUsd,
    adCreditUsd: toNum(agg._sum.adCreditBalance as never),
    walletLiabilityUsd: cashUsd + pointsUsd,
  };
}

export async function getBalances(): Promise<Balances> {
  const pointsPerUsd = await getPointsPerUsd();
  const select = {
    _sum: { cashBalance: true, pointsBalance: true, adCreditBalance: true },
    _count: true,
  } as const;

  const [all, real] = await Promise.all([
    prisma.user.aggregate(select),
    prisma.user.aggregate({ where: { role: "USER" }, ...select }),
  ]);

  const allShaped = shape(all as never, pointsPerUsd);
  const realShaped = shape(real as never, pointsPerUsd);

  return {
    real: realShaped,
    all: allShaped,
    staffOnlyUsd: allShaped.walletLiabilityUsd - realShaped.walletLiabilityUsd,
    pointsPerUsd,
  };
}

interface SumAmountCount {
  _sum: { amount: unknown };
  _count: number;
}

export interface Obligations {
  /** Withdrawals requested and not yet paid — the cash has ALREADY left wallets. */
  pendingPayoutsUsd: number;
  pendingPayoutsCount: number;
  /** Buyer money held in marketplace escrow, owed to one side or the other. */
  escrowHeldUsd: number;
  escrowCount: number;
  /** Advertiser budget funded and not yet delivered. */
  adBudgetUnspentUsd: number;
  /** Deposits submitted and not yet approved — not owed until they are. */
  pendingDepositsUsd: number;
  pendingDepositsCount: number;
}

/**
 * What the platform owes beyond wallet balances.
 *
 * Two of these were on no admin page at all:
 *
 * - **In-flight withdrawals.** Cash is debited at request time and the ledger
 *   row sits at `PENDING`, but every finance query filters `status: COMPLETED`,
 *   so that money appeared in neither the balances nor the ledger.
 * - **`MarketplaceDeal.heldAmount`** — live escrow float, a real obligation.
 */
export async function getObligations(): Promise<Obligations> {
  // Prisma's aggregate generics degrade to `{}` inside a Promise.all tuple —
  // the same gotcha the finance page documents — so the shapes are declared.
  const [payouts, escrow, adBudget, deposits] = (await Promise.all([
    prisma.withdrawal.aggregate({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.marketplaceDeal.aggregate({
      where: { heldAmount: { gt: 0 } },
      _sum: { heldAmount: true },
      _count: true,
    }),
    prisma.adCampaign.aggregate({
      where: { isHouse: false },
      _sum: { budget: true },
    }),
    prisma.deposit.aggregate({
      where: { status: "PENDING" },
      _sum: { amount: true },
      _count: true,
    }),
  ])) as unknown as [
    SumAmountCount,
    { _sum: { heldAmount: unknown }; _count: number },
    { _sum: { budget: unknown } },
    SumAmountCount,
  ];

  return {
    pendingPayoutsUsd: toNum(payouts._sum.amount as never),
    pendingPayoutsCount: payouts._count,
    escrowHeldUsd: toNum(escrow._sum.heldAmount as never),
    escrowCount: escrow._count,
    adBudgetUnspentUsd: toNum(adBudget._sum.budget as never),
    pendingDepositsUsd: toNum(deposits._sum.amount as never),
    pendingDepositsCount: deposits._count,
  };
}

export interface Reconciliation {
  balancesUsd: number;
  ledgerUsd: number;
  differenceUsd: number;
  /** True when the two agree to within a cent. */
  agrees: boolean;
}

/**
 * Do the balances agree with the ledger?
 *
 * They currently do not, and by a long way: balances hold about $160k while the
 * ledger's `amount` column sums to roughly $17. Most of that gap is the seeded
 * staff money, which was written straight onto the user rows with no journal
 * entry at all.
 *
 * Reported rather than hidden. A finance console that quietly shows only one of
 * two disagreeing numbers is worse than one that shows both and says they
 * disagree — the disagreement is the finding.
 */
export async function getReconciliation(): Promise<Reconciliation> {
  const [users, ledger] = (await Promise.all([
    prisma.user.aggregate({ _sum: { cashBalance: true } }),
    prisma.transaction.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amount: true },
    }),
  ])) as unknown as [
    { _sum: { cashBalance: unknown } },
    { _sum: { amount: unknown } },
  ];
  const balancesUsd = toNum(users._sum.cashBalance as never);
  const ledgerUsd = toNum(ledger._sum.amount as never);
  const differenceUsd = balancesUsd - ledgerUsd;
  return {
    balancesUsd,
    ledgerUsd,
    differenceUsd,
    agrees: Math.abs(differenceUsd) < 0.01,
  };
}

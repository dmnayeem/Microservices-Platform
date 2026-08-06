import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { getPointsPerUsd, usdToPoints } from "@/lib/economy";
import { getSetting } from "@/lib/system-settings";
import { toNum } from "@/lib/money";

/**
 * Ad Credits — a non-withdrawable, USD-denominated ad-spend wallet
 * (`User.adCreditBalance`, 1 credit = $1). Advertisers buy credit with wallet
 * cash or points (or admins grant it); campaign budgets are funded FROM credit;
 * per-click billing draws the campaign budget down (unchanged). Every movement
 * is journalled to `AdCreditLedger`.
 */

// The interactive-transaction client type (Accelerate-extended).
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface CreditResult {
  ok: boolean;
  error?: string;
  status?: number;
  adCreditBalance?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

async function creditBonusPct(): Promise<number> {
  const n = Number(await getSetting<number>("ads.credit_bonus_pct", 0));
  return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 0;
}

async function journal(
  tx: Tx,
  userId: string,
  delta: number,
  kind: string,
  balanceAfter: number,
  reference?: string,
  metadata?: Record<string, unknown>
) {
  await tx.adCreditLedger.create({
    data: {
      userId,
      delta,
      kind,
      balanceAfter,
      reference: reference ?? null,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
    },
  });
}

/** Deduct ad credit inside an existing transaction (throws INSUFFICIENT_CREDIT). */
export async function deductAdCreditTx(
  tx: Tx,
  userId: string,
  amountUsd: number,
  opts: { kind: string; reference?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const d = await tx.user.updateMany({
    where: { id: userId, adCreditBalance: { gte: amountUsd } },
    data: { adCreditBalance: { decrement: amountUsd } },
  });
  if (d.count === 0) throw new Error("INSUFFICIENT_CREDIT");
  const u = await tx.user.findUnique({ where: { id: userId }, select: { adCreditBalance: true } });
  await journal(tx, userId, -amountUsd, opts.kind, toNum(u?.adCreditBalance ?? 0), opts.reference, opts.metadata);
}

/** Add ad credit inside an existing transaction. */
export async function creditAdCreditTx(
  tx: Tx,
  userId: string,
  amountUsd: number,
  opts: { kind: string; reference?: string; metadata?: Record<string, unknown> }
): Promise<number> {
  await tx.user.update({ where: { id: userId }, data: { adCreditBalance: { increment: amountUsd } } });
  const u = await tx.user.findUnique({ where: { id: userId }, select: { adCreditBalance: true } });
  const bal = toNum(u?.adCreditBalance ?? 0);
  await journal(tx, userId, amountUsd, opts.kind, bal, opts.reference, opts.metadata);
  return bal;
}

/** Buy ad credit with wallet cash (1:1) or points (usdToPoints), + optional bonus %. */
export async function buyAdCredits(opts: {
  userId: string;
  amountUsd: number;
  currency: "cash" | "points";
}): Promise<CreditResult> {
  const { userId, currency } = opts;
  const amountUsd = round2(opts.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd < 5) {
    return { ok: false, error: "Minimum is $5.", status: 400 };
  }
  const bonus = await creditBonusPct();
  const credited = round6(amountUsd * (1 + bonus / 100));
  const ppu = await getPointsPerUsd();
  const pointsCost = usdToPoints(amountUsd, ppu);

  try {
    const balance = await prisma.$transaction(async (tx) => {
      if (currency === "cash") {
        const d = await tx.user.updateMany({
          where: { id: userId, cashBalance: { gte: amountUsd } },
          data: { cashBalance: { decrement: amountUsd }, adCreditBalance: { increment: credited } },
        });
        if (d.count === 0) throw new Error("INSUFFICIENT");
      } else {
        const d = await tx.user.updateMany({
          where: { id: userId, pointsBalance: { gte: pointsCost } },
          data: { pointsBalance: { decrement: pointsCost }, adCreditBalance: { increment: credited } },
        });
        if (d.count === 0) throw new Error("INSUFFICIENT");
      }
      const u = await tx.user.findUnique({ where: { id: userId }, select: { adCreditBalance: true } });
      const bal = toNum(u?.adCreditBalance ?? 0);
      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.AD_CREDIT_PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: currency === "cash" ? -amountUsd : 0,
          points: currency === "points" ? -pointsCost : 0,
          description: `Ad credits — $${credited.toFixed(2)}`,
          reference: `adcredit_buy_${userId}_${Date.now()}`,
          metadata: { creditUsd: credited, currency, bonusPct: bonus },
        },
      });
      await journal(tx, userId, credited, "PURCHASE", bal, undefined, { currency, bonusPct: bonus, paidUsd: amountUsd });
      return bal;
    });
    return { ok: true, adCreditBalance: balance };
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT") {
      return {
        ok: false,
        error: currency === "cash" ? "Insufficient wallet cash." : "Insufficient points.",
        status: 402,
      };
    }
    throw err;
  }
}

/** Admin grants (or adjusts, if negative) ad credit for a user. */
export async function grantAdCredits(opts: {
  userId: string;
  amountUsd: number;
  adminId: string;
  note?: string;
}): Promise<CreditResult> {
  const amountUsd = round2(opts.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd === 0) {
    return { ok: false, error: "Enter a non-zero amount.", status: 400 };
  }
  try {
    const balance = await prisma.$transaction(async (tx) => {
      if (amountUsd < 0) {
        const d = await tx.user.updateMany({
          where: { id: opts.userId, adCreditBalance: { gte: -amountUsd } },
          data: { adCreditBalance: { increment: amountUsd } },
        });
        if (d.count === 0) throw new Error("INSUFFICIENT");
        const u = await tx.user.findUnique({ where: { id: opts.userId }, select: { adCreditBalance: true } });
        const bal = toNum(u?.adCreditBalance ?? 0);
        await journal(tx, opts.userId, amountUsd, "GRANT", bal, undefined, { adminId: opts.adminId, note: opts.note ?? null });
        return bal;
      }
      return creditAdCreditTx(tx, opts.userId, amountUsd, {
        kind: "GRANT",
        metadata: { adminId: opts.adminId, note: opts.note ?? null },
      });
    });
    return { ok: true, adCreditBalance: balance };
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT") {
      return { ok: false, error: "Not enough credit to deduct.", status: 402 };
    }
    throw err;
  }
}

/** Return a campaign's remaining budget to the owner's ad credit (on end/delete). */
export async function refundCampaignBudgetToCredit(campaignId: string): Promise<void> {
  const c = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, advertiserId: true, budget: true },
  });
  if (!c || !c.advertiserId) return;
  const remaining = round6(toNum(c.budget));
  if (remaining <= 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.adCampaign.update({ where: { id: campaignId }, data: { budget: 0 } });
    await creditAdCreditTx(tx, c.advertiserId as string, remaining, {
      kind: "REFUND",
      reference: `campaign_refund_${campaignId}`,
      metadata: { campaignId },
    });
  });
}

/** Balance + recent ledger for the advertiser credit page. */
export async function getAdCreditSummary(userId: string) {
  const [u, ledger] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { adCreditBalance: true } }),
    prisma.adCreditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  return {
    adCreditBalance: toNum(u?.adCreditBalance ?? 0),
    ledger: ledger.map((l) => ({
      id: l.id,
      delta: toNum(l.delta),
      kind: l.kind,
      balanceAfter: l.balanceAfter == null ? null : toNum(l.balanceAfter),
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

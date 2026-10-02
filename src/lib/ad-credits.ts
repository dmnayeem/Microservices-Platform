import { usd } from "@/lib/utils";
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
          description: `Ad credits — ${usd(credited)}`,
          // Per-occurrence by design. An advertiser may top up the same
          // amount of ad credit as often as they like.
          // A deterministic key would make `Transaction @@unique([userId, reference])`
          // reject the second one, so this stays keyed on the instant it happened.
          reference: `adcredit_buy_${userId}_${Date.now()}`,
          metadata: { creditUsd: credited, currency, bonusPct: bonus },
        },
      });
      await journal(tx, userId, credited, "PURCHASE", bal, undefined, { currency, bonusPct: bonus, paidUsd: amountUsd });
      return bal;
    });
    // A receipt for the money that just moved, so every payment ends up with a
    // document whichever direction it came from — a bill the owner sent, or a
    // self-serve top-up like this one.
    //
    // Best-effort and AFTER the transaction on purpose: the credit is already
    // banked, and a paperwork failure must never roll back or block money the
    // advertiser has paid for. Imported lazily to keep this module free of a
    // cycle (invoices.ts imports creditAdCreditTx from here).
    void (async () => {
      try {
        const { createInvoice } = await import("@/lib/invoices");
        await createInvoice({
          advertiserId: userId,
          kind: "RECEIPT",
          paid: true,
          paymentRef: currency === "points" ? "Points" : "Wallet balance",
          lines: [
            {
              description:
                bonus > 0
                  ? `Ad credit top-up (includes ${bonus}% bonus — ${usd(credited)} credited)`
                  : "Ad credit top-up",
              quantity: 1,
              // The cash actually paid, not the credit issued. A receipt that
              // showed the bonused figure would be a receipt for money nobody
              // handed over.
              unitUsd: amountUsd,
              kind: "ADJUSTMENT",
            },
          ],
        });
      } catch {
        /* the credit is banked; the document can be reissued */
      }
    })();

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

/**
 * Return a campaign's remaining budget to the owner's ad credit (on end/delete).
 * Returns the refunded amount.
 *
 * Idempotent by construction: the budget is zeroed with a conditional update
 * that reports how many rows it changed, and credit is issued only when this
 * call is the one that won. Two concurrent "end campaign" clicks therefore
 * refund once, not twice.
 */
export async function refundCampaignBudgetToCredit(
  campaignId: string
): Promise<number> {
  const c = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, advertiserId: true, budget: true },
  });
  if (!c || !c.advertiserId) return 0;
  const remaining = round6(toNum(c.budget));
  if (remaining <= 0) return 0;

  return prisma.$transaction(async (tx) => {
    const zeroed = await tx.adCampaign.updateMany({
      where: { id: campaignId, budget: remaining },
      data: { budget: 0 },
    });
    if (zeroed.count === 0) return 0; // someone else already refunded it
    // The budget CAS above is the once-only guard. The reference must still be
    // unique per refund: an admin can re-activate an ENDED campaign and fund it
    // again, and a second end reusing `campaign_refund_<id>` hit the ledger's
    // unique key, rolled back, and left that budget locked in the campaign.
    const base = `campaign_refund_${campaignId}`;
    const prior = await tx.adCreditLedger.count({
      where: { userId: c.advertiserId as string, reference: { startsWith: base } },
    });
    await creditAdCreditTx(tx, c.advertiserId as string, remaining, {
      kind: "REFUND",
      reference: prior === 0 ? base : `${base}_${prior + 1}`,
      metadata: { campaignId },
    });
    return remaining;
  });
}

export type AdminBudgetSource = "advertiser" | "platform";

export interface AdminBudgetResult {
  ok: boolean;
  error?: string;
  status?: number;
  /** Signed change applied to the campaign's remaining budget. */
  delta: number;
}

/**
 * An admin changing a campaign's budget from the Ad Manager.
 *
 * `budget` is what is LEFT to spend (clicks draw it down and move the same
 * amount into `spentTotal`), so the admin's number is a new remaining figure
 * and what moves is the difference.
 *
 * It used to be written straight onto the row. For a campaign with an
 * advertiser that was money from nowhere: ending the campaign refunds the
 * remaining budget to the advertiser's Ad Credit, so every dollar an admin
 * typed in came back out as spendable credit that no one had paid for.
 *
 * Now every change to an advertiser's campaign goes through the ledger:
 *  - raise, source "advertiser": taken from their Ad Credit (CAMPAIGN_FUND),
 *    refused if they don't have it — exactly the self-serve top-up.
 *  - raise, source "platform": the platform pays. A GRANT row (+) and a
 *    CAMPAIGN_FUND row (−) in the same transaction, so the books show where
 *    the money came from and the advertiser's balance does not move.
 *  - lower: the difference goes back to their Ad Credit (REFUND). The remaining
 *    budget can never go below zero, so nothing already spent is returned.
 *
 * A campaign with no advertiser (house / platform inventory) has nobody to
 * debit and nobody a refund can reach (`refundCampaignBudgetToCredit` returns 0
 * for it), so its budget is set directly. Exemption is keyed on the missing
 * advertiser, not on `isHouse`: that flag is an admin toggle, and flipping it
 * off later must not turn an unjournalled budget into refundable credit.
 */
export async function setCampaignBudgetByAdmin(opts: {
  campaignId: string;
  targetBudget: number;
  source: AdminBudgetSource;
  adminId: string;
}): Promise<AdminBudgetResult> {
  const target = round6(Number(opts.targetBudget));
  if (!Number.isFinite(target) || target < 0) {
    return { ok: false, error: "Budget must be zero or more.", status: 400, delta: 0 };
  }
  const c = await prisma.adCampaign.findUnique({
    where: { id: opts.campaignId },
    select: { id: true, advertiserId: true, budget: true, status: true },
  });
  if (!c) return { ok: false, error: "Not found", status: 404, delta: 0 };

  const current = round6(toNum(c.budget));
  const delta = round6(target - current);
  if (delta === 0) return { ok: true, delta: 0 };

  if (!c.advertiserId) {
    await prisma.adCampaign.update({ where: { id: c.id }, data: { budget: target } });
    return { ok: true, delta };
  }
  // An ended campaign has already had its remainder refunded. Money put in now
  // would sit where nothing spends it and nothing refunds it.
  if (c.status === "ENDED") {
    return { ok: false, error: "This campaign has ended — its budget can't be changed.", status: 400, delta: 0 };
  }

  const advertiserId = c.advertiserId;
  const stamp = Date.now();
  const meta = { campaignId: c.id, adminId: opts.adminId, via: "admin-budget-edit" };
  try {
    await prisma.$transaction(async (tx) => {
      if (delta > 0) {
        if (opts.source === "platform") {
          await creditAdCreditTx(tx, advertiserId, delta, {
            kind: "GRANT",
            reference: `campaign_grant_${c.id}_${stamp}`,
            metadata: { ...meta, platformGrant: true },
          });
        }
        await deductAdCreditTx(tx, advertiserId, delta, {
          kind: "CAMPAIGN_FUND",
          reference: `campaign_fund_${c.id}_${stamp}`,
          metadata: { ...meta, source: opts.source },
        });
        await tx.adCampaign.update({
          where: { id: c.id },
          data: { budget: { increment: delta } },
        });
      } else {
        const amount = -delta;
        // CAS: clicks may have drawn the budget down since it was read. Never
        // return more than is actually left.
        const cut = await tx.adCampaign.updateMany({
          where: { id: c.id, status: { not: "ENDED" }, budget: { gte: amount } },
          data: { budget: { decrement: amount } },
        });
        if (cut.count === 0) throw new Error("BUDGET_MOVED");
        await creditAdCreditTx(tx, advertiserId, amount, {
          kind: "REFUND",
          reference: `campaign_reduce_${c.id}_${stamp}`,
          metadata: meta,
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_CREDIT") {
      return {
        ok: false,
        error: `The advertiser doesn't have ${usd(delta)} of Ad Credit. Fund it as a platform grant instead, or ask them to top up.`,
        status: 402,
        delta: 0,
      };
    }
    if (err instanceof Error && err.message === "BUDGET_MOVED") {
      return { ok: false, error: "The budget changed while you were editing. Reload and try again.", status: 409, delta: 0 };
    }
    throw err;
  }
  return { ok: true, delta };
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

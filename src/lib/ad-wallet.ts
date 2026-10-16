import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getPointsPerUsd } from "@/lib/economy";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import type { LedgerDb } from "@/lib/ledger";

/**
 * The two spend-only balances (owner, 2026-10-16). The four balances are:
 *
 *   Earn Points  User.pointsBalance  — earned (tasks, referrals, prizes). Only
 *                converted to Cash and withdrawn, or — once past the withdrawal
 *                minimum — converted to Ad Points. Never spent directly.
 *   Cash         User.cashBalance    — withdrawable USD (converted Earn Points,
 *                sales income).
 *   Ad Points    User.adPointsBalance — spend-only points. Platform spending
 *                (boost, promotion, lottery, spotlight, plans, badge, ad/task
 *                credit). Never converted back, never withdrawn.
 *   Ad Fund      User.adFundBalance  — USD from Add fund (deposits). Platform
 *                spending AND marketplace / services / courses. Never withdrawn.
 *
 * Every move goes through the four functions below: a compare-and-set debit
 * (no overdraft, no race) and its ledger row in the SAME transaction.
 *
 * Ledger rows: `Transaction.points` stays 0 — that column means EARNED points
 * everywhere in finance and the dashboards, and Ad Points are not earnings.
 * The Ad Points figure lives in `metadata.adPoints`; `amount` is the USD value
 * (negative = leaves the member, positive = comes to the member). Rows are told
 * apart by their reference prefix (AD_POINTS_REF / AD_FUND_REF).
 */

export const AD_POINTS_REF = "adpts_";
export const AD_FUND_REF = "adfund_";

/** Ad Points per USD, set by the admin (Settings → Wallet). */
export async function getAdPointsPerUsd(): Promise<number> {
  const v = Number(await getSetting<number>("wallet.ad_points_per_usd", 100));
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 100;
}

export class InsufficientBalanceError extends Error {
  constructor(public balance: "AD_POINTS" | "AD_FUND") {
    super(`INSUFFICIENT_${balance}`);
  }
}

type Move = {
  userId: string;
  /** Unique per member (Transaction @@unique([userId, reference])) — idempotency. */
  reference: string;
  description: string;
  /** What it was for, e.g. "boost", "lottery", "spotlight", "refund:boost". */
  purpose: string;
  metadata?: Record<string, unknown>;
};

/** Debit Ad Points (throws InsufficientBalanceError). Run inside a transaction. */
export async function debitAdPoints(tx: LedgerDb, m: Move & { points: number }, rate?: number) {
  const n = Math.floor(m.points);
  if (!(n > 0)) throw new Error("AD_POINTS_AMOUNT");
  const r = rate ?? (await getAdPointsPerUsd());
  const ok = await tx.user.updateMany({
    where: { id: m.userId, adPointsBalance: { gte: n } },
    data: { adPointsBalance: { decrement: n } },
  });
  if (ok.count === 0) throw new InsufficientBalanceError("AD_POINTS");
  await tx.transaction.create({
    data: {
      userId: m.userId,
      type: TransactionType.PURCHASE,
      status: TransactionStatus.COMPLETED,
      amount: -(n / r),
      points: 0,
      description: m.description,
      reference: `${AD_POINTS_REF}${m.reference}`,
      metadata: { balance: "AD_POINTS", adPoints: -n, rate: r, purpose: m.purpose, ...(m.metadata ?? {}) },
    },
  });
}

/** Credit Ad Points (refunds, conversions). Run inside a transaction. */
export async function creditAdPoints(tx: LedgerDb, m: Move & { points: number }, rate?: number) {
  const n = Math.floor(m.points);
  if (!(n > 0)) return;
  const r = rate ?? (await getAdPointsPerUsd());
  await tx.user.update({ where: { id: m.userId }, data: { adPointsBalance: { increment: n } } });
  await tx.transaction.create({
    data: {
      userId: m.userId,
      // A conversion only moves value between the member's own balances —
      // never a BONUS, which finance reads as a cost paid to the member. A
      // donation is one member paying another (GIFT); finance files it as
      // internal by its `donation_` reference (tx-sources.ts adWalletKind "peer").
      type: m.purpose.startsWith("refund")
        ? TransactionType.REFUND
        : m.purpose.startsWith("convert")
          ? TransactionType.POINTS_CONVERSION
          : m.purpose === "donation"
            ? TransactionType.GIFT
            : TransactionType.BONUS,
      status: TransactionStatus.COMPLETED,
      amount: n / r,
      points: 0,
      description: m.description,
      reference: `${AD_POINTS_REF}${m.reference}`,
      metadata: { balance: "AD_POINTS", adPoints: n, rate: r, purpose: m.purpose, ...(m.metadata ?? {}) },
    },
  });
}

/** Debit Ad Fund USD (throws InsufficientBalanceError). Run inside a transaction. */
export async function debitAdFund(tx: LedgerDb, m: Move & { usd: number }) {
  const usd = Math.round(m.usd * 1e6) / 1e6;
  if (!(usd > 0)) throw new Error("AD_FUND_AMOUNT");
  const ok = await tx.user.updateMany({
    where: { id: m.userId, adFundBalance: { gte: usd } },
    data: { adFundBalance: { decrement: usd } },
  });
  if (ok.count === 0) throw new InsufficientBalanceError("AD_FUND");
  await tx.transaction.create({
    data: {
      userId: m.userId,
      type: TransactionType.PURCHASE,
      status: TransactionStatus.COMPLETED,
      amount: -usd,
      points: 0,
      description: m.description,
      reference: `${AD_FUND_REF}${m.reference}`,
      metadata: { balance: "AD_FUND", purpose: m.purpose, ...(m.metadata ?? {}) },
    },
  });
}

/** Credit Ad Fund USD (deposits, refunds). Run inside a transaction. */
export async function creditAdFund(tx: LedgerDb, m: Move & { usd: number }) {
  const usd = Math.round(m.usd * 1e6) / 1e6;
  if (!(usd > 0)) return;
  await tx.user.update({ where: { id: m.userId }, data: { adFundBalance: { increment: usd } } });
  await tx.transaction.create({
    data: {
      userId: m.userId,
      type: m.purpose === "deposit" ? TransactionType.DEPOSIT : TransactionType.REFUND,
      status: TransactionStatus.COMPLETED,
      amount: usd,
      points: 0,
      description: m.description,
      reference: `${AD_FUND_REF}${m.reference}`,
      metadata: { balance: "AD_FUND", purpose: m.purpose, ...(m.metadata ?? {}) },
    },
  });
}

/**
 * Pay `adPoints` worth for a platform purchase from either spend balance:
 * Ad Points directly, or Ad Fund at the current rate (rounded up to the cent
 * fraction so the platform is never short). Returns what was taken.
 */
export async function payPlatform(
  tx: LedgerDb,
  m: Move & { adPoints: number; from: "AD_POINTS" | "AD_FUND" }
): Promise<{ from: "AD_POINTS" | "AD_FUND"; adPoints: number; usd: number; rate: number }> {
  const rate = await getAdPointsPerUsd();
  const n = Math.ceil(m.adPoints);
  if (m.from === "AD_POINTS") {
    await debitAdPoints(tx, { ...m, points: n }, rate);
    return { from: "AD_POINTS", adPoints: n, usd: n / rate, rate };
  }
  const usd = Math.ceil((n / rate) * 1e6) / 1e6;
  await debitAdFund(tx, { ...m, usd, metadata: { ...(m.metadata ?? {}), adPoints: n, rate } });
  return { from: "AD_FUND", adPoints: n, usd, rate };
}

/** Refund a platform payment to the balance it came from. */
export async function refundPlatform(
  tx: LedgerDb,
  m: Move & { adPoints: number; to: "AD_POINTS" | "AD_FUND"; rate: number }
) {
  const n = Math.floor(m.adPoints);
  if (!(n > 0)) return;
  if (m.to === "AD_POINTS") return creditAdPoints(tx, { ...m, points: n }, m.rate);
  return creditAdFund(tx, { ...m, usd: Math.floor((n / m.rate) * 1e6) / 1e6, metadata: { ...(m.metadata ?? {}), adPoints: n, rate: m.rate } });
}

/**
 * Earn Points → Ad Points (owner's rule): allowed only while the member's Earn
 * Points are worth at least the minimum withdrawal. Value is kept: Earn Points
 * → USD at points_per_usd → Ad Points at the Ad Points rate (rounded down).
 */
export async function convertEarnToAdPoints(userId: string, earnPoints: number, minWithdrawalUsd: number) {
  const n = Math.floor(earnPoints);
  if (!(n > 0)) return { ok: false as const, error: "Enter how many points to convert." };
  const [ppu, rate] = await Promise.all([getPointsPerUsd(), getAdPointsPerUsd()]);
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } });
  const have = me?.pointsBalance ?? 0;
  if (have / ppu < minWithdrawalUsd) {
    return {
      ok: false as const,
      error: `You can convert once your Earn Points are worth the minimum withdrawal ($${minWithdrawalUsd}).`,
    };
  }
  const usd = n / ppu;
  const adPoints = Math.floor(usd * rate);
  if (adPoints < 1) return { ok: false as const, error: "That is too few points to convert." };
  const stamp = `${userId}_${Date.now()}`;
  try {
    await prisma.$transaction(async (tx) => {
      const ok = await tx.user.updateMany({
        where: { id: userId, pointsBalance: { gte: n } },
        data: { pointsBalance: { decrement: n } },
      });
      if (ok.count === 0) throw new Error("INSUFFICIENT_EARN");
      // The Earn Points leaving: an internal move, not spending and not earning.
      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.POINTS_CONVERSION,
          status: TransactionStatus.COMPLETED,
          amount: 0,
          points: -n,
          description: `Converted ${n.toLocaleString()} Earn Points to ${adPoints.toLocaleString()} Ad Points`,
          reference: `${AD_POINTS_REF}convert_out_${stamp}`,
          metadata: { balance: "EARN_POINTS", purpose: "convert_to_ad_points", usd, ppu, adPoints, rate },
        },
      });
      await creditAdPoints(
        tx,
        {
          userId,
          points: adPoints,
          reference: `convert_in_${stamp}`,
          description: `Ad Points from ${n.toLocaleString()} Earn Points`,
          purpose: "convert_from_earn",
          metadata: { earnPoints: n, ppu },
        },
        rate
      );
    });
    return { ok: true as const, earnPoints: n, adPoints, usd };
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_EARN") {
      return { ok: false as const, error: "You don't have that many Earn Points." };
    }
    throw e;
  }
}

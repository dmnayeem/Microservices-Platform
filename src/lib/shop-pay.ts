import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { AD_FUND_REF, creditAdFund } from "@/lib/ad-wallet";
import type { LedgerDb } from "@/lib/ledger";
import { addFundHref, type ShopSource } from "@/lib/pay-source";
import { TransactionType, TransactionStatus } from "@/generated/prisma";

/**
 * Marketplace / services / courses paid from Cash or Ad Fund (owner, 2026-10-16).
 *
 * The buyer debit itself stays in each sale path: Cash keeps its existing
 * compare-and-set + ledger row; Ad Fund calls `debitAdFund` with the SAME
 * reference, so the stored row is `adfund_<that reference>`. No column records
 * the source — that ledger row is the record, and refunds read it back here.
 */

export const SHOP_SOURCE_NAME: Record<ShopSource, string> = { CASH: "Cash", AD_FUND: "Ad Fund" };

/** The buyer's balance in the chosen source (null when the user is gone). */
export async function shopBalance(userId: string, source: ShopSource): Promise<number | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { cashBalance: true, adFundBalance: true },
  });
  if (!u) return null;
  return toNum(source === "AD_FUND" ? u.adFundBalance : u.cashBalance);
}

/**
 * The 402 a buyer sees when Ad Fund cannot cover a purchase — same status the
 * Cash path uses, plus an Add fund link pre-filled with the shortfall.
 */
export function adFundShortResponse(opts: {
  needUsd: number;
  haveUsd?: number | null;
  returnTo: string;
  status?: number;
}) {
  const have = opts.haveUsd ?? null;
  const shortBy =
    have == null ? opts.needUsd : Math.max(0, Math.round((opts.needUsd - have) * 1e6) / 1e6);
  return NextResponse.json(
    {
      error:
        have == null
          ? `Not enough Ad Fund — this costs ${usd(opts.needUsd)}. Nothing was charged.`
          : `Not enough Ad Fund — this costs ${usd(opts.needUsd)}, you have ${usd(have)}.`,
      shortBy,
      paySource: "AD_FUND",
      addFund: addFundHref(shortBy > 0 ? shortBy : opts.needUsd, opts.returnTo),
    },
    { status: opts.status ?? 402 }
  );
}

/** |amount| of the buyer's Ad Fund debit stored as `adfund_<originalRef>`, or 0. */
export async function adFundPaidFor(db: LedgerDb, userId: string, originalRef: string): Promise<number> {
  const row = await db.transaction.findFirst({
    where: { userId, reference: `${AD_FUND_REF}${originalRef}` },
    select: { amount: true },
  });
  return row ? Math.abs(toNum(row.amount)) : 0;
}

/**
 * Ad Fund paid for one MarketplacePurchase, whichever way it was bought:
 *  - escrow deal → the deal's `adfund_deal_<dealId>` principal debit;
 *  - direct checkout / accepted offer or counter-offer / auction win → the
 *    debit carrying `metadata.purchaseId`;
 *  - cart → the one cart debit listing it in `metadata.purchaseIds`.
 * Returns 0 when the purchase was paid in Cash.
 */
export async function adFundPaidForPurchase(
  db: LedgerDb,
  buyerId: string,
  purchaseId: string
): Promise<number> {
  const deal = await db.marketplaceDeal.findFirst({
    where: { purchaseId },
    select: { id: true },
  });
  if (deal) return adFundPaidFor(db, buyerId, `deal_${deal.id}`);
  const row = await db.transaction.findFirst({
    where: {
      userId: buyerId,
      type: TransactionType.PURCHASE,
      reference: { startsWith: AD_FUND_REF },
      OR: [
        { metadata: { path: ["purchaseId"], equals: purchaseId } },
        { metadata: { path: ["purchaseIds"], array_contains: [purchaseId] } },
      ],
    },
    select: { amount: true },
  });
  return row ? Math.abs(toNum(row.amount)) : 0;
}

/**
 * Give a refund back to the balance that paid. Up to `adFundPaid` goes to Ad
 * Fund (via creditAdFund → `adfund_<reference>`); anything beyond that — only
 * possible when part of the original payment was Cash, e.g. a mediation fee
 * charged later — goes to Cash exactly as before, under `reference`.
 * Run inside the caller's transaction.
 */
export async function refundToPayingBalance(
  tx: LedgerDb,
  m: {
    userId: string;
    usd: number;
    adFundPaid: number;
    reference: string;
    description: string;
    purpose: "refund:marketplace" | "refund:service" | "refund:course";
    cashType: TransactionType;
    metadata?: Record<string, unknown>;
  }
): Promise<{ adFund: number; cash: number }> {
  const total = Math.round(m.usd * 1e6) / 1e6;
  if (!(total > 0)) return { adFund: 0, cash: 0 };
  const adFund = Math.min(total, Math.max(0, Math.round(m.adFundPaid * 1e6) / 1e6));
  const cash = Math.round((total - adFund) * 1e6) / 1e6;
  if (adFund > 0) {
    await creditAdFund(tx, {
      userId: m.userId,
      usd: adFund,
      reference: m.reference,
      description: m.description,
      purpose: m.purpose,
      metadata: m.metadata,
    });
  }
  if (cash > 0) {
    await tx.user.update({
      where: { id: m.userId },
      data: { cashBalance: { increment: cash } },
    });
    await tx.transaction.create({
      data: {
        userId: m.userId,
        type: m.cashType,
        status: TransactionStatus.COMPLETED,
        amount: cash,
        points: 0,
        description: m.description,
        reference: m.reference,
        metadata: { ...(m.metadata ?? {}), ...(adFund > 0 ? { adFundPart: adFund } : {}) },
      },
    });
  }
  return { adFund, cash };
}

/** "your Cash" / "your Ad Fund" / "your Cash and Ad Fund" for refund notices. */
export function refundedToLabel(r: { adFund: number; cash: number }): string {
  if (r.adFund > 0 && r.cash > 0) return "your Cash and Ad Fund";
  return r.adFund > 0 ? "your Ad Fund" : "your Cash";
}

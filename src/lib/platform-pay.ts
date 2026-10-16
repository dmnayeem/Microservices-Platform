import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import {
  AD_FUND_REF,
  AD_POINTS_REF,
  InsufficientBalanceError,
  creditAdFund,
  creditAdPoints,
  debitAdFund,
  getAdPointsPerUsd,
  payPlatform,
} from "@/lib/ad-wallet";
import type { LedgerDb } from "@/lib/ledger";
import {
  addFundHref,
  adPointsToUsd,
  defaultPaySource,
  type PaySource,
  type PlatformQuote,
} from "@/lib/pay-source";

/**
 * Platform spending (spotlight, lottery, promotions, badge, plans, ad credit,
 * task credit) paid from Ad Points or Ad Fund. A thin layer over
 * src/lib/ad-wallet.ts — every balance move still goes through payPlatform /
 * creditAdPoints / creditAdFund there.
 *
 * Refunds read the ORIGINAL ledger row and give back exactly what it took, to
 * the balance it took it from. No extra column is needed to remember the
 * source: the row's reference prefix (adpts_ / adfund_) is the record.
 */

export class PlatformPayError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly addFund?: string
  ) {
    super(userMessage);
  }
}

export async function getSpendBalances(userId: string, db: LedgerDb | typeof prisma = prisma) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { adPointsBalance: true, adFundBalance: true },
  });
  return { adPoints: u?.adPointsBalance ?? 0, adFundUsd: toNum(u?.adFundBalance ?? 0) };
}

/**
 * The member's choice if given, else whichever balance covers the price
 * (Ad Points first). Null when nothing covers it and no choice was made.
 */
export async function resolvePaySource(
  userId: string,
  adPoints: number,
  chosen: PaySource | null,
  rate?: number
): Promise<PaySource | null> {
  if (chosen) return chosen;
  const r = rate ?? (await getAdPointsPerUsd());
  return defaultPaySource(adPoints, await getSpendBalances(userId), r);
}

/** "Not enough Ad Points / Ad Fund" with the shortfall and an Add fund link. */
export async function insufficientError(
  userId: string,
  adPoints: number,
  from: PaySource | null,
  returnTo?: string,
  rate?: number
): Promise<PlatformPayError> {
  const r = rate ?? (await getAdPointsPerUsd());
  const bal = await getSpendBalances(userId);
  const needUsd = adPointsToUsd(adPoints, r);
  if (from === "AD_POINTS") {
    const short = Math.max(0, Math.ceil(adPoints) - bal.adPoints);
    return new PlatformPayError(
      `Not enough Ad Points — this costs ${Math.ceil(adPoints).toLocaleString()} and you have ${bal.adPoints.toLocaleString()}. Pay from Ad Fund, convert Earn Points, or add fund.`,
      addFundHref(short / r, returnTo)
    );
  }
  const short = Math.max(0, needUsd - bal.adFundUsd);
  return new PlatformPayError(
    from === "AD_FUND"
      ? `Not enough Ad Fund — this costs ${usd(needUsd)} and you have ${usd(bal.adFundUsd)}. Add fund to continue.`
      : `Not enough Ad Points or Ad Fund — this costs ${Math.ceil(adPoints).toLocaleString()} Ad Points (${usd(needUsd)}). Add fund to continue.`,
    addFundHref(short, returnTo)
  );
}

/**
 * Pay inside the caller's transaction. Throws PlatformPayError (with the
 * Add fund link) when the chosen balance is short — the CAS debit in
 * ad-wallet.ts is what decides, so a race can never overdraw.
 */
export async function payPlatformOrThrow(
  tx: LedgerDb,
  m: {
    userId: string;
    adPoints: number;
    from: PaySource;
    reference: string;
    description: string;
    purpose: string;
    metadata?: Record<string, unknown>;
    returnTo?: string;
  }
) {
  try {
    return await payPlatform(tx, m);
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      throw await insufficientError(m.userId, m.adPoints, m.from, m.returnTo);
    }
    throw e;
  }
}

export interface FoundPayment {
  from: PaySource;
  adPoints: number;
  usd: number;
  rate: number;
}

/** The platform payment written under `reference` (without its prefix), or null. */
export async function findPlatformPayment(
  db: LedgerDb | typeof prisma,
  userId: string,
  reference: string
): Promise<FoundPayment | null> {
  const row = await db.transaction.findFirst({
    where: { userId, reference: { in: [`${AD_POINTS_REF}${reference}`, `${AD_FUND_REF}${reference}`] } },
    select: { reference: true, amount: true, metadata: true },
  });
  if (!row) return null;
  const meta = (row.metadata ?? {}) as { adPoints?: number; rate?: number };
  const from: PaySource = row.reference!.startsWith(AD_POINTS_REF) ? "AD_POINTS" : "AD_FUND";
  return {
    from,
    adPoints: Math.abs(Number(meta.adPoints ?? 0)),
    usd: Math.abs(toNum(row.amount)),
    rate: Number(meta.rate) || 0,
  };
}

/**
 * Give back exactly what the payment under `payReference` took, to the same
 * balance. Callers guard against a second refund with their own status
 * compare-and-set; `refundReference` is unique per member as a backstop.
 * Returns null when there is no such payment (e.g. a legacy row paid in Earn
 * Points or Cash — the caller handles those the old way).
 */
export async function refundPlatformPayment(
  tx: LedgerDb,
  m: {
    userId: string;
    payReference: string;
    refundReference: string;
    description: string;
    purpose: string;
    metadata?: Record<string, unknown>;
    /** Refund only this many Ad Points' worth (partial). Default: all of it. */
    adPoints?: number;
  }
): Promise<FoundPayment | null> {
  const paid = await findPlatformPayment(tx, m.userId, m.payReference);
  if (!paid) return null;
  const share =
    m.adPoints === undefined || !(paid.adPoints > 0) ? 1 : Math.min(1, Math.max(0, m.adPoints / paid.adPoints));
  const base = {
    userId: m.userId,
    reference: m.refundReference,
    description: m.description,
    purpose: m.purpose,
    metadata: { ...(m.metadata ?? {}), refundOf: m.payReference },
  };
  if (paid.from === "AD_POINTS") {
    const n = Math.floor(paid.adPoints * share);
    await creditAdPoints(tx, { ...base, points: n }, paid.rate || undefined);
    return { ...paid, adPoints: n, usd: paid.rate ? n / paid.rate : 0 };
  }
  // The exact USD the row took (never re-derived from a rate that may have
  // changed since), floored to the micro-dollar on a partial.
  const usdBack = share === 1 ? paid.usd : Math.floor(paid.usd * share * 1e6) / 1e6;
  await creditAdFund(tx, {
    ...base,
    usd: usdBack,
    metadata: { ...base.metadata, adPoints: Math.floor(paid.adPoints * share), rate: paid.rate },
  });
  return { ...paid, adPoints: Math.floor(paid.adPoints * share), usd: usdBack };
}

/**
 * Charge a platform price (see quotePlatformPrice) inside the caller's
 * transaction. Ad Points → payPlatform. Ad Fund → the USD price itself when
 * the item is priced in USD (debitAdFund, so the member pays exactly the
 * listed dollars), else payPlatform at the rate. Both rows carry adPoints +
 * rate in metadata so refundPlatformPayment can give back the same value.
 */
export async function chargePlatform(
  tx: LedgerDb,
  m: {
    userId: string;
    quote: PlatformQuote;
    from: PaySource;
    reference: string;
    description: string;
    purpose: string;
    metadata?: Record<string, unknown>;
    returnTo?: string;
  }
): Promise<{ from: PaySource; adPoints: number; usd: number; rate: number }> {
  if (!(m.quote.adPoints > 0)) throw new Error("PLATFORM_PRICE");
  if (m.from === "AD_FUND" && m.quote.usdFixed) {
    const rate = await getAdPointsPerUsd();
    try {
      await debitAdFund(tx, {
        userId: m.userId,
        usd: m.quote.usd,
        reference: m.reference,
        description: m.description,
        purpose: m.purpose,
        metadata: { ...(m.metadata ?? {}), adPoints: m.quote.adPoints, rate },
      });
    } catch (e) {
      if (e instanceof InsufficientBalanceError) {
        throw await insufficientError(m.userId, m.quote.adPoints, "AD_FUND", m.returnTo, rate);
      }
      throw e;
    }
    return { from: "AD_FUND", adPoints: m.quote.adPoints, usd: m.quote.usd, rate };
  }
  return payPlatformOrThrow(tx, { ...m, adPoints: m.quote.adPoints });
}

/**
 * Auto-renewals (plans, badge): Ad Fund first, else Ad Points, else null —
 * the item lapses (owner, 2026-10-16). Read inside the renewal transaction;
 * the debit is still a CAS, so a balance spent meanwhile just fails the renewal.
 */
export async function pickRenewalSource(
  db: LedgerDb,
  userId: string,
  quote: PlatformQuote
): Promise<PaySource | null> {
  const bal = await getSpendBalances(userId, db);
  if (bal.adFundUsd + 1e-9 >= quote.usd) return "AD_FUND";
  if (bal.adPoints >= quote.adPoints) return "AD_POINTS";
  return null;
}

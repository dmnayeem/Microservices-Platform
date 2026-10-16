import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { AD_FUND_REF, AD_POINTS_REF } from "@/lib/ad-wallet";
import { adWalletKind } from "@/lib/tx-sources";
import { withoutUsers } from "@/lib/finance/test-users";

/**
 * Platform spending paid from Ad Points / Ad Fund (owner, 2026-10-16) — the
 * revenue stream for every ad-wallet PURCHASE row, minus its REFUND rows, read
 * from the ledger rows src/lib/ad-wallet.ts writes. `amount` there is always
 * the USD value (Ad Points at the rate they were spent at).
 *
 * Counted once, never twice:
 *   - Products / services / courses / mediation fees ("shop", "shopfee",
 *     "course") are left out: their platform take is already on
 *     MarketplacePurchase.fee / MarketplaceDeal.adminFee /
 *     CourseEnrollment.platformFeeUsd.
 *   - Ad credit / task credit purchases are left out: they are revenue when
 *     SPENT (the ad stream, the buyer task commission).
 *   - A first plan term ("plan") is left out: Subscription.amount counts it.
 *   - Feed donations ("peer") are left out: member-to-member, not the house's.
 *   - Spotlight wins and lottery house cuts paid this way are taken OUT of
 *     their legacy streams by the two id helpers below.
 *   - Deposits (Add fund) and Earn → Ad conversions are not PURCHASE/REFUND
 *     rows, so they never enter (deposits are a liability, not revenue).
 */

interface Range {
  from?: Date;
  to?: Date;
}

const AD_REF_OR = [{ reference: { startsWith: AD_POINTS_REF } }, { reference: { startsWith: AD_FUND_REF } }];

export interface AdSpendRow {
  createdAt: Date;
  /** + for spending, − for a refund of it. */
  usd: number;
}

export async function adWalletSpendRows(range: Range, testIds: string[]): Promise<AdSpendRow[]> {
  const created =
    range.from || range.to ? { gte: range.from ?? undefined, lte: range.to ?? undefined } : undefined;
  const rows = (await prisma.transaction.findMany({
    where: withoutUsers<Record<string, unknown>>(
      {
        status: "COMPLETED",
        type: { in: ["PURCHASE", "REFUND"] },
        OR: AD_REF_OR,
        ...(created ? { createdAt: created } : {}),
      },
      testIds,
      "userId"
    ) as never,
    select: { createdAt: true, type: true, reference: true, amount: true },
    take: 100_000,
  })) as Array<{ createdAt: Date; type: string; reference: string | null; amount: unknown }>;
  const out: AdSpendRow[] = [];
  for (const r of rows) {
    if (adWalletKind(r.reference) !== "platform") continue;
    // Never trust the stored sign (signing.ts): the type says which way it went.
    const mag = Math.abs(toNum(r.amount as never));
    if (!(mag > 0)) continue;
    out.push({ createdAt: r.createdAt, usd: r.type === "REFUND" ? -mag : mag });
  }
  return out;
}

/**
 * Spotlight auctions whose WINNING hold was paid from Ad Points / Ad Fund —
 * already counted by adWalletSpendRows, so the legacy winnerBid stream must
 * skip them.
 */
export async function adPaidSpotlightIds(
  winners: Array<{ id: string; winnerUserId: string | null; winnerBid: number | null }>
): Promise<Set<string>> {
  const refs = winners
    .filter((w) => w.winnerUserId && w.winnerBid != null)
    .map((w) => ({ id: w.id, inner: `spotlight_hold_${w.id}_${w.winnerUserId}_${w.winnerBid}` }));
  if (refs.length === 0) return new Set();
  const found = await prisma.transaction.findMany({
    where: {
      reference: { in: refs.flatMap((r) => [AD_POINTS_REF + r.inner, AD_FUND_REF + r.inner]) },
    },
    select: { reference: true },
  });
  const hit = new Set(found.map((f) => (f.reference ?? "").replace(/^(adpts_|adfund_)/, "")));
  return new Set(refs.filter((r) => hit.has(r.inner)).map((r) => r.id));
}

/**
 * Lotteries that sold tickets for Ad Points / Ad Fund. Their ticket sales are
 * revenue in adWalletSpendRows (and prizes a cost in the ledger), so the
 * legacy house-cut stream must skip them.
 */
export async function adPaidLotteryIds(lotteryIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(lotteryIds)];
  if (ids.length === 0) return new Set();
  const found = await prisma.transaction.findMany({
    where: {
      type: "PURCHASE",
      OR: ids.flatMap((id) => [
        { reference: { startsWith: `${AD_POINTS_REF}lottery_${id}_` } },
        { reference: { startsWith: `${AD_FUND_REF}lottery_${id}_` } },
      ]),
    },
    select: { reference: true },
    distinct: ["reference"],
    take: 50_000,
  });
  const out = new Set<string>();
  for (const f of found) {
    const m = /^(?:adpts_|adfund_)lottery_([^_]+)_/.exec(f.reference ?? "");
    if (m && ids.includes(m[1])) out.add(m[1]);
  }
  return out;
}

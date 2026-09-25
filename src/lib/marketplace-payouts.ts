/**
 * Releases seller payouts whose hold has expired.
 *
 * When the admin turns the payout hold on, a sale writes a HELD row instead of
 * crediting the seller. This is what actually pays them. Nothing else does — so
 * if this stops running, sellers stop being paid while the shop keeps taking
 * money. It rides the platform's own traffic through `lib/scheduler`, the same
 * as every other recurring job here, and `/api/cron/marketplace-payouts` exists
 * for anyone who would rather drive it from outside.
 *
 * Running twice is harmless, which `lib/scheduler/jobs` requires: the status
 * flip is part of the UPDATE's WHERE clause, so a row already released by an
 * overlapping tick matches nothing and is not paid again.
 */
import { prisma } from "@/lib/prisma";
import { D, toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { TransactionType, TransactionStatus } from "@/generated/prisma";

/** Never turn one tick into an unbounded chain of wallet writes. */
const DEFAULT_LIMIT = 50;

export type ReleaseSummary = {
  examined: number;
  released: number;
  amount: number;
  skipped: number;
};

export function summariseReleases(s: ReleaseSummary): string {
  if (s.examined === 0) return "No payouts due.";
  const bits = [`released ${s.released} of ${s.examined}`, usd(s.amount)];
  if (s.skipped) bits.push(`${s.skipped} taken by another tick`);
  return `${bits.join(", ")}.`;
}

export async function releaseDuePayouts(
  opts: { limit?: number } = {}
): Promise<ReleaseSummary> {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 200));
  const summary: ReleaseSummary = { examined: 0, released: 0, amount: 0, skipped: 0 };

  const due = await prisma.marketplacePayout.findMany({
    where: { status: "HELD", releaseAt: { lte: new Date() } },
    orderBy: { releaseAt: "asc" },
    take: limit,
  });
  summary.examined = due.length;

  // Titles fetched separately rather than through a nested relation select:
  // the generated client does not surface nested selects on this model, and a
  // silently-dropped include would put "listing" in every seller's statement.
  const titles = new Map<string, string>();
  if (due.length > 0) {
    const purchases = await prisma.marketplacePurchase.findMany({
      where: { id: { in: due.map((r) => r.purchaseId) } },
      select: { id: true, listing: { select: { title: true } } },
    });
    for (const p of purchases) titles.set(p.id, p.listing?.title ?? "listing");
  }

  for (const row of due) {
    const amount = toNum(row.amount);
    if (!(amount > 0)) {
      // Nothing to pay, but leave no row stuck HELD forever.
      await prisma.marketplacePayout.updateMany({
        where: { id: row.id, status: "HELD" },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Claim it first. `status: "HELD"` in the WHERE is what makes a second
        // tick — or a refund reversing it a moment ago — a no-op rather than a
        // double payment.
        const claimed = await tx.marketplacePayout.updateMany({
          where: { id: row.id, status: "HELD" },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new Error("ALREADY_SETTLED");
        }

        await tx.user.update({
          where: { id: row.sellerId },
          data: {
            cashBalance: { increment: D(amount) },
            // Counted only now. A held sale is still reversible, and adding it
            // to lifetime earnings on the day of the sale would overstate the
            // figure and then need unwinding on every refund.
            totalEarnings: { increment: D(amount) },
          },
        });

        await tx.transaction.create({
          data: {
            userId: row.sellerId,
            // EARNING, which is what an immediately-paid marketplace sale
            // already writes: a released payout is the same income arriving
            // later, not a different kind of money.
            type: TransactionType.EARNING,
            status: TransactionStatus.COMPLETED,
            amount: D(amount),
            points: 0,
            description: `Marketplace payout released — "${titles.get(row.purchaseId) ?? "listing"}"`,
            reference: `marketplace_payout_${row.id}`,
            metadata: { payoutId: row.id, purchaseId: row.purchaseId },
          },
        });
      });
      summary.released++;
      summary.amount += amount;
    } catch (e) {
      if (e instanceof Error && e.message === "ALREADY_SETTLED") {
        summary.skipped++;
        continue;
      }
      // One bad row must not stop the rest of the queue being paid.
      console.error(`[marketplace-payouts] could not release ${row.id}:`, e);
    }
  }

  summary.amount = Math.round(summary.amount * 100) / 100;
  return summary;
}

/**
 * Take a refund out of a held payout, up to `owed`.
 *
 * Returns how much was actually reclaimed this way. Anything already RELEASED
 * is not touched — that money is in the seller's wallet and has to be clawed
 * back by the caller, which is the situation the hold exists to avoid.
 *
 * `owed` is the ceiling, and it matters: on a PARTIAL refund the seller keeps
 * the rest of the sale. This used to cancel the whole held payout whatever the
 * refund was — a 50% refund on an $80 held share took all $80, the buyer got
 * their $40 back, and the other $40 vanished: not the seller's, not the buyer's,
 * and recorded nowhere, because the caller's "still owed" came out at zero. Now
 * a partial refund shrinks the held row and the remainder still releases to
 * the seller on schedule; only a refund of the whole share reverses it.
 *
 * Both writes are compare-and-set on the row as read, so two refunds racing on
 * one sale cannot both take the same held money.
 */
export async function reverseHeldPayout(
  tx: { marketplacePayout: typeof prisma.marketplacePayout },
  purchaseId: string,
  reason: string,
  owed?: number
): Promise<number> {
  const payout = await tx.marketplacePayout.findUnique({
    where: { purchaseId },
    select: { id: true, amount: true, status: true },
  });
  if (!payout || payout.status !== "HELD") return 0;

  const held = toNum(payout.amount);
  const take = owed === undefined ? held : Math.min(held, Math.max(0, Math.round(owed * 100) / 100));
  if (take <= 0) return 0;

  // The whole share (to the cent): the sale is fully unwound.
  if (take >= held - 0.005) {
    const reversed = await tx.marketplacePayout.updateMany({
      where: { id: payout.id, status: "HELD" },
      data: { status: "REVERSED", reversedAt: new Date(), reason: reason.slice(0, 300) },
    });
    return reversed.count > 0 ? held : 0;
  }

  // Part of it: shrink the held row and leave it HELD, so what is left still
  // pays out to the seller when the hold ends.
  const shrunk = await tx.marketplacePayout.updateMany({
    where: { id: payout.id, status: "HELD", amount: payout.amount },
    data: {
      amount: Math.round((held - take) * 100) / 100,
      reason: `${reason} (partial: ${take.toFixed(2)} of ${held.toFixed(2)})`.slice(0, 300),
    },
  });
  return shrunk.count > 0 ? take : 0;
}

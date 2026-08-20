import { usd } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { defaultPackage } from "@/lib/packages";
import { toNum } from "@/lib/money";
import { deliverToUser } from "@/lib/notify";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * For each active subscription whose end date has passed:
 *   • autoRenew + enough wallet balance → charge again, extend the period, keep
 *     the package (idempotent: once extended the row leaves the due set).
 *   • otherwise → deactivate the subscription and revert the user to the default
 *     package (only when their overall entitlement has actually lapsed).
 * Idempotent + safe to re-run. Returns a summary.
 */
/** One batch. `runSubscriptionExpiry` below drives this until the queue drains. */
async function runSubscriptionExpiryBatch(): Promise<{
  processed: number;
  renewed: number;
  expired: number;
}> {
  const now = new Date();
  const due = await prisma.subscription.findMany({
    where: { isActive: true, endDate: { lte: now } },
    take: 100,
  });

  // Subscription has no `user` relation — batch-load balance + entitlement expiry.
  const balanceById = new Map<string, number>();
  const expiresById = new Map<string, Date | null>();
  if (due.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: due.map((s) => s.userId) } },
      select: { id: true, cashBalance: true, packageExpiresAt: true },
    });
    for (const u of users) {
      balanceById.set(u.id, toNum(u.cashBalance));
      expiresById.set(u.id, u.packageExpiresAt);
    }
  }

  const fallback = await defaultPackage();

  let renewed = 0;
  let expired = 0;

  for (const sub of due) {
    const periodMs = Math.max(
      sub.endDate.getTime() - sub.startDate.getTime(),
      THIRTY_DAYS
    );
    const newEnd = new Date(now.getTime() + periodMs);
    const subAmount = toNum(sub.amount);

    const canRenew =
      sub.autoRenew &&
      subAmount > 0 &&
      !!sub.packageId &&
      (balanceById.get(sub.userId) ?? 0) >= subAmount;

    if (canRenew) {
      try {
        await prisma.$transaction(async (tx) => {
          const debit = await tx.user.updateMany({
            where: { id: sub.userId, cashBalance: { gte: subAmount } },
            data: { cashBalance: { decrement: subAmount } },
          });
          if (debit.count === 0) throw new Error("INSUFFICIENT");

          await tx.user.update({
            where: { id: sub.userId },
            data: { packageId: sub.packageId, packageExpiresAt: newEnd },
          });
          await tx.subscription.update({
            where: { id: sub.id },
            data: { endDate: newEnd },
          });
          await tx.transaction.create({
            data: {
              userId: sub.userId,
              type: TransactionType.PURCHASE,
              status: TransactionStatus.COMPLETED,
              amount: -subAmount,
              points: 0,
              description: "Subscription auto-renewal",
              reference: `sub_renew_${sub.id}_${newEnd.getTime()}`,
            },
          });
        });
        renewed++;
        void deliverToUser({
          userId: sub.userId,
          title: "Subscription renewed",
          message: `Your plan was auto-renewed for ${usd(subAmount)}.`,
          link: "/my-package",
        });
        continue;
      } catch {
        // Balance moved / race — fall through and expire instead.
      }
    }

    const entitlement = expiresById.get(sub.userId);
    const stillEntitled =
      entitlement != null && entitlement.getTime() > now.getTime();
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: sub.id },
        data: { isActive: false },
      }),
      ...(stillEntitled
        ? []
        : [
            prisma.user.update({
              where: { id: sub.userId },
              data: { packageId: fallback?.id ?? null, packageExpiresAt: null },
            }),
          ]),
    ]);
    expired++;
    void deliverToUser({
      userId: sub.userId,
      title: "Subscription expired",
      message:
        "Your premium plan has ended. Renew any time to restore your benefits.",
      link: "/packages",
    });
  }

  return { processed: due.length, renewed, expired };
}

/** How many rows one batch takes — must match the `take` above. */
const BATCH = 100;
/** Safety stop, plus a wall-clock budget so one run can't hang forever. */
const MAX_BATCHES = 100;
const BUDGET_MS = 45_000;

/**
 * Expire or renew every due subscription.
 *
 * This used to be a single `take: 100` pass per day. If more than 100 expired in
 * a day the backlog grew permanently and those users kept a plan they had
 * stopped paying for — a revenue leak that gets worse as the userbase grows, and
 * one that looks like a working cron the whole time. Now it loops until drained.
 */
export async function runSubscriptionExpiry(): Promise<{
  processed: number;
  renewed: number;
  expired: number;
  batches: number;
  drained: boolean;
}> {
  let processed = 0;
  let renewed = 0;
  let expired = 0;
  let batches = 0;
  let drained = false;
  const deadline = Date.now() + BUDGET_MS;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const r = await runSubscriptionExpiryBatch();
    batches++;
    processed += r.processed;
    renewed += r.renewed;
    expired += r.expired;
    if (r.processed < BATCH) {
      drained = true;
      break;
    }
    if (Date.now() >= deadline) break;
  }
  return { processed, renewed, expired, batches, drained };
}
